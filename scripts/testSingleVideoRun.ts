import { ensureVideoIndex } from "../lib/videoIndexService";

async function main() {
  console.log("🧪 Testing single video run (without force reindex)...\n");

  const testVideoId = "mdSlmRCRsao";
  console.log(`Testing with videoId: ${testVideoId}`);
  console.log("Options: { forceReindex: false }\n");

  try {
    const result = await ensureVideoIndex(testVideoId, { forceReindex: false });
    console.log("✅ Success!");
    console.log("Result:", result);
  } catch (error) {
    console.error("❌ Error:", error);
    if (error instanceof Error) {
      console.error("Message:", error.message);
      console.error("Stack:", error.stack);
    }
  }
}

main();
