import "server-only";
import { z } from "zod";
import { getDatabase } from "./db";

export const createPlanSchema = z.object({
  name: z.string().trim().min(1, "Ingresa el nombre del plan.").max(200, "El nombre admite hasta 200 caracteres."),
  description: z.string().trim().max(5000, "La descripción admite hasta 5000 caracteres.").default(""),
  startDate: z.iso.date().nullable().default(null),
  endDate: z.iso.date().nullable().default(null),
}).refine(
  (plan) => !plan.startDate || !plan.endDate || plan.endDate >= plan.startDate,
  { message: "La fecha de término no puede ser anterior al inicio.", path: ["endDate"] },
);

export const planModel = {
  list() {
    return getDatabase().plan.findMany({ orderBy: { createdAt: "desc" } });
  },
  create(input: z.infer<typeof createPlanSchema>, createdById: string) {
    const data = createPlanSchema.parse(input);
    return getDatabase().plan.create({ data: {
      ...data,
      startDate: data.startDate ? new Date(`${data.startDate}T00:00:00.000Z`) : null,
      endDate: data.endDate ? new Date(`${data.endDate}T00:00:00.000Z`) : null,
      createdById,
    } });
  },
};
