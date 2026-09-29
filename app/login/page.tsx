import { redirect } from "next/navigation";
import { resolveActor } from "@/controllers/session-controller";
import LoginView from "@/views/auth/LoginView";

export const dynamic = "force-dynamic";
export default async function LoginPage() {
  if (await resolveActor()) redirect("/");
  return <LoginView />;
}
