import Badge from "@/views/ui/Badge";
import type { Review, ReviewList } from "./types";
import { date, timestamp } from "./presentation";
export default function ReviewHeader({ review, reviews, busy, onSelect, onFinish, onStart }: {
  review: Review | null; reviews: ReviewList; busy: boolean;
  onSelect: (id: string) => void; onFinish: () => void; onStart: () => void;
}) {
  const actions = review?.dimensions.flatMap(d => d.actions) ?? [];
  const pending = actions.filter(a => a.state === "PENDIENTE").length;
  const open = reviews.find(r => r.status === "ABIERTA");
  return <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-label="Revisión seleccionada">
    <div className="flex flex-wrap items-end justify-between gap-4">
      {reviews.length > 0 && <label className="block min-w-0 flex-1 font-medium">Revisión
        <select className="field mt-2" value={review?.id ?? ""} disabled={busy} onChange={e => onSelect(e.target.value)}>
          <option value="" disabled>Seleccionar revisión</option>
          {[...reviews].sort((a, b) => Number(b.status === "ABIERTA") - Number(a.status === "ABIERTA")).map(r =>
            <option key={r.id} value={r.id}>{r.title} · {date(r.referenceStartDate)} – {date(r.referenceEndDate)} · {r.status === "ABIERTA" ? "Abierta" : "Finalizada"}</option>)}
        </select>
      </label>}
      {review?.status === "ABIERTA" && <button disabled={busy} className="button-danger" onClick={onFinish}>Finalizar revisión</button>}
      {!open && <button disabled={busy} className="button-primary" onClick={onStart}>Iniciar revisión</button>}
      {open && open.id !== review?.id && <button disabled={busy} className="button-secondary" onClick={() => onSelect(open.id)}>Volver a la revisión abierta</button>}
    </div>
    {review ? <div className="mt-4 space-y-2">
      <Badge tone={review.status === "ABIERTA" ? "success" : "info"}>{review.status === "ABIERTA" ? "◉ Revisión abierta" : "🔒 Revisión finalizada · Solo lectura"}</Badge>
      <p className="text-slate-600">Período: {date(review.referenceStartDate)} – {date(review.referenceEndDate)}</p>
      {review.finalizedAt && <p className="text-sm text-slate-600">Finalizada el {timestamp(review.finalizedAt)} por {review.finalizedBy?.name}</p>}
      <p className="flex flex-wrap gap-x-6 font-medium"><Badge tone="success">Revisadas: {actions.length - pending}</Badge><Badge tone="warning">Pendientes: {pending}</Badge></p>
    </div> : <p className="mt-4 text-slate-600">No hay una revisión abierta. Inicia una nueva o consulta las anteriores.</p>}
  </section>;
}
