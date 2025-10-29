import { config } from "dotenv";
import { resolve } from "path";
import { PrismaClient } from "@prisma/client";

config({ path: resolve(process.cwd(), ".env.local") });

const prisma = new PrismaClient();

async function main() {
  const videoId = process.argv[2] || "PiZaIXJ2iPs";

  console.log(`\nTesting publishedAt for video: ${videoId}\n`);

  // First, reset the video to NONE so we can re-index
  await prisma.videoIndex.update({
    where: { videoId },
    data: {
      status: "NONE",
      publishedAt: null,
    },
  });

  console.log("✅ Reset video to NONE");

  // Now trigger indexing
  const { ensureVideoIndex } = await import("../lib/videoIndexService");
  console.log("⏳ Starting indexing...");
  await ensureVideoIndex(videoId);

  // Wait a bit for indexing to complete
  await new Promise((resolve) => setTimeout(resolve, 5000));

  // Check the result
  const video = await prisma.videoIndex.findUnique({
    where: { videoId },
  });

  console.log("\n📋 Result:");
  console.log("  Video ID:", video?.videoId);
  console.log("  Title:", video?.title);
  console.log("  Status:", video?.status);
  console.log("  Published At:", video?.publishedAt || "❌ Not set");
  console.log("  Source:", video?.source);
  console.log("  Updated At:", video?.updatedAt);

  if (video?.publishedAt) {
    console.log("\n✅ Success! publishedAt is now being stored.");
  } else {
    console.log("\n⚠️ publishedAt is not set. Check if video metadata was fetched.");
  }

  await prisma.$disconnect();
}

main();
