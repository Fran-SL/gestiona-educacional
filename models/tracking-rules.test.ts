import { it, expect } from "vitest";
import { startReviewSchema, saveTrackingSchema, finalizeReviewSchema, readReviewSchema, reviewEventsSchema } from "./tracking-rules";
const start = { planId: "p", title: " Revisión ", referenceStartDate: "2026-01-01", referenceEndDate: "2026-12-31" };
const save = { planId: "p", reviewId: "r", reviewActionId: "a", version: 0, milestones: [{ reviewMilestoneId: "h", progressBps: 5000 }] };
it("título y fechas válidas, fechas reales y ordenadas", () => {
  expect(startReviewSchema.parse(start).title).toBe("Revisión");
  for (const patch of [{ planId: " " }, { title: " " }, { referenceStartDate: "2026-02-30" }, { referenceEndDate: "2025-12-31" }]) expect(startReviewSchema.safeParse({ ...start, ...patch }).success).toBe(false);
});
it.each([-1, 10001, 0.5, NaN, Infinity])("rechaza BPS inválidos: %s", progressBps => {
  expect(saveTrackingSchema.safeParse({ ...save, milestones: [{ ...save.milestones[0], progressBps }] }).success).toBe(false);
});
it("rechaza duplicados, versiones inválidas y confirmaciones no booleanas", () => {
  for (const patch of [{ version: -1 }, { version: 0.5 }, { version: 2147483647 }, { milestones: [] }, { milestones: [...save.milestones, ...save.milestones] }, { milestones: [{ ...save.milestones[0], confirmDecrease: "true" }] }]) expect(saveTrackingSchema.safeParse({ ...save, ...patch }).success).toBe(false);
  expect(finalizeReviewSchema.safeParse({ planId: "p", reviewId: "r", version: 0, confirmPending: 1 }).success).toBe(false);
});
it.each(["actorId", "actorRole", "previousBps", "type", "weightBps", "snapshotTransactionId"])("rechaza campo sensible %s en raíz y hito", field => {
  expect(saveTrackingSchema.safeParse({ ...save, [field]: "forjado" }).success).toBe(false);
  expect(saveTrackingSchema.safeParse({ ...save, milestones: [{ ...save.milestones[0], [field]: "forjado" }] }).success).toBe(false);
});
it("lecturas estrictas y motivo acotado", () => {
  expect(readReviewSchema.safeParse({ planId: "p", reviewId: "r", includeEvents: true, actorRole: "SUPERUSUARIO" }).success).toBe(false);
  expect(reviewEventsSchema.safeParse({ planId: "p", reviewId: "r", reviewActionId: " " }).success).toBe(false);
  expect(saveTrackingSchema.safeParse({ ...save, milestones: [{ ...save.milestones[0], reason: "a".repeat(5001) }] }).success).toBe(false);
});
