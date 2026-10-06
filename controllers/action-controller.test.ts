import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createActionController } from "./action-controller";
import { actionModel } from "@/models/action";
it("rechaza sesiones ausentes e inactivas antes de escribir", async () => {
  const model = { save: vi.fn<typeof actionModel.save>() };
  for (const actor of [null, { id: "u", role: "SUPERUSUARIO" as const, active: false }]) await expect(createActionController(async () => actor, model).save({})).rejects.toThrow();
  expect(model.save).not.toHaveBeenCalled();
});
