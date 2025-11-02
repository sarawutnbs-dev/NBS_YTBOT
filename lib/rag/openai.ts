import OpenAI from "openai";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.AI_API_KEY;
const EMBED_MODEL = process.env.EMBED_MODEL || "text-embedding-3-small";
const CHAT_MODEL = process.env.CHAT_MODEL || process.env.AI_MODEL || "gpt-4o-mini";

if (!OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY or AI_API_KEY environment variable is required");
}

export const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

/**
 * Generate embeddings for a single text
 */
export async function createEmbedding(text: string): Promise<number[]> {
  try {
    const response = await openai.embeddings.create({
      model: EMBED_MODEL,
      input: text,
    });

    return response.data[0].embedding;
  } catch (error) {
    console.error("[openai] Embedding error:", error);
    throw new Error(`Failed to create embedding: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

/**
 * Generate embeddings for multiple texts in batch
 */
export async function createEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const batchSize = parseInt(process.env.EMBED_BATCH || "64");
  const results: number[][] = [];

  // Process in batches
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);

    try {
      const response = await openai.embeddings.create({
        model: EMBED_MODEL,
        input: batch,
      });

      const embeddings = response.data
        .sort((a, b) => a.index - b.index)
        .map(item => item.embedding);

      results.push(...embeddings);

      console.log(`[openai] Generated ${embeddings.length} embeddings (${i + batch.length}/${texts.length})`);
    } catch (error) {
      console.error(`[openai] Batch embedding error (batch ${i}-${i + batch.length}):`, error);
      throw new Error(`Failed to create embeddings: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  return results;
}

/**
 * Generate chat completion
 */
export async function chatCompletion(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  options?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
  }
): Promise<string> {
  try {
    const response = await openai.chat.completions.create({
      model: options?.model || CHAT_MODEL,
      messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens,
    });

    return response.choices[0]?.message?.content || "";
  } catch (error) {
    console.error("[openai] Chat completion error:", error);
    throw new Error(`Failed to generate completion: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

/**
 * Get embedding model info
 */
export function getEmbeddingModelInfo() {
  return {
    model: EMBED_MODEL,
    dimensions: parseInt(process.env.EMBED_DIMENSIONS || "1536"),
    batchSize: parseInt(process.env.EMBED_BATCH || "64"),
  };
}

/**
 * Get chat model info
 */
export function getChatModelInfo() {
  return {
    model: CHAT_MODEL,
  };
}
