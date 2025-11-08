import { prisma } from "@/lib/db";
import { IndexStatus } from "@prisma/client";
import { fetchVideoMeta, getCaptions, chunkTranscript, buildIndex } from "@/lib/transcript";
import { extractVideoTags } from "@/lib/tagUtils";
import { ingestTranscript } from "@/lib/rag/ingest";
import type { TranscriptSource } from "@/lib/rag/schema";

export async function indexVideo({ videoId }: { videoId: string }) {
  console.log(`[indexVideo] Starting for videoId: ${videoId}`);

  // เช็กอีกชั้นกันซ้ำ: ถ้า READY หรือ INDEXING อยู่ → ข้าม
  const current = await prisma.videoIndex.findUnique({ where: { videoId } });

  if (current?.status === IndexStatus.READY) {
    console.log(`[indexVideo] Video ${videoId} already READY, skipping`);
    return current;
  }

  if (current?.status === IndexStatus.INDEXING) {
    console.log(`[indexVideo] Video ${videoId} currently INDEXING, continuing existing job`);
  }

  // ตั้งสถานะ INDEXING
  console.log(`[indexVideo] Fetching video metadata for ${videoId}`);
  const meta = await fetchVideoMeta(videoId);

  // Extract tags from video title
  const videoTitle = meta?.title ?? current?.title ?? "";
  const tags = extractVideoTags(videoTitle);
  if (tags.length > 0) {
    console.log(`[indexVideo] Extracted tags for ${videoId}:`, tags);
  }

  await prisma.videoIndex.upsert({
    where: { videoId },
    update: {
      status: IndexStatus.INDEXING,
      title: videoTitle,
      tags: tags,
      publishedAt: meta?.publishedAt ? new Date(meta.publishedAt) : current?.publishedAt ?? null
    },
    create: {
      videoId,
      status: IndexStatus.INDEXING,
      title: videoTitle,
      tags: tags,
      publishedAt: meta?.publishedAt ? new Date(meta.publishedAt) : null
    }
  });

  try {
    console.log(`[indexVideo] Fetching captions for ${videoId}`);
    const text = await getCaptions(videoId);
    if (!text) {
      console.log(`[indexVideo] No YouTube captions - scheduling scrape job (tubetranscript)`);

      // If another worker (e.g. TubeTranscript fallback) already completed processing,
      // it may have flipped status to READY while this job was still running.
      const latest = await prisma.videoIndex.findUnique({ where: { videoId } });
      if (latest?.status === IndexStatus.READY) {
        console.log(`[indexVideo] Captions missing but video ${videoId} already READY (likely fallback). Skipping reset.`);
        return latest;
      }

      // Leave status INDEXING; external scrape job will populate RawTranscript then processing job will finish index.
      return await prisma.videoIndex.update({
        where: { videoId },
        data: {
          errorMessage: "awaiting scraped transcript",
          source: null
        }
      });
    }
    const source: "captions" = "captions";
    console.log(`[indexVideo] Chunking transcript for ${videoId} (source: ${source})`);
    const chunks = chunkTranscript(text, 400);

    console.log(`[indexVideo] Building index for ${videoId} (${chunks.length} chunks)`);
    const { summaryJSON } = await buildIndex(chunks);

    // CRITICAL: Ingest to RAG BEFORE updating status to READY
    // This ensures RAG is populated before marking video as ready
    try {
      console.log(`[indexVideo] 🤖 Auto-ingesting transcript to RAG...`);

      const transcriptSource: TranscriptSource = {
        videoId,
        title: meta?.title || current?.title || "Untitled Video",
        channelName: meta?.channelTitle || "Unknown Channel",
        publishedAt: meta?.publishedAt || current?.publishedAt?.toISOString(),
        transcript: text,
        duration: undefined, // Will be fetched by RAG if needed
        viewCount: undefined
      };

      // Note: ingestTranscript will automatically check for duplicates by videoId
      // and skip re-embedding if content hash is the same (overwrite=false)
      const ingestResult = await ingestTranscript(transcriptSource, false);

      if (ingestResult.chunksCreated === 0) {
        console.log(`[indexVideo] ⏭️  Transcript already in RAG with same content, skipped re-embedding`);
      } else {
        console.log(`[indexVideo] ✅ Auto-ingested to RAG: ${ingestResult.chunksCreated} chunks created`);
      }
    } catch (ingestError) {
      // Don't fail the entire indexing job if RAG ingest fails
      console.error(`[indexVideo] ⚠️  Auto-ingest to RAG failed (non-critical):`, ingestError);
      console.log(`[indexVideo] ℹ️  Will continue to mark video as READY, RAG ingest can be retried manually`);
    }

    // Now update to READY status (after RAG ingest attempt)
    const result = await prisma.videoIndex.update({
      where: { videoId },
      data: {
        status: IndexStatus.READY,
        source,
        chunksJSON: JSON.stringify(chunks),
        summaryJSON: JSON.stringify(summaryJSON)
      }
    });

    console.log(`[indexVideo] ✅ Successfully indexed ${videoId} from ${source}`);

    return result;
  } catch (e) {
    const errorMessage = (e as Error).message ?? "index failed";
    console.error(`[indexVideo] ❌ Failed to index ${videoId}:`, errorMessage);
    
    return await prisma.videoIndex.update({
      where: { videoId },
      data: { 
        status: IndexStatus.FAILED, 
        errorMessage 
      }
    });
  }
}
