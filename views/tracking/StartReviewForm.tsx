"use client";
import Dialog from "@/views/ui/Dialog";
import { useState, type FormEvent } from "react";
import { startReview } from "@/app/seguimiento/actions";
import type { Failure } from "./types";
export default function StartReviewForm({ planId, onCreated, onCancel, onFailure }: {
  planId: string; onCreated: (id: string) => void; onCancel: () => void; onFailure: (failure: Failure) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const from = String(form.get("from")), to = String(form.get("to"));
    if (to < from) { setError("La fecha final no puede ser anterior al inicio."); return; }
    setBusy(true); setError("");
    try {
      const result = await startReview({ planId, title: form.get("title"), referenceStartDate: from, referenceEndDate: to });
      if (result.ok) onCreated(result.data.id);
      else { setError(result.error); onFailure(result); }
    } catch { setError("No se pudo conectar. Tus datos siguen en el formulario."); }
    finally { setBusy(false); }
  }
  return <Dialog title="Iniciar una revisión" onClose={onCancel} busy={busy}><section className="space-y-4">
    
    <p className="my-3 text-slate-600">Se conservará una fotografía de la estructura y los avances actuales.</p>
    {error && <p role="alert" className="my-3 text-red-700">{error}</p>}
    <form onSubmit={submit}><fieldset disabled={busy} className="space-y-4">
      <label className="block">Título<input data-dialog-autofocus className="field mt-2" name="title" required maxLength={200} /></label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label>Inicio del período<input className="field mt-2" type="date" name="from" required /></label>
        <label>Fin del período<input className="field mt-2" type="date" name="to" required /></label>
      </div>
      <div className="flex flex-wrap gap-3"><button className="button-primary">{busy ? "Iniciando…" : "Crear revisión"}</button><button className="button-secondary" type="button" onClick={onCancel}>Cancelar</button></div>
    </fieldset></form>
  </section></Dialog>;
}
