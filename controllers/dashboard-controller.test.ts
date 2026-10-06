import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/models/dashboard", () => ({ dashboardModel: {} }));
import { createDashboardController } from "./dashboard-controller";
it.each([null, { active: false, role: "SUPERUSUARIO" }, { active: true, role: "OTRO" }])("rechaza acceso antes de leer datos: %j", async actor => {
  const model = { read: vi.fn() };
  await expect(createDashboardController(async () => actor, model).read({ planId: "plan" })).rejects.toThrow("permiso");
  expect(model.read).not.toHaveBeenCalled();
});
it.each(["ADMINISTRADOR", "SUPERUSUARIO"])("autoriza %s y valida entrada", async role => {
  const model = { read: vi.fn().mockResolvedValue(null) };
  const controller = createDashboardController(async () => ({ active: true, role }), model);
  await controller.read({ planId: "plan", reviewId: "review" });
  expect(model.read).toHaveBeenCalledWith("plan", "review");
  await expect(controller.read({ planId: "" })).rejects.toThrow();
});
