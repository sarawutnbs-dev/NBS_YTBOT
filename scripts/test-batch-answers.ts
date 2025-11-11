import dotenv from "dotenv";

// Load .env.local BEFORE importing other modules
dotenv.config({ path: ".env.local" });

async function testBatchAnswers() {
  const { generateBatchAnswers } = await import("../lib/rag/answer");
  const { prisma } = await import("../lib/db");

  try {
    // 1. Find a video with READY status
    const videoIndex = await prisma.videoIndex.findFirst({
      where: {
        status: "READY",
      },
      select: {
        videoId: true,
        title: true,
      }
    });

    if (!videoIndex) {
      console.log("❌ No READY video found");
      return;
    }

    // 2. Find comments for this video
    const comments = await prisma.comment.findMany({
      where: {
        videoId: videoIndex.videoId,
      },
      take: 2, // Test with 2 comments
      select: {
        id: true,
        textOriginal: true,
      }
    });

    if (comments.length === 0) {
      console.log(`❌ No comments found for video ${videoIndex.videoId}`);
      return;
    }

    console.log(`\n📹 Testing with video: ${videoIndex.videoId}`);
    console.log(`   Title: ${videoIndex.title}`);
    console.log(`📝 Found ${comments.length} comments\n`);

    // 3. Prepare comment queries
    const commentQueries = comments.map(c => ({
      commentId: c.id,
      text: c.textOriginal
    }));

    // Log comments
    commentQueries.forEach((c, i) => {
      console.log(`Comment ${i + 1}: "${c.text.substring(0, 60)}..."`);
    });

    console.log("\n🚀 Running generateBatchAnswers...\n");

    // 4. Test generateBatchAnswers
    const result = await generateBatchAnswers(
      videoIndex.videoId,
      commentQueries,
      {
        includeProducts: true,
        includeTranscripts: true,
      }
    );

    // 4. Display results
    console.log("\n" + "=".repeat(80));
    console.log("📊 RESULTS");
    console.log("=".repeat(80) + "\n");

    console.log(`Total tokens used: ${result.totalTokensUsed}`);
    console.log(`Total answers: ${result.results.length}\n`);

    result.results.forEach((r, i) => {
      console.log(`--- Answer ${i + 1} (Comment ID: ${r.commentId}) ---`);
      console.log(`📝 Answer:\n${r.answer}\n`);
      console.log(`🛍️  Products: ${r.products.length}`);
      r.products.forEach((p, j) => {
        console.log(`   ${j + 1}. ${p.id} (confidence: ${p.confidence})`);
        console.log(`      Reason: ${p.reason}`);
        console.log(`      URL: ${p.url}`);
      });
      console.log(`📚 Contexts: ${r.contexts.length}`);
      console.log("");
    });

    console.log("✅ Test completed successfully!");

  } catch (error) {
    console.error("❌ Test failed:", error);
  } finally {
    await prisma.$disconnect();
  }
}

testBatchAnswers();
