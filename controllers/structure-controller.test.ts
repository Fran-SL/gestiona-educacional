import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createStructureController } from "./structure-controller";
import { structureModel } from "@/models/plan-structure";

function model() {
  return {
    get: vi.fn<typeof structureModel.get>(),
    saveWeights: vi.fn<typeof structureModel.saveWeights>(),
    save: vi.fn<typeof structureModel.save>(),
    preview: vi.fn<typeof structureModel.preview>(),
    remove: vi.fn<typeof structureModel.remove>(),
  };
}
//primer test.
const target = { planId: "plan", kind: "dimension", id: "dimension" };
describe("permisos y confirmación de estructura", () => {
  it.each([null, { active: false, role: "SUPERUSUARIO" }, { active: true, role: "OTHER" }])("rechaza actores sin acceso %j", async actor => {
    const db = model(); const controller = createStructureController(async () => actor, db);
    await expect(controller.get("plan")).rejects.toThrow();

    await expect(
      controller.saveWeights({
        planId: "plan",
        kind: "dimension",
        parentId: "plan",
        weights: [{ id: "dimension", weightBps: 10000 }],
      })
    ).rejects.toThrow();

    await expect(controller.save({ ...target, name: "Nombre" })).rejects.toThrow();
    await expect(controller.preview(target)).rejects.toThrow();
    await expect(controller.remove({ ...target, confirmed: true, token: "a".repeat(64) })).rejects.toThrow();
    expect(db.remove).not.toHaveBeenCalled(); expect(db.save).not.toHaveBeenCalled();
    expect(db.saveWeights).not.toHaveBeenCalled();
  });
  it.each(["SUPERUSUARIO", "ADMINISTRADOR"])("permite guardar y exige confirmación a %s", async role => {
    const db = model(); const controller = createStructureController(async () => ({ active: true, role }), db);
    await controller.save({ ...target, name: " Dimensión " });
    expect(db.save).toHaveBeenCalledWith({ ...target, name: "Dimensión", description: "" });

    await controller.saveWeights({
      planId: "plan",
      kind: "dimension",
      parentId: "plan",
      weights: [{ id: "dimension", weightBps: 10000 }],
    });

    expect(db.saveWeights).toHaveBeenCalledWith({
      planId: "plan",
      kind: "dimension",
      parentId: "plan",
      weights: [{ id: "dimension", weightBps: 10000 }],
    });
    
    await expect(controller.remove(target)).rejects.toThrow();
    await expect(controller.remove({ ...target, confirmed: false, token: "a".repeat(64) })).rejects.toThrow();
    expect(db.remove).not.toHaveBeenCalled();
    await controller.remove({ ...target, confirmed: true, token: "a".repeat(64) });
    expect(db.remove).toHaveBeenCalledOnce();
  });
});
