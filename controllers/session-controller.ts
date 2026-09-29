import "server-only";
import { headers } from "next/headers";
import { getAuth } from "@/models/auth";
import { getDatabase } from "@/models/db";

export async function resolveActor() {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return null;
  // Re-read permissions so deactivation and role changes apply immediately.
  const user = await getDatabase().user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, role: true, active: true },
  });
  return user?.active ? user : null;
}
