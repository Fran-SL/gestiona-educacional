import Dialog from "@/views/ui/Dialog";
import type { Draft, ReviewMilestone } from "./types";
import { parsePercent, percent } from "./presentation";
export default function CorrectionConfirmation({ feedback, milestones, draft, busy, onReason, onConfirm, onSave, onCancel }: {
  feedback?: React.ReactNode; milestones: ReviewMilestone[]; draft: Draft; busy: boolean;
  onReason: (id: string, value: string) => void; onConfirm: (id: string, value: boolean) => void;
  onSave: () => void; onCancel: () => void;
}) {
  const ready = milestones.every(h => draft[h.id]?.reason.trim() && draft[h.id]?.confirmed);
  return <Dialog title="Confirmar correcciones" onClose={onCancel} busy={busy}>{feedback}<section id="correction-panel" tabIndex={-1} className="space-y-4">
    
    <p className="mt-2">Se guardará la acción completa, incluidos sus aumentos. Confirma cada disminución.</p>
    {milestones.map(h => <fieldset key={h.id} disabled={busy} className="mt-5 space-y-3 border-t border-amber-200 pt-4">
      <legend className="font-semibold">{h.name}: {percent(h.progressBps / 100)} % → {percent(parsePercent(draft[h.id].value)! / 100)} %</legend>
      <label className="block">Motivo de corrección de {h.name}<textarea className="field mt-2" rows={2} maxLength={5000} value={draft[h.id].reason} onChange={e => onReason(h.id, e.target.value)} required /></label>
      <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={draft[h.id].confirmed} onChange={e => onConfirm(h.id, e.target.checked)} />Confirmo la disminución de {h.name}</label>
    </fieldset>)}
    <div className="mt-5 flex flex-wrap gap-3"><button type="button" disabled={busy || !ready} className="button-primary" onClick={onSave}>Confirmar correcciones y guardar acción</button><button type="button" disabled={busy} className="button-secondary" onClick={onCancel}>Volver a editar</button></div>
  </section></Dialog>;
}
