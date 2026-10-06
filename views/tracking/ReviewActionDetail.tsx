import Badge from "@/views/ui/Badge";
import type { Draft, ReviewAction } from "./types";
import { date, percent, parsePercent, stateLabels } from "./presentation";
import MilestoneProgressField from "./MilestoneProgressField";
import ProgressHistory from "./ProgressHistory";
export default function ReviewActionDetail({ action, dimensionName, planId, reviewId, closed, superuser, busy, draft, changed, onChange, onSave, onDiscard, children, blocked }: {
  action: ReviewAction; dimensionName: string; planId: string; reviewId: string; closed: boolean;
  superuser: boolean; busy: boolean; draft: Draft; changed: boolean; blocked: boolean;
  onChange: (id: string, value: string) => void; onSave: () => void; onDiscard: () => void; children?: React.ReactNode;
}) {
  const unavailable = action.milestones.filter(h => !h.sourceAvailable);
  const readOnly = closed || unavailable.length > 0;
  const valid = action.milestones.every(h => parsePercent(draft[h.id]?.value ?? "") !== null);
  const decrease = action.milestones.some(h => (parsePercent(draft[h.id]?.value ?? "") ?? h.progressBps) < h.progressBps);
  const proposed = valid ? action.milestones.reduce((sum, h) => sum + h.weightBps * parsePercent(draft[h.id].value)!, 0) / 1_000_000 : null;
  return <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="action-title">
    {unavailable.length > 0 && <div role="alert" className="mb-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
      <h3 className="text-lg font-semibold">⚠ Acción no actualizable</h3>
      <p className="mt-2">{unavailable.every(h => h.sourceDeleted) ? "Uno o más hitos de esta revisión ya no existen en la estructura actual." : "Uno o más hitos de esta revisión ya no están disponibles en la estructura actual."} Los datos históricos se conservan, pero esta acción no puede registrar nuevos avances.</p>
      <p className="mt-3 font-medium">Hitos afectados:</p><ul className="list-inside list-disc">{unavailable.map(h => <li key={h.id}>{h.name}</li>)}</ul>
    </div>}
    <p className="text-sm font-medium text-slate-600">{dimensionName}</p>
    <h2 id="action-title" tabIndex={-1} className="mt-2 break-words text-2xl font-bold">{action.name}</h2>
    <div className="mt-3"><Badge tone={action.state === "PENDIENTE" ? "warning" : "success"}>{stateLabels[action.state]}</Badge></div>
    <p className="mt-4 whitespace-pre-wrap break-words text-slate-600">{action.description}</p>
    <dl className="mt-5 grid gap-3 sm:grid-cols-2">
      <div><dt className="text-sm text-slate-500">Responsable</dt><dd>{action.responsibleName}</dd></div>
      <div><dt className="text-sm text-slate-500">Fechas</dt><dd>{date(action.startDate)} – {date(action.endDate)}</dd></div>
      <div className="sm:col-span-2"><dt className="text-sm text-slate-500">Gasto real registrado en esta revisión</dt><dd>{action.actualExpense === null ? "Sin registrar" : `${new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 }).format(Number(action.actualExpense))} ${action.currency}`}</dd></div>
    </dl>
    <div className="my-6 rounded-xl bg-blue-50 p-4"><p className="text-sm font-medium text-blue-900">Avance guardado de la acción</p><p className="mt-1 text-3xl font-bold text-blue-950">{percent(action.achievement)} %</p></div>
    <h3 className="mb-3 text-xl font-semibold">Hitos ({action.milestones.length})</h3>
    <ul className="space-y-4">{action.milestones.map(h => <MilestoneProgressField key={h.id} milestone={h} value={draft[h.id]?.value ?? percent(h.progressBps / 100)} readOnly={readOnly} busy={busy} superuser={superuser} onChange={value => onChange(h.id, value)} />)}</ul>
    {!readOnly && <>
      {changed && <p role="status" className="mt-5 rounded-lg bg-amber-50 p-3 font-medium">{proposed !== null ? `Resultado propuesto: ${percent(proposed)} % · Sin guardar` : "Hay valores por corregir · Sin guardar"}</p>}
      {children}
      <div className="mt-6 border-t border-slate-200 pt-5">
        {!changed && <p className="mb-3 text-slate-600">Confirma que revisaste esta acción y sus avances continúan iguales.</p>}
        <div className="flex flex-wrap gap-3">
          <button className="button-primary" disabled={busy || blocked || !valid || (decrease && !superuser)} onClick={onSave}>{busy ? "Guardando…" : changed ? "Guardar seguimiento" : "Confirmar revisión sin cambios"}</button>
          {changed && <button disabled={busy} className="button-secondary" onClick={onDiscard}>Descartar cambios</button>}
        </div>
      </div>
    </>}
    <ProgressHistory key={`${action.id}-${action.version}`} planId={planId} reviewId={reviewId} action={action} />
  </article>;
}
