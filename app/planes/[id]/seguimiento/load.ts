import "server-only";
import { notFound, redirect } from "next/navigation";
import { resolveActor } from "@/controllers/session-controller";
import { createTrackingController } from "@/controllers/tracking-controller";
import { createStructureController } from "@/controllers/structure-controller";
import { TrackingError } from "@/models/tracking-error";
export async function loadTracking(planId: string, reviewId?: string) {
  const actor = await resolveActor();
  if (!actor) redirect("/login");
  const plan = await createStructureController(resolveActor).get(planId);
  if (!plan) notFound();
  const controller = createTrackingController(resolveActor);
  const reviews = await controller.list({ planId });
  if (!reviewId) {
    const open = reviews.find(r => r.status === "ABIERTA");
    if (open) redirect(`/planes/${planId}/seguimiento/${open.id}`);
  }
  try {
    const review = reviewId ? await controller.read({ planId, reviewId }) : null;
    return { plan: { id: plan.id, name: plan.name }, initialReview: review, initialReviews: reviews, superuser: actor.role === "SUPERUSUARIO" };
  } catch (error) {
    if (error instanceof TrackingError && error.code === "NOT_FOUND") notFound();
    throw error;
  }
}
