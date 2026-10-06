import "server-only";
import { z } from "zod";
import { AccessDeniedError } from "./errors";
import { dashboardModel } from "@/models/dashboard";
const inputSchema = z.object({ planId: z.string().min(1).max(200), reviewId: z.string().min(1).max(200).optional() }).strict();
export function createDashboardController(resolveActor: () => Promise<{ active: boolean; role: string } | null>, model = dashboardModel) {
  return { async read(input: unknown) {
    const actor = await resolveActor();
    if (!actor?.active || !["SUPERUSUARIO", "ADMINISTRADOR"].includes(actor.role)) throw new AccessDeniedError();
    const { planId, reviewId } = inputSchema.parse(input);
    return model.read(planId, reviewId);
  } };
}
