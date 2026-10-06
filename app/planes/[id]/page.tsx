import { notFound, redirect } from "next/navigation";
import { resolveActor } from "@/controllers/session-controller";
import { createStructureController } from "@/controllers/structure-controller";
import PlanDetailView from "@/views/plans/PlanDetailView";

export const dynamic = "force-dynamic";

export default async function PlanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await resolveActor();

  if (!actor) {
    redirect("/login");
  }

  const plan = await createStructureController(resolveActor).get(
    (await params).id
  );

  if (!plan) {
    notFound();
  }

  return (
    <PlanDetailView
      superuser={actor.role === "SUPERUSUARIO"}
      plan={{
        id: plan.id,
        name: plan.name,
        description: plan.description,
        status: plan.status,
        dimensions: plan.dimensions.map(d => ({
          id: d.id,
          name: d.name,
          description: d.description,
          weightBps: d.weightBps,
          actions: d.actions.map(a => ({
            id: a.id,
            name: a.name,
            description: a.description,
            responsibleName: a.responsibleName,
            startDate: a.startDate.toISOString().slice(0, 10),
            endDate: a.endDate.toISOString().slice(0, 10),
            actualExpense: a.actualExpense?.toFixed(0) ?? null,
            weightBps: a.weightBps,
            version: a.version,
            milestones: a.milestones.map(h => ({
              id: h.id,
              name: h.name,
              weightBps: h.weightBps,
              comments: h.comments.map(c => ({
                id: c.id,
                body: c.body,
                createdAt: c.createdAt.toISOString(),
              })),
            })),
          })),
        })),
      }}
    />
  );
}
