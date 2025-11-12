import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function checkSourceIdMapping() {
  try {
    // Get a sample RagDocument with embedding
    const sample = await prisma.$queryRaw<
      Array<{ sourceId: string; meta: any }>
    >`
      SELECT rd."sourceId", rc.meta
      FROM "RagDocument" rd
      JOIN "RagChunk" rc ON rd.id = rc."docId"
      WHERE rd."sourceType" = 'product'
        AND rc.embedding IS NOT NULL
      LIMIT 1
    `;

    console.log("Sample RagDocument sourceId:", sample[0]?.sourceId);

    // Try to find product by this sourceId
    const product = await prisma.product.findUnique({
      where: { id: sample[0]?.sourceId },
      select: { id: true, name: true, shortURL: true, price: true },
    });

    console.log("\nProduct from DB:", product);
    console.log("\nMeta from embedding:", sample[0]?.meta);

    if (!product) {
      console.log("\n❌ sourceId does NOT match product.id");

      // Try to find by shopeeProductId
      const productByShopeeId = await prisma.product.findUnique({
        where: { shopeeProductId: sample[0]?.sourceId },
        select: { id: true, name: true, shortURL: true, price: true },
      });

      if (productByShopeeId) {
        console.log("✅ Found by shopeeProductId instead:", productByShopeeId);
      }
    } else {
      console.log("\n✅ sourceId matches product.id correctly");
    }
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

checkSourceIdMapping();
