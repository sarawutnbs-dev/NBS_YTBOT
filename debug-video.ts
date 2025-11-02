/**
 * Debug script to check video XipK40MQCrw state
 */

import { prisma } from "./lib/db";

const VIDEO_ID = "XipK40MQCrw";

async function debugVideo() {
  console.log(`\n🔍 Debugging video: ${VIDEO_ID}\n`);
  console.log("=" .repeat(80));

  try {
    // 1. Check VideoIndex
    console.log("\n1️⃣ Checking VideoIndex table...");
    const videoIndex = await prisma.videoIndex.findUnique({
      where: { videoId: VIDEO_ID },
    });

    if (!videoIndex) {
      console.log("❌ Video NOT found in VideoIndex table");
      return;
    }

    console.log("✅ Video found:");
    console.log(`   - Title: ${videoIndex.title}`);
    console.log(`   - Channel: ${videoIndex.channelName}`);
    console.log(`   - Status: ${videoIndex.status}`);
    console.log(`   - Tags: ${videoIndex.tags?.join(", ") || "None"}`);
    console.log(`   - Has transcript: ${videoIndex.transcript ? "YES" : "NO"}`);
    console.log(`   - Transcript length: ${videoIndex.transcript?.length || 0} chars`);

    // 2. Check Comments
    console.log("\n2️⃣ Checking Comments...");
    const allComments = await prisma.comment.findMany({
      where: { videoId: VIDEO_ID },
      select: {
        id: true,
        textOriginal: true,
        publishedAt: true,
        draft: {
          select: {
            id: true,
            status: true,
            reply: true,
          },
        },
      },
      orderBy: { publishedAt: "desc" },
    });

    console.log(`   - Total comments: ${allComments.length}`);

    const commentsWithDrafts = allComments.filter((c) => c.draft);
    const commentsWithoutDrafts = allComments.filter((c) => !c.draft);

    console.log(`   - With drafts: ${commentsWithDrafts.length}`);
    console.log(`   - Without drafts: ${commentsWithoutDrafts.length}`);

    if (commentsWithoutDrafts.length > 0) {
      console.log("\n   📝 Comments without drafts:");
      commentsWithoutDrafts.slice(0, 3).forEach((c, i) => {
        console.log(`      ${i + 1}. ${c.textOriginal.substring(0, 60)}...`);
      });
    }

    if (commentsWithDrafts.length > 0) {
      console.log("\n   ✅ Comments with drafts:");
      commentsWithDrafts.slice(0, 3).forEach((c, i) => {
        console.log(`      ${i + 1}. Status: ${c.draft?.status}, Reply: ${c.draft?.reply?.substring(0, 60) || "N/A"}...`);
      });
    }

    // 3. Check matching products
    console.log("\n3️⃣ Checking matching products...");
    const videoTags = videoIndex.tags || [];

    if (videoTags.length === 0) {
      console.log("⚠️  Video has NO tags - cannot match products");
    } else {
      const products = await prisma.product.findMany({
        where: {
          tags: {
            hasSome: videoTags,
          },
        },
        select: {
          id: true,
          name: true,
          tags: true,
          price: true,
        },
      });

      console.log(`   - Video tags: ${videoTags.join(", ")}`);
      console.log(`   - Matching products: ${products.length}`);

      if (products.length > 0) {
        console.log("\n   🛍️  Sample products:");
        products.slice(0, 3).forEach((p, i) => {
          console.log(`      ${i + 1}. ${p.name} (฿${p.price})`);
          console.log(`         Tags: ${p.tags?.join(", ") || "None"}`);
        });
      } else {
        console.log("   ⚠️  NO products match video tags!");
      }
    }

    // 4. Check RAG indexing
    console.log("\n4️⃣ Checking RAG indexing...");

    const transcriptDoc = await prisma.ragDocument.findFirst({
      where: {
        sourceType: "transcript",
        sourceId: VIDEO_ID,
      },
      include: {
        chunks: {
          select: { id: true },
        },
      },
    });

    if (transcriptDoc) {
      console.log(`   ✅ Transcript indexed in RAG: ${transcriptDoc.chunks.length} chunks`);
    } else {
      console.log("   ⚠️  Transcript NOT indexed in RAG");
    }

    const productDocs = await prisma.ragDocument.findMany({
      where: {
        sourceType: "product",
      },
      include: {
        chunks: {
          select: { id: true },
        },
      },
    });

    console.log(`   - Products indexed in RAG: ${productDocs.length}`);

    // 5. Summary
    console.log("\n" + "=".repeat(80));
    console.log("📊 SUMMARY:");
    console.log("=".repeat(80));

    const issues = [];

    if (videoIndex.status !== "READY") {
      issues.push(`❌ Video transcript status is ${videoIndex.status}, not READY`);
    }

    if (!videoIndex.transcript) {
      issues.push("❌ Video has no transcript data");
    }

    if (videoTags.length === 0) {
      issues.push("❌ Video has no tags");
    }

    const matchingProducts = videoTags.length > 0 ? await prisma.product.count({
      where: { tags: { hasSome: videoTags } },
    }) : 0;

    if (matchingProducts === 0) {
      issues.push("❌ No products match video tags");
    }

    if (commentsWithoutDrafts.length === 0) {
      issues.push("⚠️  All comments already have drafts");
    }

    if (issues.length === 0) {
      console.log("✅ Everything looks good! Ready for draft generation.");
    } else {
      console.log("⚠️  Issues found:");
      issues.forEach((issue) => console.log(`   ${issue}`));
    }

    console.log("\n" + "=".repeat(80) + "\n");

  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

debugVideo();
