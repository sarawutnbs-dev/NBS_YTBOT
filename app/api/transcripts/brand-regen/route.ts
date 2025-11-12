import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface BrandMatch {
  brand: string;
  category: string;
  matchedIn: "title" | "transcript" | "both";
}

/**
 * Search for brand mentions in text (case-insensitive)
 */
function findBrandInText(text: string, brand: string): boolean {
  const lowerText = text.toLowerCase();
  const lowerBrand = brand.toLowerCase();

  // Try exact match first
  if (lowerText.includes(lowerBrand)) {
    return true;
  }

  // Try word boundary match (more precise)
  const wordBoundaryRegex = new RegExp(`\\b${lowerBrand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
  return wordBoundaryRegex.test(text);
}

/**
 * Find all brand matches in video title and transcript
 */
function findBrandMatches(
  title: string,
  transcript: string,
  brandList: Array<{ brand: string; category: string }>
): BrandMatch[] {
  const matches: BrandMatch[] = [];

  for (const { brand, category } of brandList) {
    const inTitle = findBrandInText(title, brand);
    const inTranscript = findBrandInText(transcript, brand);

    if (inTitle || inTranscript) {
      matches.push({
        brand,
        category,
        matchedIn: inTitle && inTranscript ? "both" : inTitle ? "title" : "transcript",
      });
    }
  }

  return matches;
}

/**
 * POST /api/transcripts/brand-regen
 * Batch regenerate brand tags for all READY videos
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
        console.log(`[brand-regen] Starting batch brand regeneration...`);

        // 1. Load all brands from BrandTag table
        const brandTags = await prisma.brandTag.findMany({
          select: {
            brand: true,
            category: true,
          },
          orderBy: {
            brand: "asc",
          },
        });

        console.log(`[brand-regen] Loaded ${brandTags.length} brands from BrandTag table`);

        if (brandTags.length === 0) {
          sendEvent({
            type: "error",
            error: "No brands found in BrandTag table. Please import brands first.",
          });
          controller.close();
          await prisma.$disconnect();
          return;
        }

        // 2. Get all READY videos with transcript
        const videos = await prisma.videoIndex.findMany({
          where: {
            status: "READY",
            chunksJSON: { not: null },
          },
          select: {
            id: true,
            videoId: true,
            title: true,
            brandTags: true,
            chunksJSON: true,
          },
          orderBy: { updatedAt: "desc" },
        });

        console.log(`[brand-regen] Found ${videos.length} videos to process`);

        if (videos.length === 0) {
          sendEvent({
            type: "complete",
            success: true,
            message: "No READY videos found with transcripts",
            data: {
              total: 0,
              processed: 0,
              updated: 0,
              unchanged: 0,
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
            brandCount: brandTags.length,
          },
        });

        // Process each video
        let updated = 0;
        let unchanged = 0;
        let failed = 0;
        const errors: Array<{ videoId: string; error: string }> = [];

        for (const [index, video] of videos.entries()) {
          try {
            // Parse transcript
            const chunks = JSON.parse(video.chunksJSON!);
            const transcriptText = Array.isArray(chunks) ? chunks.join(" ") : String(chunks);

            console.log(
              `[brand-regen] [${index + 1}/${videos.length}] Processing: ${video.title.substring(0, 60)}...`
            );

            // Send progress update
            sendEvent({
              type: "progress",
              data: {
                current: index + 1,
                total: videos.length,
                videoTitle: video.title.substring(0, 60),
                updated,
                unchanged,
                failed,
              },
            });

            // Find brand matches
            const matches = findBrandMatches(video.title, transcriptText, brandTags);

            // Extract unique brand names
            const newBrandTags = [...new Set(matches.map(m => m.brand))].sort();
            const currentBrandTags = video.brandTags.sort();

            // Check if update is needed
            const tagsAreSame = JSON.stringify(currentBrandTags) === JSON.stringify(newBrandTags);

            if (tagsAreSame) {
              console.log(`[brand-regen] No changes needed for ${video.videoId}`);
              unchanged++;
            } else {
              // Update brandTags in database
              await prisma.videoIndex.update({
                where: { id: video.id },
                data: { brandTags: newBrandTags },
              });

              console.log(
                `[brand-regen] Updated ${video.videoId}: ${currentBrandTags.length} → ${newBrandTags.length} brands`
              );
              console.log(`[brand-regen] New brands: ${JSON.stringify(newBrandTags)}`);
              updated++;
            }

            // Small delay to avoid overwhelming the database
            if (index < videos.length - 1 && (index + 1) % 10 === 0) {
              await new Promise((resolve) => setTimeout(resolve, 500));
            }
          } catch (error) {
            failed++;
            const errorMsg = error instanceof Error ? error.message : "Unknown error";
            errors.push({
              videoId: video.videoId,
              error: errorMsg,
            });
            console.error(`[brand-regen] Failed for ${video.videoId}:`, errorMsg);
          }
        }

        console.log(
          `[brand-regen] Completed: ${updated} updated, ${unchanged} unchanged, ${failed} failed`
        );

        // Send completion
        sendEvent({
          type: "complete",
          success: failed === 0,
          message: `Updated ${updated} video(s)${failed > 0 ? `, ${failed} failed` : ""}`,
          data: {
            total: videos.length,
            processed: videos.length,
            updated,
            unchanged,
            failed,
            errors: errors.slice(0, 5), // Return first 5 errors
          },
        });

        controller.close();
      } catch (error: any) {
        console.error("[brand-regen] Error:", error);
        sendEvent({
          type: "error",
          error: error.message || "Failed to regenerate brand tags",
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
