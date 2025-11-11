import OpenAI from "openai";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.AI_API_KEY;

console.log("Testing GPT-5 with Responses API...\n");

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

async function testGPT5() {
  try {
    console.log("1. Testing simple GPT-5 request...");
    const response = await (openai as any).responses.create({
      model: "gpt-5",
      input: "สวัสดีครับ ช่วยแนะนำโน้ตบุ๊คสำหรับทำงานหน่อยครับ ตอบสั้นๆ ภาษาไทย",
      reasoning: {
        effort: "low"
      },
      text: {
        verbosity: "low"
      },
      max_output_tokens: 200
    });

    console.log("✅ Response:", response.output_text);
    console.log("   Finish reason:", response.finish_reason);
    console.log("   Usage:", JSON.stringify(response.usage));
    console.log();

    console.log("2. Testing with JSON-like output...");
    const response2 = await (openai as any).responses.create({
      model: "gpt-5",
      input: `You are a helpful assistant that responds in JSON format.

User: แนะนำโน้ตบุ๊ค ASUS ดีๆ หน่อยครับ

Please respond in this exact JSON format:
{
  "reply_text": "your reply in Thai",
  "products": []
}`,
      reasoning: {
        effort: "low"
      },
      text: {
        verbosity: "low"
      },
      max_output_tokens: 300
    });

    console.log("✅ Response:", response2.output_text);
    console.log("   Finish reason:", response2.finish_reason);
    console.log("   Usage:", JSON.stringify(response2.usage));
    console.log();

    // Try to parse as JSON
    try {
      const parsed = JSON.parse(response2.output_text);
      console.log("   ✅ Successfully parsed as JSON:", parsed);
    } catch {
      console.log("   ⚠️  Response is not valid JSON");
    }

    console.log("\n✅ All tests passed! GPT-5 is working correctly.");
  } catch (error: any) {
    console.error("❌ Error:", error.message);
    if (error.response) {
      console.error("   Response:", JSON.stringify(error.response.data, null, 2));
    }
  }
}

testGPT5();
