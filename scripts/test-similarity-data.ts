/**
 * Check data availability for similarity search testing
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function checkData() {
  console.log("=".repeat(60));
  console.log("Checking Data for Similarity Search");
  console.log("=".repeat(60));

  try {
    // Check if video exists
    const videoId = "dWL68XA91qo";
    console.log(`\n[1] Checking Video: ${videoId}`);

    const video = await prisma.videoIndex.findUnique({
      where: { videoId },
      select: {
        videoId: true,
        title: true,
        status: true
      }
    });

    if (video) {
      console.log(`   ✅ Video found: ${video.title}`);
      console.log(`   Status: ${video.status}`);
    } else {
      console.log(`   ❌ Video NOT found`);
    }

    // Check transcript chunks for this video
    console.log(`\n[2] Checking Transcript Chunks...`);

    const transcriptDocs = await prisma.ragDocument.count({
      where: {
        sourceType: "transcript",
        meta: {
          path: ["videoId"],
          equals: videoId
        }
      }
    });

    console.log(`   Transcript documents: ${transcriptDocs}`);

    if (transcriptDocs > 0) {
      const chunks = await prisma.$queryRaw<any[]>`
        SELECT COUNT(*) as count
        FROM "RagChunk" c
        JOIN "RagDocument" d ON c."docId" = d.id
        WHERE d."sourceType" = 'transcript'
          AND d.meta->>'videoId' = ${videoId}
          AND c.embedding IS NOT NULL
      `;
      console.log(`   Transcript chunks with embeddings: ${chunks[0].count}`);
    }

    // Check product data
    console.log(`\n[3] Checking Product Data...`);

    const productDocs = await prisma.ragDocument.count({
      where: {
        sourceType: "product"
      }
    });

    console.log(`   Product documents: ${productDocs}`);

    const productChunksWithEmbedding = await prisma.$queryRaw<any[]>`
      SELECT COUNT(*) as count
      FROM "RagChunk" c
      JOIN "RagDocument" d ON c."docId" = d.id
      WHERE d."sourceType" = 'product' AND c.embedding IS NOT NULL
    `;

    console.log(`   Product chunks with embeddings: ${productChunksWithEmbedding[0].count}`);

    // Check total products in Product table
    const totalProducts = await prisma.product.count();
    console.log(`   Total products in Product table: ${totalProducts}`);

    // Check products with gaming in name (sample)
    const gamingProducts = await prisma.product.count({
      where: {
        OR: [
          { name: { contains: "gaming", mode: "insensitive" } },
          { name: { contains: "game", mode: "insensitive" } },
          { name: { contains: "เกม", mode: "insensitive" } }
        ]
      }
    });

    console.log(`   Products with gaming keywords: ${gamingProducts}`);

    console.log("\n" + "=".repeat(60));
    console.log("Summary:");
    console.log("=".repeat(60));

    if (!video) {
      console.log("❌ Problem: Video not found in database");
    } else if (transcriptDocs === 0) {
      console.log("❌ Problem: No transcript chunks for this video");
    } else if (productDocs === 0) {
      console.log("❌ Problem: No product data indexed");
    } else if (productChunksWithEmbedding[0].count === 0) {
      console.log("❌ Problem: No product embeddings created");
    } else {
      console.log("✅ All data looks good!");
      console.log(`   - Video exists and ready`);
      console.log(`   - ${transcriptDocs} transcript documents`);
      console.log(`   - ${productChunksWithEmbedding[0].count} product chunks with embeddings`);
    }

  } catch (error: any) {
    console.error("\n❌ Error:", error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

checkData();
