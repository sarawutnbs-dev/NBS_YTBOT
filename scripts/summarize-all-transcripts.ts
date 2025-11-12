/**
 * Regenerate GPT-5 summaries for all videos with existing transcripts
 *
 * Run: npx tsx scripts/summarize-all-transcripts.ts
 */

import "dotenv/config";
import { PrismaClient, IndexStatus } from "@prisma/client";
import { summarizeTranscriptWithGPT5 } from "@/lib/rag/transcript-summarizer";
import { ingestTranscript } from "@/lib/rag/ingest";

const prisma = new PrismaClient();

async function main() {
  console.log("=== Regenerating GPT-5 Summaries for All Transcripts ===\n");

  // Find all videos with existing transcripts (chunksJSON exists)
  const videos = await prisma.videoIndex.findMany({
    where: {
      status: IndexStatus.READY,
      chunksJSON: {
        not: null,
      },
    },
    select: {
      videoId: true,
      title: true,
      chunksJSON: true,
      summaryText: true,
      source: true,
      publishedAt: true,
    },
    orderBy: {
      updatedAt: "desc",
    },
  });

  console.log(`Found ${videos.length} videos with existing transcripts\n`);

  if (videos.length === 0) {
    console.log("No videos to process. Exiting.");
    return;
  }

  let processed = 0;
  let skipped = 0;
  let failed = 0;

  for (const video of videos) {
    try {
      console.log(`\n[${processed + skipped + failed + 1}/${videos.length}] Processing ${video.videoId}`);
      console.log(`  Title: ${video.title}`);

      // Check if already has GPT-5 summary
      if (video.summaryText && video.summaryText.length > 100) {
        console.log(`  ⏭️  Already has GPT-5 summary (${video.summaryText.length} chars), skipping`);
        skipped++;
        continue;
      }

      // Parse chunksJSON to get full transcript
      let chunks: string[];
      try {
        chunks = JSON.parse(video.chunksJSON!);
      } catch (e) {
        console.error(`  ❌ Failed to parse chunksJSON:`, e);
        failed++;
        continue;
      }

      const fullTranscript = chunks.join("\n\n");

      if (fullTranscript.length < 200) {
        console.log(`  ⏭️  Transcript too short (${fullTranscript.length} chars), skipping`);
        skipped++;
        continue;
      }

      console.log(`  📝 Transcript length: ${fullTranscript.length} chars`);
      console.log(`  🤖 Generating GPT-5 summary...`);

      // Generate GPT-5 summary
      const summary = await summarizeTranscriptWithGPT5(fullTranscript, video.title);

      console.log(`  ✅ Summary generated: ${summary.summary_text.length} chars`);
      console.log(`  📂 Category: ${summary.category}`);

      // Update database
      await prisma.videoIndex.update({
        where: { videoId: video.videoId },
        data: {
          summaryText: summary.summary_text,
          summaryCategory: summary.category,
        },
      });

      console.log(`  💾 Saved to database`);

      // Re-ingest to RAG with summary
      try {
        console.log(`  🔄 Re-ingesting summary to RAG...`);
        await ingestTranscript(
          {
            videoId: video.videoId,
            title: summary.video_title || video.title,
            channelName: "Unknown Channel",
            transcript: summary.summary_text, // Ingest summary instead of full transcript
            publishedAt: video.publishedAt?.toISOString(),
            duration: undefined,
            viewCount: undefined,
          },
          true // overwrite=true to replace old transcript chunks
        );
        console.log(`  ✅ RAG updated`);
      } catch (ingestError) {
        console.error(`  ⚠️  RAG ingest failed (non-critical):`, ingestError);
      }

      processed++;

      // Add delay to avoid rate limiting
      if (processed % 5 === 0) {
        console.log(`\n  ⏸️  Processed ${processed} videos, pausing for 2 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

    } catch (error) {
      console.error(`  ❌ Failed to process ${video.videoId}:`, error);
      failed++;
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("Summary:");
  console.log(`  ✅ Processed: ${processed}`);
  console.log(`  ⏭️  Skipped: ${skipped}`);
  console.log(`  ❌ Failed: ${failed}`);
  console.log(`  📊 Total: ${videos.length}`);
  console.log("=".repeat(60));
}

main()
  .then(() => {
    console.log("\n✅ Script completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Script failed:", error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
