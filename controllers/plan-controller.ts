import "server-only";
import { AccessDeniedError } from "./errors";
import { createPlanSchema, planModel } from "@/models/plan";

type Actor = { id: string; role: "SUPERUSUARIO" | "ADMINISTRADOR"; active: boolean };
// Must be wired to a trusted server-side session resolver, never client input.
type ResolveActor = () => Promise<Actor | null>;

export function createPlanController(resolveActor: ResolveActor, model = planModel) {
  async function requireAdministrator() {
    const actor = await resolveActor();
    if (!actor?.active || !["SUPERUSUARIO", "ADMINISTRADOR"].includes(actor.role)) {
      throw new AccessDeniedError();
    }
    return actor;
  }
  return {
    async list() {
      await requireAdministrator();
      return model.list();
    },
    async create(input: unknown) {
      const actor = await requireAdministrator();
      return model.create(createPlanSchema.parse(input), actor.id);
    },
  };
}
