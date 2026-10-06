import TrackingView from "@/views/tracking/TrackingView";
import { loadTracking } from "../load";
export const dynamic = "force-dynamic";
export default async function ReviewPage({ params }: { params: Promise<{ id: string; reviewId: string }> }) {
  const { id, reviewId } = await params;
  return <TrackingView key={reviewId} {...await loadTracking(id, reviewId)} />;
}
