import { redirect } from "next/navigation";
import { resolveActor } from "@/controllers/session-controller";
import { createPlanController } from "@/controllers/plan-controller";
import PlansView from "@/views/plans/PlansView";

export const dynamic = "force-dynamic";
export default async function Home() {
  const actor = await resolveActor();
  if (!actor) redirect("/login");
  const plans = await createPlanController(resolveActor).list();
  return <PlansView user={{ name: actor.name, role: actor.role }} plans={plans.map(plan => ({
    id: plan.id,
    name: plan.name,
    description: plan.description,
    status: plan.status,
    startDate: plan.startDate?.toISOString().slice(0, 10) ?? null,
    endDate: plan.endDate?.toISOString().slice(0, 10) ?? null,
  }))} />;
}
