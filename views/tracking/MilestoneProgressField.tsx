import Badge from "@/views/ui/Badge";
import type { ReviewMilestone } from "./types";
import { parsePercent, percent } from "./presentation";
export default function MilestoneProgressField({ milestone: h, value, readOnly, busy, superuser, onChange }: {
  milestone: ReviewMilestone; value: string; readOnly: boolean; busy: boolean; superuser: boolean; onChange: (value: string) => void;
}) {
  const parsed = parsePercent(value);
  const decreasing = parsed !== null && parsed < h.progressBps;
  const invalid = parsed === null;
  return <li className="rounded-xl border border-slate-200 bg-slate-50 p-4">
    <h4 className="break-words text-lg font-semibold">{h.name}</h4>
    {!h.sourceAvailable && <p className="mt-2 font-medium text-amber-900">⚠ {h.sourceDeleted ? "Hito eliminado de Estructura" : "Hito no disponible en Estructura"}</p>}
    <div className="mt-3 flex flex-wrap gap-2"><Badge tone="info">Peso: {percent(h.weightBps / 100)} %</Badge><Badge tone="success">Avance guardado: {percent(h.progressBps / 100)} %</Badge></div>
    {!readOnly && <label className="mt-3 block">Nuevo avance de {h.name} (%)
      <input className="field mt-2 max-w-48" inputMode="decimal" value={value} disabled={busy} maxLength={6}
        aria-invalid={invalid || (decreasing && !superuser)} aria-describedby={`hint-${h.id}`}
        onChange={e => onChange(e.target.value)} />
    </label>}
    {!readOnly && <div id={`hint-${h.id}`}>
      {invalid && <p className="mt-2 text-red-700">Ingresa un porcentaje entre 0 y 100, con hasta dos decimales.</p>}
      {decreasing && <p className={`mt-2 ${superuser ? "text-amber-900" : "text-red-700"}`} role={superuser ? undefined : "alert"}>
        {superuser ? `Corrección pendiente: ${percent(h.progressBps / 100)} % → ${percent(parsed / 100)} %.` : "Solo el superusuario puede corregir un avance hacia abajo."}
      </p>}
      {decreasing && <button disabled={busy} type="button" className="button-secondary mt-2" onClick={() => onChange(percent(h.progressBps / 100))}>Restaurar valor guardado</button>}
    </div>}
    {(readOnly || parsed !== null) && <p className="mt-3 text-sm text-slate-600">Contribución{!readOnly && parsed !== h.progressBps ? " propuesta" : ""}: {percent(h.weightBps * (readOnly ? h.progressBps : parsed!) / 1_000_000)} puntos porcentuales</p>}
  </li>;
}
