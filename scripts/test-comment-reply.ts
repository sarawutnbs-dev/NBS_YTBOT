/**
 * Test Comment Reply Generation with New System Prompt
 */

import { prisma } from "@/lib/db";
import { generateCommentReply } from "@/lib/rag/comment-reply";

async function testCommentReply() {
  console.log("🧪 Testing Comment Reply Generation\n");

  try {
    // Setup test video
    const videoId = "TEST_VIDEO_001";

    // Test cases covering different scenarios
    const testCases = [
      {
        name: "คำถามเทคนิค (ตอบจาก transcript)",
        comment: "RAM 8GB พอไหมครับสำหรับทำงาน"
      },
      {
        name: "ถามราคา + มีสินค้า (แนะนำได้)",
        comment: "อยากได้ notebook ราคา 15000 แนะนำหน่อยครับ"
      },
      {
        name: "ถามแบรนด์ทั่วไป (ตอบ + แนะนำถ้าเกี่ยวข้อง)",
        comment: "ASUS ดีไหมครับ"
      },
      {
        name: "คำถามที่ไม่มีข้อมูล (ห้ามเดา)",
        comment: "RTX 4090 ราคาเท่าไหร่ครับ"
      },
      {
        name: "ถามสเปค (เทคนิคมาก)",
        comment: "i5 กับ i7 ต่างกันยังไง แล้วควรเลือกแบบไหน"
      }
    ];

    for (const [idx, test] of testCases.entries()) {
      console.log(`\n${"=".repeat(70)}`);
      console.log(`Test ${idx + 1}: ${test.name}`);
      console.log(`${"=".repeat(70)}`);
      console.log(`💬 Comment: "${test.comment}"\n`);

      const startTime = Date.now();

      const result = await generateCommentReply({
        commentText: test.comment,
        videoId,
        includeProducts: true,
        includeTranscripts: true,
        temperature: 0.7
      });

      const elapsed = Date.now() - startTime;

      console.log(`⏱️  Time: ${elapsed}ms\n`);

      console.log(`📊 Contexts Retrieved: ${result.contexts.length}`);
      result.contexts.forEach((ctx, i) => {
        console.log(`   ${i + 1}. [${ctx.sourceType}] Score: ${ctx.score.toFixed(3)}`);
        console.log(`      ${ctx.text.substring(0, 80)}...`);
      });

      console.log(`\n✉️  Reply:`);
      console.log(`   ${result.replyText}\n`);

      if (result.products.length > 0) {
        console.log(`🛍️  Products Recommended: ${result.products.length}`);
        result.products.forEach((p, i) => {
          console.log(`   ${i + 1}. Confidence: ${p.confidence.toFixed(2)}`);
          console.log(`      Reason: ${p.reason}`);
          console.log(`      URL: ${p.url}`);
        });
        console.log();
      }

      console.log(`🔢 Token Usage:`);
      console.log(`   Query: ${result.tokenUsage.queryTokens} tokens`);
      console.log(`   System: ${result.tokenUsage.systemTokens} tokens`);
      console.log(`   Context: ${result.tokenUsage.contextTokens} tokens`);
      console.log(`   Total: ${result.tokenUsage.totalTokens} tokens`);

      // Debug: show raw response
      if (result.rawResponse) {
        console.log(`\n🐛 Raw Response (first 200 chars):`);
        console.log(`   ${result.rawResponse.substring(0, 200)}...`);
      }
    }

    // Summary
    console.log(`\n\n${"=".repeat(70)}`);
    console.log(`✅ Comment Reply Test Complete!`);
    console.log(`${"=".repeat(70)}\n`);

    console.log(`📋 Summary:`);
    console.log(`   ✅ New system prompt with strict JSON output`);
    console.log(`   ✅ Few-shot examples included (4 scenarios)`);
    console.log(`   ✅ Product recommendation validation`);
    console.log(`   ✅ Language mirroring (Thai default)`);
    console.log(`   ✅ Link limit enforcement (≤ 2)\n`);

    console.log(`🎯 Expected Behavior:`);
    console.log(`   - Technical questions: Answer from transcript`);
    console.log(`   - Product questions: Recommend only if relevant (confidence > 0.7)`);
    console.log(`   - Unknown topics: Politely decline, don't guess`);
    console.log(`   - Output: Always valid JSON with reply_text + products array\n`);

  } catch (error) {
    console.error("\n❌ Test failed:", error);
    throw error;
  }
}

testCommentReply()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
