import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { isAllowedUser, type AppSession } from "@/lib/permissions";
import DashboardShell from "./DashboardShell.client";

export default async function DashboardLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const session = await getServerAuthSession() as AppSession | null;

  if (!session?.user) {
    redirect("/auth/login");
  }

  if (!isAllowedUser(session)) {
    redirect("/auth/login?error=not_allowed");
  }

  return <DashboardShell session={session}>{children}</DashboardShell>;
}
