/**
 * Show metadata usage examples in RAG system
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function showMetadataUsage() {
  console.log("=".repeat(60));
  console.log("Metadata Usage in RAG System");
  console.log("=".repeat(60));

  try {
    // 1. Product metadata example
    console.log("\n[1] Product Metadata Example:");
    console.log("-".repeat(60));
    const productDoc = await prisma.ragDocument.findFirst({
      where: { sourceType: "product" },
      select: { sourceId: true, meta: true }
    });

    if (productDoc) {
      console.log("RagDocument.meta (Product):");
      console.log(JSON.stringify(productDoc.meta, null, 2));

      const productChunk = await prisma.ragChunk.findFirst({
        where: { docId: (await prisma.ragDocument.findFirst({
          where: { sourceType: "product" },
          select: { id: true }
        }))?.id },
        select: { text: true, meta: true }
      });

      if (productChunk) {
        console.log("\nRagChunk.meta (Product chunk):");
        console.log(JSON.stringify(productChunk.meta, null, 2));
      }
    }

    // 2. Transcript metadata example
    console.log("\n[2] Transcript Metadata Example:");
    console.log("-".repeat(60));
    const transcriptDoc = await prisma.ragDocument.findFirst({
      where: {
        sourceType: "transcript",
        meta: {
          path: ["videoId"],
          equals: "dWL68XA91qo"
        }
      },
      select: { sourceId: true, meta: true }
    });

    if (transcriptDoc) {
      console.log("RagDocument.meta (Transcript):");
      console.log(JSON.stringify(transcriptDoc.meta, null, 2));

      const transcriptChunk = await prisma.ragChunk.findFirst({
        where: {
          docId: (await prisma.ragDocument.findFirst({
            where: {
              sourceType: "transcript",
              meta: {
                path: ["videoId"],
                equals: "dWL68XA91qo"
              }
            },
            select: { id: true }
          }))?.id
        },
        select: { text: true, meta: true }
      });

      if (transcriptChunk) {
        console.log("\nRagChunk.meta (Transcript chunk):");
        console.log(JSON.stringify(transcriptChunk.meta, null, 2));
      }
    }

    // 3. Usage examples
    console.log("\n[3] Metadata Usage Examples:");
    console.log("-".repeat(60));

    console.log("\n✅ Use Case 1: Filter by videoId");
    console.log(`
    WHERE d.meta->>'videoId' = 'dWL68XA91qo'
    → Find all chunks from specific video
    `);

    console.log("✅ Use Case 2: Display product info");
    console.log(`
    meta.name → "Lenovo LOQ Gaming"
    meta.price → 36090
    meta.url → "https://nbsi.me/ezt8"
    → Show product details without querying Product table
    `);

    console.log("✅ Use Case 3: Filter by chunk type");
    console.log(`
    WHERE c.meta->>'chunkType' = 'summary'
    → Get only summary chunks, not detail chunks
    `);

    console.log("✅ Use Case 4: Time-based filtering");
    console.log(`
    WHERE c.meta->>'startTime' >= 120
    → Get transcript chunks after 2 minutes
    `);

    console.log("✅ Use Case 5: Category/Tag filtering");
    console.log(`
    WHERE d.meta->'tags' @> '["Lenovo"]'
    → Find products with specific tags
    `);

  } catch (error: any) {
    console.error("\n❌ Error:", error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

showMetadataUsage();
