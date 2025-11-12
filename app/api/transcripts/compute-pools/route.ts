import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { computeVideoProductPool } from "@/lib/rag/video-product-pool";

const prisma = new PrismaClient();

/**
 * POST /api/transcripts/compute-pools
 * Compute product pools for all READY videos with metadata
 * Returns Server-Sent Events for real-time progress
 */
export async function POST(request: Request) {
  // Create ReadableStream for SSE
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const sendEvent = (data: any) => {
        const message = `data: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(message));
      };

      try {
        console.log(`[compute-pools] Starting video product pool computation...`);

        // Get all READY videos with metadata
        const videos = await prisma.videoIndex.findMany({
          where: {
            status: "READY",
            OR: [
              { categoryTags: { isEmpty: false } },
              { brandTags: { isEmpty: false } },
              {
                AND: [
                  { priceRangeMin: { not: null } },
                  { priceRangeMax: { not: null } }
                ]
              },
              { tags: { isEmpty: false } }
            ],
          },
          select: {
            videoId: true,
            title: true,
            categoryTags: true,
            brandTags: true,
            tags: true,
          },
          orderBy: { updatedAt: "desc" },
        });

        console.log(`[compute-pools] Found ${videos.length} videos to process`);

        if (videos.length === 0) {
          sendEvent({
            type: "complete",
            success: true,
            message: "No videos found with metadata",
            data: {
              total: 0,
              processed: 0,
              successful: 0,
              failed: 0,
              totalProducts: 0,
              avgPoolSize: 0,
            },
          });
          controller.close();
          await prisma.$disconnect();
          return;
        }

        // Send initial progress
        sendEvent({
          type: "start",
          data: {
            total: videos.length,
          },
        });

        // Process each video
        let successful = 0;
        let failed = 0;
        let totalProducts = 0;
        const errors: Array<{ videoId: string; error: string }> = [];

        for (const [index, video] of videos.entries()) {
          try {
            console.log(
              `[compute-pools] [${index + 1}/${videos.length}] Processing: ${video.title.substring(0, 60)}...`
            );

            // Send progress update
            sendEvent({
              type: "progress",
              data: {
                current: index + 1,
                total: videos.length,
                videoTitle: video.title.substring(0, 60),
                successful,
                failed,
              },
            });

            // Compute pool for this video
            const result = await computeVideoProductPool(video.videoId, {
              maxPoolSize: 200,
              minRelevanceScore: 0.1,
              overwrite: true, // Overwrite existing pools
            });

            console.log(
              `[compute-pools] Video ${video.videoId}: pool size = ${result.poolSize}, avg score = ${result.avgScore.toFixed(3)}`
            );

            totalProducts += result.poolSize;
            successful++;

            // Small delay to avoid overwhelming the database
            if (index < videos.length - 1) {
              await new Promise((resolve) => setTimeout(resolve, 100)); // 100ms delay
            }
          } catch (error) {
            failed++;
            const errorMsg = error instanceof Error ? error.message : "Unknown error";
            errors.push({
              videoId: video.videoId,
              error: errorMsg,
            });
            console.error(`[compute-pools] Failed:`, errorMsg);
          }
        }

        const avgPoolSize = successful > 0 ? Math.round(totalProducts / successful) : 0;

        console.log(
          `[compute-pools] Completed: ${successful} successful, ${failed} failed, avg pool size = ${avgPoolSize}`
        );

        // Send completion
        sendEvent({
          type: "complete",
          success: failed === 0,
          message: `Computed pools for ${successful} video(s)${failed > 0 ? `, ${failed} failed` : ""}`,
          data: {
            total: videos.length,
            processed: videos.length,
            successful,
            failed,
            totalProducts,
            avgPoolSize,
            errors: errors.slice(0, 5), // Return first 5 errors
          },
        });

        controller.close();
      } catch (error: any) {
        console.error("[compute-pools] Error:", error);
        sendEvent({
          type: "error",
          error: error.message || "Failed to compute video product pools",
        });
        controller.close();
      } finally {
        await prisma.$disconnect();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
