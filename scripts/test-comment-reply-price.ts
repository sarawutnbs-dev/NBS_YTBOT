/**
 * Test comment reply with price re-ranking
 */

import { generateCommentReply } from "../lib/rag/comment-reply";

async function testCommentReplyWithPrice() {
  console.log("=".repeat(60));
  console.log("Testing Comment Reply with Price Re-ranking");
  console.log("=".repeat(60));

  try {
    const videoId = "dWL68XA91qo";  // Gaming laptop video

    const testComments = [
      {
        name: "มีราคาชัดเจน",
        text: "อยากได้ notebook gaming งบ 40000 บาท แนะนำหน่อยครับ"
      },
      {
        name: "มีราคาแบบ K",
        text: "หา gaming laptop ประมาณ 25K ครับ"
      },
      {
        name: "มีช่วงราคา",
        text: "ต้องการโน๊ตบุ๊คเล่นเกม ราคาไม่เกิน 50,000 บาท"
      },
      {
        name: "ไม่มีราคา",
        text: "แนะนำ gaming notebook หน่อยครับ"
      }
    ];

    for (let i = 0; i < testComments.length; i++) {
      const testCase = testComments[i];

      console.log("\n" + "=".repeat(60));
      console.log(`[${i + 1}] Test: ${testCase.name}`);
      console.log("=".repeat(60));
      console.log(`Comment: "${testCase.text}"`);
      console.log("");

      const startTime = Date.now();

      try {
        const response = await generateCommentReply({
          commentText: testCase.text,
          videoId: videoId,
          includeProducts: true,
          includeTranscripts: true,
          maxTokens: 3000,
          model: "gpt-4o-mini"
        });

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);

        console.log("✅ Reply generated successfully!\n");
        console.log("-".repeat(60));
        console.log("REPLY:");
        console.log("-".repeat(60));
        console.log(response.replyText);
        console.log("");

        if (response.products.length > 0) {
          console.log("-".repeat(60));
          console.log(`RECOMMENDED PRODUCTS (${response.products.length}):`);
          console.log("-".repeat(60));
          response.products.forEach((p, idx) => {
            console.log(`${idx + 1}. ${p.id}`);
            console.log(`   URL: ${p.url}`);
            console.log(`   Reason: ${p.reason}`);
            console.log(`   Confidence: ${p.confidence}`);
            console.log("");
          });
        }

        console.log("-".repeat(60));
        console.log("METRICS:");
        console.log("-".repeat(60));
        console.log(`⏱️  Duration: ${duration}s`);
        console.log(`🤖 Model: ${response.model}`);
        console.log(`📦 Contexts: ${response.contexts.length} chunks`);
        console.log(`📊 Products: ${response.products.length}`);
        console.log(`💰 Tokens: ${response.tokenUsage.totalTokens}`);

      } catch (error: any) {
        console.error(`❌ Error: ${error.message}`);
        console.error(error.stack);
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log("✅ All tests completed!");
    console.log("=".repeat(60));
    console.log("\nExpected behavior:");
    console.log("1. Comments with price (40K, 25K, 50,000) should trigger re-ranking");
    console.log("2. Products close to budget should rank higher");
    console.log("3. Comments without price should work normally");
    console.log("\nLook for these log patterns:");
    console.log("  • '💰 Detected price in comment: XXX บาท'");
    console.log("  • 'Re-ranking X products by price...'");
    console.log("  • '✅ Pool/Global results re-ranked by price'");

  } catch (error: any) {
    console.error("\n❌ Test failed:", error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testCommentReplyWithPrice();
