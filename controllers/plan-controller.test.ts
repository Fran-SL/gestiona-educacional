import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createPlanController } from "./plan-controller";
import { createPlanSchema, planModel } from "../models/plan";

function fakeModel() {
  return { list: vi.fn<typeof planModel.list>().mockResolvedValue([]), create: vi.fn<typeof planModel.create>() };
}
describe("Acceso y creación de planes", () => {
  it.each([null, { id: "inactive", role: "ADMINISTRADOR" as const, active: false }])("rechaza usuarios sin acceso", async actor => {
    const model = fakeModel();
    const controller = createPlanController(async () => actor, model);
    await expect(controller.list()).rejects.toThrow();
    await expect(controller.create({ name: "Plan" })).rejects.toThrow();
    expect(model.list).not.toHaveBeenCalled(); expect(model.create).not.toHaveBeenCalled();
  });
  it.each(["SUPERUSUARIO", "ADMINISTRADOR"] as const)("autoriza %s y usa la identidad de sesión", async role => {
    const model = fakeModel();
    const controller = createPlanController(async () => ({ id: "session-user", active: true, role }), model);
    await controller.create({ name: " Plan 2026 ", createdById: "forged-user" });
    expect(model.create).toHaveBeenCalledWith({ name: "Plan 2026", description: "", startDate: null, endDate: null }, "session-user");
  });
  it("rechaza nombres vacíos y fechas inválidas", () => {
    expect(createPlanSchema.safeParse({ name: "   " }).success).toBe(false);
    expect(createPlanSchema.safeParse({ name: "Plan", startDate: "2026-02-30" }).success).toBe(false);
    expect(createPlanSchema.safeParse({ name: "Plan", startDate: "2026-12-31", endDate: "2026-01-01" }).success).toBe(false);
  });
  it("permite fechas libres o ausentes sin imponer cuatro años", () => {
    expect(createPlanSchema.safeParse({ name: "Plan" }).success).toBe(true);
    expect(createPlanSchema.safeParse({ name: "Plan", startDate: "2026-01-01", endDate: "2026-12-31" }).success).toBe(true);
  });
});
