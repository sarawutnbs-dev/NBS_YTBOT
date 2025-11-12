import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function checkProductEmbeddings() {
  try {
    console.log("🔍 Checking product embeddings...\n");

    // 1. Get total products count
    const totalProducts = await prisma.product.count();
    console.log(`📦 Total products in DB: ${totalProducts}`);

    // 2. Get products with embeddings (RagDocument)
    const productsWithRagDocs = await prisma.ragDocument.count({
      where: {
        sourceType: "product",
      },
    });
    console.log(`📝 Products with RagDocuments: ${productsWithRagDocs}`);

    // 3. Get products with actual embeddings (RagChunk with embedding)
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
    console.log(`✅ Products with embeddings: ${embeddedCount}`);

    // 4. Calculate coverage
    const coverage = totalProducts > 0 ? (embeddedCount / totalProducts) * 100 : 0;
    console.log(`📊 Coverage: ${coverage.toFixed(2)}%`);

    // 5. Get sample of products WITH embeddings
    console.log("\n📌 Sample products WITH embeddings:");
    const sampleWithEmbeddings = await prisma.$queryRaw<
      Array<{ sourceId: string; text: string; meta: any }>
    >`
      SELECT DISTINCT ON (rd."sourceId")
        rd."sourceId",
        rc.text,
        rc.meta
      FROM "RagDocument" rd
      JOIN "RagChunk" rc ON rd.id = rc."docId"
      WHERE rd."sourceType" = 'product'
        AND rc.embedding IS NOT NULL
      LIMIT 3
    `;

    for (const sample of sampleWithEmbeddings) {
      const product = await prisma.product.findUnique({
        where: { shopeeProductId: sample.sourceId },
        select: { name: true, price: true, shortURL: true },
      });
      console.log(`\n  Product: ${product?.name || "N/A"}`);
      console.log(`  Price: ${product?.price || "N/A"}`);
      console.log(`  ShortURL: ${product?.shortURL || "N/A"}`);
      console.log(`  Chunk text: ${sample.text.substring(0, 100)}...`);
      console.log(`  Meta:`, sample.meta);
    }

    // 6. Get sample of products WITHOUT embeddings
    console.log("\n\n❌ Sample products WITHOUT embeddings:");
    const allProductIds = await prisma.product.findMany({
      select: { id: true, shopeeProductId: true, name: true, price: true, shortURL: true },
      take: 200,
    });

    const productIdsWithEmbeddings = await prisma.$queryRaw<
      Array<{ sourceId: string }>
    >`
      SELECT DISTINCT rd."sourceId"
      FROM "RagDocument" rd
      JOIN "RagChunk" rc ON rd.id = rc."docId"
      WHERE rd."sourceType" = 'product'
        AND rc.embedding IS NOT NULL
    `;

    const embeddedIds = new Set(
      productIdsWithEmbeddings.map((p) => p.sourceId)
    );
    const productsWithoutEmbeddings = allProductIds.filter(
      (p) => p.shopeeProductId && !embeddedIds.has(p.shopeeProductId)
    );

    for (const product of productsWithoutEmbeddings.slice(0, 5)) {
      console.log(`\n  Product ID: ${product.id}`);
      console.log(`  Name: ${product.name}`);
      console.log(`  Price: ${product.price || "N/A"}`);
      console.log(`  ShortURL: ${product.shortURL || "N/A"}`);
    }

    console.log(
      `\n\n📋 Summary:\n  Missing embeddings: ${totalProducts - embeddedCount} products`
    );
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

checkProductEmbeddings();
