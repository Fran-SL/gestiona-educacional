import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { PrismaClient } from "../../generated/prisma/client";
import { databaseAdapter } from "../../models/database-adapter";
import { createDashboardModel } from "../../models/dashboard";
import { createReviewModel } from "../../models/review";
import { isolatedDatabase } from "../helpers/isolated-database.mjs";
it("la revisión finalizada conserva pesos y gastos históricos ante cambios actuales", async () => {
  const isolated = await isolatedDatabase();
  const db = new PrismaClient({ adapter: databaseAdapter(isolated.url) });
  try {
    const actor = await db.user.create({ data: { email: "dashboard@example.invalid", name: "Prueba", role: "SUPERUSUARIO" } });
    const plan = await db.plan.create({ data: { name: "Plan", createdById: actor.id, dimensions: { create: { name: "Dimensión", weightBps: 10000,
      actions: { create: [8000, 2000].map((weightBps, i) => ({ name: `A${i}`, description: "", responsibleName: "Responsable", weightBps, actualExpense: "10", startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31"), milestones: { create: { name: "H", weightBps: 10000, progressBps: i ? 10000 : 5000 } } })) },
    } } }, include: { dimensions: { include: { actions: { orderBy: { name: "asc" } } } } } });
    const second = await db.$transaction(async tx => {
      await tx.dimension.update({ where: { id: plan.dimensions[0].id }, data: { weightBps: 8000 } });
      return tx.dimension.create({ data: { planId: plan.id, name: "Segunda", weightBps: 2000, actions: { create: { name: "C", description: "", responsibleName: "Responsable", weightBps: 10000, startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31"), milestones: { create: { name: "H", weightBps: 10000, progressBps: 1000 } } } } } });
    });
    const reviews = createReviewModel(() => db), dashboard = createDashboardModel(() => db);
    const review = await reviews.start({ planId: plan.id, title: "Histórica", referenceStartDate: "2026-01-01", referenceEndDate: "2026-12-31" }, actor);
    await reviews.finalize({ planId: plan.id, reviewId: review.id, version: review.version, confirmPending: true }, actor);
    const before = await dashboard.read(plan.id, review.id);
    expect(before?.summary.achievement).toBe(50);
    await db.$transaction(async tx => {
      await tx.dimension.update({ where: { id: plan.dimensions[0].id }, data: { weightBps: 2000 } });
      await tx.dimension.update({ where: { id: second.id }, data: { weightBps: 8000 } });
      for (const [i, a] of plan.dimensions[0].actions.entries()) await tx.action.update({ where: { id: a.id }, data: { weightBps: i ? 8000 : 2000, actualExpense: "100" } });
    });
    expect((await dashboard.read(plan.id))?.summary.achievement).toBe(26);
    await db.action.create({ data: { dimensionId: second.id, name: "Nueva después del cierre", description: "", responsibleName: "Responsable", weightBps: 0, startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31"), milestones: { create: { name: "Nuevo", weightBps: 10000, progressBps: 0 } } } });
    const newer = await reviews.start({ planId: plan.id, title: "Nueva revisión", referenceStartDate: "2026-02-01", referenceEndDate: "2026-12-31" }, actor);
    const after = await dashboard.read(plan.id, review.id);
    expect(after?.summary).toEqual(before?.summary);
    expect(after?.summary.expenses).toEqual([{ currency: "CLP", amount: "20.00" }]);
    expect(after?.history.points.map(p => p.id)).toEqual([review.id, newer.id]);
    expect(after?.history.points.map(p => p.achievement)).toEqual([50, 26]);
    expect(after?.history.change).toBe(-24);
    expect(after?.summary.actions.total).toBe(3);
    expect((await dashboard.read(plan.id))?.summary.actions.total).toBe(4);
    expect((await dashboard.read(plan.id, newer.id))?.summary.actions.total).toBe(4);
    const other = await db.plan.create({ data: { name: "Otro", createdById: actor.id } });
    expect(await dashboard.read(other.id, review.id)).toBeNull();
    expect(await dashboard.read("inexistente")).toBeNull();
  } finally { await db.$disconnect(); await isolated.cleanup(); }
});
