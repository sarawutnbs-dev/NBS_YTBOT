import { config } from "dotenv";
import { resolve } from "path";
import { PrismaClient } from "@prisma/client";

config({ path: resolve(process.cwd(), ".env.local") });

const prisma = new PrismaClient();

async function main() {
  const videoId = process.argv[2];

  if (!videoId) {
    console.error("Usage: npx tsx scripts/fixStuckIndexing.ts <videoId>");
    process.exit(1);
  }

  console.log(`\nFixing stuck INDEXING status for video: ${videoId}\n`);

  try {
    const videoIndex = await prisma.videoIndex.findUnique({
      where: { videoId },
    });

    if (!videoIndex) {
      console.log("❌ Video not found in database");
      return;
    }

    console.log("Current status:", videoIndex.status);

    if (videoIndex.status !== "INDEXING") {
      console.log("⚠️  Video is not in INDEXING status. No action needed.");
      return;
    }

    // Reset to NONE so it can be re-indexed
    await prisma.videoIndex.update({
      where: { videoId },
      data: {
        status: "NONE",
        summaryJSON: null,
        chunksJSON: null,
      },
    });

    console.log("✅ Status reset to NONE. You can now click 'Run' to re-index.");
    console.log("\nNext steps:");
    console.log("1. Go to the Transcripts page in the dashboard");
    console.log("2. Click the 'Run' button for this video");
    console.log("3. Wait for status to become 'READY'");
    console.log("4. Then you can click 'Preview'");

  } catch (error) {
    console.error("Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
