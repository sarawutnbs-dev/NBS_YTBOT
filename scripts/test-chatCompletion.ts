import dotenv from "dotenv";

// Load .env.local BEFORE importing other modules
dotenv.config({ path: ".env.local" });

async function run() {
  // Dynamic import after dotenv.config
  const { chatCompletion } = await import("../lib/rag/openai");

  try {
    // Test GPT-5 with JSON mode
    console.log("Testing gpt-5 with JSON mode...");
    const response = await chatCompletion([
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: 'ตอบเป็น JSON object ตามรูปแบบ: {"reply_text": "สวัสดีโลก", "products": []}' }
    ], {
      model: "gpt-5",
      maxTokens: 1000,
      jsonMode: true, // Test JSON mode
    });

    console.log("GPT-5 JSON response:", response);

    // Try to parse as JSON
    try {
      const parsed = JSON.parse(response);
      console.log("✅ Successfully parsed JSON:", parsed);
    } catch (err) {
      console.error("❌ Failed to parse JSON:", err);
    }
  } catch (error) {
    console.error("Error:", error);
  }
}

run();
