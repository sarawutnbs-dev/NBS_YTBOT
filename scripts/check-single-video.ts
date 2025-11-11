import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { prisma } from "@/lib/db";
import { fetchVideoMeta, getCaptions } from "@/lib/transcript";
import { scrapeTranscriptFromTubeTranscript } from "@/lib/transcriptScraper";

const VIDEO_ID = "yxuD1LSeFmA";

async function checkVideo() {
  console.log(`\n========================================`);
  console.log(`Checking video: ${VIDEO_ID}`);
  console.log(`========================================\n`);

  // 1. Check database status
  console.log("1. Checking database status...");
  const videoIndex = await prisma.videoIndex.findUnique({
    where: { videoId: VIDEO_ID },
  });

  if (videoIndex) {
    console.log("✅ Video found in database:");
    console.log("   - Title:", videoIndex.title || "(empty)");
    console.log("   - Status:", videoIndex.status);
    console.log("   - PublishedAt:", videoIndex.publishedAt);
    console.log("   - Source:", videoIndex.source);
    console.log("   - Error:", videoIndex.errorMessage || "(none)");
    console.log("   - Has chunks:", !!videoIndex.chunksJSON);
    console.log("   - Has summary:", !!videoIndex.summaryJSON);
  } else {
    console.log("❌ Video NOT found in database");
  }

  // 2. Check YouTube metadata
  console.log("\n2. Fetching YouTube metadata...");
  try {
    const meta = await fetchVideoMeta(VIDEO_ID);
    if (meta) {
      console.log("✅ YouTube metadata:");
      console.log("   - Title:", meta.title);
      console.log("   - Channel:", meta.channelTitle);
      console.log("   - Published:", meta.publishedAt);
    } else {
      console.log("❌ No metadata returned from YouTube API");
    }
  } catch (error) {
    console.error("❌ Error fetching metadata:", error);
  }

  // 3. Check YouTube captions
  console.log("\n3. Checking YouTube captions...");
  try {
    const captions = await getCaptions(VIDEO_ID);
    if (captions && captions.length > 0) {
      console.log(`✅ Found captions (${captions.length} characters)`);
      console.log("   Preview:", captions.substring(0, 200) + "...");
    } else {
      console.log("❌ No captions available from YouTube");
    }
  } catch (error) {
    console.error("❌ Error fetching captions:", error);
  }

  // 4. Try TubeTranscript scraper
  console.log("\n4. Trying TubeTranscript scraper...");
  try {
    const scraped = await scrapeTranscriptFromTubeTranscript(VIDEO_ID, 15000);
    if (scraped && scraped.length > 0) {
      console.log(`✅ Found transcript via scraper (${scraped.length} characters)`);
      console.log("   Preview:", scraped.substring(0, 200) + "...");
    } else {
      console.log("❌ No transcript from scraper");
    }
  } catch (error) {
    console.error("❌ Error with scraper:", error);
  }

  // 5. Check comments
  console.log("\n5. Checking comments...");
  const comments = await prisma.comment.findMany({
    where: { videoId: VIDEO_ID },
    select: {
      id: true,
      textOriginal: true,
      authorDisplayName: true,
      publishedAt: true,
    },
    take: 5,
  });

  console.log(`Found ${comments.length} comment(s) for this video`);
  if (comments.length > 0) {
    comments.forEach((comment, idx) => {
      console.log(`   ${idx + 1}. ${comment.authorDisplayName}: ${comment.textOriginal.substring(0, 50)}...`);
    });
  }

  console.log(`\n========================================`);
  console.log(`Check complete`);
  console.log(`========================================\n`);

  await prisma.$disconnect();
}

checkVideo().catch(console.error);
