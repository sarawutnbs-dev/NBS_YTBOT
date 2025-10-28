import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });

async function main() {
  const { getTranscriptFromGitHub } = await import("../lib/transcript");
  
  // ทดสอบด้วย videoId ตัวอย่าง
  const videoId = process.argv[2] ?? "h0nNu5mTEQo";
  
  console.log(`Testing GitHub transcript fetch for videoId=${videoId}`);
  
  const transcript = await getTranscriptFromGitHub(videoId);
  
  if (transcript) {
    console.log(`✅ Transcript found (${transcript.length} chars)`);
    console.log("\nFirst 500 characters:");
    console.log(transcript.substring(0, 500));
  } else {
    console.log("❌ No transcript found on GitHub");
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
