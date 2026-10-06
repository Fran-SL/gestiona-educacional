"use client";

import Dialog from "@/views/ui/Dialog";
import Badge from "@/views/ui/Badge";
import { useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPlanAction } from "@/app/plans/actions";
import { authClient } from "@/views/auth/client";

type Plan = {
  id: string; name: string; description: string;
  startDate: string | null; endDate: string | null;
  status: "ABIERTO" | "CERRADO";
};
function formatDate(date: string | null) {
  if (!date) return "Sin definir";
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

export default function PlansView({ plans, user }: { plans: Plan[]; user: { name: string; role: string } }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setError(""); setMessage("");
    startTransition(async () => {
      try {
        const result = await createPlanAction({
          name: String(data.get("name")), description: String(data.get("description")),
          startDate: data.get("startDate") || null, endDate: data.get("endDate") || null,
        });
        if (!result.ok) { setError(result.error); return; }
        setOpen(false);
        setMessage("Plan guardado correctamente.");
        router.refresh();
      } catch { setError("No se pudo conectar. Intenta nuevamente."); }
    });
  }
  async function signOut() {
    setSigningOut(true); setError("");
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error("Sign out failed");
      router.replace("/login"); router.refresh();
    } catch { setError("No se pudo cerrar la sesión. Intenta nuevamente."); }
    finally { setSigningOut(false); }
  }

  return <main className="min-h-screen bg-slate-100 px-5 py-10 text-slate-900">
    <div className="mx-auto max-w-4xl">
      <header className="mb-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm font-semibold uppercase tracking-wider text-blue-600">Plataforma de seguimiento</p>
          <button className="button-secondary" onClick={signOut} disabled={signingOut || pending}>{signingOut ? "Cerrando…" : "Cerrar sesión"}</button>
        </div>
        <h1 className="text-3xl font-bold sm:text-4xl">Sistema de Gestión Educacional</h1>
        <p className="mt-3 text-slate-600">{user.name} · {user.role === "SUPERUSUARIO" ? "Superusuario" : "Administrador"}</p>
      </header>
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-2xl font-semibold">Planes</h2>
          {<button disabled={open || pending} className="button-primary" onClick={() => { setOpen(true); setError(""); setMessage(""); }}>Crear nuevo plan</button>}
        </div>
        {error && !open && <p role="alert" className="mt-5 rounded-lg bg-red-50 p-3 text-red-700">{error}</p>}
        {message && <p role="status" className="mt-5 rounded-lg bg-emerald-50 p-3 text-emerald-800">{message}</p>}
        {open && <Dialog title="Crear nuevo plan" onClose={() => { setOpen(false); setError(""); }} busy={pending}>{error && <p role="alert" className="text-red-800">{error}</p>}<form className="mt-8 space-y-5" onSubmit={create}>
          <fieldset disabled={pending} className="space-y-5">
            <div><label htmlFor="name" className="mb-2 block font-medium">Nombre del plan</label><input id="name" name="name" className="field" required maxLength={200} data-dialog-autofocus placeholder="Plan de Gestión 2026" /></div>
            <div><label htmlFor="description" className="mb-2 block font-medium">Descripción</label><textarea id="description" name="description" className="field" rows={3} maxLength={5000} /></div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div><label htmlFor="startDate" className="mb-2 block font-medium">Fecha de inicio (opcional)</label><input id="startDate" name="startDate" type="date" className="field" /></div>
              <div><label htmlFor="endDate" className="mb-2 block font-medium">Fecha de término (opcional)</label><input id="endDate" name="endDate" type="date" className="field" /></div>
            </div>
            <div className="flex justify-end gap-3"><button type="button" className="button-secondary" onClick={() => { setOpen(false); setError(""); }}>Cancelar</button><button className="button-primary" type="submit">{pending ? "Guardando…" : "Guardar plan"}</button></div>
          </fieldset>
        </form></Dialog>}
        {plans.length === 0 ? <div className="mt-8 rounded-xl border border-dashed border-slate-300 p-10 text-center"><p className="text-slate-600">No hay planes creados.</p></div> : <div className="mt-8 space-y-4">
          {plans.map(plan => <article key={plan.id} className="rounded-xl border border-slate-200 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3"><h3 className="break-words text-lg font-semibold">{plan.name}</h3><Badge tone={plan.status === "CERRADO" ? "info" : "success"}>{plan.status === "CERRADO" ? "Plan cerrado" : "Abierto"}</Badge></div>
            {plan.description && <p className="mt-2 whitespace-pre-wrap break-words text-slate-600">{plan.description}</p>}
            <p className="mt-3 text-sm text-slate-500">Inicio: {formatDate(plan.startDate)} · Término: {formatDate(plan.endDate)}</p>
            <Link href={`/planes/${plan.id}`} className="button-primary mt-4 inline-block" aria-label={`Abrir plan ${plan.name}`}>Abrir plan</Link>
          </article>)}
        </div>}
      </section>
    </div>
  </main>;
}
