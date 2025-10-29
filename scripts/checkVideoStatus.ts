import { config } from "dotenv";
import { resolve } from "path";
import { PrismaClient } from "@prisma/client";

config({ path: resolve(process.cwd(), ".env.local") });

const prisma = new PrismaClient();

async function main() {
  const videoId = process.argv[2] || "PiZaIXJ2iPs";

  console.log(`\nChecking video: ${videoId}\n`);

  try {
    const videoIndex = await prisma.videoIndex.findUnique({
      where: { videoId },
    });

    if (!videoIndex) {
      console.log("❌ Video not found in database");
      return;
    }

    console.log("✅ Video found in database:");
    console.log("  Title:", videoIndex.title);
    console.log("  Status:", videoIndex.status);
    console.log("  Source:", videoIndex.source);
    console.log("  Published At:", videoIndex.publishedAt || "❌ Not set");
    console.log("  Updated:", videoIndex.updatedAt);
    console.log("\nPreview button status:");
    if (videoIndex.status === "READY") {
      console.log("  ✅ Preview button should be ENABLED");
    } else {
      console.log(`  ❌ Preview button is DISABLED (status is "${videoIndex.status}", needs to be "READY")`);
    }

    // Check if transcript data exists
    console.log("\nTranscript data:");
    console.log("  summaryJSON:", videoIndex.summaryJSON ? "✅ Exists" : "❌ Missing");
    console.log("  chunksJSON:", videoIndex.chunksJSON ? "✅ Exists" : "❌ Missing");

  } catch (error) {
    console.error("Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
