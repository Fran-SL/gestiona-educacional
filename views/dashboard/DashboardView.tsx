import Badge from "@/views/ui/Badge";
import ActionDonut from "./ActionDonut";
import ScrollReveal from "./ScrollReveal";
import Link from "next/link";
import type { DashboardData } from "@/models/dashboard";
import DimensionComparison from "./DimensionComparison";
import ReviewEvolution from "./ReviewEvolution";
import PlanNavigation from "@/views/plans/PlanNavigation";
import { date, percent, timestamp } from "@/views/tracking/presentation";
function Progress({ value, label, prominent = false }: { value: number | null; label: string; prominent?: boolean }) {
  return value === null ? <div><Badge>No calculable</Badge><p className="mt-2 text-sm text-slate-600">Estructura incompleta o pesos inválidos</p></div> : <div>
    <p className={prominent ? "text-5xl font-bold tracking-tight tabular-nums sm:text-6xl" : "text-2xl font-bold tabular-nums"}>{percent(value)} %</p>
    <progress className="dashboard-progress mt-2 h-3 w-full" value={value} max={100} aria-label={label}>{percent(value)} %</progress>
  </div>;
}
function money(value: string) {
  const [whole, fraction] = value.split(".");
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}${fraction === "00" ? "" : `,${fraction}`}`;
}
export default function DashboardView({ data }: { data: DashboardData }) {
  const { plan, summary: s, source, reviews } = data;
  return <ScrollReveal><main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-900 sm:px-6"><div className="mx-auto max-w-7xl">
    <Link href="/" className="button-secondary inline-flex">← Volver a planes</Link>
    <header className="my-6"><p className="text-sm font-medium text-slate-600">Dashboard institucional</p><h1 className="mt-2 break-words text-3xl font-bold">{plan.name}</h1></header>
    <PlanNavigation planId={plan.id} active="dashboard" />
    <section className="mb-6 rounded-2xl bg-white p-5 shadow-sm" aria-label="Origen de los indicadores">
      <form action={`/planes/${plan.id}/dashboard`} className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-end">
        <label className="block w-full min-w-0 flex-1 font-medium">Información utilizada<select name="reviewId" defaultValue={source?.id ?? ""} className="field mt-2 min-w-0 max-w-full">
          <option value="">Estructura y avances actuales</option>
          {reviews.map(r => <option value={r.id} key={r.id}>{r.title} · {date(r.referenceStartDate)} – {date(r.referenceEndDate)} · {r.status === "ABIERTA" ? "Abierta" : "Finalizada"}</option>)}
        </select></label><button className="button-primary" type="submit">Consultar</button>
      </form>
      <p className="mt-3 text-sm text-slate-600">{source ? `Revisión: ${source.title}. Pesos, avances y gastos de esta revisión; ${source.status === "FINALIZADA" ? "historial finalizado, solo lectura" : "abierta, sus avances pueden cambiar"}.` : "Estructura vigente y últimos avances registrados en los hitos. No corresponde a una revisión histórica específica."}</p>
      {source?.finalizedAt && <p className="mt-1 text-sm text-slate-600">Finalizada el {timestamp(source.finalizedAt)}</p>}
      {source && <Link className="button-secondary mt-2 inline-flex" href={`/planes/${plan.id}/seguimiento/${source.id}`}>Abrir esta revisión</Link>}
    </section>
    {s.achievement === null && <p role="status" className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4">No se puede calcular el avance global con esta estructura. Cada nivel necesita elementos y pesos que sumen 100 %. No se reemplazan datos faltantes por cero.</p>}
    <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr]">
      <section className="min-w-0 md:col-span-2 lg:col-span-1 rounded-2xl border border-blue-200 bg-blue-50 p-6 shadow-sm"><h2 className="mb-4 text-lg font-semibold">Avance global del plan</h2><Progress value={s.achievement} label="Avance global del plan" prominent /></section>
      <section className="min-w-0 rounded-2xl bg-white p-5 shadow-sm"><h2 className="mb-4 text-lg font-semibold">Acciones · {s.actions.total}</h2><dl className="grid grid-cols-3 gap-3 text-center">
        {[["Al 100 %", s.actions.completed], ["En avance", s.actions.inProgress], ["Sin avance", s.actions.notStarted]].map(([label, count]) => <div key={label} className="rounded-lg bg-slate-50 px-2 py-3"><dt className="text-sm text-slate-600">{label}</dt><dd className="mt-1 text-3xl font-semibold tabular-nums">{count}</dd></div>)}
      </dl>{s.actions.unavailable > 0 && <p>⚠ No calculables: {s.actions.unavailable}</p>}</section>
      <section className="min-w-0 rounded-2xl bg-white p-5 shadow-sm"><h2 className="mb-4 text-lg font-semibold">Gastos reales registrados</h2>{s.expenses.length ? s.expenses.map(e => <p key={e.currency} className="break-words text-xl font-bold">{money(e.amount)} {e.currency}</p>) : <p>Sin gastos registrados</p>}<p className="mt-2 text-sm text-slate-600">{s.recordedExpenses} acciones con gasto registrado · {s.missingExpenses} sin registrar.</p><p className="mt-1 text-sm text-slate-600">No incluye presupuesto planificado.</p></section>
    </div>
    <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm"><h2 className="text-xl font-semibold">Hitos · {s.milestones.total}</h2><div className="mt-3 flex flex-wrap gap-x-8 gap-y-2"><Badge tone="success">✓ Completados: {s.milestones.completed}</Badge><Badge tone="warning">◐ En avance: {s.milestones.inProgress}</Badge><Badge>○ Sin iniciar: {s.milestones.notStarted}</Badge></div></section>
    <div className="mt-6 grid items-stretch gap-5 xl:grid-cols-2"><DimensionComparison dimensions={s.dimensions} /><ActionDonut actions={s.actions} /></div><div className="mt-6"><ReviewEvolution history={data.history} planId={plan.id} selectedId={source?.id} /></div>
    <section className="mt-8"><h2 className="mb-4 text-2xl font-semibold">Avance por dimensión y acciones</h2>
      {!s.dimensions.length && <p className="rounded-2xl bg-white p-5">Este plan no tiene dimensiones en la fuente seleccionada.</p>}
      <div className="space-y-5">{s.dimensions.map(d => <article key={d.id} id={`dimension-${d.id}`} tabIndex={-1} className="scroll-mt-6 focus-visible:outline-2 focus-visible:outline-blue-600 min-w-0 rounded-2xl bg-white p-5 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2"><div><h3 className="break-words text-xl font-semibold">{d.name}</h3><p className="mt-1 text-slate-600">Peso dentro del plan: {percent(d.weightBps / 100)} %</p></div><Progress value={d.achievement} label={`Avance de ${d.name}`} /></div>
        {!d.actions.length && <p className="mt-4 text-slate-600">Sin acciones.</p>}
        <ul className="mt-5 divide-y divide-slate-200">{d.actions.map(a => <li key={a.id} className="grid gap-3 py-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="min-w-0"><h4 className="break-words font-semibold">{a.name}</h4><p className="break-words text-sm text-slate-600">Responsable: {a.responsibleName}</p><p className="text-sm text-slate-600">Peso en esta dimensión: {percent(a.weightBps / 100)} %</p><div className="mt-2"><Badge tone={a.achievement === null || a.achievement === 0 ? "neutral" : a.achievement === 100 ? "success" : "warning"}>{a.achievement === null ? "⚠ Revisar estructura" : a.achievement === 0 ? "○ Sin avance registrado" : a.achievement === 100 ? "✓ Logro al 100 %" : "◐ En avance"}</Badge></div></div>
          <Progress value={a.achievement} label={`Logro de ${a.name}`} />
        </li>)}</ul>
      </article>)}</div>
    </section>
  </div></main></ScrollReveal>;
}
