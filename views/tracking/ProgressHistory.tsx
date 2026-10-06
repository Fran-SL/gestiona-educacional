"use client";
import { useState } from "react";
import { readProgressEvents } from "@/app/seguimiento/actions";
import type { ProgressEvents, ReviewAction } from "./types";
import { percent, timestamp } from "./presentation";
export default function ProgressHistory({ planId, reviewId, action }: { planId: string; reviewId: string; action: ReviewAction }) {
  const [events, setEvents] = useState<ProgressEvents | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  async function load() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const result = await readProgressEvents({ planId, reviewId, reviewActionId: action.id });
      if (result.ok) setEvents(result.data); else setError(result.error);
    } catch { setError("No se pudo cargar el historial. Intenta nuevamente."); }
    finally { setBusy(false); }
  }
  return <section className="mt-6 border-t border-slate-200 pt-5">
    <p className="text-sm text-slate-600">{action.lastReviewedAt ? `Última confirmación: ${timestamp(action.lastReviewedAt)} · ${action.lastReviewedBy?.name}` : "Esta acción aún no ha sido confirmada."}</p>
    <details className="mt-3" onToggle={e => { if (e.currentTarget.open && events === null && !error) void load(); }}>
      <summary className="cursor-pointer rounded-lg py-3 font-semibold focus-visible:outline-2 focus-visible:outline-blue-600">Ver historial de esta acción</summary>
      {busy && <p role="status">Cargando historial…</p>}
      {error && <div role="alert"><p className="text-red-700">{error}</p><button className="button-secondary mt-2" onClick={() => void load()}>Reintentar historial</button></div>}
      {events && <>
        <label className="block">Filtrar por hito<select className="field mt-2" value={filter} onChange={e => setFilter(e.target.value)}><option value="">Todos los hitos</option>{action.milestones.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}</select></label>
        {!events.length && <p className="mt-3 text-slate-600">Esta acción no tiene cambios de avance registrados.</p>}
        <ul className="mt-4 space-y-3">{events.filter(e => !filter || e.reviewMilestoneId === filter).map(e => <li key={e.id} className="rounded-lg border border-slate-200 p-4">
          <p className="font-semibold">{e.type === "CORRECCION" ? "Corrección" : "Actualización"} · {action.milestones.find(h => h.id === e.reviewMilestoneId)?.name}</p>
          <p className="mt-1">{percent(e.previousBps / 100)} % → {percent(e.newBps / 100)} %</p>
          <p className="mt-1 text-sm text-slate-600">{timestamp(e.createdAt)} · {e.actor.name} · {e.actorRole === "SUPERUSUARIO" ? "Superusuario" : "Administrador"}</p>
          {e.type === "CORRECCION" && <p className="mt-2 whitespace-pre-wrap break-words">Motivo: {e.reason}</p>}
        </li>)}</ul>
      </>}
    </details>
  </section>;
}
