import "server-only";
import { actionInputSchema } from "@/models/action-rules";
import { actionModel } from "@/models/action";
import { AccessDeniedError } from "./errors";
type Actor = { id: string; active: boolean; role: "SUPERUSUARIO" | "ADMINISTRADOR" } | null;
export function createActionController(resolveActor: () => Promise<Actor>, model = actionModel) {
  return { async save(input: unknown) {
    const actor = await resolveActor();
    if (!actor?.active || !["SUPERUSUARIO", "ADMINISTRADOR"].includes(actor.role)) throw new AccessDeniedError();
    return model.save(actionInputSchema.parse(input), { id: actor.id, role: actor.role });
  } };
}
