import Badge from "@/views/ui/Badge";
import Link from "next/link";
import type { DashboardData } from "@/models/dashboard";
import { percent, timestamp } from "@/views/tracking/presentation";
export default function ReviewEvolution({ history, planId, selectedId }: { history: DashboardData["history"]; planId: string; selectedId?: string }) {
  const { points, change } = history;
  // Coordinates only; all achievements and comparisons arrive calculated by the model.
  const x = (i: number) => points.length === 1 ? 330 : 75 + i * 530 / (points.length - 1);
  const y = (value: number) => 175 - value * 1.5;
  return <section aria-labelledby="evolution-title" className="min-w-0 rounded-2xl bg-white p-5 shadow-sm">
    <h2 id="evolution-title" className="text-xl font-semibold">Evolución del avance global</h2>
    <p className="mt-1 text-sm text-slate-600">Todas las revisiones, en orden de creación. Cada punto conserva los pesos y la estructura de su revisión; sus cambios también pueden variar el logro.</p>
    {!points.length ? <p className="mt-5 text-slate-600">Aún no hay revisiones para mostrar la evolución.</p> : <>
      <p className="mt-3 font-medium">{change === null ? "Sin comparación disponible entre las dos últimas revisiones." : change === 0 ? "Sin variación entre las dos últimas revisiones." : `${change > 0 ? "Aumento" : "Disminución"} de ${percent(Math.abs(change))} puntos porcentuales entre las dos últimas revisiones.`}</p>
      <svg viewBox="0 0 630 205" className="mt-3 block w-full" role="img" aria-labelledby="evolution-chart-title" aria-describedby="evolution-chart-description">
        <title id="evolution-chart-title">Logro global por revisión, escala de 0 a 100 %</title>
        <desc id="evolution-chart-description">Revisiones separadas uniformemente en orden de creación. La lista inferior muestra fechas y valores exactos. Los resultados no calculables interrumpen la línea. Los círculos vacíos corresponden a revisiones abiertas.</desc>
        {[0, 50, 100].map(value => <g key={value}><line x1="75" x2="605" y1={y(value)} y2={y(value)} stroke="#cbd5e1" /><text x="65" y={y(value) + 4} textAnchor="end" className="text-[22px] sm:text-[14px]" fill="#475569">{value}%</text></g>)}
        {points.map((p, i) => {
          const previous = points[i - 1];
          return <g key={p.id}>
            {p.achievement !== null && previous?.achievement !== null && previous?.achievement !== undefined && <line data-segment="review" x1={x(i - 1)} y1={y(previous.achievement)} x2={x(i)} y2={y(p.achievement)} stroke="#2563eb" strokeWidth="2.5" />}
            {p.achievement !== null ? <circle data-point="review" cx={x(i)} cy={y(p.achievement)} r={p.id === selectedId ? 6 : 4} fill={p.status === "ABIERTA" ? "white" : "#2563eb"} stroke="#1d4ed8" strokeWidth="2" /> : <text x={x(i)} y="193" textAnchor="middle" fill="#92400e" className="text-[22px] sm:text-[14px]">×</text>}
          </g>;
        })}
      </svg>
      <p className="text-xs text-slate-600"><Badge tone="info">● Finalizada</Badge>{" "}<Badge tone="success">○ Abierta (provisional)</Badge>{" "}<Badge>× No calculable</Badge>{" "}La selección no filtra esta evolución.</p>
      <ol aria-label="Valores por revisión" className="mt-4 grid gap-2 text-sm sm:grid-cols-2">{points.map((p, i) => <li key={p.id} className={`min-w-0 rounded-lg border p-3 ${p.id === selectedId ? "border-blue-500 bg-blue-50" : "border-slate-200"}`}>
        <Link className="navigation-link inline-block break-words" href={`/planes/${planId}/dashboard?reviewId=${encodeURIComponent(p.id)}`} aria-current={p.id === selectedId ? "true" : undefined}>{i + 1}. {p.title}</Link>
        <p className="mt-1 text-slate-600">{timestamp(p.createdAt)} · {p.status === "ABIERTA" ? "Abierta · provisional" : "Finalizada"}</p>
        <p className="font-semibold">{p.achievement === null ? "No calculable" : `${percent(p.achievement)} %`}</p>
      </li>)}</ol>
    </>}
  </section>;
}
