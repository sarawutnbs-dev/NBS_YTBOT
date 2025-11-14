/**
 * Test specific comment that returns placeholder URL
 */

import { generateCommentReply } from "@/lib/rag/comment-reply";

async function testSpecificComment() {
  console.log("=".repeat(60));
  console.log("Testing Specific Comment Issue");
  console.log("=".repeat(60));

  const videoId = "GVWrCAB35Cg";
  const commentText = "มีรุ่นไหนแนะนำผมหน่อยผมจะซื้อให้ลูกชายใช้เรียนขอบคุณครับ";

  console.log(`\nVideo ID: ${videoId}`);
  console.log(`Comment: "${commentText}"\n`);

  try {
    const result = await generateCommentReply({
      commentText,
      videoId,
      model: "gpt-4o-mini"
    });

    console.log("\n" + "=".repeat(60));
    console.log("RESULT:");
    console.log("=".repeat(60));
    console.log("\nReply Text:");
    console.log(result.replyText);

    console.log("\n" + "-".repeat(60));
    console.log(`Products returned: ${result.products.length}`);

    if (result.products.length > 0) {
      console.log("\nProducts:");
      result.products.forEach((p, idx) => {
        console.log(`\n${idx + 1}. ${p.id || 'NO ID'}`);
        console.log(`   URL: ${p.url}`);
        console.log(`   Reason: ${p.reason || 'NO REASON'}`);
        console.log(`   Confidence: ${p.confidence || 'NO CONFIDENCE'}`);
      });
    }

    console.log("\n" + "-".repeat(60));
    console.log(`Contexts: ${result.contexts.length} chunks`);
    if (result.contexts.length > 0) {
      console.log(`Top 3 scores: ${result.contexts.slice(0, 3).map(c => c.score.toFixed(3)).join(", ")}`);
    }

    console.log("\n" + "=".repeat(60));
    console.log("CHECKING FOR PLACEHOLDER URLs:");
    console.log("=".repeat(60));

    const hasPlaceholder = result.replyText.includes("nbsi.me/xxxx");
    const productsWithPlaceholder = result.products.filter(p => p.url && p.url.includes("/xxxx"));

    if (hasPlaceholder) {
      console.log("⚠️  FOUND PLACEHOLDER in reply text!");
    } else {
      console.log("✅ No placeholder in reply text");
    }

    if (productsWithPlaceholder.length > 0) {
      console.log(`⚠️  FOUND ${productsWithPlaceholder.length} PLACEHOLDER(s) in products array!`);
    } else {
      console.log("✅ No placeholder in products array");
    }

  } catch (error) {
    console.error("\n❌ Error:", error);
    throw error;
  }
}

testSpecificComment()
  .then(() => {
    console.log("\n✅ Test complete");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n💥 Fatal error:", error);
    process.exit(1);
  });
