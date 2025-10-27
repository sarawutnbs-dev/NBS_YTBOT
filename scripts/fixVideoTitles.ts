/**
 * Script to fix missing video titles in VideoIndex table
 * 
 * This script:
 * 1. Finds all VideoIndex records where title is empty or null
 * 2. Fetches video metadata from YouTube API
 * 3. Updates the title in database
 * 
 * Usage:
 *   npm run fix-titles
 */

import { config } from "dotenv";
import { resolve } from "path";
import { google } from "googleapis";

// Load .env.local
config({ path: resolve(process.cwd(), ".env.local") });

import { prisma } from "@/lib/db";

const youtube = google.youtube("v3");

async function fetchVideoTitle(videoId: string): Promise<string | null> {
  const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
  
  if (!YOUTUBE_API_KEY) {
    throw new Error("YOUTUBE_API_KEY not found in environment");
  }

  try {
    const response = await youtube.videos.list({
      key: YOUTUBE_API_KEY,
      part: ["snippet"],
      id: [videoId],
    });

    const video = response.data.items?.[0];
    return video?.snippet?.title ?? null;
  } catch (error) {
    console.error(`Error fetching video ${videoId}:`, error);
    return null;
  }
}

async function fixVideoTitles() {
  console.log("🔍 Finding VideoIndex records with missing titles...");

  // Find all records where title is empty or null
  const recordsWithoutTitle = await prisma.videoIndex.findMany({
    where: {
      title: "",
    },
    select: {
      videoId: true,
      status: true,
    },
  });

  if (recordsWithoutTitle.length === 0) {
    console.log("✅ No records found with missing titles. All done!");
    return;
  }

  console.log(`📝 Found ${recordsWithoutTitle.length} record(s) with missing titles`);
  console.log("Video IDs:", recordsWithoutTitle.map((r) => r.videoId).join(", "));
  console.log("");

  let successCount = 0;
  let failCount = 0;

  for (const record of recordsWithoutTitle) {
    const { videoId } = record;

    try {
      console.log(`🔄 Fetching title for ${videoId}...`);
      
      const title = await fetchVideoTitle(videoId);

      if (!title) {
        console.log(`⚠️  ${videoId}: No title found (video may be unavailable)`);
        failCount++;
        continue;
      }

      await prisma.videoIndex.update({
        where: { videoId },
        data: { title },
      });

      console.log(`✅ ${videoId}: "${title}"`);
      successCount++;

      // Small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (error) {
      console.error(`❌ ${videoId}: Error -`, (error as Error).message);
      failCount++;
    }
  }

  console.log("");
  console.log("=" .repeat(60));
  console.log("📊 Summary:");
  console.log(`   Total records: ${recordsWithoutTitle.length}`);
  console.log(`   ✅ Successfully updated: ${successCount}`);
  console.log(`   ❌ Failed: ${failCount}`);
  console.log("=" .repeat(60));
}

// Run the script
fixVideoTitles()
  .then(() => {
    console.log("\n🎉 Script completed!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Script failed:", error);
    process.exit(1);
  });
