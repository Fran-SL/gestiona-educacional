"use server";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { createPlanController } from "@/controllers/plan-controller";
import { resolveActor } from "@/controllers/session-controller";
import { AccessDeniedError } from "@/controllers/errors";

export async function createPlanAction(input: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await createPlanController(resolveActor).create(input);
    revalidatePath("/");
    return { ok: true };
  } catch (error) {
    if (error instanceof ZodError) return { ok: false, error: error.issues[0]?.message ?? "Revisa los datos del plan." };
    if (error instanceof AccessDeniedError) return { ok: false, error: "Tu sesión no permite esta operación. Vuelve a iniciar sesión." };
    return { ok: false, error: "No se pudo guardar el plan. Intenta nuevamente." };
  }
}
