import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Review, ReviewList } from "@/views/tracking/types";
const mocks = vi.hoisted(() => ({ push: vi.fn(), startReview: vi.fn(), readReview: vi.fn(), listReviews: vi.fn(), saveTrackingAction: vi.fn(), finalizeReview: vi.fn(), readProgressEvents: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("next/link", () => ({ default: ({ href, children, onNavigate, ...props }: { href: string; children: React.ReactNode; onNavigate?: (event: { preventDefault: () => void }) => void }) => <a {...props} href={href} onClick={e => { e.preventDefault(); onNavigate?.({ preventDefault() {} }); }}>{children}</a> }));
vi.mock("@/app/seguimiento/actions", () => mocks);
import TrackingView from "@/views/tracking/TrackingView";
import StartReviewForm from "@/views/tracking/StartReviewForm";
import { parsePercent } from "@/views/tracking/presentation";
const person = { id: "user", name: "Usuario de prueba" };
function fixture(): Review {
  const a = (id: string, name: string) => ({
    id, sourceActionId: `source-${id}`, name, description: "Descripción", responsibleName: "Responsable", position: 0,
    startDate: "2026-01-01", endDate: "2026-12-31", actualExpense: "850000", currency: "CLP", version: 0,
    lastReviewedAt: null, lastReviewedBy: null, state: "PENDIENTE", achievement: 58, initialAchievement: 58,
    milestones: [2000, 3000, 5000].map((weightBps, i) => ({ id: `${id}-${i}`, sourceMilestoneId: `source-${id}-${i}`, name: `Hito ${i + 1}`, position: i, weightBps, initialProgressBps: [4000,5000,7000][i], progressBps: [4000,5000,7000][i], sourceDeleted: false, sourceAvailable: true })),
  });
  return { id: "review", planId: "plan", title: "Reunión", status: "ABIERTA", version: 0, referenceStartDate: "2026-03-01", referenceEndDate: "2026-06-30",
    planName: "Plan", planDescription: "", planStatus: "ABIERTO", planStartDate: null, planEndDate: null, createdAt: "2026-03-01T12:00:00Z", createdById: person.id, createdBy: person,
    finalizedAt: null, finalizedById: null, finalizedBy: null, relatedReviewId: null,
    dimensions: [{ id: "dimension", sourceDimensionId: "source-d", name: "Pedagógica", description: "", position: 0, actions: [a("a", "Acción A"), a("b", "Acción B")] },
      { id: "dimension2", sourceDimensionId: "source-d2", name: "Liderazgo", description: "", position: 1, actions: [a("c", "Acción C")] }],
  };
}
function list(r: Review): ReviewList {
  return [{ ...r, pending: r.dimensions.flatMap(d => d.actions).filter(a => a.state === "PENDIENTE").length, reviewed: 0 }];
}
function mount(r = fixture(), superuser = false, reviews = list(r)) {
  render(<TrackingView plan={{ id: "plan", name: "Plan" }} initialReview={r} initialReviews={reviews} superuser={superuser} />);
  return userEvent.setup();
}
const field = (n = 1) => screen.getByRole("textbox", { name: `Nuevo avance de Hito ${n} (%)` });
const button = (name: string) => screen.getByRole("button", { name });
async function fill(user: ReturnType<typeof userEvent.setup>, n: number, value: string) { await user.clear(field(n)); await user.type(field(n), value); }
function saved(r: Review, changes = [6000,5000,7000]): Review {
  const next = structuredClone(r); next.version++;
  const a = next.dimensions[0].actions[0]; a.version++; a.state = "REVISADA_CON_CAMBIOS"; a.lastReviewedBy = person; a.lastReviewedAt = "2026-04-01T12:00:00Z";
  a.milestones.forEach((h,i) => h.progressBps = changes[i]); a.achievement = a.milestones.reduce((n,h) => n + h.weightBps * h.progressBps,0)/1e6;
  return next;
}
beforeEach(() => { vi.clearAllMocks(); mocks.readProgressEvents.mockResolvedValue({ ok: true, data: [] }); });
afterEach(cleanup);
it.each(["0", "100", "60,25", "60.25"])("acepta porcentaje normal %s", value => { expect(parsePercent(value)).not.toBeNull(); });
it.each(["", "-1", "100.01", "1.234", "texto"])("rechaza porcentaje inválido %s", value => { expect(parsePercent(value)).toBeNull(); });
it("inicia revisión con solo título y período", async () => {
  mocks.startReview.mockResolvedValue({ ok: true, data: { id: "new" } }); const created = vi.fn(); const user = userEvent.setup();
  render(<StartReviewForm planId="plan" onCreated={created} onCancel={() => {}} onFailure={() => {}} />);
  await user.type(screen.getByLabelText("Título", { exact: true }), "Reunión");
  fireEvent.change(screen.getByLabelText("Inicio del período"), { target: { value: "2026-01-01" } });
  fireEvent.change(screen.getByLabelText("Fin del período"), { target: { value: "2026-03-01" } });
  await user.click(button("Crear revisión"));
  expect(mocks.startReview).toHaveBeenCalledWith({ planId: "plan", title: "Reunión", referenceStartDate: "2026-01-01", referenceEndDate: "2026-03-01" }); expect(created).toHaveBeenCalledWith("new");
});
it("navega dimensiones y acciones sin mostrar formularios simultáneos", async () => {
  const user = mount(); expect(screen.getAllByRole("textbox", { name: /Nuevo avance/ })).toHaveLength(3);
  await user.click(button("Siguiente →")); expect(screen.getByRole("heading", { name: "Acción B" })).toBeTruthy();
  await user.click(screen.getByRole("button", { name: /Liderazgo/ })); expect(screen.getByRole("heading", { name: "Acción C" })).toBeTruthy();
  await user.click(button("← Anterior")); expect(screen.getByRole("heading", { name: "Acción B" })).toBeTruthy();
});
it("guardar envía N hitos, usa respuesta del servidor y conserva selección", async () => {
  const r = fixture(); mocks.saveTrackingAction.mockResolvedValue({ ok: true, data: saved(r, [6000,6050,8000]) }); const user = mount(r);
  await fill(user,1,"60"); await fill(user,2,"60,50"); await fill(user,3,"80");
  expect(mocks.saveTrackingAction).not.toHaveBeenCalled();
  expect(screen.getByText("Resultado propuesto: 70,15 % · Sin guardar")).toBeTruthy();
  await user.click(button("Guardar seguimiento"));
  expect(mocks.saveTrackingAction).toHaveBeenCalledWith({ planId:"plan", reviewId:"review", reviewActionId:"a", version:0, milestones:[{reviewMilestoneId:"a-0",progressBps:6000},{reviewMilestoneId:"a-1",progressBps:6050},{reviewMilestoneId:"a-2",progressBps:8000}] });
  expect(screen.getByText("Seguimiento guardado.")).toBeTruthy(); expect(screen.getByText("Revisadas: 1")).toBeTruthy(); expect(screen.getByRole("heading",{name:"Acción A"})).toBeTruthy();
});
it("confirma sin cambios y conserva el estado con cambios si ya existía", async () => {
  const r=fixture(), next=saved(r,[4000,5000,7000]); next.dimensions[0].actions[0].state="REVISADA_SIN_CAMBIOS";
  mocks.saveTrackingAction.mockResolvedValue({ok:true,data:next});const user=mount(r);await user.click(button("Confirmar revisión sin cambios"));
  expect(screen.getByText("Revisión confirmada sin cambios de avance.")).toBeTruthy();expect(mocks.saveTrackingAction.mock.calls[0][0].milestones[0].progressBps).toBe(4000);
  mocks.saveTrackingAction.mockResolvedValue({ok:true,data:{...next,dimensions:[{...next.dimensions[0],actions:[{...next.dimensions[0].actions[0],state:"REVISADA_CON_CAMBIOS"},next.dimensions[0].actions[1]]},next.dimensions[1]]}});
  await user.click(button("Confirmar revisión sin cambios"));expect(screen.getAllByText("✓ Revisada con cambios").length).toBeGreaterThan(0);
});
it("administrador no disminuye y puede restaurar el valor", async()=>{
  const user=mount();await fill(user,1,"30");expect(button("Guardar seguimiento").hasAttribute("disabled")).toBe(true);
  expect(screen.getByText("Solo el superusuario puede corregir un avance hacia abajo.")).toBeTruthy();await user.click(button("Restaurar valor guardado"));expect((field() as HTMLInputElement).value).toBe("40");
  expect(mocks.saveTrackingAction).not.toHaveBeenCalled();
});
it("superusuario confirma múltiples correcciones individualmente y se invalida al editar", async()=>{
  const r=fixture();mocks.saveTrackingAction.mockResolvedValue({ok:true,data:saved(r,[3000,5000,5500])});const user=mount(r,true);
  await fill(user,1,"30");await fill(user,3,"60");await user.click(button("Guardar seguimiento"));
  expect(button("Confirmar correcciones y guardar acción").hasAttribute("disabled")).toBe(true);
  await user.type(screen.getByLabelText("Motivo de corrección de Hito 1"),"Motivo uno");await user.click(screen.getByLabelText("Confirmo la disminución de Hito 1"));
  await user.type(screen.getByLabelText("Motivo de corrección de Hito 3"),"Motivo tres");await user.click(screen.getByLabelText("Confirmo la disminución de Hito 3"));
  await user.type(screen.getByLabelText("Motivo de corrección de Hito 1")," revisado");expect((screen.getByLabelText("Confirmo la disminución de Hito 1") as HTMLInputElement).checked).toBe(false);
  await user.click(screen.getByLabelText("Confirmo la disminución de Hito 1"));await fill(user,3,"55");expect((screen.getByLabelText("Confirmo la disminución de Hito 3") as HTMLInputElement).checked).toBe(false);
  await user.click(screen.getByLabelText("Confirmo la disminución de Hito 3"));await user.click(button("Confirmar correcciones y guardar acción"));
  const payload=mocks.saveTrackingAction.mock.calls[0][0];expect(payload.milestones).toHaveLength(3);expect(payload.milestones[0]).toMatchObject({confirmDecrease:true,reason:"Motivo uno revisado",progressBps:3000});expect(payload.milestones[2]).toMatchObject({confirmDecrease:true,reason:"Motivo tres",progressBps:5500});
});
it.each(["acción","dimensión","sección","revisión","dashboard"])("protege cambios al navegar por %s", async(kind)=>{
  const r=fixture(),older={...list(r)[0],id:"old",status:"FINALIZADA" as const};const user=mount(r,false,[...list(r),older]);await fill(user,1,"60");
  if(kind==="acción")await user.click(button("Siguiente →"));
  if(kind==="dimensión")await user.click(screen.getByRole("button",{name:/Liderazgo/}));
  if(kind==="dashboard")await user.click(screen.getByRole("link",{name:"Dashboard"}));
  if(kind==="sección")await user.click(screen.getByRole("link",{name:"Estructura"}));
  if(kind==="revisión")await user.selectOptions(screen.getByLabelText("Revisión",{exact:true}),"old");
  expect(screen.getByRole("heading",{name:"Cambios sin guardar"})).toBeTruthy();await user.click(button("Seguir editando"));expect((field() as HTMLInputElement).value).toBe("60");expect(mocks.push).not.toHaveBeenCalled();
});
it("guardar y continuar y descartar y continuar respetan la elección",async()=>{
  const r=fixture();mocks.saveTrackingAction.mockResolvedValue({ok:true,data:saved(r)});const user=mount(r);
  await fill(user,1,"60");await user.click(button("Siguiente →"));await user.click(button("Guardar y continuar"));expect(screen.getByRole("heading",{name:"Acción B"})).toBeTruthy();
  await user.click(button("← Anterior"));expect((field() as HTMLInputElement).value).toBe("60");await fill(user,1,"80");await user.click(button("Siguiente →"));await user.click(button("Descartar y continuar"));await user.click(button("← Anterior"));expect((field() as HTMLInputElement).value).toBe("60");
});
it.each([true,false])("hito no disponible: aviso, afectados, lectura completa y estado intacto (eliminado=%s)", deleted=>{
  const r=fixture();Object.assign(r.dimensions[0].actions[0].milestones[1],{sourceAvailable:false,sourceDeleted:deleted});mount(r);
  expect(screen.getByRole("heading",{name:"⚠ Acción no actualizable"})).toBeTruthy();expect(screen.getByText("Hitos afectados:")).toBeTruthy();expect(screen.getByText("Hitos (3)")).toBeTruthy();
  expect(screen.queryAllByRole("textbox",{name:/Nuevo avance/})).toHaveLength(0);expect(screen.queryByRole("button",{name:"Confirmar revisión sin cambios"})).toBeNull();expect(screen.getByText("Pendientes: 3")).toBeTruthy();
});
it("historial secundario contiene actor, fecha, hito, tipo, motivo y última confirmación",async()=>{
  const r=saved(fixture());mocks.readProgressEvents.mockResolvedValue({ok:true,data:[{id:"event",reviewMilestoneId:"a-0",actionVersion:1,previousBps:7000,newBps:6000,type:"CORRECCION",reason:"Rectificación",confirmedAt:"2026-04-01T12:00:00Z",createdAt:"2026-04-01T12:00:00Z",actorId:person.id,actorRole:"SUPERUSUARIO",actor:person}]});const user=mount(r);
  await user.click(screen.getByRole("button",{name:/Acción A/}));expect(mocks.readProgressEvents).not.toHaveBeenCalled();await user.click(screen.getByText("Ver historial de esta acción"));
  await waitFor(()=>expect(screen.getByText("Motivo: Rectificación")).toBeTruthy());expect(screen.getByText("70 % → 60 %")).toBeTruthy();expect(screen.getByText(/Última confirmación:/)).toBeTruthy();
});
it.each([true,false])("finaliza exigiendo confirmación cuando corresponde (pendientes=%s)",async(pending)=>{
  const r=fixture();if(!pending)r.dimensions.forEach(d=>d.actions.forEach(a=>a.state="REVISADA_SIN_CAMBIOS"));
  const closed={...r,status:"FINALIZADA" as const,version:1,finalizedAt:"2026-04-01T12:00:00Z",finalizedBy:person};mocks.finalizeReview.mockResolvedValue({ok:true,data:closed});mocks.readReview.mockResolvedValue({ok:true,data:closed});const user=mount(r);
  await user.click(button("Finalizar revisión"));if(pending){expect(button("Confirmar finalización").hasAttribute("disabled")).toBe(true);await user.click(screen.getByLabelText("Confirmo finalizar con 3 acciones pendientes."));}
  await user.click(button("Confirmar finalización"));expect(mocks.finalizeReview).toHaveBeenCalledWith({planId:"plan",reviewId:"review",version:0,confirmPending:pending});expect(screen.queryAllByRole("textbox",{name:/Nuevo avance/})).toHaveLength(0);expect(screen.getByText("🔒 Revisión finalizada · Solo lectura")).toBeTruthy();
});
it("conflicto conserva borrador y recarga solo tras descartar explícitamente",async()=>{
  const r=fixture();mocks.saveTrackingAction.mockResolvedValue({ok:false,code:"CONFLICT",error:"Los datos cambiaron. Recarga."});mocks.readReview.mockResolvedValue({ok:true,data:saved(r,[7000,5000,7000])});const user=mount(r);
  await fill(user,1,"60");await user.click(button("Guardar seguimiento"));expect((field() as HTMLInputElement).value).toBe("60");await user.click(button("Recargar datos"));expect(mocks.readReview).not.toHaveBeenCalled();await user.click(button("Descartar y continuar"));await waitFor(()=>expect((field() as HTMLInputElement).value).toBe("70"));
});
it("conflicto de cierre recarga resumen y elimina confirmación previa",async()=>{
  const r=fixture();mocks.finalizeReview.mockResolvedValue({ok:false,code:"CONFLICT",error:"Cambió"});mocks.readReview.mockResolvedValue({ok:true,data:saved(r)});const user=mount(r);
  await user.click(button("Finalizar revisión"));await user.click(screen.getByLabelText("Confirmo finalizar con 3 acciones pendientes."));await user.click(button("Confirmar finalización"));
  await waitFor(()=>expect(screen.getByLabelText("Confirmo finalizar con 2 acciones pendientes.")).toBeTruthy());expect((screen.getByLabelText("Confirmo finalizar con 2 acciones pendientes.") as HTMLInputElement).checked).toBe(false);expect(button("Confirmar finalización").hasAttribute("disabled")).toBe(true);
});
it("recarga una revisión finalizada por otro usuario como lectura",async()=>{
  const r=fixture();mocks.saveTrackingAction.mockResolvedValue({ok:false,code:"FINALIZED",error:"Revisión finalizada"});mocks.readReview.mockResolvedValue({ok:true,data:{...r,status:"FINALIZADA"}});const user=mount(r);
  await fill(user,1,"60");await user.click(button("Guardar seguimiento"));await user.click(button("Recargar datos"));await user.click(button("Descartar y continuar"));await waitFor(()=>expect(screen.queryAllByRole("textbox",{name:/Nuevo avance/})).toHaveLength(0));
});
it("advertencia al abandonar documento y selector compacto de navegación",async()=>{
  const user=mount();await user.click(button("Elegir dimensión y acción"));expect(button("Elegir dimensión y acción").getAttribute("aria-expanded")).toBe("true");await fill(user,1,"60");
  const event=new Event("beforeunload",{cancelable:true});window.dispatchEvent(event);expect(event.defaultPrevented).toBe(true);
});

it("protege cambios hechos después de abrir el cierre", async () => {
  const user = mount();
  await user.click(button("Finalizar revisión"));
  await user.click(screen.getByLabelText("Confirmo finalizar con 3 acciones pendientes."));
  await fill(user, 1, "60");
  await user.click(button("Confirmar finalización"));
  expect(mocks.finalizeReview).not.toHaveBeenCalled();
  expect(screen.getByRole("heading", { name: "Cambios sin guardar" })).toBeTruthy();
  expect((field() as HTMLInputElement).value).toBe("60");
});
