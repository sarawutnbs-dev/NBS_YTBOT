import OpenAI from "openai";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.AI_API_KEY;

console.log("API Key found:", OPENAI_API_KEY ? `Yes (${OPENAI_API_KEY.substring(0, 10)}...)` : "No");
console.log("Testing OpenAI API connection...\n");

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

async function testOpenAI() {
  try {
    console.log("1. Testing simple completion without JSON mode...");
    const response1 = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Say 'Hello World' in one word." }
      ],
      max_completion_tokens: 10,
    });

    console.log("✅ Response 1:", response1.choices[0]?.message?.content);
    console.log("   Finish reason:", response1.choices[0]?.finish_reason);
    console.log("   Usage:", response1.usage);
    console.log();

    console.log("2. Testing JSON mode completion...");
    const response2 = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a helpful assistant that outputs JSON." },
        { role: "user", content: 'Return JSON with format: {"greeting": "Hello World"}' }
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 50,
    });

    console.log("✅ Response 2:", response2.choices[0]?.message?.content);
    console.log("   Finish reason:", response2.choices[0]?.finish_reason);
    console.log("   Usage:", response2.usage);
    console.log();

    console.log("✅ All tests passed! OpenAI API is working correctly.");
  } catch (error: any) {
    console.error("❌ Error:", error.message);
    console.error("   Error details:", JSON.stringify(error, null, 2));
  }
}

testOpenAI();
