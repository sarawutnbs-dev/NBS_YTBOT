/**
 * Test specific question for debugging shortURL issue
 */

import { PrismaClient } from "@prisma/client";
import { generateCommentReply } from "@/lib/rag/comment-reply";

const prisma = new PrismaClient();

async function testSpecificQuestion() {
  const videoId = "GVWrCAB35Cg";
  const question = "ใช้เรียนกับเล่นเกมแนะนำตัวไหนคะ";

  console.log("=".repeat(80));
  console.log("Testing specific question");
  console.log("=".repeat(80));
  console.log(`Video ID: ${videoId}`);
  console.log(`Question: ${question}`);
  console.log("=".repeat(80));

  try {
    const result = await generateCommentReply({
      commentText: question,
      videoId: videoId,
      includeProducts: true,
      includeTranscripts: true,
    });

    console.log("\n📝 Reply Text:");
    console.log(result.replyText);

    console.log("\n🛍️ Products:");
    console.log(JSON.stringify(result.products, null, 2));

    console.log("\n📊 Context Count:", result.contexts.length);

    // Check if reply contains xxxx
    if (result.replyText.includes("xxxx")) {
      console.log("\n⚠️  WARNING: Reply contains 'xxxx' placeholder!");
    }

    if (result.products.length > 0) {
      console.log("\n🔍 Product URLs:");
      result.products.forEach((p, idx) => {
        console.log(`  ${idx + 1}. ${p.url}`);
        if (p.url.includes("xxxx")) {
          console.log(`     ⚠️  Contains placeholder!`);
        }
      });
    }

  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

testSpecificQuestion();
