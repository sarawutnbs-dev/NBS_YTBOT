import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import OpenAI from "openai";

const prisma = new PrismaClient();
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || process.env.AI_API_KEY,
});

interface VideoTagResponse {
  category: string;
  tags: string[];
}

/**
 * Generate tags for a video transcript using OpenAI
 */
async function generateVideoTags(transcript: string): Promise<VideoTagResponse> {
  try {
    const prompt = `คุณคือผู้ช่วยวิเคราะห์วิดีโอรีวิว Notebook, Smartphone หรือ PC Component จาก transcript (ไม่มีภาพ) โดยมีหน้าที่สกัด "Tag" ที่เกี่ยวข้องกับสินค้าในวิดีโอ เพื่อนำไปจับคู่กับสินค้าในระบบฐานข้อมูล

โจทย์:
0. วิเคราะห์ transcript และจัดหมวดหมู่ผลิตภัณฑ์ (category) เป็นหนึ่งใน:
   - "Notebook"
   - "CPU"
   - "Mainboard"
   - "Graphics Cards / VGA"
   - "RAM"
   - "PSU"
   - "Fans & Heatsinks"
   - "PC Cases"
   - "Notebook Chargers & Adapters"
   - "Unknown" (กรณีไม่สามารถจัดเข้าหมวดหมู่ใดได้ชัดเจน)

1. อ่าน transcript ทั้งหมด แล้วดึง "แท็ก" ที่สะท้อนคุณสมบัติ, การใช้งาน, จุดเด่นของสินค้าที่พูดถึง
2. แท็กควรสั้น กระชับ และมีความหมายเฉพาะ เช่น "i5 Gen13", "บางเบา", "พกพา", "จอ OLED", "เล่นเกม", "RAM 16GB"
3. ห้ามใส่แท็กกว้างเกินไป เช่น "โน้ตบุ๊ก", "วิดีโอ", "ของดี" หรือ tag เชิงอารมณ์
4. ถ้าใน transcript พูดถึงหลายรุ่น ให้สกัดแท็กโดยรวมทั้งหมด
5. ถ้า transcript พูดถึงหลายหมวด เช่น Notebook + CPU ให้ tag แยกหมวดไว้

**รูปแบบผลลัพธ์เป็น JSON object:**

\`\`\`json
{
  "category": "Notebook",
  "tags": [
    "i5 Gen13",
    "RAM 16GB",
    "SSD 512GB",
    "จอ OLED",
    "14 นิ้ว",
    "บางเบา",
    "แบตอึด",
    "พอร์ตครบ",
    "ชาร์จผ่าน USB-C",
    "เหมาะกับงานเอกสาร",
    "พกพา"
  ]
}
\`\`\`

**Transcript:**
${transcript}

ตอบเป็น JSON object เท่านั้น ไม่ต้องมีคำอธิบายเพิ่มเติม`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a video analysis assistant. Always respond with valid JSON only, no additional text or markdown.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.3,
      response_format: { type: "json_object" },
    });

    const responseText = completion.choices[0].message.content;
    if (!responseText) {
      throw new Error("Empty response from OpenAI");
    }

    console.log(`[generateVideoTags] AI Response: ${responseText.substring(0, 300)}...`);

    // Parse JSON response
    const tagResponse: VideoTagResponse = JSON.parse(responseText);

    console.log(`[generateVideoTags] Parsed - category: ${tagResponse.category}, tags count: ${tagResponse.tags?.length || 0}`);

    return tagResponse;
  } catch (error) {
    console.error(`[video-tag-regen] Error generating tags:`, error);
    throw error;
  }
}

/**
 * POST /api/transcripts/tag-regen
 * Batch regenerate tags for all READY videos
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
        console.log(`[video-tag-regen] Starting batch tag regeneration...`);

        // 1. Get all READY videos with transcript
        const videos = await prisma.videoIndex.findMany({
          where: {
            status: "READY",
            chunksJSON: { not: null },
          },
          select: {
            id: true,
            videoId: true,
            title: true,
            tags: true,
            chunksJSON: true,
          },
        });

        console.log(`[video-tag-regen] Found ${videos.length} videos to tag`);

        const videosToTag = videos;

        if (videosToTag.length === 0) {
          sendEvent({
            type: "complete",
            success: true,
            message: "No READY videos found with transcripts",
            data: {
              total: 0,
              processed: 0,
              successful: 0,
              failed: 0,
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
            total: videosToTag.length,
          },
        });

        // Process each video
        let successful = 0;
        let failed = 0;
        const errors: Array<{ videoId: string; error: string }> = [];

        for (const [index, video] of videosToTag.entries()) {
          try {
            // chunksJSON is an array of strings
            const chunks = JSON.parse(video.chunksJSON!);
            const transcriptText = Array.isArray(chunks) ? chunks.join(" ") : String(chunks);

            console.log(
              `[video-tag-regen] [${index + 1}/${videosToTag.length}] Processing: ${video.title.substring(0, 60)}... (${transcriptText.length} chars)`
            );
            console.log(`[video-tag-regen] Transcript preview: ${transcriptText.substring(0, 200)}...`);

            // Send progress update
            sendEvent({
              type: "progress",
              data: {
                current: index + 1,
                total: videosToTag.length,
                videoTitle: video.title.substring(0, 60),
                successful,
                failed,
              },
            });

            // Generate tags using OpenAI
            const tagResponse = await generateVideoTags(transcriptText);
            console.log(`[video-tag-regen] Generated ${tagResponse.tags.length} tags, category: ${tagResponse.category}`);
            console.log(`[video-tag-regen] Tags: ${JSON.stringify(tagResponse.tags)}`);

            // Update tags and categoryTags in database
            const updatedVideo = await prisma.videoIndex.update({
              where: { id: video.id },
              data: {
                tags: tagResponse.tags,
                categoryTags: tagResponse.category !== "Unknown" ? [tagResponse.category] : [],
              },
              select: {
                videoId: true,
                tags: true,
                categoryTags: true,
              },
            });

            console.log(`[video-tag-regen] DB updated - videoId: ${updatedVideo.videoId}, tags: ${updatedVideo.tags.length}, categoryTags: ${updatedVideo.categoryTags.length}`);

            successful++;

            // Delay between requests to avoid rate limiting
            if (index < videosToTag.length - 1) {
              await new Promise((resolve) => setTimeout(resolve, 1000)); // 1 second delay
            }
          } catch (error) {
            failed++;
            const errorMsg = error instanceof Error ? error.message : "Unknown error";
            errors.push({
              videoId: video.videoId,
              error: errorMsg,
            });
            console.error(`[video-tag-regen] Failed:`, errorMsg);
          }
        }

        console.log(
          `[video-tag-regen] Completed: ${successful} successful, ${failed} failed`
        );

        // Send completion
        sendEvent({
          type: "complete",
          success: failed === 0,
          message: `Tagged ${successful} video(s)${failed > 0 ? `, ${failed} failed` : ""}`,
          data: {
            total: videosToTag.length,
            processed: videosToTag.length,
            successful,
            failed,
            errors: errors.slice(0, 5), // Return first 5 errors
          },
        });

        controller.close();
      } catch (error: any) {
        console.error("[video-tag-regen] Error:", error);
        sendEvent({
          type: "error",
          error: error.message || "Failed to regenerate video tags",
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
