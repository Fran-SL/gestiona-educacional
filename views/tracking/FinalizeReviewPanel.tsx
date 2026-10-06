import Dialog from "@/views/ui/Dialog";
import { useState } from "react";
import type { Review } from "./types";
export default function FinalizeReviewPanel({ feedback, review, busy, onConfirm, onCancel }: { feedback?: React.ReactNode; review: Review; busy: boolean; onConfirm: (confirmed: boolean) => void; onCancel: () => void }) {
  const [confirmed, setConfirmed] = useState(false);
  const actions = review.dimensions.flatMap(d => d.actions);
  const pending = actions.filter(a => a.state === "PENDIENTE").length;
  return <Dialog title="Finalizar revisión" onClose={onCancel} busy={busy}>{feedback}<section tabIndex={-1} id="finalize-panel" className="space-y-4" aria-labelledby="finalize-title">
    <h2 id="finalize-title" className="text-xl font-semibold">Finalizar «{review.title}»</h2>
    <p className="mt-3">Revisadas: {actions.length - pending} · Pendientes: {pending}</p>
    <p className="mt-2 text-slate-600">Esta revisión quedará disponible solo para consulta. El plan seguirá editable.</p>
    {pending > 0 && <label className="mt-4 flex items-start gap-2"><input type="checkbox" className="mt-1" disabled={busy} checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />Confirmo finalizar con {pending} acciones pendientes.</label>}
    <div className="mt-5 flex flex-wrap gap-3"><button disabled={busy || (pending > 0 && !confirmed)} className="button-danger" onClick={() => onConfirm(confirmed)}>{busy ? "Finalizando…" : "Confirmar finalización"}</button><button disabled={busy} className="button-secondary" onClick={onCancel}>Cancelar</button></div>
  </section></Dialog>;
}
