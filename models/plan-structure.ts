import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { getDatabase } from "./db";

export const structureInput = z.object({
  planId: z.string().min(1), kind: z.literal("dimension"),
  id: z.string().min(1).optional(),
  name: z.string().trim().min(1, "Ingresa un nombre.").max(200),
  description: z.string().trim().max(5000).default(""),
});
export const targetInput = z.object({ planId: z.string().min(1), kind: z.enum(["dimension", "action"]), id: z.string().min(1) });
// Definimos que forma de datos sera valida, tambien el contrato protege rango, suma total y IDs duplicados.
export const weightsInput = z
  .object({
    planId: z.string().min(1),
    kind: z.enum(["dimension", "action"]),
    parentId: z.string().min(1),
    weights: z
      .array(
        z.object({
          id: z.string().min(1),
          weightBps: z.number().int().min(0).max(10000),
        })
      )
      .min(1),
  })
  .superRefine((data, ctx) => {
    const total = data.weights.reduce(
      (sum, item) => sum + item.weightBps,
      0
    );

    if (total !== 10000) {
      ctx.addIssue({
        code: "custom",
        path: ["weights"],
        message: "Los pesos deben sumar exactamente 100 %.",
      });
    }

    const ids = data.weights.map(item => item.id);

    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: "custom",
        path: ["weights"],
        message: "No puede haber elementos repetidos.",
      });
    }
  });

export class StructureError extends Error {}
const tree = { dimensions: { orderBy: [{ position: "asc" as const }, { createdAt: "asc" as const }], include: { actions: { orderBy: [{ position: "asc" as const }, { createdAt: "asc" as const }], include: { milestones: { orderBy: [{ position: "asc" as const }, { createdAt: "asc" as const }], include: { comments: { orderBy: { id: "asc" as const } } } } } } } } };
export const structureModel = {
  get(planId: string) { return getDatabase().plan.findUnique({ where: { id: planId }, include: tree }); },
  async saveWeights(data: z.infer<typeof weightsInput>) {
    return getDatabase().$transaction(async tx => {
      const plan = await tx.plan.findUnique({
        where: { id: data.planId },
        select: { id: true },
      });

      if (!plan) {
        throw new StructureError("El plan ya no existe.");
      }

      if (data.kind === "dimension") {
        if (data.parentId !== data.planId) {
          throw new StructureError(
            "Los pesos no corresponden a este plan."
          );
        }

        const dimensions = await tx.dimension.findMany({
          where: { planId: data.planId },
          select: { id: true },
        });

        validateWeightMembers(
          dimensions.map(d => d.id),
          data.weights.map(item => item.id)
        );

        for (const item of data.weights) {
          await tx.dimension.update({
            where: { id: item.id },
            data: { weightBps: item.weightBps },
          });
        }

        return;
      }

      const dimension = await tx.dimension.findFirst({
        where: {
          id: data.parentId,
          planId: data.planId,
        },
        select: { id: true },
      });

      if (!dimension) {
        throw new StructureError(
          "La dimensión ya no pertenece a este plan."
        );
      }

      const actions = await tx.action.findMany({
        where: { dimensionId: data.parentId },
        select: { id: true },
      });

      validateWeightMembers(
        actions.map(a => a.id),
        data.weights.map(item => item.id)
      );

      for (const item of data.weights) {
        await tx.action.update({
          where: { id: item.id },
          data: { weightBps: item.weightBps },
        });
      }
    });
  },
  async save(data: z.infer<typeof structureInput>) {
    return getDatabase().$transaction(async tx => {
      if (!await tx.plan.findUnique({ where: { id: data.planId }, select: { id: true } })) throw new StructureError("El plan ya no existe.");
      const fields = { name: data.name, description: data.description };
      if (data.id) {
        const result = await tx.dimension.updateMany({
          where: { id: data.id, planId: data.planId },
          data: fields,
        });

        if (!result.count) {
          throw new StructureError("La dimensión ya no existe en este plan.");
        }
      } else {
        const dimensionCount = await tx.dimension.count({
          where: { planId: data.planId },
        });

        await tx.dimension.create({
          data: {
            ...fields,
            planId: data.planId,
            weightBps: dimensionCount === 0 ? 10000 : 0,
          },
        });
      }
    });
  },
  async preview(data: z.infer<typeof targetInput>) {
    const plan = await this.get(data.planId);
    return summarize(plan, data);
  },
  async remove(data: z.infer<typeof targetInput>, token: string) {
    return getDatabase().$transaction(async tx => {
      const plan = await tx.plan.findUnique({ where: { id: data.planId }, include: tree });
      if (summarize(plan, data).token !== token) throw new StructureError("El contenido cambió. Revisa nuevamente el resumen antes de eliminar.");
      if (data.kind === "dimension") {
        const dimension = await tx.dimension.findFirst({
          where: {
            id: data.id,
            planId: data.planId,
          },
          select: {
            id: true,
            weightBps: true,
          },
        });

        if (!dimension) {
          throw new StructureError(
            "La dimensión ya no existe en este plan."
          );
        }

        const dimensionCount = await tx.dimension.count({
          where: { planId: data.planId },
        });

        if (dimensionCount > 1 && dimension.weightBps !== 0) {
          throw new StructureError(
            "Antes de eliminar esta dimensión, asigna 0 % a su peso y redistribuye el porcentaje entre las dimensiones restantes."
          );
        }

        await tx.dimension.delete({
          where: { id: data.id },
        });
      } else {
        const action = await tx.action.findFirst({
          where: {
            id: data.id,
            dimension: {
              planId: data.planId,
            },
          },
          select: {
            id: true,
            dimensionId: true,
            weightBps: true,
          },
        });

        if (!action) {
          throw new StructureError(
            "La acción ya no existe en este plan."
          );
        }

        const actionCount = await tx.action.count({
          where: {
            dimensionId: action.dimensionId,
          },
        });

        if (actionCount > 1 && action.weightBps !== 0) {
          throw new StructureError(
            "Antes de eliminar esta acción, asigna 0 % a su peso y redistribuye el porcentaje entre las acciones restantes."
          );
        }

        await tx.action.delete({
          where: { id: data.id },
        });
      }
    }, { isolationLevel: "Serializable" });
  },
};
function summarize(plan: Awaited<ReturnType<typeof structureModel.get>>, data: z.infer<typeof targetInput>) {
  const dimension = plan?.dimensions.find(d => d.id === data.id);
  const action = plan?.dimensions.flatMap(d => d.actions).find(a => a.id === data.id);
  const entity = data.kind === "dimension" ? dimension : action;
  if (!entity) throw new StructureError("El elemento ya no existe en este plan.");
  const actions = data.kind === "dimension" ? dimension!.actions : [action!];
  const milestones = actions.flatMap(a => a.milestones);
  return { name: entity.name, dimensions: data.kind === "dimension" ? 1 : 0, actions: actions.length, milestones: milestones.length, comments: milestones.flatMap(m => m.comments).length,
    token: createHash("sha256").update(JSON.stringify(entity)).digest("hex") };
}

function validateWeightMembers(
  expectedIds: string[],
  receivedIds: string[]
) {
  if (
    expectedIds.length !== receivedIds.length ||
    expectedIds.some(id => !receivedIds.includes(id))
  ) {
    throw new StructureError(
      "La estructura cambió. Recarga la página antes de guardar los pesos."
    );
  }
}