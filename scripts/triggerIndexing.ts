import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });

async function main() {
  const videoId = process.argv[2];

  if (!videoId) {
    console.error("Usage: npx tsx scripts/triggerIndexing.ts <videoId>");
    process.exit(1);
  }

  console.log(`\nTriggering indexing for video: ${videoId}\n`);

  try {
    // Import the ensureVideoIndex function from the service
    const { ensureVideoIndex } = await import("../lib/videoIndexService");

    console.log("⏳ Starting indexing process...");
    const result = await ensureVideoIndex(videoId);

    console.log("\n✅ Indexing completed successfully!");
    console.log("Result:", result);

  } catch (error) {
    console.error("\n❌ Indexing failed:");
    console.error(error);
    process.exit(1);
  }
}

main();
