"use server";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { createStructureController } from "@/controllers/structure-controller";
import { resolveActor } from "@/controllers/session-controller";
import { AccessDeniedError } from "@/controllers/errors";
import { StructureError } from "@/models/plan-structure";

export async function structureAction(operation: "save" | "preview" | "remove", input: unknown) {
  try {
    const controller = createStructureController(resolveActor);
    if (operation === "preview") return { ok: true as const, preview: await controller.preview(input) };
    if (operation === "save") await controller.save(input);
    else if (operation === "remove") await controller.remove(input);
    else throw new StructureError("Operación inválida.");
    revalidatePath("/planes/[id]", "page");
    return { ok: true as const };
  } catch (error) {
    const message = error instanceof ZodError ? error.issues[0]?.message : error instanceof AccessDeniedError ? "Tu sesión no permite esta operación. Vuelve a iniciar sesión." : error instanceof StructureError ? error.message : "No se pudo completar la operación. Actualiza la página e intenta nuevamente.";
    return { ok: false as const, error: message ?? "Revisa los datos." };
  }
}

export async function saveActionWithMilestones(input: unknown) {
  try {
    const { createActionController } = await import("@/controllers/action-controller");
    await createActionController(resolveActor).save(input);
    revalidatePath("/planes/[id]", "page");
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: error instanceof ZodError ? error.issues[0]?.message ?? "Revisa los datos." : error instanceof StructureError ? error.message : error instanceof AccessDeniedError ? "Tu sesión no permite esta operación." : "No se pudo guardar. Actualiza la página e intenta nuevamente." };
  }
}

export async function saveStructureWeights(input: unknown) {
  try {
    const controller = createStructureController(resolveActor);

    await controller.saveWeights(input);

    revalidatePath("/planes/[id]", "page");

    return { ok: true as const };
  } catch (error) {
    const message =
      error instanceof ZodError
        ? error.issues[0]?.message
        : error instanceof AccessDeniedError
          ? "Tu sesión no permite esta operación. Vuelve a iniciar sesión."
          : error instanceof StructureError
            ? error.message
            : "No se pudieron guardar los pesos. Actualiza la página e intenta nuevamente.";

    return {
      ok: false as const,
      error: message ?? "Revisa los pesos ingresados.",
    };
  }
}
