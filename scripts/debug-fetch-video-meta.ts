import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { fetchVideoMeta } from "@/lib/transcript";
import { getEnv } from "@/lib/config";

async function debug() {
  console.log("\n=== Debug fetchVideoMeta ===\n");

  // Check env
  const env = getEnv({ skipCache: true });
  console.log("1. Environment:");
  console.log(`   YOUTUBE_OAUTH_REFRESH_TOKEN: ${env.YOUTUBE_OAUTH_REFRESH_TOKEN?.substring(0, 30)}...`);
  console.log();

  // Try fetching metadata
  console.log("2. Calling fetchVideoMeta('dQw4w9WgXcQ')...");
  try {
    const meta = await fetchVideoMeta("dQw4w9WgXcQ");
    if (meta) {
      console.log("✅ Success!");
      console.log(`   Title: ${meta.title}`);
      console.log(`   Channel: ${meta.channelTitle}`);
      console.log(`   Published: ${meta.publishedAt}`);
    } else {
      console.log("⚠️  No metadata returned");
    }
  } catch (error: any) {
    console.error("❌ Error:", error.message);
    if (error.message?.includes("invalid_grant")) {
      console.log("\n   Token has been revoked or expired!");
      console.log("   This indicates the OAuth client is using the OLD token.");
    }
  }

  console.log();
}

debug().catch(console.error);
