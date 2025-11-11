import { ensureVideoIndex } from "../lib/videoIndexService";

async function main() {
  console.log("🧪 Testing single video run (after fix)...\n");

  const testVideoId = "AhZ58eUmbcw"; // Different video
  console.log(`Testing with videoId: ${testVideoId}`);
  console.log("Options: { forceReindex: true }\n");

  try {
    const result = await ensureVideoIndex(testVideoId, { forceReindex: true });
    console.log("✅ API Call Success!");
    console.log("Result:", result);

    // Wait a bit for background job to start
    await new Promise(resolve => setTimeout(resolve, 15000));

    console.log("\n⏳ Waiting for background indexing to complete...");
    console.log("(Check the logs above for any errors)\n");
  } catch (error) {
    console.error("❌ Error:", error);
    if (error instanceof Error) {
      console.error("Message:", error.message);
      console.error("Stack:", error.stack);
    }
  }
}

main();
