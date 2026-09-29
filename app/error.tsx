"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6 text-slate-900"><section className="max-w-md rounded-2xl bg-white p-8 shadow-sm"><h1 className="text-2xl font-bold">No pudimos cargar la información</h1><p className="mt-4 text-slate-600">Comprueba que el servicio esté disponible e intenta nuevamente.</p><button onClick={reset} className="button-primary mt-6">Reintentar</button></section></main>;
}
