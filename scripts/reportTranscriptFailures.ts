import { config } from "dotenv";
import { resolve } from "path";
import { PrismaClient, IndexStatus } from "@prisma/client";

config({ path: resolve(process.cwd(), ".env.local") });

const prisma = new PrismaClient();

async function main() {
  const failures = await prisma.videoIndex.findMany({
    where: { status: IndexStatus.FAILED },
    select: {
      videoId: true,
      title: true,
      errorMessage: true,
      updatedAt: true
    },
    orderBy: { updatedAt: "desc" },
    take: 50
  });

  if (failures.length === 0) {
    console.log("✅ No failed transcripts found.");
    return;
  }

  console.log(`⚠️ Found ${failures.length} failed transcripts:`);
  for (const item of failures) {
    console.log(`- ${item.videoId} | title="${item.title ?? ""}" | error="${item.errorMessage ?? "(no message)"}" | updated=${item.updatedAt.toISOString()}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
