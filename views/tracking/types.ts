import type { reviewModel } from "@/models/review";
export type Review = Awaited<ReturnType<typeof reviewModel.read>>;
export type ReviewList = Awaited<ReturnType<typeof reviewModel.list>>;
export type ReviewDimension = Review["dimensions"][number];
export type ReviewAction = ReviewDimension["actions"][number];
export type ReviewMilestone = ReviewAction["milestones"][number];
export type ProgressEvents = Awaited<ReturnType<typeof reviewModel.events>>;
export type Draft = Record<string, { value: string; reason: string; confirmed: boolean }>;
export type Failure = { code: string; error: string };
