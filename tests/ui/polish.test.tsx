import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import userEvent from "@testing-library/user-event";
import Dialog from "@/views/ui/Dialog";
import ActionDonut from "@/views/dashboard/ActionDonut";
import ScrollReveal from "@/views/dashboard/ScrollReveal";
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it("Escape respects busy, does not submit, and returns focus to the opener", async () => {
  const submit = vi.fn();
  function Fixture({ busy }: { busy: boolean }) {
    const [open, setOpen] = useState(false);
    return <><button onClick={() => setOpen(true)}>Abrir</button>{open && <Dialog title="Editar" busy={busy} onClose={() => setOpen(false)}><form onSubmit={submit}><label>Nombre<input /></label></form></Dialog>}</>;
  }
  const view = render(<Fixture busy={true} />);
  await userEvent.click(screen.getByRole("button", { name: "Abrir" }));
  fireEvent(screen.getByRole("dialog", { name: "Editar" }), new Event("cancel", { cancelable: true }));
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Cerrar diálogo" }).hasAttribute("disabled")).toBe(true);
  view.rerender(<Fixture busy={false} />);
  fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Abrir" }));
  expect(submit).not.toHaveBeenCalled();
  expect(document.body.style.overflow).toBe("");
});
it("donut retains unavailable actions in the total instead of assigning zero progress", () => {
  const { container } = render(<ActionDonut actions={{ total: 10, completed: 2, inProgress: 3, notStarted: 4, unavailable: 1 }} />);
  expect(screen.getByRole("img", { name: /2 completadas, 3 en avance, 4 sin iniciar, 1 no calculables/ })).toBeTruthy();
  expect(Array.from(container.querySelectorAll("circle[pathLength]")).map(c => c.getAttribute("stroke-dasharray"))).toEqual(["20 100", "30 100", "40 100", "10 100"]);
});
it("empty donut has no invented segments", () => {
  const { container } = render(<ActionDonut actions={{ total: 0, completed: 0, inProgress: 0, notStarted: 0, unavailable: 0 }} />);
  expect(container.querySelectorAll("circle[pathLength]")).toHaveLength(0);
  expect(screen.getByText("Sin acciones para representar.")).toBeTruthy();
});
it("reveal keeps content visible for reduced motion", () => {
  vi.mocked(window.matchMedia).mockReturnValueOnce({ matches: true } as MediaQueryList);
  const observer = vi.fn(); vi.stubGlobal("IntersectionObserver", observer);
  const { container } = render(<ScrollReveal><section>Indicadores</section></ScrollReveal>);
  expect(observer).not.toHaveBeenCalled();
  expect(container.querySelector(".reveal-pending")).toBeNull();
});
it("reveal observes offscreen content once and cleans up", () => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ top: 2000 } as DOMRect);
  const observe = vi.fn(), unobserve = vi.fn(), disconnect = vi.fn();
  let callback: IntersectionObserverCallback;
  vi.stubGlobal("IntersectionObserver", class { constructor(cb: IntersectionObserverCallback) { callback = cb; } observe = observe; unobserve = unobserve; disconnect = disconnect; });
  const view = render(<ScrollReveal><section>Indicadores</section></ScrollReveal>);
  const target = view.container.querySelector("section")!;
  expect(target.classList.contains("reveal-pending")).toBe(true);
  callback!([{ isIntersecting: true, target, time: 0, intersectionRatio: 1, boundingClientRect: target.getBoundingClientRect(), intersectionRect: target.getBoundingClientRect(), rootBounds: null }], {} as IntersectionObserver);
  expect(target.classList.contains("reveal-pending")).toBe(false);
  expect(unobserve).toHaveBeenCalledWith(target);
  view.unmount(); expect(disconnect).toHaveBeenCalled();
});

const formMocks = vi.hoisted(() => ({ save: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: formMocks.refresh }) }));
vi.mock("@/app/planes/[id]/actions", () => ({ saveActionWithMilestones: formMocks.save }));
import ActionForm from "@/views/plans/ActionForm";
it("action dialog keeps server errors and draft inside, preserves the structural payload", async () => {
  formMocks.save.mockResolvedValue({ ok: false, error: "Revisa los datos de la acción." });
  const saved = vi.fn(), close = vi.fn(), user = userEvent.setup();
  render(<ActionForm planId="plan" dimensionId="dim" superuser onClose={close} onSaved={saved} action={{ id: "a", version: 3, name: "Acción", description: "Descripción", responsibleName: "Equipo", startDate: "2026-01-01", endDate: "2026-12-31", actualExpense: null, weightBps: 10000, milestones: [{ id: "h", name: "Hito", weightBps: 10000, comments: [] }] }} />);
  await user.click(screen.getByRole("button", { name: "Guardar acción e hitos" }));
  expect(screen.getByRole("dialog").contains(screen.getByRole("alert"))).toBe(true);
  expect((screen.getByLabelText("Nombre de la acción") as HTMLInputElement).value).toBe("Acción");
  expect(formMocks.save.mock.calls.at(-1)![0].milestones).toEqual([{ id: "h", name: "Hito", weightBps: 10000, newComment: "" }]);
  expect(saved).not.toHaveBeenCalled(); expect(close).not.toHaveBeenCalled();
});
it("dialog wraps keyboard focus at both ends", async () => {
  vi.spyOn(Element.prototype, "getClientRects").mockReturnValue([{}] as unknown as DOMRectList);
  render(<Dialog title="Confirmar" onClose={() => {}}><button>Cancelar</button></Dialog>);
  const first = screen.getByRole("button", { name: "Cerrar diálogo" }), last = screen.getByRole("button", { name: "Cancelar" });
  last.focus(); fireEvent.keyDown(last, { key: "Tab" }); expect(document.activeElement).toBe(first);
  fireEvent.keyDown(first, { key: "Tab", shiftKey: true }); expect(document.activeElement).toBe(last);
});
