"use client";
import Dialog from "@/views/ui/Dialog";
import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { saveActionWithMilestones } from "@/app/planes/[id]/actions";
import { percentageToBps } from "@/models/action-rules";

export type ActionView = {
  id: string;
  name: string;
  description: string;
  responsibleName: string;
  startDate: string;
  endDate: string;
  actualExpense: string | null;
  weightBps: number;
  version: number;
  milestones: {
    id: string;
    name: string;
    weightBps: number;
    comments: {
      id: string;
      body: string;
      createdAt: string;
    }[];
  }[];
};

type DraftHito = { 
  key: string;
  id?: string;
  name: string;
  weight: string;
  newComment: string;
};

export default function ActionForm({ planId, dimensionId, action, onClose, onSaved }: { planId: string; dimensionId: string; action?: ActionView; superuser: boolean; onClose: () => void; onSaved: () => void }) {
  const router = useRouter();
  const [hitos, setHitos] = useState<DraftHito[]>(() =>
    action
      ? action.milestones.map(h => ({
          key: h.id,
          id: h.id,
          name: h.name,
          weight: String(h.weightBps / 100),
          newComment: "", 
        }))
      : [
          { 
            key: "initial",
            name: "",
            weight: "100",
            newComment: "",
          },
        ]
  );
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const removed = action?.milestones.filter(h => !hitos.some(d => d.id === h.id)) ?? [];
  const total = hitos.reduce((n, h) => n + percentageToBps(h.weight), 0);
  const valid = hitos.length > 0 && total === 10000 && hitos.every(h => Number.isFinite(percentageToBps(h.weight)) && percentageToBps(h.weight) <= 10000);
  function update(index: number, field: keyof DraftHito, value: string) { setHitos(hitos.map((h, i) => i === index ? { ...h, [field]: value } : h)); }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    const data = new FormData(event.currentTarget);
    startTransition(async () => {
      try {
        const result = await saveActionWithMilestones({ planId, dimensionId, id: action?.id, version: action?.version,
          name: data.get("name"), description: data.get("description"), responsibleName: data.get("responsibleName"), startDate: data.get("startDate"), endDate: data.get("endDate"), actualExpense: data.get("actualExpense") || null,
          confirmedRemovedIds: confirmed ? removed.map(h => h.id) : [],
          milestones: hitos.map(h => ({
            id: h.id,
            name: h.name,
            weightBps: percentageToBps(h.weight),
            newComment: h.newComment,
          })),
        });
        if (!result.ok) { setError(result.error); return; }
        router.refresh(); onSaved();
      } catch { setError("No se pudo conectar. Tus cambios siguen en el formulario; intenta nuevamente."); }
    });
  }
  return <Dialog title={action ? "Editar acción e hitos" : "Nueva acción e hitos"} onClose={onClose} busy={pending}><form onInvalidCapture={event => { const details = (event.target as HTMLElement).closest("details"); if (details) details.open = true; }} onSubmit={submit} className="space-y-5" aria-label={action ? "Editar acción" : "Nueva acción"}>
    
    <fieldset disabled={pending} className="mt-5 space-y-5">
      <label className="block">Nombre de la acción<input className="field mt-2" name="name" required maxLength={200} defaultValue={action?.name} data-dialog-autofocus /></label>
      <label className="block">Descripción de la acción<textarea className="field mt-2" name="description" required maxLength={5000} rows={3} defaultValue={action?.description} /></label>
      <label className="block">Responsable<input className="field mt-2" name="responsibleName" required maxLength={200} defaultValue={action?.responsibleName} /></label>
      <div className="grid gap-4 sm:grid-cols-2"><label>Fecha de inicio<input className="field mt-2" name="startDate" type="date" required defaultValue={action?.startDate} /></label><label>Fecha límite<input className="field mt-2" name="endDate" type="date" required defaultValue={action?.endDate} /></label></div>
      <label className="block">Gasto real en CLP (opcional)<input className="field mt-2" name="actualExpense" inputMode="numeric" pattern="[0-9]{1,16}" maxLength={16} defaultValue={action?.actualExpense ?? ""} placeholder="Monto sin puntos ni decimales" /></label>
      <h6 className="text-lg font-semibold">Hitos ({hitos.length})</h6>
      {hitos.map((h, i) => <details key={h.key} open={!h.id} className="rounded-lg border border-slate-200 p-4" aria-label={`Hito ${i + 1}`} >
        <summary className="cursor-pointer break-words font-medium focus-visible:outline-2 focus-visible:outline-blue-600">Hito {i + 1}{h.name ? `: ${h.name}` : " · Nuevo hito"}</summary>
        <div className="mt-4 space-y-4">
        <div className="flex items-center justify-between gap-3"><p className="font-medium">Hito {i + 1}</p><button type="button" className="button-secondary" onClick={() => { setHitos(hitos.filter((_, index) => i !== index)); setConfirmed(false); }}>Quitar hito {i + 1}</button></div>
        <label className="block">Nombre del hito<input className="field mt-2" required maxLength={200} value={h.name} onChange={e => update(i, "name", e.target.value)} /></label>
        <label className="block">
          Peso (%)
          <input
            className="field mt-2"
            type="number"
            required
            min="0"
            max="100"
            step="0.01"
            value={h.weight}
            onChange={e => update(i, "weight", e.target.value)}
          />
        </label>
        <label className="block">Agregar comentario (opcional)<textarea className="field mt-2" maxLength={5000} rows={2} value={h.newComment} onChange={e => update(i, "newComment", e.target.value)} /></label>
      </div></details>)}
      <button className="button-secondary" type="button" onClick={() => setHitos([...hitos, { key: crypto.randomUUID(), name: "", weight: "0", newComment: "" }])}>Agregar hito</button>
      <div aria-live="polite" className="rounded-lg bg-slate-100 p-4">
        <p>
          Peso total: {Number.isFinite(total)
            ? (total / 100).toLocaleString("es-CL")
            : "—"} % de 100 %
        </p>

        {!hitos.length && <p>Agrega al menos un hito.</p>}
      </div>
      {removed.length > 0 && <section className="rounded-lg border border-red-200 p-4"><p className="font-semibold">Al guardar se eliminarán estos hitos y sus comentarios:</p><ul className="my-3 list-inside list-disc">{removed.map(h => <li key={h.id}>{h.name} — {h.comments.length} comentarios</li>)}</ul><label><input type="checkbox" required checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /> Confirmo la eliminación permanente de estos {removed.length} hitos.</label><p className="mt-2 text-sm">Para conservarlos, cancela la edición.</p></section>}
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}
      <div className="flex flex-wrap gap-3"><button type="submit" className="button-primary" disabled={!valid || (removed.length > 0 && !confirmed)}>{pending ? "Guardando…" : "Guardar acción e hitos"}</button><button type="button" className="button-secondary" onClick={onClose}>Cancelar</button></div>
    </fieldset>
  </form></Dialog>;
}
