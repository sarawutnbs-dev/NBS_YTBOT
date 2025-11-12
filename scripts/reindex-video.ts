/**
 * Force re-index a specific video with new GPT-5 summarization
 *
 * Run: npx tsx scripts/reindex-video.ts A_rJAFy1D-0
 */

import "dotenv/config";
import { ensureVideoIndex } from "@/lib/videoIndexService";

async function main() {
  const videoId = process.argv[2];

  if (!videoId) {
    console.error("Usage: npx tsx scripts/reindex-video.ts <videoId>");
    process.exit(1);
  }

  console.log(`=== Force Re-indexing Video ===`);
  console.log(`Video ID: ${videoId}\n`);

  console.log("Starting re-index with forceReindex=true...");

  const result = await ensureVideoIndex(videoId, { forceReindex: true });

  console.log("\n✅ Re-index initiated!");
  console.log(`Result:`, result);

  if (result.fallback) {
    console.log("\nFallback result:", result.fallback);

    if (result.fallback.ok) {
      console.log(`✅ Successfully re-indexed with ${result.fallback.chunks} chunks`);
    } else {
      console.log(`❌ Failed: ${result.fallback.reason}`);
    }
  }

  console.log("\n💡 Check logs for GPT-5 summarization activity:");
  console.log("   - [TranscriptSummarizer] Summarizing transcript...");
  console.log("   - [openai:gpt-5] Calling Responses API...");
  console.log("   - [TranscriptSummarizer] ✅ Summary generated successfully");
}

main()
  .then(() => {
    console.log("\n✅ Script completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Script failed:", error);
    process.exit(1);
  });
