import { prisma } from "../lib/db";
import { getVideoInfo } from "../lib/youtube";

async function syncVideoTitles() {
  try {
    console.log("🔄 Fetching videos from database...");

    // Get all videos that need title updates
    const videos = await prisma.videoIndex.findMany({
      select: {
        videoId: true,
        title: true,
      },
    });

    console.log(`Found ${videos.length} videos in database`);

    // Filter videos that don't have titles
    const videosWithoutTitles = videos.filter(v => !v.title);
    console.log(`${videosWithoutTitles.length} videos need titles`);

    if (videosWithoutTitles.length === 0) {
      console.log("✅ All videos already have titles");
      return;
    }

    // YouTube API allows up to 50 video IDs per request
    const batchSize = 50;
    let updated = 0;
    let failed = 0;

    for (let i = 0; i < videosWithoutTitles.length; i += batchSize) {
      const batch = videosWithoutTitles.slice(i, i + batchSize);
      const videoIds = batch.map(v => v.videoId);

      console.log(`\n📡 Fetching info for batch ${Math.floor(i / batchSize) + 1} (${videoIds.length} videos)...`);

      try {
        const videoInfos = await getVideoInfo(videoIds);

        console.log(`✓ Retrieved ${videoInfos.length} video details from YouTube`);

        // Update database
        for (const info of videoInfos) {
          try {
            await prisma.videoIndex.update({
              where: { videoId: info.videoId },
              data: {
                title: info.title,
                publishedAt: new Date(info.publishedAt),
              },
            });

            console.log(`  ✓ Updated: ${info.videoId} - ${info.title.substring(0, 60)}${info.title.length > 60 ? '...' : ''}`);
            updated++;
          } catch (error) {
            console.error(`  ✗ Failed to update ${info.videoId}:`, error);
            failed++;
          }
        }

        // Add delay to avoid rate limiting
        if (i + batchSize < videosWithoutTitles.length) {
          console.log("⏳ Waiting 1 second before next batch...");
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } catch (error) {
        console.error(`✗ Failed to fetch batch:`, error);
        failed += batch.length;
      }
    }

    console.log(`\n✅ Sync completed!`);
    console.log(`   Updated: ${updated}`);
    console.log(`   Failed: ${failed}`);
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

syncVideoTitles();
