/**
 * Test specific comment: "ใช้เรียนกับเล่นเกมแนะนำตัวไหนคะ"
 */

import { generateCommentReply } from "@/lib/rag/comment-reply";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: true });
dotenv.config({ override: false });

async function testStudyGamingComment() {
  console.log("============================================================");
  console.log("Testing: Study + Gaming Comment");
  console.log("============================================================\n");

  const videoId = "GVWrCAB35Cg";
  const commentText = "ใช้เรียนกับเล่นเกมแนะนำตัวไหนคะ";

  console.log(`Video ID: ${videoId}`);
  console.log(`Comment: "${commentText}"\n`);

  try {
    const result = await generateCommentReply({
      commentText,
      videoId,
      model: "gpt-4o-mini"
    });

    console.log("============================================================");
    console.log("RESULT:");
    console.log("============================================================\n");

    console.log("Reply Text:");
    console.log(result.replyText);
    console.log("\n" + "-".repeat(60));
    console.log(`Products returned: ${result.products.length}\n`);

    if (result.products.length > 0) {
      console.log("Products:\n");
      result.products.forEach((product, idx) => {
        console.log(`${idx + 1}. ${product.id}`);
        console.log(`   URL: ${product.url}`);
        console.log(`   Reason: ${product.reason}`);
        console.log(`   Confidence: ${product.confidence}\n`);
      });
    }

    console.log("-".repeat(60));
    console.log(`Contexts: ${result.contexts.length} chunks`);
    if (result.scores.length > 0) {
      console.log(`Top 3 scores: ${result.scores.slice(0, 3).join(", ")}`);
    }

    console.log("\n============================================================");
    console.log("CHECKING FOR PLACEHOLDER URLs:");
    console.log("============================================================");

    // Check for placeholder URLs
    const hasPlaceholderInText = result.replyText.includes("nbsi.me/xxxx") || result.replyText.includes("nbsi.me/xxxxx");
    const hasPlaceholderInProducts = result.products.some(p =>
      p.url.includes("xxxx") || p.url.includes("xxxxx")
    );

    if (hasPlaceholderInText) {
      console.log("❌ Found placeholder in reply text");
    } else {
      console.log("✅ No placeholder in reply text");
    }

    if (hasPlaceholderInProducts) {
      console.log("❌ Found placeholder in products array");
    } else {
      console.log("✅ No placeholder in products array");
    }

    if (hasPlaceholderInText || hasPlaceholderInProducts) {
      console.log("\n⚠️  PLACEHOLDER DETECTED!");
      console.log("\nDEBUG INFO:");
      console.log("Raw response:", result.rawResponse?.substring(0, 500));
    }

    console.log("\n✅ Test complete");

  } catch (error) {
    console.error("\n❌ Error:", error);
    if (error instanceof Error) {
      console.error("Stack:", error.stack);
    }
  }
}

testStudyGamingComment();
