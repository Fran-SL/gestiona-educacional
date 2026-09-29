export class AccessDeniedError extends Error {
  constructor() {
    super("No tienes permiso para administrar planes.");
    this.name = "AccessDeniedError";
  }
}
