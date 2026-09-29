import { z } from "zod";

export const basisPointsSchema = z.number().int().min(0).max(10_000);
export const milestoneInputSchema = z.object({
  name: z.string().trim().min(1, "El hito necesita un nombre."),
  weightBps: basisPointsSchema,
  progressBps: basisPointsSchema,
});

export const milestonesSchema = z.array(milestoneInputSchema)
  .min(1, "La acción necesita al menos un hito.")
  .refine(
    (items) => items.reduce((sum, item) => sum + item.weightBps, 0) === 10_000,
    "Los pesos de los hitos deben sumar 100%.",
  );

export type MilestoneInput = z.infer<typeof milestoneInputSchema>;

/** Returns a percentage; round only for display, never each contribution. */
export function calculateAchievement(items: readonly MilestoneInput[]): number {
  const validated = milestonesSchema.parse(items);
  return validated.reduce((sum, item) => sum + item.weightBps * item.progressBps, 0) / 1_000_000;
}

export function validateProgressChange(previous: number, next: number, role: "ADMINISTRADOR" | "SUPERUSUARIO") {
  basisPointsSchema.parse(previous);
  basisPointsSchema.parse(next);
  if (next < previous && role !== "SUPERUSUARIO") {
    throw new Error("Solo el superusuario puede corregir un avance hacia abajo.");
  }
}
