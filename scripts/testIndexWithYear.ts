import { config } from "dotenv";
import { resolve } from "path";
import { PrismaClient } from "@prisma/client";

config({ path: resolve(process.cwd(), ".env.local") });

const prisma = new PrismaClient();

async function main() {
  const videoId = "PiZaIXJ2iPs";

  console.log(`\n=== Testing Index with Year Detection ===\n`);
  console.log(`Video ID: ${videoId}\n`);

  // Get current status
  const before = await prisma.videoIndex.findUnique({
    where: { videoId },
    select: { publishedAt: true, status: true },
  });

  console.log("Before:");
  console.log(`  Published At: ${before?.publishedAt}`);
  console.log(`  Status: ${before?.status}\n`);

  // Reset to trigger re-index
  console.log("Resetting to NONE...");
  await prisma.videoIndex.update({
    where: { videoId },
    data: { status: "NONE" },
  });

  // Trigger indexing
  console.log("Triggering indexing...\n");
  const { ensureVideoIndex } = await import("../lib/videoIndexService");
  await ensureVideoIndex(videoId);

  // Wait for completion
  await new Promise((resolve) => setTimeout(resolve, 5000));

  // Check result
  const after = await prisma.videoIndex.findUnique({
    where: { videoId },
    select: { publishedAt: true, status: true, source: true },
  });

  console.log("\nAfter:");
  console.log(`  Published At: ${after?.publishedAt}`);
  console.log(`  Status: ${after?.status}`);
  console.log(`  Source: ${after?.source}`);

  if (after?.publishedAt) {
    const year = new Date(after.publishedAt).getFullYear();
    console.log(`\n✅ Success! Used year ${year} for GitHub path`);
  }

  await prisma.$disconnect();
}

main();
