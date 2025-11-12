import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";
import UsersTable from "./UsersTable.client";

export default async function UsersPage() {
  const session = await getServerAuthSession();

  // Only ADMIN can access user management page
  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  return <UsersTable />;
}
