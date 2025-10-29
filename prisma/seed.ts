import { prisma } from "@/lib/db";

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  if (adminEmail) {
    await prisma.user.upsert({
      where: { email: adminEmail },
      update: { allowed: true, role: "ADMIN" },
      create: { email: adminEmail, allowed: true, role: "ADMIN" }
    });
  }

  await prisma.appSetting.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      channelId: process.env.SEED_CHANNEL_ID ?? "",
      syncDays: 14,
      maxSyncDays: 30,
      aiTranscriptFallback: false
    } as any
  });
}

main()
  .catch(error => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
