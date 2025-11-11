import { prisma } from "@/lib/db";
import { IndexStatus } from "@prisma/client";
import { indexVideo } from "@/jobs/indexVideo";
import { fetchVideoMeta } from "@/lib/transcript";

/**
 * Ensure video index for given video IDs
 * - Skip if status is READY or INDEXING
 * - Create/update to INDEXING and enqueue job if NONE or FAILED
 */
export async function ensureVideoIndexFor(videoIds: Set<string>) {
  const ids = Array.from(videoIds);
  console.log(`[transcriptQueue] Processing ${ids.length} video(s):`, ids);

  for (const videoId of ids) {
    try {
      const vi = await prisma.videoIndex.findUnique({ where: { videoId } });

      if (vi && (vi.status === IndexStatus.READY || vi.status === IndexStatus.INDEXING)) {
        console.log(`[transcriptQueue] Video ${videoId} already ${vi.status}, skipping`);
        continue;
      }

      // ถ้าไม่มี หรือเคย FAILED/NONE → เริ่มทำใหม่
      console.log(`[transcriptQueue] Queueing video ${videoId} for indexing`);

      // Fetch video metadata to get title and publishedAt
      let videoTitle = vi?.title || "";
      let publishedAt = vi?.publishedAt || null;

      try {
        const meta = await fetchVideoMeta(videoId);
        videoTitle = meta?.title || videoTitle;
        publishedAt = meta?.publishedAt ? new Date(meta.publishedAt) : publishedAt;
      } catch (metaError) {
        console.warn(`[transcriptQueue] Failed to fetch metadata for ${videoId}:`, metaError);
      }

      await prisma.videoIndex.upsert({
        where: { videoId },
        update: {
          status: IndexStatus.INDEXING,
          title: videoTitle,
          publishedAt: publishedAt
        },
        create: {
          videoId,
          title: videoTitle,
          publishedAt: publishedAt,
          status: IndexStatus.INDEXING
        }
      });

      // TODO: เปลี่ยนเป็นคิวจริง (BullMQ/Upstash) ถ้ามี
      // ตอนนี้เรียกตรงๆ แบบ async (fire and forget)
      // ใช้ Promise.resolve().then() เพื่อไม่ block loop
      Promise.resolve().then(async () => {
        try {
          await indexVideo({ videoId });
        } catch (e) {
          console.error(`[transcriptQueue] Error indexing ${videoId}:`, e);
          await prisma.videoIndex.update({
            where: { videoId },
            data: { 
              status: IndexStatus.FAILED, 
              errorMessage: (e as Error).message ?? "index failed" 
            }
          });
        }
      });
    } catch (e) {
      console.error(`[transcriptQueue] Error processing ${videoId}:`, e);
    }
  }

  console.log(`[transcriptQueue] ✅ Queued ${ids.length} video(s) for indexing`);
}
