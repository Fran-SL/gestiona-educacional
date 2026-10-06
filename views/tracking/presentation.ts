import type { Draft, ReviewAction } from "./types";
export function percent(value: number) {
  return new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 }).format(value);
}
export function parsePercent(value: string): number | null {
  if (!/^\d{1,3}(?:[.,]\d{1,2})?$/.test(value.trim())) return null;
  const result = Math.round(Number(value.trim().replace(",", ".")) * 100);
  return result <= 10000 ? result : null;
}
export function date(value: string) { return value.slice(0, 10).split("-").reverse().join("/"); }
export function timestamp(value: string) {
  const parts = new Intl.DateTimeFormat("es-CL", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "America/Santiago",
  }).formatToParts(new Date(value));

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${get("day")}-${get("month")}-${get("year")}, ${get("hour")}:${get("minute")}`;
}
export function draftFor(action?: ReviewAction): Draft {
  return Object.fromEntries(action?.milestones.map(h => [h.id, { value: percent(h.progressBps / 100), reason: "", confirmed: false }]) ?? []);
}
export function hasChanges(action: ReviewAction | undefined, draft: Draft) {
  return !!action?.milestones.some(h => parsePercent(draft[h.id]?.value ?? "") !== h.progressBps);
}
export const stateLabels: Record<string, string> = {
  PENDIENTE: "○ Pendiente",
  REVISADA_SIN_CAMBIOS: "✓ Revisada sin cambios",
  REVISADA_CON_CAMBIOS: "✓ Revisada con cambios",
} as const;
