import { config } from "dotenv";
import { prisma } from "../lib/db";

// Load .env.local
config({ path: ".env.local" });

async function main() {
  console.log("Checking YouTube Channel in database...");
  
  const settings = await prisma.appSetting.findFirst();
  
  if (settings) {
    const aiFallbackEnabled = Boolean((settings as { aiTranscriptFallback?: boolean }).aiTranscriptFallback);
    console.log("✅ Channel settings found:");
    console.log("  Channel ID:", settings.channelId);
    console.log("  Sync Days:", settings.syncDays);
    console.log("  Max Sync Days:", settings.maxSyncDays);
    console.log("  AI Transcript Fallback:", aiFallbackEnabled ? "Enabled" : "Disabled");
    console.log("  Created:", settings.createdAt);
    console.log("  Updated:", settings.updatedAt);
  } else {
    console.log("❌ No channel settings found in database");
    console.log("\nYou need to add the channel settings first.");
  }
  
  const commentCount = await prisma.comment.count();
  console.log(`\nComments in database: ${commentCount}`);
  
  const userCount = await prisma.user.count();
  console.log(`Users in database: ${userCount}`);
}

main()
  .catch((e) => {
    console.error("Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
