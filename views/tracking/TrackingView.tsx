"use client";
import Dialog from "@/views/ui/Dialog";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { finalizeReview, listReviews, readReview, saveTrackingAction } from "@/app/seguimiento/actions";
import type { Draft, Failure, Review, ReviewList } from "./types";
import { draftFor, hasChanges, parsePercent } from "./presentation";
import PlanNavigation from "@/views/plans/PlanNavigation";
import ReviewHeader from "./ReviewHeader";
import StartReviewForm from "./StartReviewForm";
import ReviewNavigator from "./ReviewNavigator";
import ReviewActionDetail from "./ReviewActionDetail";
import CorrectionConfirmation from "./CorrectionConfirmation";
import FinalizeReviewPanel from "./FinalizeReviewPanel";

type Intent = { kind: "action" | "dimension" | "href"; value: string } | { kind: "finish" | "reload" | "discard" };
function initialSelection(review: Review | null) {
  const dimension = review?.dimensions.find(d => d.actions.some(a => a.state === "PENDIENTE")) ?? review?.dimensions[0];
  const action = dimension?.actions.find(a => a.state === "PENDIENTE") ?? dimension?.actions[0];
  return { dimensionId: dimension?.id ?? "", actionId: action?.id ?? "", draft: draftFor(action) };
}
export default function TrackingView({ plan, initialReview, initialReviews, superuser }: {
  plan: { id: string; name: string }; initialReview: Review | null; initialReviews: ReviewList; superuser: boolean;
}) {
  const router = useRouter();
  const first = initialSelection(initialReview);
  const [review, setReview] = useState(initialReview);
  const [reviews, setReviews] = useState(initialReviews);
  const [dimensionId, setDimensionId] = useState(first.dimensionId);
  const [actionId, setActionId] = useState(first.actionId);
  const [draft, setDraft] = useState<Draft>(first.draft);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [message, setMessage] = useState("");
  const [intent, setIntent] = useState<Intent | null>(null);
  const [correcting, setCorrecting] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [onlyPending, setOnlyPending] = useState(false);
  const [mobileNavigation, setMobileNavigation] = useState(false);
  const dimension = review?.dimensions.find(d => d.id === dimensionId);
  const action = dimension?.actions.find(a => a.id === actionId);
  const changed = hasChanges(action, draft);
  const blocked = !!failure && ["CONFLICT", "SOURCE_DELETED", "FINALIZED", "ACCESS_DENIED", "CORRECTION_FORBIDDEN"].includes(failure.code);
  const decreases = action?.milestones.filter(h => {
    const value = parsePercent(draft[h.id]?.value ?? "");
    return value !== null && value < h.progressBps;
  }) ?? [];
  const ordered = review?.dimensions.flatMap(d => d.actions).filter(a => !onlyPending || a.state === "PENDIENTE" || a.id === actionId) ?? [];
  const index = ordered.findIndex(a => a.id === actionId);
  function focus(id: string) { setTimeout(() => document.getElementById(id)?.focus(), 0); }
  function lock(value: boolean) { busyRef.current = value; setBusy(value); }

  useEffect(() => {
    if (!changed) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [changed]);

  function apply(next: Review) {
    setReview(next);
    const selected = next.dimensions.flatMap(d => d.actions).find(a => a.id === actionId);
    setDraft(draftFor(selected)); setCorrecting(false);
    const all = next.dimensions.flatMap(d => d.actions);
    const pending = all.filter(a => a.state === "PENDIENTE").length;
    setReviews(previous => previous.map(r => r.id === next.id ? { ...r, version: next.version, status: next.status, finalizedAt: next.finalizedAt, finalizedBy: next.finalizedBy, pending, reviewed: all.length - pending } : r));
  }
  async function reload(keepFinish = false) {
    if (!review) return;
    lock(true);
    try {
      const result = await readReview({ planId: plan.id, reviewId: review.id });
      if (!result.ok) { setFailure(result); return; }
      apply(result.data); setFailure(null); setIntent(null);
      setFinishing(keepFinish && result.data.status === "ABIERTA");
      setMessage(keepFinish ? "El resumen se actualizó. Revisa los datos y confirma nuevamente." : "Datos recargados desde el servidor.");
    } catch { setFailure({ code: "NETWORK", error: "No se pudo conectar. Se conservaron tus cambios locales." }); }
    finally { lock(false); }
  }
  function select(id: string) {
    const d = review?.dimensions.find(item => item.actions.some(a => a.id === id));
    const a = d?.actions.find(item => item.id === id);
    if (d && a) { setDimensionId(d.id); setActionId(a.id); setDraft(draftFor(a)); }
    setCorrecting(false); setFinishing(false); setMessage(""); setMobileNavigation(false);
    // Conflicts apply to the old draft; selecting another action is permitted.
    setFailure(null); focus("action-title");
  }
  function execute(next: Intent) {
    setIntent(null);
    if (next.kind === "action") select(next.value);
    else if (next.kind === "dimension") {
      const d = review?.dimensions.find(item => item.id === next.value);
      const a = d?.actions.find(item => !onlyPending || item.state === "PENDIENTE") ?? d?.actions[0];
      if (a) select(a.id);
      else { setDimensionId(next.value); setActionId(""); setDraft({}); setCorrecting(false); }
    } else if (next.kind === "href") router.push(next.value);
    else if (next.kind === "finish") { setFinishing(true); focus("finalize-panel"); }
    else if (next.kind === "reload") void reload();
    else { setDraft(draftFor(action)); setCorrecting(false); }
  }
  function navigate(next: Intent) {
    if (busyRef.current) return;
    if (changed) { setIntent(next); focus("unsaved-panel"); }
    else execute(next);
  }
  async function save(continuation: Intent | null = intent) {
    if (!review || !action || busyRef.current || blocked) return;
    if (review.status !== "ABIERTA" || action.milestones.some(h => !h.sourceAvailable)) return;
    if (action.milestones.some(h => parsePercent(draft[h.id]?.value ?? "") === null)) {
      setFailure({ code: "INVALID_INPUT", error: "Revisa los porcentajes antes de guardar." }); return;
    }
    if (decreases.length && !superuser) return;
    if (decreases.length && (!correcting || decreases.some(h => !draft[h.id].confirmed || !draft[h.id].reason.trim()))) {
      setCorrecting(true); focus("correction-panel"); return;
    }
    lock(true); setFailure(null); setMessage("");
    try {
      const result = await saveTrackingAction({
        planId: plan.id, reviewId: review.id, reviewActionId: action.id, version: action.version,
        milestones: action.milestones.map(h => ({ reviewMilestoneId: h.id, progressBps: parsePercent(draft[h.id].value),
          ...(decreases.some(d => d.id === h.id) ? { confirmDecrease: draft[h.id].confirmed, reason: draft[h.id].reason.trim() } : {}),
        })),
      });
      if (!result.ok) { setFailure(result); return; }
      apply(result.data); setIntent(null);
      setMessage(changed ? "Seguimiento guardado." : "Revisión confirmada sin cambios de avance.");
      if (continuation) execute(continuation);
    } catch { setFailure({ code: "NETWORK", error: "No se pudo confirmar el guardado. Recarga los datos antes de reintentar si la conexión se interrumpió." }); }
    finally { lock(false); }
  }
  async function finish(confirmed: boolean) {
    if (!review || busyRef.current) return;
    if (changed) { setFinishing(false); setIntent({ kind: "finish" }); focus("unsaved-panel"); return; }
    lock(true); setFailure(null); setMessage("");
    try {
      const result = await finalizeReview({ planId: plan.id, reviewId: review.id, version: review.version, confirmPending: confirmed });
      if (!result.ok) {
        if (["CONFLICT", "FINALIZED"].includes(result.code)) {
          setFinishing(false);
          await reload(true);
        } else setFailure(result);
        return;
      }
      setReview({ ...review, status: "FINALIZADA", version: result.data.version });
      setFinishing(false);
      const detail = await readReview({ planId: plan.id, reviewId: review.id });
      if (detail.ok) apply(detail.data);
      else { setReview({ ...review, status: "FINALIZADA", version: result.data.version }); setFailure(detail); }
      setFinishing(false); setMessage("Revisión finalizada. Disponible solo para consulta.");
    } catch { setFailure({ code: "NETWORK", error: "No se pudo confirmar la finalización. Recarga los datos para verificar su estado." }); }
    finally { lock(false); }
  }
  async function startFailure(error: Failure) {
    setFailure(error);
    if (error.code === "OPEN_REVIEW") {
      const result = await listReviews({ planId: plan.id });
      if (result.ok) { setReviews(result.data); setStarting(false); }
    }
  }
  const reviewPath = (id: string) => `/planes/${plan.id}/seguimiento/${id}`;
  const failurePanel = failure && <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-red-800"><p>{failure.error}</p>
      {review && <button disabled={busy} className="button-secondary mt-3" onClick={() => navigate({ kind: "reload" })}>Recargar datos</button>}
      {failure.code === "ACCESS_DENIED" && <button className="button-secondary ml-2 mt-3" onClick={() => navigate({ kind: "href", value: "/login" })}>Volver a iniciar sesión</button>}
      {failure.code === "INVALID_STRUCTURE" && <button className="button-secondary mt-3" onClick={() => navigate({ kind: "href", value: `/planes/${plan.id}` })}>Ir a Estructura</button>}
    </div>;
  return <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-900 sm:px-6"><div className="mx-auto max-w-7xl">
    <Link className="button-secondary inline-flex" href="/" onNavigate={e => { e.preventDefault(); navigate({ kind: "href", value: "/" }); }}>← Volver a planes</Link>
    <header className="my-6"><p className="text-sm font-medium text-slate-600">Estado de avance</p><h1 className="mt-2 break-words text-3xl font-bold">{plan.name}</h1></header>
    <PlanNavigation planId={plan.id} active="tracking" onNavigate={href => navigate({ kind: "href", value: href })} />
    {intent && !correcting && <Dialog title="Cambios sin guardar" onClose={() => setIntent(null)} busy={busy}>{failurePanel}<section id="unsaved-panel" tabIndex={-1} role="region" aria-label="Opciones para los cambios sin guardar" className="mb-6 rounded-xl border border-amber-400 bg-amber-50 p-5">
      
      <p className="my-3">Guarda esta acción o descarta sus cambios antes de continuar.{intent.kind === "reload" && " Recargar reemplazará los valores locales."}</p>
      <div className="flex flex-wrap gap-3">
        {intent.kind !== "reload" && intent.kind !== "discard" && <button disabled={busy || blocked || (decreases.length > 0 && !superuser)} className="button-primary" onClick={() => void save(intent)}>Guardar y continuar</button>}
        <button disabled={busy} className="button-secondary" onClick={() => { setDraft(draftFor(action)); setCorrecting(false); execute(intent); }}>Descartar y continuar</button>
        <button disabled={busy} className="button-secondary" onClick={() => { setIntent(null); focus("action-title"); }}>Seguir editando</button>
      </div>
    </section></Dialog>}
    {!intent && !correcting && !finishing && failurePanel}
    {message && <p role="status" className="mb-5 rounded-xl bg-emerald-50 p-4 text-emerald-900">{message}</p>}
    <ReviewHeader review={review} reviews={reviews} busy={busy} onSelect={id => navigate({ kind: "href", value: reviewPath(id) })} onFinish={() => navigate({ kind: "finish" })} onStart={() => setStarting(true)} />
    {starting && <StartReviewForm planId={plan.id} onCreated={id => router.push(reviewPath(id))} onCancel={() => setStarting(false)} onFailure={error => void startFailure(error)} />}
    {finishing && review?.status === "ABIERTA" && <FinalizeReviewPanel key={`${review.id}-${review.version}`} review={review} busy={busy} feedback={failurePanel} onConfirm={confirmed => void finish(confirmed)} onCancel={() => setFinishing(false)} />}
    {review && <div className="grid items-start gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
      <div className="min-w-0"><button className="button-secondary mb-3 w-full lg:hidden" aria-expanded={mobileNavigation} onClick={() => setMobileNavigation(value => !value)}>Elegir dimensión y acción</button>
      <div className={mobileNavigation ? "block" : "hidden lg:block"}><ReviewNavigator review={review} dimensionId={dimensionId} actionId={actionId} onlyPending={onlyPending} busy={busy} onFilter={setOnlyPending} onDimension={id => { if (id !== dimensionId) navigate({ kind: "dimension", value: id }); }} onAction={id => { if (id !== actionId) navigate({ kind: "action", value: id }); }} /></div></div>
      <div className="min-w-0">
        {action ? <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-slate-600">Acción {index + 1} de {ordered.length}{onlyPending ? " en la selección" : ""}</p><div className="flex flex-wrap gap-2">
            <button className="button-secondary" disabled={busy || index <= 0} onClick={() => navigate({ kind: "action", value: ordered[index - 1].id })}>← Anterior</button>
            <button className="button-secondary" disabled={busy || index < 0 || index >= ordered.length - 1} onClick={() => navigate({ kind: "action", value: ordered[index + 1].id })}>Siguiente →</button>
          </div></div>
          <ReviewActionDetail action={action} dimensionName={dimension?.name ?? ""} planId={plan.id} reviewId={review.id} closed={review.status === "FINALIZADA"} superuser={superuser} busy={busy} draft={draft} changed={changed} blocked={blocked}
            onChange={(id, value) => { setDraft(old => ({ ...old, [id]: { ...old[id], value, confirmed: false } })); setMessage(""); }}
            onSave={() => void save()} onDiscard={() => navigate({ kind: "discard" })}>
            {correcting && decreases.length > 0 && <CorrectionConfirmation feedback={failurePanel} milestones={decreases} draft={draft} busy={busy}
              onReason={(id, reason) => setDraft(old => ({ ...old, [id]: { ...old[id], reason, confirmed: false } }))}
              onConfirm={(id, confirmed) => setDraft(old => ({ ...old, [id]: { ...old[id], confirmed } }))}
              onSave={() => void save()} onCancel={() => setCorrecting(false)} />}
          </ReviewActionDetail>
        </> : <p className="rounded-2xl bg-white p-6 text-slate-600">Selecciona una dimensión con acciones para revisar su seguimiento.</p>}
      </div>
    </div>}
  </div></main>;
}
