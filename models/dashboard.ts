import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { getDatabase } from "./db";
import { calculateDashboard, prepareDashboardHistory } from "./dashboard-rules";

const tree = { orderBy: [{ position: "asc" as const }, { id: "asc" as const }], select: {
  id: true, name: true, weightBps: true,
  actions: { orderBy: [{ position: "asc" as const }, { id: "asc" as const }], select: {
    id: true, name: true, responsibleName: true, weightBps: true, actualExpense: true, currency: true,
    milestones: { select: { name: true, weightBps: true, progressBps: true } },
  } },
} };
export function createDashboardModel(database: () => PrismaClient = getDatabase) {
  return {
    async read(planId: string, reviewId?: string) {
      return database().$transaction(async tx => {
        const plan = await tx.plan.findUnique({ where: { id: planId }, select: { id: true, name: true } });
        if (!plan) return null;
        const reviews = await tx.planReview.findMany({ where: { planId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: { id: true, title: true, status: true, createdAt: true, referenceStartDate: true, referenceEndDate: true, dimensions: tree } });
        const snapshot = reviewId ? await tx.planReview.findFirst({ where: { id: reviewId, planId }, select: {
          id: true, planName: true, title: true, status: true, finalizedAt: true, dimensions: tree,
        } }) : null;
        if (reviewId && !snapshot) return null;
        const current = !reviewId ? await tx.plan.findUnique({ where: { id: planId }, select: { dimensions: tree } }) : null;
        const dimensions = (snapshot?.dimensions ?? current?.dimensions ?? []).map(d => ({ ...d,
          actions: d.actions.map(a => ({ ...a, actualExpense: a.actualExpense?.toFixed(2) ?? null })),
        }));
        return { plan: { id: plan.id, name: snapshot?.planName ?? plan.name },
          source: snapshot ? { id: snapshot.id, title: snapshot.title, status: snapshot.status, finalizedAt: snapshot.finalizedAt?.toISOString() ?? null } : null,
          history: prepareDashboardHistory(reviews.map(r => ({ id: r.id, title: r.title, status: r.status, createdAt: r.createdAt.toISOString(),
            achievement: calculateDashboard(r.dimensions.map(d => ({ ...d, actions: d.actions.map(a => ({ ...a, actualExpense: a.actualExpense?.toFixed(2) ?? null })) }))).achievement,
          }))),
          reviews: reviews.map(r => ({ id: r.id, title: r.title, status: r.status, referenceStartDate: r.referenceStartDate.toISOString().slice(0, 10), referenceEndDate: r.referenceEndDate.toISOString().slice(0, 10) })),
          summary: calculateDashboard(dimensions),
        };
      }, { isolationLevel: "RepeatableRead" });
    },
  };
}
export const dashboardModel = createDashboardModel();
export type DashboardData = NonNullable<Awaited<ReturnType<typeof dashboardModel.read>>>;
