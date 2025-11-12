import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { ingestProducts } from "@/lib/rag/ingest";
import { ProductSource } from "@/lib/rag/schema";

const prisma = new PrismaClient();

/**
 * POST /api/products/embed-missing
 * Embed products that don't have embeddings yet
 */
export async function POST() {
  try {
    console.log("[embed-missing] Starting...");

    // 1. Get all products with shopeeProductId
    const allProducts = await prisma.product.findMany({
      where: {
        shopeeProductId: {
          not: null,
        },
      },
      select: {
        id: true,
        shopeeProductId: true,
        name: true,
        price: true,
        shortURL: true,
        affiliateUrl: true,
        productLink: true,
        categoryName: true,
        tags: true,
      },
    });

    console.log(`[embed-missing] Total products in DB: ${allProducts.length}`);

    // 2. Get shopeeProductIds that already have embeddings
    const embeddedProductIds = await prisma.$queryRaw<
      Array<{ sourceId: string }>
    >`
      SELECT DISTINCT rd."sourceId"
      FROM "RagDocument" rd
      JOIN "RagChunk" rc ON rd.id = rc."docId"
      WHERE rd."sourceType" = 'product'
        AND rc.embedding IS NOT NULL
    `;

    const embeddedIds = new Set(
      embeddedProductIds.map((p) => p.sourceId)
    );

    console.log(`[embed-missing] Already embedded: ${embeddedIds.size}`);

    // 3. Filter products that don't have embeddings
    const productsToEmbed = allProducts.filter(
      (p) => p.shopeeProductId && !embeddedIds.has(p.shopeeProductId)
    );

    console.log(`[embed-missing] Products to embed: ${productsToEmbed.length}`);

    if (productsToEmbed.length === 0) {
      return NextResponse.json({
        success: true,
        message: "All products already have embeddings",
        data: {
          processed: 0,
          successful: 0,
          failed: 0,
        },
      });
    }

    // 4. Convert to ProductSource format
    const productSources: ProductSource[] = productsToEmbed.map((p) => {
      const url = p.shortURL || p.affiliateUrl || p.productLink || undefined;
      return {
        productId: p.shopeeProductId!, // Use shopeeProductId as sourceId
        name: p.name,
        description: undefined, // not available in current schema
        price: p.price != null ? Number(p.price) : undefined,
        url,
        imageUrl: undefined, // not available in current schema
        category: p.categoryName || undefined,
        tags: p.tags || undefined,
      } as ProductSource;
    });

    // 5. Ingest in batches
    const batchSize = 20;
    let totalSuccessful = 0;
    let totalFailed = 0;
    const allErrors: Array<{ productId: string; error: string }> = [];

    for (let i = 0; i < productSources.length; i += batchSize) {
      const batch = productSources.slice(i, i + batchSize);

      console.log(
        `[embed-missing] Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(productSources.length / batchSize)}`
      );

      const result = await ingestProducts(batch, false);

      totalSuccessful += result.successful;
      totalFailed += result.failed;
      allErrors.push(...result.errors);

      // Delay between batches to avoid rate limiting
      if (i + batchSize < productSources.length) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }

    console.log(
      `[embed-missing] Completed: ${totalSuccessful} successful, ${totalFailed} failed`
    );

    return NextResponse.json({
      success: totalFailed === 0,
      message: `Embedded ${totalSuccessful} products${totalFailed > 0 ? `, ${totalFailed} failed` : ""}`,
      data: {
        processed: productsToEmbed.length,
        successful: totalSuccessful,
        failed: totalFailed,
        errors: allErrors.slice(0, 5), // Return first 5 errors
      },
    });
  } catch (error: any) {
    console.error("[embed-missing] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to embed products",
      },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
