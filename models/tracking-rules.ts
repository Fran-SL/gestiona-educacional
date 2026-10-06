import { z } from "zod";
import { basisPointsSchema } from "./milestone-rules";

const id = z.string().trim().min(1, "Falta el identificador.").max(200);
const version = z.number().int().min(0).max(2_147_483_646);
export const reviewTargetSchema = z.object({ planId: id, reviewId: id }).strict();
export const startReviewSchema = z.object({
  planId: id,
  title: z.string().trim().min(1, "Ingresa un título.").max(200),
  referenceStartDate: z.iso.date(), referenceEndDate: z.iso.date(),
}).strict().refine(v => v.referenceEndDate >= v.referenceStartDate, {
  message: "La fecha final no puede ser anterior al inicio.", path: ["referenceEndDate"],
});
export const readReviewSchema = reviewTargetSchema.extend({ includeEvents: z.boolean().default(false) });
export const listReviewsSchema = z.object({ planId: id, status: z.enum(["ABIERTA", "FINALIZADA"]).optional() }).strict();
export const saveTrackingSchema = reviewTargetSchema.extend({
  reviewActionId: id, version,
  milestones: z.array(z.object({
    reviewMilestoneId: id, progressBps: basisPointsSchema,
    confirmDecrease: z.boolean().default(false),
    reason: z.string().trim().max(5000).optional(),
  }).strict()).min(1),
}).refine(v => new Set(v.milestones.map(h => h.reviewMilestoneId)).size === v.milestones.length,
  { message: "Un hito no puede aparecer dos veces.", path: ["milestones"] });
export const finalizeReviewSchema = reviewTargetSchema.extend({ version, confirmPending: z.boolean().default(false) });
export const reviewEventsSchema = reviewTargetSchema.extend({ reviewActionId: id, reviewMilestoneId: id.optional() });
export type StartReviewInput = z.infer<typeof startReviewSchema>;
export type SaveTrackingInput = z.infer<typeof saveTrackingSchema>;
export type FinalizeReviewInput = z.infer<typeof finalizeReviewSchema>;
export type ReadReviewInput = z.infer<typeof readReviewSchema>;
export type ListReviewsInput = z.infer<typeof listReviewsSchema>;
export type ReviewEventsInput = z.infer<typeof reviewEventsSchema>;
