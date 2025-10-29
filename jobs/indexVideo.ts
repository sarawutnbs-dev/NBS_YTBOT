import { prisma } from "@/lib/db";
import { IndexStatus } from "@prisma/client";
import { fetchVideoMeta, getCaptions, getTranscriptFromGitHub, chunkTranscript, buildIndex } from "@/lib/transcript";

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
  await prisma.videoIndex.upsert({
    where: { videoId },
    update: {
      status: IndexStatus.INDEXING,
      title: meta?.title ?? current?.title ?? "",
      publishedAt: meta?.publishedAt ? new Date(meta.publishedAt) : current?.publishedAt ?? null
    },
    create: {
      videoId,
      status: IndexStatus.INDEXING,
      title: meta?.title ?? "",
      publishedAt: meta?.publishedAt ? new Date(meta.publishedAt) : null
    }
  });

  try {
    console.log(`[indexVideo] Fetching captions for ${videoId}`);
    let text = await getCaptions(videoId);
    let source: "captions" | "github" = "captions";
    
    // ถ้าไม่มี captions จาก YouTube ให้ลองดึงจาก GitHub
    if (!text) {
      console.log(`[indexVideo] No captions from YouTube, trying GitHub for ${videoId}`);
      text = await getTranscriptFromGitHub(videoId);
      source = "github";
    }
    
    if (!text) {
      // ไม่มีคำบรรยายทั้ง YouTube และ GitHub → mark FAILED
      console.log(`[indexVideo] No transcript available for ${videoId} (YouTube & GitHub)`);
      return await prisma.videoIndex.update({
        where: { videoId },
        data: { 
          status: IndexStatus.FAILED, 
          errorMessage: "no transcript available from YouTube or GitHub", 
          source: null 
        }
      });
    }

    console.log(`[indexVideo] Chunking transcript for ${videoId} (source: ${source})`);
    const chunks = chunkTranscript(text, 400);
    
    console.log(`[indexVideo] Building index for ${videoId} (${chunks.length} chunks)`);
    const { summaryJSON } = await buildIndex(chunks);

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
