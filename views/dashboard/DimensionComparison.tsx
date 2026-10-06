import type { DashboardData } from "@/models/dashboard";
import { percent } from "@/views/tracking/presentation";
export default function DimensionComparison({ dimensions }: { dimensions: DashboardData["summary"]["dimensions"] }) {
  return <section aria-labelledby="comparison-title" className="min-w-0 rounded-2xl bg-white p-5 shadow-sm">
    <h2 id="comparison-title" className="text-xl font-semibold">Comparación de dimensiones</h2>
    <p className="mt-1 text-sm text-slate-600">Logro en la fuente seleccionada. Selecciona una dimensión para ver sus acciones.</p>
    <div aria-hidden="true" className="mt-4 flex justify-between text-xs text-slate-600"><span>0 %</span><span>50 %</span><span>100 %</span></div>
    {!dimensions.length && <p className="mt-4 text-slate-600">Sin dimensiones para comparar.</p>}
    <ul className="mt-3 space-y-4">{dimensions.map(d => <li key={d.id}>
      <div className="mb-1 flex items-start justify-between gap-3"><a className="navigation-link min-w-0 break-words" href={`#dimension-${d.id}`}>{d.name}</a><span className="shrink-0 font-semibold tabular-nums">{d.achievement === null ? "No calculable" : `${percent(d.achievement)} %`}</span></div>
      {d.achievement === null ? <p className="rounded bg-amber-50 px-2 py-1 text-sm text-amber-900">Estructura incompleta o pesos inválidos</p> : <progress aria-label={`Comparación: ${d.name}`} value={d.achievement} max={100} className="dashboard-progress h-3 w-full">{percent(d.achievement)} %</progress>}
    </li>)}</ul>
  </section>;
}
