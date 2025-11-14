import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import { isAdmin, type AppSession } from "@/lib/permissions";
import UsersTable from "./UsersTable.client";

export default async function UsersPage() {
  const session = await getServerAuthSession() as AppSession | null;

  // Only ADMIN can access user management page
  if (!isAdmin(session)) {
    redirect("/dashboard");
  }

  return <UsersTable />;
}
