"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveStructureWeights } from "@/app/planes/[id]/actions";
import { percentageToBps } from "@/models/action-rules";

type WeightItem = {
  id: string;
  name: string;
  weightBps: number;
};

export default function StructureWeightsEditor({
  title,
  planId,
  kind,
  parentId,
  items,
}: {
  title: string;
  planId: string;
  kind: "dimension" | "action";
  parentId: string;
  items: WeightItem[];
}) {

  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [weights, setWeights] = useState(() =>
    items.map(item => ({
      ...item,
      weight: String(item.weightBps / 100),
    }))
  );

  const total = weights.reduce(
    (sum, item) => sum + percentageToBps(item.weight),
    0
  );

  function updateWeight(id: string, value: string) {
    setWeights(current =>
      current.map(item =>
        item.id === id
          ? { ...item, weight: value }
          : item
      )
    );
  }

  function distributeEqually() {
    const count = weights.length;

    if (count === 0) {
        return;
    }

    const base = Math.floor(10000 / count);
    const remainder = 10000 % count;

    setWeights(current =>
        current.map((item, index) => ({
            ...item,
            weight: String(
                (base + (index < remainder ? 1 : 0)) / 100
            ),
        }))
    );

    setError("");
    setMessage("");
    }

  function saveWeights() {
    setError("");
    setMessage("");

    startTransition(async () => {
        try {
        const result = await saveStructureWeights({
            planId,
            kind,
            parentId,
            weights: weights.map(item => ({
            id: item.id,
            weightBps: percentageToBps(item.weight),
            })),
        });

        if (!result.ok) {
            setError(result.error);
            return;
        }

        setMessage("Pesos guardados.");
        router.refresh();
        } catch {
        setError(
            "No se pudieron guardar los pesos. Intenta nuevamente."
        );
        }
    });
    }

  return (
    <section className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <h3 className="font-semibold">{title}</h3>

      <div className="mt-4 space-y-3">
        {weights.map(item => (
          <label key={item.id} className="block">
            <span className="break-words">{item.name}</span>

            <div className="mt-1 flex items-center gap-2">
              <input
                className="field"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={item.weight}
                onChange={event =>
                  updateWeight(item.id, event.target.value)
                }
              />

              <span>%</span>
            </div>
          </label>
        ))}
      </div>

      <div className="mt-4 rounded-lg bg-white p-3">
        <p>
          Total:{" "}
          {Number.isFinite(total)
            ? (total / 100).toLocaleString("es-CL")
            : "—"}{" "}
          % de 100 %
        </p>
      </div>

      {error && (
        <p
            role="alert"
            className="mt-3 rounded-lg bg-red-50 p-3 text-red-700"
        >
            {error}
        </p>
        )}

        {message && (
        <p
            role="status"
            className="mt-3 rounded-lg bg-emerald-50 p-3 text-emerald-800"
        >
            {message}
        </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
            <button
                type="button"
                className="button-secondary"
                disabled={pending}
                onClick={distributeEqually}
            >
                Distribuir equitativamente
            </button>

            <button
                type="button"
                className="button-primary"
                disabled={pending || total !== 10000}
                onClick={saveWeights}
            >
                {pending ? "Guardando…" : "Guardar pesos"}
            </button>
        </div>
    </section>
  );
}