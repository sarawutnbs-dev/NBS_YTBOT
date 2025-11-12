import { chatCompletion } from "./openai";

/**
 * Summary result from GPT-5
 */
export interface TranscriptSummary {
  video_title: string;
  category: "Notebook" | "PC Component" | "Smartphone" | "Tablet" | "Unknown";
  summary_text: string;
}

/**
 * Summarize a video transcript using GPT-5
 *
 * This function takes a full transcript and generates a concise summary (400-600 words)
 * that captures the key points of the video review.
 *
 * @param transcript - Full transcript text from YouTube
 * @param videoTitle - Original video title
 * @returns Structured summary with title, category, and summary text
 */
export async function summarizeTranscriptWithGPT5(
  transcript: string,
  videoTitle: string
): Promise<TranscriptSummary> {
  const systemPrompt = `คุณเป็น AI ที่ช่วยสรุปเนื้อหาวิดีโอรีวิวสินค้าเทคโนโลยี

หน้าที่ของคุณ:
1. อ่าน Transcript ของวิดีโอรีวิวทั้งหมด
2. สรุปเนื้อหาที่สำคัญแบบรัดกุม ชัดเจน ครบถ้วน
3. ระบุหมวดหมู่สินค้าที่รีวิว (Notebook, PC Component, Smartphone, Tablet, หรือ Unknown)
4. จัดรูปแบบเป็น JSON

คำแนะนำการสรุป:
- **ความยาว**: 400-600 คำ (ไม่เกิน 1 หน้า A4)
- **โครงสร้าง**: แนะนำสินค้า → คุณสมบัติเด่น → จุดเด่น/จุดด้อย → ราคาและความคุ้มค่า → สรุปคำแนะนำ
- **เนื้อหา**:
  - ชื่อรุ่นและสเปก (CPU, RAM, GPU, หน้าจอ, แบตเตอรี่)
  - ราคาและโปรโมชั่น (ถ้ามี)
  - จุดเด่นและจุดด้อยที่สำคัญ
  - การใช้งานที่เหมาะสม (Office, Gaming, Content Creation)
  - คำแนะนำสำหรับกลุ่มเป้าหมาย
- **ภาษา**: ใช้ภาษาไทยที่เป็นธรรมชาติ อ่านง่าย ไม่ซับซ้อน
- **ห้าม**: ข้อความยาวเกินไป ซ้ำซาก หรือไม่เกี่ยวข้อง

รูปแบบ Output (JSON):
{
  "video_title": "ชื่อวิดีโอรีวิว (ใช้ชื่อจาก Transcript ถ้าพบ ไม่งั้นใช้ที่ส่งมา)",
  "category": "Notebook | PC Component | Smartphone | Tablet | Unknown",
  "summary_text": "สรุปรีวิวทั้งหมดแบบย่อ (400-600 คำ)"
}`;

  const userPrompt = `วิดีโอ: "${videoTitle}"

Transcript:
${transcript}

---

โปรดสรุป Transcript ข้างต้นเป็น JSON ตามรูปแบบที่กำหนด`;

  try {
    console.log(`[TranscriptSummarizer] Summarizing transcript...`);
    console.log(`[TranscriptSummarizer] Title: ${videoTitle}`);
    console.log(`[TranscriptSummarizer] Transcript length: ${transcript.length} chars`);

    const response = await chatCompletion(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      {
        model: "gpt-5",
        maxTokens: 5000, // Increased to 5000 to ensure complete JSON response
        jsonMode: true,
      }
    );

    console.log(`[TranscriptSummarizer] Raw response length: ${response.length} chars`);
    console.log(`[TranscriptSummarizer] Raw response preview: ${response.substring(0, 200)}...`);

    // Validate response is not empty
    if (!response || response.trim().length === 0) {
      throw new Error("Empty response from GPT-5");
    }

    // Parse JSON response with better error handling
    let summary: TranscriptSummary;
    try {
      summary = JSON.parse(response) as TranscriptSummary;
    } catch (parseError) {
      console.error(`[TranscriptSummarizer] JSON parse error:`, parseError);
      console.error(`[TranscriptSummarizer] Response ends with:`, response.substring(Math.max(0, response.length - 100)));
      throw new Error(`Failed to parse JSON response: ${parseError instanceof Error ? parseError.message : "Unknown error"}`);
    }

    // Validate response structure
    if (!summary.video_title || !summary.category || !summary.summary_text) {
      throw new Error("Invalid summary structure: missing required fields");
    }

    // Validate category
    const validCategories = ["Notebook", "PC Component", "Smartphone", "Tablet", "Unknown"];
    if (!validCategories.includes(summary.category)) {
      console.warn(`[TranscriptSummarizer] Invalid category "${summary.category}", defaulting to "Unknown"`);
      summary.category = "Unknown";
    }

    console.log(`[TranscriptSummarizer] ✅ Summary generated successfully`);
    console.log(`[TranscriptSummarizer] Category: ${summary.category}`);
    console.log(`[TranscriptSummarizer] Summary length: ${summary.summary_text.length} chars`);

    return summary;
  } catch (error) {
    console.error(`[TranscriptSummarizer] Error:`, error);

    // Return fallback summary
    console.warn(`[TranscriptSummarizer] Returning fallback summary`);
    return {
      video_title: videoTitle,
      category: "Unknown",
      summary_text: transcript.substring(0, 2000) + "...", // Fallback: first 2000 chars
    };
  }
}
