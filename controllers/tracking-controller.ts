import "server-only";
import { AccessDeniedError } from "./errors";
import { reviewModel } from "@/models/review";
import { startReviewSchema, readReviewSchema, listReviewsSchema, saveTrackingSchema, finalizeReviewSchema, reviewEventsSchema } from "@/models/tracking-rules";
type Actor = { id: string; active: boolean; role: "SUPERUSUARIO" | "ADMINISTRADOR" } | null;
export function createTrackingController(resolveActor: () => Promise<Actor>, model = reviewModel) {
  async function actor() {
    const user = await resolveActor();
    if (!user?.active || !["SUPERUSUARIO", "ADMINISTRADOR"].includes(user.role)) throw new AccessDeniedError();
    return { id: user.id };
  }
  return {
    async start(input: unknown) { const user = await actor(); return model.start(startReviewSchema.parse(input), user); },
    async read(input: unknown) { const user = await actor(); return model.read(readReviewSchema.parse(input), user); },
    async list(input: unknown) { const user = await actor(); return model.list(listReviewsSchema.parse(input), user); },
    async save(input: unknown) { const user = await actor(); return model.save(saveTrackingSchema.parse(input), user); },
    async finalize(input: unknown) { const user = await actor(); return model.finalize(finalizeReviewSchema.parse(input), user); },
    async events(input: unknown) { const user = await actor(); return model.events(reviewEventsSchema.parse(input), user); },
  };
}
