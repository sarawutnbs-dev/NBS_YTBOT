import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * GET /api/products/embedding-status
 * Get embedding status for products
 */
export async function GET() {
  try {
    // 1. Get total products count
    const totalProducts = await prisma.product.count();

    // 2. Get products with embeddings using shopeeProductId as sourceId
    const productsWithEmbeddings = await prisma.$queryRaw<
      Array<{ count: bigint }>
    >`
      SELECT COUNT(DISTINCT rd."sourceId") as count
      FROM "RagDocument" rd
      JOIN "RagChunk" rc ON rd.id = rc."docId"
      WHERE rd."sourceType" = 'product'
        AND rc.embedding IS NOT NULL
    `;
    const embeddedCount = Number(productsWithEmbeddings[0]?.count || 0);

    // 3. Calculate missing
    const missingCount = totalProducts - embeddedCount;
    const coverage = totalProducts > 0 ? (embeddedCount / totalProducts) * 100 : 0;

    return NextResponse.json({
      success: true,
      data: {
        total: totalProducts,
        embedded: embeddedCount,
        missing: missingCount,
        coverage: Math.round(coverage * 100) / 100, // 2 decimal places
      },
    });
  } catch (error: any) {
    console.error("[embedding-status] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to get embedding status",
      },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
