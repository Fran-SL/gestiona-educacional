import { notFound, redirect } from "next/navigation";
import { resolveActor } from "@/controllers/session-controller";
import { createDashboardController } from "@/controllers/dashboard-controller";
import DashboardView from "@/views/dashboard/DashboardView";
export const dynamic = "force-dynamic";
export default async function DashboardPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ reviewId?: string | string[] }>;
}) {
  const actor = await resolveActor();
  if (!actor || !["SUPERUSUARIO", "ADMINISTRADOR"].includes(actor.role)) redirect("/login");
  const { reviewId } = await searchParams;
  if (Array.isArray(reviewId) || (reviewId && reviewId.length > 200)) notFound();
  const data = await createDashboardController(async () => actor).read({ planId: (await params).id, reviewId: reviewId || undefined });
  if (!data) notFound();
  return <DashboardView data={data} />;
}
