import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import TranscriptsTable from "./TranscriptsTable.client";

export default async function TranscriptsPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/signin");
  }

  return <TranscriptsTable />;
}
