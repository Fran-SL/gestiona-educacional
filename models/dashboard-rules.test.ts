import { expect, it } from "vitest";
import { calculateDashboard, prepareDashboardHistory, type DashboardDimension } from "./dashboard-rules";
export function fixture(): DashboardDimension[] {
  const action = (id: string, weightBps: number, progressBps: number) => ({ id, name: id, responsibleName: "Responsable", weightBps, actualExpense: null, currency: "CLP", milestones: [{ name: "Hito", weightBps: 10000, progressBps }] });
  const a = action("A", 7500, 10000);
  a.milestones = [{ name: "H1", weightBps: 2000, progressBps: 0 }, { name: "H2", weightBps: 8000, progressBps: 10000 }];
  return [{ id: "D1", name: "D1", weightBps: 8000, actions: [a, action("B", 2500, 2000)] }, { id: "D2", name: "D2", weightBps: 2000, actions: [action("C", 10000, 1000)] }];
}
it("pondera Hitos → Acción → Dimensión → Plan con pesos desiguales", () => {
  const result = calculateDashboard(fixture());
  expect(result.dimensions[0].actions[0].achievement).toBe(80);
  expect(result.dimensions[0].achievement).toBe(65);
  expect(result.dimensions[1].achievement).toBe(10);
  expect(result.achievement).toBe(54);
  expect(result.milestones).toEqual({ total: 4, notStarted: 1, inProgress: 2, completed: 1 });
});
it("no redondea contribuciones intermedias ni confunde BPS con porcentajes", () => {
  const input = fixture();input[0].actions[0].milestones[1].progressBps = 3333;
  expect(calculateDashboard(input).achievement).toBeCloseTo(21.9984, 10);
});
it("sin estructura o pesos inválidos no inventa avance cero", () => {
  expect(calculateDashboard([]).achievement).toBeNull();
  const input = fixture();input[0].actions[0].milestones = [];
  expect(calculateDashboard(input).achievement).toBeNull();
  expect(calculateDashboard(input).actions.unavailable).toBe(1);
  const bad = fixture();bad[0].weightBps = 10000;
  expect(calculateDashboard(bad).achievement).toBeNull();
});
it("suma gastos exactamente y separa monedas y gastos sin registrar", () => {
  const input = fixture();input[0].actions[0].actualExpense = "9999999999999999.99";
  input[0].actions[1].actualExpense = "0.02";
  input[1].actions[0].currency = "USD";input[1].actions[0].actualExpense = "12.30";
  expect(calculateDashboard(input).expenses).toEqual([{ currency: "CLP", amount: "10000000000000000.01" }, { currency: "USD", amount: "12.30" }]);
  input[1].actions[0].actualExpense = null;
  expect(calculateDashboard(input).missingExpenses).toBe(1);
});

it("conserva el caso institucional validado: 57,884 %", () => {
  const dimensions = [6971, 5000, 2500, 10000].map((progressBps, i) => ({ ...fixture()[1], id: `D${i}`, weightBps: [4000, 3000, 2000, 1000][i], actions: [{ ...fixture()[1].actions[0], milestones: [{ name: "H", weightBps: 10000, progressBps }] }] }));
  expect(calculateDashboard(dimensions).achievement).toBeCloseTo(57.884, 10);
  expect(new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 }).format(calculateDashboard(dimensions).achievement!)).toBe("57,88");
});
it("ordena revisiones y conserva cero real y huecos sin comparar a través de ellos", () => {
  const point = (id: string, achievement: number | null) => ({ id, title: id, status: "FINALIZADA" as const, createdAt: `2026-0${id}-01T12:00:00Z`, achievement });
  const history = prepareDashboardHistory([point("3", 50), point("1", 0), point("2", null)]);
  expect(history.points.map(p => p.achievement)).toEqual([0, null, 50]);
  expect(history.change).toBeNull();
  expect(prepareDashboardHistory([point("2", 0), point("1", 50)]).change).toBe(-50);
  expect(prepareDashboardHistory([point("1", 0), point("2", 0)]).change).toBe(0);
});
