import { PrismaClient } from "@prisma/client";
import OpenAI from "openai";
import { ingestProduct } from "@/lib/rag/ingest";
import { ProductSource } from "@/lib/rag/schema";
import dotenv from "dotenv";
import path from "path";

// Load environment variables from .env.local first with override
dotenv.config({ override: true });
// Then load .env for any missing variables
dotenv.config({ override: false });

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
      model: "gpt-4o-mini", // Fast and cheap model (ใช้แทน gpt-5-nano)
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
    console.error(`[tag-products] Error generating tags:`, error);
    throw error;
  }
}

/**
 * Main script function
 */
async function tagAndEmbedProducts(options: {
  minTags?: number;
  limit?: number;
  dryRun?: boolean;
  forceReembed?: boolean;
} = {}) {
  const {
    minTags = 3,
    limit,
    dryRun = false,
    forceReembed = false,
  } = options;

  console.log("🏷️  Starting product tagging and embedding...");
  console.log(`   Min tags threshold: ${minTags}`);
  console.log(`   Limit: ${limit || "None"}`);
  console.log(`   Dry run: ${dryRun}`);
  console.log(`   Force re-embed: ${forceReembed}\n`);

  try {
    // 1. Get all products (we'll filter by tag count in JavaScript)
    const products = await prisma.product.findMany({
      select: {
        id: true,
        shopeeProductId: true,
        name: true,
        tags: true,
        price: true,
        shortURL: true,
        affiliateUrl: true,
        productLink: true,
        categoryName: true,
      },
    });

    // Filter by tag count in JavaScript and apply limit
    let productsToTag = products.filter((p) => p.tags.length < minTags);

    if (limit) {
      productsToTag = productsToTag.slice(0, limit);
    }

    console.log(`📦 Found ${productsToTag.length} products with < ${minTags} tags\n`);

    if (productsToTag.length === 0) {
      console.log("✅ All products have sufficient tags!");
      return {
        success: true,
        processed: 0,
        tagged: 0,
        embedded: 0,
        failed: 0,
      };
    }

    if (dryRun) {
      console.log("🔍 DRY RUN - Preview of products to tag:\n");
      for (const product of productsToTag.slice(0, 5)) {
        console.log(`  • ${product.name}`);
        console.log(`    Current tags (${product.tags.length}): ${product.tags.join(", ") || "None"}\n`);
      }
      return {
        success: true,
        processed: 0,
        tagged: 0,
        embedded: 0,
        failed: 0,
        dryRun: true,
        previewCount: productsToTag.length,
      };
    }

    let tagged = 0;
    let embedded = 0;
    let failed = 0;
    const errors: Array<{ productId: string; error: string }> = [];

    for (const [index, product] of productsToTag.entries()) {
      try {
        console.log(
          `[${index + 1}/${productsToTag.length}] Processing: ${product.name.substring(0, 60)}...`
        );
        console.log(`   Current tags (${product.tags.length}): ${product.tags.join(", ") || "None"}`);

        // Generate new tags using OpenAI
        const newTags = await generateTags(product.name);
        console.log(`   ✨ Generated ${newTags.length} tags: ${newTags.join(", ")}`);

        // Merge with existing tags
        const mergedTags = [...new Set([...product.tags, ...newTags])];
        console.log(`   📝 Merged tags (${mergedTags.length}): ${mergedTags.join(", ")}`);

        // Update tags in database
        await prisma.product.update({
          where: { id: product.id },
          data: { tags: mergedTags },
        });

        tagged++;
        console.log(`   ✅ Updated tags in database`);

        // Re-embed product if it has shopeeProductId and forceReembed is true
        if (product.shopeeProductId && forceReembed) {
          try {
            const url =
              product.shortURL || product.affiliateUrl || product.productLink || undefined;

            const productSource: ProductSource = {
              productId: product.shopeeProductId,
              name: product.name,
              description: undefined,
              price: product.price != null ? Number(product.price) : undefined,
              url,
              imageUrl: undefined,
              category: product.categoryName || undefined,
              tags: mergedTags,
            };

            await ingestProduct(productSource, true); // overwrite = true
            embedded++;
            console.log(`   🔄 Re-embedded product`);
          } catch (embedError) {
            console.error(`   ⚠️  Failed to re-embed:`, embedError);
            // Don't count as failed if tagging succeeded
          }
        }

        console.log(""); // Empty line for readability

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
        console.error(`   ❌ Failed: ${errorMsg}\n`);
      }
    }

    console.log("\n📊 Summary:");
    console.log(`   Processed: ${productsToTag.length}`);
    console.log(`   Tagged: ${tagged}`);
    console.log(`   Embedded: ${embedded}`);
    console.log(`   Failed: ${failed}`);

    if (errors.length > 0) {
      console.log("\n❌ Errors:");
      errors.slice(0, 5).forEach((err) => {
        console.log(`   • ${err.productId}: ${err.error}`);
      });
    }

    return {
      success: failed === 0,
      processed: productsToTag.length,
      tagged,
      embedded,
      failed,
      errors,
    };
  } catch (error) {
    console.error("\n💥 Fatal error:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * CLI runner
 */
if (require.main === module) {
  const args = process.argv.slice(2);
  const options: Parameters<typeof tagAndEmbedProducts>[0] = {};

  // Parse CLI arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--min-tags" && args[i + 1]) {
      options.minTags = parseInt(args[i + 1]);
      i++;
    } else if (arg === "--limit" && args[i + 1]) {
      options.limit = parseInt(args[i + 1]);
      i++;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--force-reembed") {
      options.forceReembed = true;
    } else if (arg === "--help") {
      console.log(`
Usage: npx tsx scripts/tag-and-embed-products.ts [options]

Options:
  --min-tags <number>     Minimum number of tags threshold (default: 3)
  --limit <number>        Limit number of products to process
  --dry-run               Preview without actually tagging
  --force-reembed         Force re-embedding after tagging
  --help                  Show this help message

Examples:
  npx tsx scripts/tag-and-embed-products.ts --dry-run
  npx tsx scripts/tag-and-embed-products.ts --min-tags 3 --limit 10
  npx tsx scripts/tag-and-embed-products.ts --force-reembed
      `);
      process.exit(0);
    }
  }

  tagAndEmbedProducts(options)
    .then((result) => {
      console.log("\n✅ Done!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n💥 Fatal error:", error);
      process.exit(1);
    });
}

export { tagAndEmbedProducts, generateTags };
