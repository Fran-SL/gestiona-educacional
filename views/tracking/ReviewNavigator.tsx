import Badge from "@/views/ui/Badge";
import type { Review } from "./types";
import { stateLabels } from "./presentation";
export default function ReviewNavigator({ review, dimensionId, actionId, onlyPending, busy, onFilter, onDimension, onAction }: {
  review: Review; dimensionId: string; actionId: string; onlyPending: boolean; busy: boolean;
  onFilter: (value: boolean) => void; onDimension: (id: string) => void; onAction: (id: string) => void;
}) {
  return <nav aria-label="Dimensiones y acciones" className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <h2 className="text-lg font-semibold">Dimensiones y acciones</h2>
    <label className="my-4 flex items-center gap-2"><input type="checkbox" checked={onlyPending} disabled={busy} onChange={e => onFilter(e.target.checked)} />Solo pendientes</label>
    <div className="space-y-3">{review.dimensions.map(d => <section key={d.id}>
      <button disabled={busy} className="w-full rounded-lg bg-slate-100 p-3 text-left font-semibold focus-visible:outline-2 focus-visible:outline-blue-600"
        aria-expanded={dimensionId === d.id} onClick={() => onDimension(d.id)}>
        <span aria-hidden="true">{dimensionId === d.id ? "▾ " : "▸ "}</span>{d.name}
        <span className="mt-1 block text-sm font-normal text-slate-600">{d.actions.filter(a => a.state !== "PENDIENTE").length} de {d.actions.length} revisadas</span>
      </button>
      {dimensionId === d.id && <ul className="mt-2 space-y-2">{d.actions.filter(a => !onlyPending || a.state === "PENDIENTE" || a.id === actionId).map(a => <li key={a.id}>
        <button disabled={busy} aria-current={a.id === actionId ? "true" : undefined} onClick={() => onAction(a.id)}
          className={`w-full rounded-lg border p-3 text-left focus-visible:outline-2 focus-visible:outline-blue-600 ${a.id === actionId ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:bg-slate-50"}`}>
          <span className="block break-words font-medium">{a.name}</span><span className="mt-2 block"><Badge tone={a.state === "PENDIENTE" ? "warning" : "success"}>{stateLabels[a.state]}</Badge></span>
        </button>
      </li>)}</ul>}
      {dimensionId === d.id && !d.actions.length && <p className="p-3 text-sm text-slate-600">Esta dimensión no contiene acciones en la revisión.</p>}
    </section>)}</div>
    {!review.dimensions.length && <p className="mt-4 text-slate-600">Esta revisión no contiene dimensiones.</p>}
  </nav>;
}
