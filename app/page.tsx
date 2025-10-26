import { redirect } from "next/navigation";
import { getServerAuthSession } from "@/lib/auth";

export default async function HomePage() {
  const session = await getServerAuthSession();

  if (session?.user) {
    redirect("/dashboard");
  }

  redirect("/auth/login");
}
