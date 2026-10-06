import TrackingView from "@/views/tracking/TrackingView";
import { loadTracking } from "./load";
export const dynamic = "force-dynamic";
export default async function TrackingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TrackingView key={id} {...await loadTracking(id)} />;
}
