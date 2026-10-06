"use server";
import { ZodError } from "zod";
import { createTrackingController } from "@/controllers/tracking-controller";
import { resolveActor } from "@/controllers/session-controller";
import { AccessDeniedError } from "@/controllers/errors";
import { TrackingError } from "@/models/tracking-error";

async function respond<T>(work: () => Promise<T>) {
  try { return { ok: true as const, data: await work() }; }
  catch (error) {
    if (error instanceof AccessDeniedError) return { ok: false as const, code: "ACCESS_DENIED", error: "Tu sesión no permite esta operación. Vuelve a iniciar sesión." };
    if (error instanceof ZodError) return { ok: false as const, code: "INVALID_INPUT", error: "Revisa los datos enviados: identificadores, fechas, porcentajes y confirmaciones." };
    if (error instanceof TrackingError) return { ok: false as const, code: error.code, error: error.message };
    return { ok: false as const, code: "UNEXPECTED", error: "No se pudo completar la operación. Recarga e intenta nuevamente." };
  }
}
export async function startReview(input: unknown) { return respond(() => createTrackingController(resolveActor).start(input)); }
export async function readReview(input: unknown) { return respond(() => createTrackingController(resolveActor).read(input)); }
export async function listReviews(input: unknown) { return respond(() => createTrackingController(resolveActor).list(input)); }
export async function saveTrackingAction(input: unknown) { return respond(() => createTrackingController(resolveActor).save(input)); }
export async function finalizeReview(input: unknown) { return respond(() => createTrackingController(resolveActor).finalize(input)); }
export async function readProgressEvents(input: unknown) { return respond(() => createTrackingController(resolveActor).events(input)); }
