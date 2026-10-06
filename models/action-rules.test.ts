import { describe, expect, it } from "vitest";
import { actionInputSchema, percentageToBps } from "./action-rules";
const input = { planId: "p", dimensionId: "d", name: "Acción", description: "Descripción", responsibleName: "Responsable", startDate: "2026-01-01", endDate: "2026-12-31", actualExpense: null, milestones: [{ name: "Hito", weightBps: 10000 }] };
describe("guardado de acciones", () => {
  it("acepta CLP exactos y porcentajes con dos decimales", () => {
    expect(actionInputSchema.parse({ ...input, actualExpense: "9999999999999999" }).actualExpense).toBe("9999999999999999");
    expect(percentageToBps("33,33")).toBe(3333); expect(percentageToBps("33.33")).toBe(3333); expect(percentageToBps("1.001")).toBeNaN();
  });
  it.each([{ milestones: [] }, { milestones: [{ name: "H", weightBps: 9999 }] }, { endDate: "2025-01-01" }, { startDate: "2026-02-30" }, { actualExpense: "-1" }, { actualExpense: "0.5" }, { actualExpense: "10000000000000000" }, { responsibleName: " " }, { id: "a" }])("rechaza entradas incompletas %j", change => {
    expect(actionInputSchema.safeParse({ ...input, ...change }).success).toBe(false);
  });
  it("rechaza IDs de hitos repetidos", () => {
    expect(actionInputSchema.safeParse({ ...input, id: "a", version: 0, milestones: [1, 2].map(() => ({ id: "h", name: "H", weightBps: 5000 })) }).success).toBe(false);
  });
});

it.each([0, 5000, 10000])("rechaza progressBps=%s en la entrada estructural", progressBps => {
  expect(actionInputSchema.safeParse({ ...input, milestones: [{ ...input.milestones[0], progressBps }] }).success).toBe(false);
  expect(actionInputSchema.safeParse({ ...input, progressBps }).success).toBe(false);
});
it("rechaza la antigua bandera de corrección en estructura", () => {
  expect(actionInputSchema.safeParse({ ...input, correctProgress: true }).success).toBe(false);
});
