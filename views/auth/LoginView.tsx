"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "./client";

export default function LoginView() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true);
    setError("");
    try {
      const result = await authClient.signIn.email({
        email: String(data.get("email")).trim(),
        password: String(data.get("password")),
      });
      if (result.error) {
        setError("No pudimos iniciar sesión. Revisa tus credenciales o consulta al superusuario.");
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError("No se pudo conectar. Intenta nuevamente.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-5 py-12 text-slate-900">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wider text-blue-600">Gestión Educacional</p>
        <h1 className="mt-3 text-3xl font-bold">Iniciar sesión</h1>
        <p className="mt-3 text-slate-600">Accede a los planes de gestión de tu institución.</p>
        <form onSubmit={submit} className="mt-8 space-y-5">
          <div>
            <label className="mb-2 block font-medium" htmlFor="email">Correo electrónico</label>
            <input className="field" id="email" name="email" type="email" autoComplete="username" required autoFocus disabled={pending} />
          </div>
          <div>
            <label className="mb-2 block font-medium" htmlFor="password">Contraseña</label>
            <input className="field" id="password" name="password" type="password" autoComplete="current-password" required disabled={pending} />
          </div>
          {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <button className="button-primary w-full" disabled={pending}>{pending ? "Ingresando…" : "Ingresar"}</button>
        </form>
        <p className="mt-6 text-sm text-slate-500">Las cuentas son habilitadas por el superusuario.</p>
      </section>
    </main>
  );
}
