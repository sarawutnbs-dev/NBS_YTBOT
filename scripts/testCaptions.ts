import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env.local") });

async function main() {
  const { getCaptions, fetchVideoMeta } = await import("../lib/transcript");
  const videoId = process.argv[2] ?? "h0nNu5mTEQo";
  console.log(`Testing captions for videoId=${videoId}`);

  const meta = await fetchVideoMeta(videoId);
  console.log("Video meta:", meta);

  const captions = await getCaptions(videoId);

  if (captions) {
    console.log("✅ Captions downloaded. Sample:\n", captions.split("\n").slice(0, 10).join("\n"));
  } else {
    console.log("❌ Captions not available (getCaptions returned null)");
  }
}

main().catch((err) => {
  console.error("Error testing captions:", err);
  process.exit(1);
});
