import { z } from "zod";
import { basisPointsSchema } from "./milestone-rules";

export const actionInputSchema = z.object({
  planId: z.string().min(1), dimensionId: z.string().min(1),
  id: z.string().min(1).optional(), version: z.number().int().nonnegative().optional(),
  name: z.string().trim().min(1, "Ingresa el nombre de la acción.").max(200),
  description: z.string().trim().min(1, "Ingresa la descripción.").max(5000),
  responsibleName: z.string().trim().min(1, "Ingresa el responsable.").max(200),
  startDate: z.iso.date({ error: "Ingresa una fecha de inicio válida." }),
  endDate: z.iso.date({ error: "Ingresa una fecha límite válida." }),
  actualExpense: z.string().regex(/^\d{1,16}$/, "El gasto debe ser un monto entero, positivo o cero, de hasta 16 dígitos.").nullable(),
  milestones: z.array(
    z.object({
      id: z.string().min(1).optional(),

      name: z
        .string()
        .trim()
        .min(1, "El hito necesita un nombre.")
        .max(200),

      weightBps: basisPointsSchema,

      newComment: z
        .string()
        .trim()
        .max(5000)
        .default(""),
    }).strict()
  ).min(1, "La acción necesita al menos un hito."),
  confirmedRemovedIds: z.array(z.string()).default([]),
}).strict().superRefine((value, ctx) => {
  if (value.endDate < value.startDate) ctx.addIssue({ code: "custom", message: "La fecha límite no puede ser anterior al inicio.", path: ["endDate"] });
  if (value.milestones.reduce((n, h) => n + h.weightBps, 0) !== 10000) ctx.addIssue({ code: "custom", message: "Los pesos de los hitos deben sumar 100%.", path: ["milestones"] });
  const ids = value.milestones.flatMap(h => h.id ? [h.id] : []);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", message: "Un hito no puede aparecer dos veces." });
  if (value.id && value.version === undefined) ctx.addIssue({ code: "custom", message: "Actualiza la página antes de editar." });
  if (!value.id && ids.length) ctx.addIssue({ code: "custom", message: "Los hitos de una nueva acción deben ser nuevos." });
});
export type ActionInput = z.infer<typeof actionInputSchema>;
export function percentageToBps(value: string): number {
  if (!/^\d{1,3}(?:[.,]\d{1,2})?$/.test(value)) return NaN;
  return Math.round(Number(value.replace(",", ".")) * 100);
}
