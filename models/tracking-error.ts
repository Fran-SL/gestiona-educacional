export class TrackingError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "TrackingError";
  }
}
export function trackingConflict(): never {
  throw new TrackingError("CONFLICT", "Los datos cambiaron. Recarga la revisión antes de guardar.");
}
