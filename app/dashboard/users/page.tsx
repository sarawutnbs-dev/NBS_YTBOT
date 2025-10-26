import { prisma } from "@/lib/db";
import UsersTable from "./UsersTable.client";

export default async function UsersPage() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" }
  });

  return <UsersTable initialUsers={users} />;
}
