import type { DashboardData } from "@/models/dashboard";

export default function ActionDonut({
  actions,
}: {
  actions: DashboardData["summary"]["actions"];
}) {
  const parts = [
    { name: "Completadas", count: actions.completed, color: "#047857" },
    { name: "En avance", count: actions.inProgress, color: "#b45309" },
    { name: "Sin iniciar", count: actions.notStarted, color: "#475569" },
    { name: "No calculables", count: actions.unavailable, color: "#cbd5e1" },
  ];

  return (
    <section
      className="flex min-w-0 flex-col rounded-2xl bg-white p-5 text-center shadow-sm"
      aria-labelledby="action-donut-title"
    >
      <h2 id="action-donut-title" className="text-xl font-semibold">
        Estado de las acciones
      </h2>

      <p className="mt-1 text-sm text-slate-600">
        Distribución del total de acciones en la fuente seleccionada.
      </p>

      <div className="mx-auto flex w-fit max-w-full flex-1 flex-col items-center justify-center gap-6 py-6 sm:flex-row sm:gap-10">
        <svg
          viewBox="0 0 160 160"
          className="w-44 max-w-full shrink-0"
          role="img"
          aria-label={`Estado de ${actions.total} acciones: ${parts
            .map((p) => `${p.count} ${p.name.toLowerCase()}`)
            .join(", ")}`}
        >
          <circle
            cx="80"
            cy="80"
            r="60"
            fill="none"
            stroke="#e2e8f0"
            strokeWidth="22"
          />

          {actions.total > 0 &&
            parts.map(
              (part, index) =>
                part.count > 0 && (
                  <circle
                    key={part.name}
                    cx="80"
                    cy="80"
                    r="60"
                    fill="none"
                    stroke={part.color}
                    strokeWidth="22"
                    pathLength="100"
                    strokeDasharray={`${(part.count / actions.total) * 100} 100`}
                    strokeDashoffset={
                      (-parts
                        .slice(0, index)
                        .reduce((n, p) => n + p.count, 0) /
                        actions.total) *
                      100
                    }
                    transform="rotate(-90 80 80)"
                  />
                ),
            )}

          <text
            x="80"
            y="80"
            textAnchor="middle"
            fill="#0f172a"
            fontSize="28"
            fontWeight="700"
          >
            {actions.total}
          </text>

          <text
            x="80"
            y="101"
            textAnchor="middle"
            fill="#475569"
            fontSize="12"
          >
            acciones
          </text>
        </svg>

        <dl className="w-full max-w-xs space-y-3 text-left">
          {parts
            .filter((p) => p.name !== "No calculables" || p.count > 0)
            .map((p) => (
              <div
                key={p.name}
                className="flex items-center justify-between gap-8"
              >
                <dt className="flex items-center gap-2 text-sm">
                  <span
                    aria-hidden="true"
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ background: p.color }}
                  />
                  {p.name}
                </dt>

                <dd className="font-semibold tabular-nums">{p.count}</dd>
              </div>
            ))}
        </dl>

      </div>

      {!actions.total && (
        <p className="mt-4 text-center text-sm text-slate-600">
          Sin acciones para representar.
        </p>
      )}
    </section>
  );
}