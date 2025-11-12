import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import OpenAI from "openai";

const prisma = new PrismaClient();
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || process.env.AI_API_KEY,
});

interface TaggingResponse {
  brand: string[];
  series: string[];
  cpu: string[];
  gpu?: string[];
  screen: string[];
  features: string[];
  audience: string[];
  warranty: string[];
  segment: string[];
}

/**
 * Generate tags for a product using OpenAI
 */
async function generateTags(productName: string): Promise<string[]> {
  try {
    const prompt = `ช่วยแยก tag สำหรับสินค้า โดยแยกออกเป็นหมวดหมู่ดังนี้:

- แบรนด์
- ซีรีส์/ตระกูล
- CPU/GPU
- หน้าจอ
- จุดเด่นการใช้งาน
- กลุ่มเป้าหมาย
- ประกัน
- ราคา (เชิง market segment เช่น "ราคาประหยัด")

สินค้า:
${productName}

ขอผลลัพธ์ในรูปแบบ JSON object แบบนี้:
{
  "brand": ["ASUS"],
  "series": ["Vivobook GO"],
  "cpu": ["Intel i3", "i3-N305"],
  "gpu": ["Integrated Graphics"],
  "screen": ["15 นิ้ว"],
  "features": ["น้ำหนักเบา", "ใช้งานทั่วไป", "เหมาะกับพกพา"],
  "audience": ["นักเรียน", "นักศึกษา", "ผู้เริ่มต้น"],
  "warranty": ["ประกัน 2 ปี", "ประกันอุบัติเหตุ 1 ปี"],
  "segment": ["โน้ตบุ๊กราคาประหยัด"]
}

ตอบเป็น JSON object เท่านั้น ไม่ต้องมีคำอธิบายเพิ่มเติม`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a product tagging assistant. Always respond with valid JSON only, no additional text or markdown.",
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

    // Parse JSON response
    const taggingResponse: TaggingResponse = JSON.parse(responseText);

    // Flatten all tags into a single array
    const allTags: string[] = [
      ...(taggingResponse.brand || []),
      ...(taggingResponse.series || []),
      ...(taggingResponse.cpu || []),
      ...(taggingResponse.gpu || []),
      ...(taggingResponse.screen || []),
      ...(taggingResponse.features || []),
      ...(taggingResponse.audience || []),
      ...(taggingResponse.warranty || []),
      ...(taggingResponse.segment || []),
    ];

    // Remove duplicates and empty strings
    const uniqueTags = [...new Set(allTags.filter((tag) => tag.trim() !== ""))];

    return uniqueTags;
  } catch (error) {
    console.error(`[tag-regen] Error generating tags:`, error);
    throw error;
  }
}

/**
 * POST /api/products/tag-regen
 * Regenerate tags for products with fewer than 3 tags (all products)
 * Returns Server-Sent Events for real-time progress
 */
export async function POST(request: Request) {
  const minTags = 3;

  // Create ReadableStream for SSE
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const sendEvent = (data: any) => {
        const message = `data: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(message));
      };

      try {
        console.log(`[tag-regen] Starting tag regeneration...`);

        // 1. Get all products
        const products = await prisma.product.findMany({
          select: {
            id: true,
            shopeeProductId: true,
            name: true,
            tags: true,
          },
        });

        // Filter by tag count (all products with tags < minTags)
        const productsToTag = products.filter((p) => p.tags.length < minTags);

        console.log(`[tag-regen] Found ${productsToTag.length} products to tag`);

        if (productsToTag.length === 0) {
          sendEvent({
            type: "complete",
            success: true,
            message: "All products have sufficient tags",
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
            total: productsToTag.length,
          },
        });

        // Process each product
        let successful = 0;
        let failed = 0;
        const errors: Array<{ productId: string; error: string }> = [];

        for (const [index, product] of productsToTag.entries()) {
          try {
            console.log(
              `[tag-regen] [${index + 1}/${productsToTag.length}] Processing: ${product.name.substring(0, 60)}...`
            );

            // Send progress update
            sendEvent({
              type: "progress",
              data: {
                current: index + 1,
                total: productsToTag.length,
                productName: product.name.substring(0, 60),
                successful,
                failed,
              },
            });

            // Generate new tags using OpenAI
            const newTags = await generateTags(product.name);
            console.log(`[tag-regen] Generated ${newTags.length} tags`);

            // Merge with existing tags
            const mergedTags = [...new Set([...product.tags, ...newTags])];

            // Update tags in database
            await prisma.product.update({
              where: { id: product.id },
              data: { tags: mergedTags },
            });

            successful++;

            // Delay between requests to avoid rate limiting
            if (index < productsToTag.length - 1) {
              await new Promise((resolve) => setTimeout(resolve, 1000)); // 1 second delay
            }
          } catch (error) {
            failed++;
            const errorMsg = error instanceof Error ? error.message : "Unknown error";
            errors.push({
              productId: product.id,
              error: errorMsg,
            });
            console.error(`[tag-regen] Failed:`, errorMsg);
          }
        }

        console.log(
          `[tag-regen] Completed: ${successful} successful, ${failed} failed`
        );

        // Send completion
        sendEvent({
          type: "complete",
          success: failed === 0,
          message: `Tagged ${successful} products${failed > 0 ? `, ${failed} failed` : ""}`,
          data: {
            total: productsToTag.length,
            processed: productsToTag.length,
            successful,
            failed,
            errors: errors.slice(0, 5), // Return first 5 errors
          },
        });

        controller.close();
      } catch (error: any) {
        console.error("[tag-regen] Error:", error);
        sendEvent({
          type: "error",
          error: error.message || "Failed to regenerate tags",
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
