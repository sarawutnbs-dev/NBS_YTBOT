/**
 * Test script to verify tag regeneration is working correctly
 * Run: npx tsx scripts/test-tag-regen.ts
 */

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

async function generateVideoTags(transcript: string): Promise<VideoTagResponse> {
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

  const tagResponse: VideoTagResponse = JSON.parse(responseText);
  return tagResponse;
}

async function main() {
  console.log("=== Testing Tag Regeneration ===\n");

  try {
    // Get first 3 READY videos
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
        categoryTags: true,
        chunksJSON: true,
      },
      take: 3,
      orderBy: { updatedAt: "desc" },
    });

    if (videos.length === 0) {
      console.log("No READY videos found with transcripts");
      return;
    }

    console.log(`Found ${videos.length} videos to test\n`);

    for (const [index, video] of videos.entries()) {
      console.log(`\n--- Video ${index + 1}/${videos.length} ---`);
      console.log(`Video ID: ${video.videoId}`);
      console.log(`Title: ${video.title}`);

      // Parse transcript - chunksJSON is an array of strings
      const chunks = JSON.parse(video.chunksJSON!);
      const transcriptText = Array.isArray(chunks) ? chunks.join(" ") : String(chunks);

      console.log(`Transcript length: ${transcriptText.length} chars`);
      console.log(`Transcript preview: ${transcriptText.substring(0, 150)}...\n`);

      // Existing tags
      console.log(`Current tags (${video.tags.length}): ${JSON.stringify(video.tags)}`);
      console.log(`Current category: ${JSON.stringify(video.categoryTags)}\n`);

      // Generate new tags
      console.log("Calling OpenAI...");
      const tagResponse = await generateVideoTags(transcriptText);

      console.log(`\nGenerated category: ${tagResponse.category}`);
      console.log(`Generated tags (${tagResponse.tags.length}): ${JSON.stringify(tagResponse.tags)}\n`);

      // Check if tags are different
      const tagsAreSame = JSON.stringify(video.tags.sort()) === JSON.stringify(tagResponse.tags.sort());
      console.log(`Tags are ${tagsAreSame ? "SAME ⚠️" : "DIFFERENT ✅"}`);

      // Small delay between requests
      if (index < videos.length - 1) {
        console.log("\nWaiting 2 seconds...");
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }

    console.log("\n=== Test Complete ===");
  } catch (error) {
    console.error("Error:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main();
