import "dotenv/config";
import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { PrismaClient } from "../../generated/prisma/client";
import { databaseAdapter } from "../../models/database-adapter";
const url = process.env.DATABASE_URL!;
if (!new URL(url).searchParams.get("schema")?.startsWith("tracking_test_")) throw new Error("Requiere esquema aislado.");
const db = new PrismaClient({ adapter: databaseAdapter(url) });
test.afterAll(async () => { await db.$disconnect(); });
test("Dashboard HTTP: sesión obligatoria, ambos roles e indicadores SSR", async ({ playwright }) => {
  const origin = "http://localhost:3100";
  for (const role of ["ADMINISTRADOR", "SUPERUSUARIO"] as const) {
    const id = randomUUID(), email = `${id}@example.invalid`, password = randomUUID();
    await db.user.create({ data: { id, name: "Dashboard prueba", role, email, accounts: { create: { accountId: id, providerId: "credential", password: await hashPassword(password) } } } });
    const plan = await db.plan.create({ data: { name: `Plan ${role}`, createdById: id, dimensions: { create: { name: "Dimensión", weightBps: 10000, actions: { create: { name: "Acción", description: "", responsibleName: "Responsable", weightBps: 10000, actualExpense: "120000", startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31"), milestones: { create: { name: "Hito", weightBps: 10000, progressBps: 5000 } } } } } } } });
    const request = await playwright.request.newContext({ baseURL: origin });
    try {
      const anonymous = await request.get(`/planes/${plan.id}/dashboard`, { maxRedirects: 0 });
      expect(anonymous.status()).toBe(307);expect(anonymous.headers().location).toBe("/login");
      expect((await request.post("/api/auth/sign-in/email", { headers: { origin }, data: { email, password } })).ok()).toBe(true);
      const response = await request.get(`/planes/${plan.id}/dashboard`);
      expect(response.status()).toBe(200);
      const html = await response.text();
      expect(html).toContain("Avance global del plan");expect(html).toContain('value="50"');expect(html).toContain("120.000");
      expect((await request.get(`/planes/${plan.id}/dashboard?reviewId=inexistente`)).status()).toBe(404);
      await db.user.update({ where: { id }, data: { active: false } });
      expect((await request.get(`/planes/${plan.id}/dashboard`, { maxRedirects: 0 })).status()).toBe(307);
    } finally { await request.dispose(); }
  }
});
