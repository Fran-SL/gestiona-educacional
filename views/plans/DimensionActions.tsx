"use client";
import { useState } from "react";
import ActionForm, { type ActionView } from "./ActionForm";
import StructureWeightsEditor from "./StructureWeightsEditor";

export default function DimensionActions({
  planId,
  dimensionId,
  actions,
  superuser,
  onDelete,
  disabled,
}: {
  planId: string;
  dimensionId: string;
  actions: ActionView[];
  superuser: boolean;
  onDelete: (id: string) => void;
  disabled: boolean;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  return (
    <details className="mt-6">
      <summary className="cursor-pointer rounded-lg py-3 font-semibold focus-visible:outline-2 focus-visible:outline-blue-600">Acciones ({actions.length})</summary>

      {actions.length > 0 && (
        <div className="mb-4">
          <StructureWeightsEditor
            key={actions.map(actions => actions.id).join("-")}
            title="Pesos de las acciones"
            planId={planId}
            kind="action"
            parentId={dimensionId}
            items={actions.map(action => ({
              id: action.id,
              name: action.name,
              weightBps: action.weightBps,
            }))}
          />
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">


        {(
          <button
            className="button-secondary"
            disabled={disabled || editing !== null}
            onClick={() => {
              setSaved(false);
              setEditing("new");
            }}
          >
            Agregar acción
          </button>
        )}
      </div>

      {saved && (
        <p role="status" className="mb-3 text-emerald-800">
          Acción e hitos guardados.
        </p>
      )}

      {editing !== null && (
        <ActionForm
          key={editing}
          planId={planId}
          dimensionId={dimensionId}
          action={actions.find(a => a.id === editing)}
          superuser={superuser}
          onClose={() => {
            setEditing(null);
          }}
          onSaved={() => {
            setEditing(null);
            setSaved(true);
          }}
        />
      )}

      {!actions.length && editing === null && (
        <p className="text-sm text-slate-500">
          Sin acciones todavía.
        </p>
      )}

      <div className="space-y-4">
        {actions.map(action => (
          <article
            key={action.id}
            className="rounded-lg bg-slate-50 p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h5 className="break-words text-lg font-semibold">
                {action.name}
              </h5>

              <div className="flex flex-wrap gap-2">
                <button
                  className="button-secondary"
                  disabled={disabled || editing !== null}
                  onClick={() => {
                    setSaved(false);
                    setEditing(action.id);
                  }}
                >
                  Editar acción
                </button>

                <button
                  className="button-danger"
                  disabled={disabled || editing !== null}
                  onClick={() => onDelete(action.id)}
                >
                  Eliminar acción
                </button>
              </div>
            </div>

            <p className="mt-2 whitespace-pre-wrap break-words text-slate-600">
              {action.description}
            </p>

            <p className="mt-3">
              Responsable: {action.responsibleName}
            </p>

            <p className="text-sm">
              Inicio: {action.startDate.split("-").reverse().join("/")}
              {" · "}
              Fecha límite: {action.endDate.split("-").reverse().join("/")}
            </p>

            <p className="mt-2">
              Gasto real:{" "}
              {action.actualExpense === null
                ? "Sin registrar"
                : `${BigInt(action.actualExpense).toLocaleString("es-CL")} CLP`}
            </p>

            <details className="mt-4">
            <summary className="cursor-pointer rounded-lg py-2 font-semibold focus-visible:outline-2 focus-visible:outline-blue-600">
              Hitos ({action.milestones.length})
            </summary>

            <ul className="mt-2 space-y-3">
              {action.milestones.map(h => (
                <li
                  key={h.id}
                  className="rounded-lg border border-slate-200 bg-white p-3"
                >
                  <p className="break-words font-medium">
                    {h.name}
                  </p>

                  <p className="text-sm">
                    Peso: {h.weightBps / 100} %
                  </p>

                  {h.comments.length > 0 && (
                    <details className="mt-2">
                      <summary className="cursor-pointer">
                        Comentarios ({h.comments.length})
                      </summary>

                      <ul className="mt-2 space-y-2">
                        {h.comments.map(c => (
                          <li
                            key={c.id}
                            className="border-l-2 border-blue-200 pl-3"
                          >
                            <p className="whitespace-pre-wrap break-words">
                              {c.body}
                            </p>

                            <time
                              className="text-xs text-slate-500"
                              dateTime={c.createdAt}
                            >
                              {c.createdAt
                                .slice(0, 10)
                                .split("-")
                                .reverse()
                                .join("/")}
                            </time>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </li>
              ))}
            </ul>
            </details>
          </article>
        ))}
      </div>
    </details>
  );
}