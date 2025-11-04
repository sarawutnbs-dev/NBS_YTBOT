/**
 * Benchmark multiple chat models for comment reply generation
 * Usage: npx tsx scripts/benchmark-models.ts
 */

import { generateCommentReply } from "@/lib/rag/comment-reply";

const MODELS = [
  "gpt-5",
  "gpt-5-mini",
  "gpt-5-nano",
];

const TEST_VIDEO_ID = "TEST_VIDEO_001";

const TEST_CASES = [
  { name: "เทคนิคจาก transcript", comment: "RAM 8GB พอไหมถ้าเปิด Excel หลายไฟล์" },
  { name: "ถามงบประมาณมีสินค้า", comment: "งบ 15000 แนะนำโน้ตบุ๊คหน่อย" },
  { name: "ถามแบรนด์ทั่วไป", comment: "ASUS ดีไหม ใช้งานเรียนออนไลน์" },
  { name: "ไม่มีข้อมูลตรง ๆ", comment: "RTX 4090 ราคาเท่าไหร่" },
];

function sentencesCount(text: string) {
  return (text.match(/[\.!?\u0E2F\u0E46]/g) || []).length || 1; // Thai end markers: ๏ / ฆ approximate
}

async function run() {
  const summary: Array<{ model: string; avgMs: number; avgReplyLen: number; avgSentences: number; jsonOk: number; reasonsOk: number; productsAvg: number; score: number; }>=[];

  for (const model of MODELS) {
    console.log("\n" + "#".repeat(80));
    console.log(`Benchmark model: ${model}`);
    console.log("#".repeat(80));

    let totalMs = 0;
    let totalLen = 0;
    let totalSentences = 0;
    let jsonOk = 0; // generateCommentReply returns parsed; treat as 1 if replyText non-empty
    let reasonsOk = 0; // count tests where all recommended products have non-empty reason
    let productsCount = 0;

    for (const tc of TEST_CASES) {
      const start = Date.now();
      try {
        const res = await generateCommentReply({
          commentText: tc.comment,
          videoId: TEST_VIDEO_ID,
          includeProducts: true,
          includeTranscripts: true,
          maxTokens: 500,
          model,
        });
        const ms = Date.now() - start;
        totalMs += ms;
        totalLen += res.replyText.length;
        totalSentences += sentencesCount(res.replyText);
        jsonOk += res.replyText.trim() ? 1 : 0;
        productsCount += res.products.length;
        const allReasons = res.products.every(p => !!p.reason && p.reason.trim().length >= 10);
        reasonsOk += allReasons ? 1 : 0;

        console.log(`\n- Case: ${tc.name}`);
        console.log(`  Time: ${ms} ms | Reply len: ${res.replyText.length} | Products: ${res.products.length}`);
        if (res.products.length) {
          for (const p of res.products.slice(0,2)) {
            console.log(`    • ${p.id} -> reason: ${p.reason?.slice(0,80)}`);
          }
        }
      } catch (err:any) {
        console.error(`Error for case '${tc.name}':`, err.message || err);
      }
    }

    const n = TEST_CASES.length;
    const avgMs = Math.round(totalMs / n);
    const avgReplyLen = Math.round(totalLen / n);
    const avgSentences = +(totalSentences / n).toFixed(2);
    const productsAvg = +(productsCount / n).toFixed(2);

    // Simple scoring: JSON ok (weight 3), reasons completeness (weight 3), speed (weight 2), reply length (target 2-4 sentences -> ideal ~3), productsAvg (weight 1)
    const jsonScore = (jsonOk / n) * 3;
    const reasonsScore = (reasonsOk / n) * 3;
    const speedScore = Math.max(0, 2 - (avgMs / 5000)); // 2 at 0ms, 1.0 at 2500ms, 0 at 10s
    const sentenceTarget = Math.abs(avgSentences - 3); // ideal around 3
    const lengthScore = Math.max(0, 2 - sentenceTarget); // 2 if ~3 sentences
    const productsScore = Math.min(1, productsAvg / 2); // 1 if ~2 products on average
    const score = +(jsonScore + reasonsScore + speedScore + lengthScore + productsScore).toFixed(2);

    summary.push({ model, avgMs, avgReplyLen, avgSentences, jsonOk, reasonsOk, productsAvg, score });

    console.log(`\nModel ${model} summary:`);
    console.log(`  avgMs=${avgMs} | avgReplyLen=${avgReplyLen} | avgSentences=${avgSentences}`);
    console.log(`  jsonOk=${jsonOk}/${n} | reasonsOk=${reasonsOk}/${n} | productsAvg=${productsAvg}`);
    console.log(`  => Score: ${score}`);
  }

  // Pick best
  summary.sort((a,b) => b.score - a.score);
  console.log("\n" + "=".repeat(80));
  console.log("Benchmark Result (best first):\n");
  for (const s of summary) {
    console.log(`• ${s.model} -> Score=${s.score} | avgMs=${s.avgMs} | jsonOk=${s.jsonOk}/${TEST_CASES.length} | reasonsOk=${s.reasonsOk}/${TEST_CASES.length}`);
  }
}

run().catch(err => {
  console.error("Benchmark failed:", err);
  process.exit(1);
});
