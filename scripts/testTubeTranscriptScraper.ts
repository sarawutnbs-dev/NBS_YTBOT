import { scrapeTranscriptFromTubeTranscript, closeBrowser } from "../lib/transcriptScraper";

async function main() {
  // Test with one of the stuck videos
  const testVideoIds = [
    "mdSlmRCRsao", // ASUS Zenbook A14
    "AhZ58eUmbcw", // ASUS TUF Gaming F16 2025
  ];

  console.log("🧪 Testing TubeTranscript scraper...\n");

  for (const videoId of testVideoIds) {
    console.log(`\n📹 Testing videoId: ${videoId}`);
    console.log("─".repeat(60));

    const startTime = Date.now();
    const transcript = await scrapeTranscriptFromTubeTranscript(videoId, 15000);
    const duration = Date.now() - startTime;

    if (transcript) {
      console.log(`✅ Success! (${duration}ms)`);
      console.log(`   Length: ${transcript.length} characters`);
      console.log(`   Preview: ${transcript.substring(0, 200)}...`);
    } else {
      console.log(`❌ Failed to scrape transcript (${duration}ms)`);
    }

    // Add delay between requests
    if (testVideoIds.indexOf(videoId) < testVideoIds.length - 1) {
      console.log("   Waiting 2s before next request...");
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  console.log("\n🔚 Closing browser...");
  await closeBrowser();
  console.log("✅ Test complete!");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  closeBrowser().then(() => process.exit(1));
});
