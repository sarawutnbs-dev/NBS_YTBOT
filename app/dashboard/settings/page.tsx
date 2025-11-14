import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { isAdmin, type AppSession } from "@/lib/permissions";
import SettingsForm from "./SettingsForm.client";

export default async function SettingsPage() {
  const session = await getServerAuthSession() as AppSession | null;

  // Only allow admin users to access settings
  if (!isAdmin(session)) {
    redirect("/dashboard");
  }

  return <SettingsForm />;
}
