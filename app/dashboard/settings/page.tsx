import { prisma } from "@/lib/db";
import SettingsForm from "./SettingsForm.client";

export default async function SettingsPage() {
  const config = await prisma.appSetting.findFirst({
    orderBy: { createdAt: "desc" }
  });

  return <SettingsForm config={config} />;
}
