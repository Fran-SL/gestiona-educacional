import "server-only";
import { z } from "zod";
import { AccessDeniedError } from "./errors";
import { structureInput, targetInput, weightsInput, structureModel } from "@/models/plan-structure";

type Actor = { active: boolean; role: string } | null;
export function createStructureController(resolveActor: () => Promise<Actor>, model = structureModel) {
  async function authorize() {
    const actor = await resolveActor();
    if (!actor?.active || !["SUPERUSUARIO", "ADMINISTRADOR"].includes(actor.role)) throw new AccessDeniedError();
  }
  return {
    async get(id: string) { await authorize(); return model.get(z.string().min(1).parse(id)); },

    async saveWeights(input: unknown) {
      await authorize();
      return model.saveWeights(weightsInput.parse(input));
    },

    async save(input: unknown) { await authorize(); return model.save(structureInput.parse(input)); },
    async preview(input: unknown) { await authorize(); return model.preview(targetInput.parse(input)); },
    async remove(input: unknown) {
      await authorize();
      const data = targetInput.extend({ confirmed: z.literal(true), token: z.string().length(64) }).parse(input);
      return model.remove(data, data.token);
    },
  };
}
