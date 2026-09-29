import { describe, expect, it } from "vitest";
import { calculateAchievement, milestonesSchema, validateProgressChange } from "./milestone-rules";

const example = [
  { name: "Cronograma", weightBps: 1000, progressBps: 7000 },
  { name: "Ejecución", weightBps: 3000, progressBps: 5000 },
  { name: "Evaluación", weightBps: 3000, progressBps: 10000 },
  { name: "Informe", weightBps: 3000, progressBps: 0 },
];

describe("Reglas de hitos", () => {
  it("calcula el 52% del ejemplo funcional", () => {
    expect(calculateAchievement(example)).toBe(52);
  });
  it("rechaza una acción sin hitos", () => {
    expect(milestonesSchema.safeParse([]).success).toBe(false);
  });
  it.each([9000, 11000])("rechaza suma de pesos %i", (weightBps) => {
    expect(milestonesSchema.safeParse([{ name: "Único", weightBps, progressBps: 0 }]).success).toBe(false);
  });
  it.each([-1, 10001, 1.5, NaN, Infinity])("rechaza avances inválidos %s", (progressBps) => {
    expect(milestonesSchema.safeParse([{ name: "Único", weightBps: 10000, progressBps }]).success).toBe(false);
  });
  it("acepta pesos fraccionarios sin error de suma flotante", () => {
    const items = [3333, 3333, 3334].map(weightBps => ({ name: "Hito", weightBps, progressBps: 10000 }));
    expect(calculateAchievement(items)).toBe(100);
  });
  it("recalcula hacia abajo al redistribuir pesos sin reducir avances", () => {
    const before = [{ name: "A", weightBps: 8000, progressBps: 10000 }, { name: "B", weightBps: 2000, progressBps: 0 }];
    const after = before.map((item, i) => ({ ...item, weightBps: i === 0 ? 2000 : 8000 }));
    expect(calculateAchievement(before)).toBe(80);
    expect(calculateAchievement(after)).toBe(20);
  });
  it("recalcula al agregar y eliminar hitos", () => {
    expect(calculateAchievement([{ name: "A", weightBps: 10000, progressBps: 10000 }])).toBe(100);
    expect(calculateAchievement([{ name: "A", weightBps: 5000, progressBps: 10000 }, { name: "B", weightBps: 5000, progressBps: 0 }])).toBe(50);
  });
  it("impide retrocesos normales y admite correcciones del superusuario", () => {
    expect(() => validateProgressChange(7000, 6000, "ADMINISTRADOR")).toThrow();
    expect(() => validateProgressChange(7000, 6000, "SUPERUSUARIO")).not.toThrow();
    expect(() => validateProgressChange(7000, 8000, "ADMINISTRADOR")).not.toThrow();
  });
});
