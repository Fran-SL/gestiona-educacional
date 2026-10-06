"use client";
import Dialog from "@/views/ui/Dialog";
import Badge from "@/views/ui/Badge";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { structureAction } from "@/app/planes/[id]/actions";

import DimensionActions from "./DimensionActions";
import PlanNavigation from "./PlanNavigation";
import StructureWeightsEditor from "./StructureWeightsEditor";
import type { ActionView } from "./ActionForm";

type Entity = {
  id: string;
  name: string;
  description: string;
};

type DimensionView = Entity & {
  weightBps: number;
  actions: ActionView[];
};

type Plan = Entity & {
  status: string;
  dimensions: DimensionView[];
};

type Editor = { kind: "dimension"; id?: string; name: string; description: string };
type Target = { kind: "dimension" | "action"; id: string };
type Preview = { name: string; dimensions: number; actions: number; milestones: number; comments: number; token: string };
export default function PlanDetailView({ plan, superuser }: { plan: Plan; superuser: boolean }) {
  const router = useRouter();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [deletion, setDeletion] = useState<{ target: Target; preview: Preview } | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  function edit(value: Editor) { setEditor(value); setDeletion(null); setError(""); setMessage(""); }
  function run(operation: "save" | "preview" | "remove", input: object, target?: Target) {
    setError(""); setMessage("");
    startTransition(async () => {
      try {
        const result = await structureAction(operation, { ...input, planId: plan.id });
        if (!result.ok) {
          setError(result.error);

          if (operation === "remove") {
            setDeletion(null);
          }

          return;
        }
        if (operation === "preview" && result.preview && target) { setEditor(null); setDeletion({ target, preview: result.preview }); return; }
        setEditor(null); setDeletion(null);
        setMessage(operation === "remove" ? "Elemento eliminado." : "Cambios guardados.");
        router.refresh();
      } catch { setError("No se pudo conectar. Intenta nuevamente."); }
    });
  }
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    run("save", { ...editor, name: data.get("name"), description: data.get("description") });
  }
  function controls(kind: "dimension", entity: Entity) {
    return <div className="flex flex-wrap gap-3"><button className="button-secondary" disabled={pending} onClick={() => edit({ kind, ...entity })} aria-label={`Editar ${entity.name}`}>Editar</button><button className="button-danger" disabled={pending} onClick={() => { const target = { kind, id: entity.id }; run("preview", target, target); }} aria-label={`Eliminar ${entity.name}`}>Eliminar</button></div>;
  }
  return <main className="min-h-screen bg-slate-100 px-5 py-10 text-slate-900"><div className="mx-auto max-w-4xl">
    <Link className="button-secondary inline-flex" href="/">← Volver a planes</Link>
    <header className="my-8"><Badge tone={plan.status === "CERRADO" ? "info" : "success"}>{plan.status === "CERRADO" ? "Plan cerrado · Editable" : "Plan abierto"}</Badge><h1 className="mt-4 break-words text-3xl font-bold">{plan.name}</h1>{plan.description && <p className="mt-3 whitespace-pre-wrap break-words text-slate-600">{plan.description}</p>}</header>
    <PlanNavigation planId={plan.id} active="structure" />
    {error && !editor && !deletion && <p role="alert" className="mb-5 rounded-lg bg-red-50 p-4 text-red-700">{error}</p>}
    {message && <p role="status" className="mb-5 rounded-lg bg-emerald-50 p-4 text-emerald-800">{message}</p>}
    {editor && <Dialog title={editor.id ? "Editar dimensión" : "Crear dimensión"} onClose={() => setEditor(null)} busy={pending}>{error && <p role="alert" className="mb-4 text-red-800">{error}</p>}<section className="space-y-4"><form key={`${editor.kind}-${editor.id ?? "new"}`} onSubmit={save}><fieldset disabled={pending} className="mt-5 space-y-4"><label className="block">Nombre<input data-dialog-autofocus required name="name" maxLength={200} defaultValue={editor.name} className="field mt-2" /></label><label className="block">Descripción<textarea name="description" maxLength={5000} defaultValue={editor.description} className="field mt-2" rows={3} /></label><div className="flex flex-wrap gap-3"><button className="button-primary" type="submit">{pending ? "Guardando…" : "Guardar"}</button><button type="button" className="button-secondary" onClick={() => setEditor(null)}>Cancelar</button></div></fieldset></form></section></Dialog>}
    {deletion && <Dialog title="Confirmar eliminación" onClose={() => setDeletion(null)} busy={pending}>{error && <p role="alert" className="mb-4 text-red-800">{error}</p>}<section role="region" aria-labelledby="delete-title" className="space-y-4"><div className="rounded-xl border border-red-200 bg-red-50 p-5 text-left">
  <h2 id="delete-title" className="text-xl font-semibold text-red-900">
    Confirmar eliminación: {deletion.preview.name}
  </h2>

  <p className="mt-3 text-red-800">
    Se eliminará este contenido de forma permanente:
  </p>

  <ul className="mt-4 list-inside list-disc space-y-1 text-red-900">
    <li>Dimensiones: {deletion.preview.dimensions}</li>
    <li>Acciones: {deletion.preview.actions}</li>
    <li>Hitos: {deletion.preview.milestones}</li>
    <li>Comentarios: {deletion.preview.comments}</li>
  </ul>
</div><div className="flex flex-wrap gap-3"><button disabled={pending} className="button-secondary" onClick={() => setDeletion(null)}>Cancelar</button><button disabled={pending} className="button-danger" onClick={() => run("remove", { ...deletion.target, confirmed: true, token: deletion.preview.token })}>{pending ? "Eliminando…" : "Confirmar eliminación"}</button></div></section></Dialog>}
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-4"><h2 className="text-2xl font-semibold">Dimensiones</h2><button disabled={pending} className="button-primary" onClick={() => edit({ kind: "dimension", name: "", description: "" })}>Agregar dimensión</button></div>
      {!plan.dimensions.length && <p className="mt-6 rounded-xl border border-dashed p-6 text-slate-600">Este plan aún no tiene dimensiones. Agrega la primera para organizar sus acciones.</p>}
      {plan.dimensions.length > 0 && (
        <div className="mb-6">
          <StructureWeightsEditor
            key={plan.dimensions.map(d => d.id).join("-")}
            title="Pesos de las dimensiones"
            planId={plan.id}
            kind="dimension"
            parentId={plan.id}
            items={plan.dimensions.map(d => ({
              id: d.id,
              name: d.name,
              weightBps: d.weightBps,
            }))}
          />
        </div>
      )}
      <div className="mt-6 space-y-6">{plan.dimensions.map(d => <article key={d.id} className="rounded-xl border border-slate-200 p-5"><div className="flex flex-wrap items-start justify-between gap-3"><h3 className="break-words text-xl font-semibold">{d.name}</h3>{controls("dimension", d)}</div>{d.description && <p className="mt-3 whitespace-pre-wrap break-words text-slate-600">{d.description}</p>}<DimensionActions planId={plan.id} dimensionId={d.id} actions={d.actions} superuser={superuser} disabled={pending} onDelete={id => { const target = { kind: "action" as const, id }; run("preview", target, target); }} /></article>)}</div>
    </section>
  </div></main>;
}
