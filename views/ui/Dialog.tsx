"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

/** Mounted only while open. Native modal supplies inert background and focus containment. */
export default function Dialog({ title, children, onClose, busy = false }: {
  title: string; children: ReactNode; onClose: () => void; busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current!;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    dialog.querySelector<HTMLElement>("[data-dialog-autofocus]")?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = previous;
      if (opener?.isConnected) opener.focus();
    };
  }, []);
  return <dialog ref={ref} aria-labelledby={titleId} aria-modal="true" aria-busy={busy}
    className="app-dialog" onKeyDown={event => {
      if (event.key !== "Tab") return;
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]'
      )).filter(element => element.getClientRects().length > 0);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <div className="mb-5 flex items-start justify-between gap-4">
      <h2 id={titleId} className="min-w-0 break-words text-xl font-semibold">{title}</h2>
      <button type="button" className="button-secondary shrink-0" aria-label="Cerrar diálogo" disabled={busy} onClick={onClose}>×</button>
    </div>
    {children}
  </dialog>;
}
