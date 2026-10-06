import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import DashboardView from "@/views/dashboard/DashboardView";
import { calculateDashboard } from "@/models/dashboard-rules";
import type { DashboardData } from "@/models/dashboard";
afterEach(cleanup);
function data(): DashboardData {
  return { plan: { id: "plan", name: "Plan institucional" }, source: null, reviews: [], history: { points: [], change: null }, summary: calculateDashboard([
    { id: "d", name: "Dimensión", weightBps: 10000, actions: [{ id: "a", name: "Acción", responsibleName: "Responsable", weightBps: 10000, actualExpense: "120000.00", currency: "CLP", milestones: [{ name: "Hito", weightBps: 10000, progressBps: 5000 }] }] },
  ]) };
}
it("muestra indicadores, origen actual, responsables y gastos reales", () => {
  render(<DashboardView data={data()} />);
  expect(screen.getByRole("progressbar", { name: "Avance global del plan" }).getAttribute("value")).toBe("50");
  expect(screen.getByText("120.000 CLP")).toBeTruthy();
  expect(screen.getByText("Responsable: Responsable")).toBeTruthy();
  expect(screen.getByText(/Estructura vigente y últimos avances/)).toBeTruthy();
  expect(screen.getByRole("link", { name: "Dashboard" }).getAttribute("aria-current")).toBe("page");
});
it("identifica revisión finalizada y permite consultar su seguimiento", () => {
  const input = data(); input.source = { id: "r", title: "Revisión histórica", status: "FINALIZADA", finalizedAt: "2026-10-01T13:26:00Z" };
  input.reviews = [{ id: "r", title: "Revisión histórica", status: "FINALIZADA", referenceStartDate: "2026-01-01", referenceEndDate: "2026-12-31" }];
  render(<DashboardView data={input} />);
  expect(screen.getByText(/historial finalizado, solo lectura/)).toBeTruthy();
  expect(screen.getByRole("link", { name: "Abrir esta revisión" }).getAttribute("href")).toBe("/planes/plan/seguimiento/r");
});
it("plan vacío no presenta 0% como dato calculado", () => {
  const input = data();input.summary = calculateDashboard([]);render(<DashboardView data={input} />);
  expect(screen.queryAllByRole("progressbar")).toHaveLength(0);
  expect(screen.getByRole("status").textContent).toContain("No se puede calcular");
});

it("barras comparan datos preparados y distinguen cero de no calculable", () => {
  const input = data();
  input.summary.dimensions[0].achievement = 0;
  input.summary.dimensions.push({ ...input.summary.dimensions[0], id: "missing", name: "Incompleta", achievement: null });
  render(<DashboardView data={input} />);
  expect(screen.getByRole("progressbar", { name: "Comparación: Dimensión" }).getAttribute("value")).toBe("0");
  expect(screen.queryByRole("progressbar", { name: "Comparación: Incompleta" })).toBeNull();
  expect(screen.getByRole("link", { name: "Dimensión" }).getAttribute("href")).toBe("#dimension-d");
});
it("evolución incluye cero real, no conecta huecos y ofrece valores accesibles", () => {
  const input = data();
  input.history.points = [0, null, 50, 60].map((achievement, i) => ({ id: `${i}`, title: `R${i}`, createdAt: `2026-0${i + 1}-01T12:00:00Z`, status: "FINALIZADA", achievement }));
  const { container } = render(<DashboardView data={input} />);
  expect(screen.getByRole("img", { name: "Logro global por revisión, escala de 0 a 100 %" })).toBeTruthy();
  expect(container.querySelectorAll('[data-point="review"]')).toHaveLength(3);
  expect(container.querySelectorAll('[data-segment="review"]')).toHaveLength(1);
  expect(screen.getByRole("list", { name: "Valores por revisión" }).textContent).toContain("No calculable");
  expect(screen.getByRole("link", { name: "1. R0" }).getAttribute("href")).toContain("reviewId=0");
});
