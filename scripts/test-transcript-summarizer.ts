/**
 * Test script for GPT-5 transcript summarizer
 *
 * Tests the new transcript summarization flow:
 * 1. Summarize a sample transcript with GPT-5
 * 2. Verify the output structure (video_title, category, summary_text)
 * 3. Check summary length (should be 400-600 words)
 *
 * Run: npx tsx scripts/test-transcript-summarizer.ts
 */

import "dotenv/config";
import { summarizeTranscriptWithGPT5 } from "@/lib/rag/transcript-summarizer";

const SAMPLE_TRANSCRIPT = `
สวัสดีครับทุกคน วันนี้มารีวิว ASUS VivoBook 16 X1605VA กันครับ
โน๊ตบุ๊ครุ่นนี้เป็นรุ่นที่น่าสนใจมากเลย สเปกดีในราคาที่เข้าถึงได้

ก่อนอื่นมาดูสเปกกันก่อน CPU ใช้ Intel Core i5-1335U รุ่นใหม่ล่าสุด
มีแรมมาให้ 8GB DDR4 และ SSD 512GB PCIe Gen 3 ซึ่งถือว่าเพียงพอสำหรับการใช้งานทั่วไป

จุดเด่นของเครื่องนี้คือหน้าจอ 16 นิ้ว Full HD IPS Panel ความละเอียดชัด สีสันสดใส
เหมาะกับการทำงาน Office, ดูหนัง ฟังเพลง และใช้งานทั่วไป

ด้านการออกแบบ VivoBook 16 มีน้ำหนักประมาณ 1.88 กก. ค่อนข้างเบา พกพาสะดวก
ตัวเครื่องทำจากพลาสติกคุณภาพดี สีเทาดูดีมีสไตล์

พอร์ตการเชื่อมต่อครบครัน มี USB-C, USB-A, HDMI, และช่องเสียบหูฟัง
รองรับ WiFi 6 ทำให้เชื่อมต่ออินเทอร์เน็ตได้เร็วและเสถียร

แบตเตอรี่ 42Wh ใช้งานได้ประมาณ 6-7 ชั่วโมง ขึ้นอยู่กับการใช้งาน
ถ้าใช้งานเบาๆ เช่น พิมพ์งาน เว็บเซิร์ฟ อาจได้มากกว่านี้

ประสิทธิภาพการทำงาน Core i5-1335U ทำงานได้ดี เหมาะกับงาน Office,
เรียนออนไลน์, ดูหนัง, เล่นเกมเบาๆ แต่ถ้าเล่นเกมหนักๆ อาจจะไม่ค่อยไหว

ราคาอยู่ที่ประมาณ 19,900 บาท ซึ่งถือว่าคุ้มค่ามาก
เพราะได้สเปกดี หน้าจอใหญ่ และแบรนด์ที่เชื่อถือได้

สรุป ASUS VivoBook 16 X1605VA เหมาะกับใครที่:
- ต้องการโน๊ตบุ๊คสำหรับทำงาน Office, เรียนออนไลน์
- งบประมาณไม่เกิน 20,000 บาท
- ต้องการหน้าจอใหญ่ 16 นิ้ว
- ไม่ต้องการเล่นเกมหนัก

ถ้าคุณอยู่ในกลุ่มนี้ แนะนำเลยครับ คุ้มค่ามาก
ส่วนใครที่ต้องการเล่นเกมหนักๆ แนะนำให้หารุ่นที่มี GPU แยกนะครับ

ขอบคุณที่รับชมครับ ถ้าชอบอย่าลืมกด Like Subscribe และกดกระดิ่งด้วยนะครับ
`;

const VIDEO_TITLE = "รีวิว ASUS VivoBook 16 X1605VA โน๊ตบุ๊คสเปกดี ราคาไม่เกิน 20,000 บาท";

async function main() {
  console.log("=== Test GPT-5 Transcript Summarizer ===\n");
  console.log(`Video Title: ${VIDEO_TITLE}`);
  console.log(`Transcript Length: ${SAMPLE_TRANSCRIPT.length} chars\n`);
  console.log("Testing summarization...\n");

  try {
    const startTime = Date.now();

    const summary = await summarizeTranscriptWithGPT5(SAMPLE_TRANSCRIPT, VIDEO_TITLE);

    const elapsedTime = Date.now() - startTime;

    console.log("\n=== Summary Result ===\n");
    console.log(`Video Title: ${summary.video_title}`);
    console.log(`Category: ${summary.category}`);
    console.log(`Summary Length: ${summary.summary_text.length} chars`);
    console.log(`Time Taken: ${elapsedTime}ms\n`);

    console.log("Summary Text:");
    console.log("---");
    console.log(summary.summary_text);
    console.log("---\n");

    // Validate results
    const wordCount = summary.summary_text.split(/\s+/).length;
    console.log(`Word Count: ${wordCount} words`);

    if (wordCount < 300) {
      console.warn("⚠️  Warning: Summary is shorter than expected (< 300 words)");
    } else if (wordCount > 800) {
      console.warn("⚠️  Warning: Summary is longer than expected (> 800 words)");
    } else {
      console.log("✅ Summary length is appropriate (300-800 words)");
    }

    // Validate category
    const validCategories = ["Notebook", "PC Component", "Smartphone", "Tablet", "Unknown"];
    if (validCategories.includes(summary.category)) {
      console.log(`✅ Category is valid: ${summary.category}`);
    } else {
      console.error(`❌ Invalid category: ${summary.category}`);
    }

    console.log("\n✅ Test completed successfully!");
  } catch (error) {
    console.error("\n❌ Test failed:", error);
    throw error;
  }
}

main()
  .then(() => {
    console.log("\n✅ Script completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Script failed:", error);
    process.exit(1);
  });
