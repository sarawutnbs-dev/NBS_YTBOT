import { prisma } from "@/lib/db";
import { IndexStatus } from "@prisma/client";
import { fetchVideoMeta, getCaptions, chunkTranscript, buildIndex } from "@/lib/transcript";

export async function indexVideo({ videoId }: { videoId: string }) {
  console.log(`[indexVideo] Starting for videoId: ${videoId}`);

  // เช็กอีกชั้นกันซ้ำ: ถ้า READY อยู่แล้ว → ข้าม (INDEXING ให้ทำต่อเพื่อ update title)
  const current = await prisma.videoIndex.findUnique({ where: { videoId } });
  if (current && current.status === IndexStatus.READY) {
    console.log(`[indexVideo] Video ${videoId} already READY, skipping`);
    return current;
  }

  // ตั้งสถานะ INDEXING และดึง metadata
  console.log(`[indexVideo] Fetching video metadata for ${videoId}`);
  const meta = await fetchVideoMeta(videoId);
  const title = meta?.title ?? "";
  
  await prisma.videoIndex.upsert({
    where: { videoId },
    update: { status: IndexStatus.INDEXING, title },
    create: { videoId, status: IndexStatus.INDEXING, title }
  });

  try {
    console.log(`[indexVideo] Fetching captions for ${videoId}`);
    const text = await getCaptions(videoId);
    
    if (!text) {
      // ไม่มีคำบรรยาย → mark FAILED
      console.log(`[indexVideo] No captions available for ${videoId}`);
      return await prisma.videoIndex.update({
        where: { videoId },
        data: { 
          status: IndexStatus.FAILED, 
          errorMessage: "no captions available", 
          source: null 
        }
      });
    }

    console.log(`[indexVideo] Chunking transcript for ${videoId}`);
    const chunks = chunkTranscript(text, 400);
    
    console.log(`[indexVideo] Building index for ${videoId} (${chunks.length} chunks)`);
    const { summaryJSON } = await buildIndex(chunks);

    const result = await prisma.videoIndex.update({
      where: { videoId },
      data: {
        status: IndexStatus.READY,
        source: "captions",
        chunksJSON: JSON.stringify(chunks),
        summaryJSON: JSON.stringify(summaryJSON)
      }
    });

    console.log(`[indexVideo] ✅ Successfully indexed ${videoId}`);
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
