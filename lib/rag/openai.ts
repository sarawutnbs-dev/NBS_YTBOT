import OpenAI from "openai";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.AI_API_KEY;
const EMBED_MODEL = process.env.EMBED_MODEL || "text-embedding-3-small";
const CHAT_MODEL = process.env.CHAT_MODEL || process.env.AI_MODEL || "gpt-5";

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
async function chatCompletionViaResponses(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  options?: {
    model?: string;
    maxTokens?: number;
    jsonMode?: boolean;
  }
): Promise<string> {
  const model = options?.model || CHAT_MODEL;

  const input = messages.map((message) => {
    const content = Array.isArray(message.content)
      ? message.content
          .map((part) => {
            if (typeof part === "string") {
              return part;
            }
            if ("text" in part && typeof part.text === "string") {
              return part.text;
            }
            // Fallback to stringifying unsupported parts
            return JSON.stringify(part);
          })
          .join("\n")
      : String(message.content ?? "");

    return {
      role: message.role,
      content,
    };
  });

  const requestParams: Record<string, any> = {
    model,
    input,
    reasoning: {
      effort: "low",
    },
    text: {
      verbosity: options?.jsonMode ? "low" : "medium",
    },
  };

  // GPT-5 reasoning model needs more tokens (for both reasoning + output)
  // Default to 5000 if not specified, allowing enough for reasoning tokens
  if (options?.maxTokens) {
    requestParams.max_output_tokens = options.maxTokens;
  } else {
    requestParams.max_output_tokens = 5000;
  }

  if (options?.jsonMode) {
    requestParams.text.format = { type: "json_object" };
  }

  try {
    const response = await (openai as any).responses.create(requestParams);

    if (typeof response?.output_text === "string" && response.output_text.trim().length > 0) {
      return response.output_text.trim();
    }

    const messageOutput = response?.output?.find((item: any) => item.type === "message");
    const textContent = messageOutput?.content?.find((c: any) => c.type === "output_text");
    if (textContent?.text) {
      return String(textContent.text);
    }

    return "";
  } catch (error: any) {
    console.error("[openai:gpt-5] Responses API error:", error);
    throw new Error(`Failed to generate GPT-5 completion: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

export async function chatCompletion(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  options?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    jsonMode?: boolean; // Force JSON output
  }
): Promise<string> {
  const model = options?.model || CHAT_MODEL;

  // GPT-5 uses Responses API instead of Chat Completions API
  if (model.startsWith("gpt-5")) {
    return chatCompletionViaResponses(messages, {
      model,
      maxTokens: options?.maxTokens,
      jsonMode: options?.jsonMode,
    });
  }

  try {
    const requestParams: any = {
      model,
      messages,
    };

    // Handle max_tokens vs max_completion_tokens
    // gpt-4o-mini and newer models use max_completion_tokens
    if (options?.maxTokens) {
      requestParams.max_completion_tokens = options.maxTokens;
    }

    // Force JSON mode if requested (supported by modern GPT-4o/5 models)
    if (options?.jsonMode) {
      requestParams.response_format = { type: "json_object" };
    }

    // Set temperature if provided; retain retry fallback if unsupported
    if (options?.temperature !== undefined) {
      requestParams.temperature = options.temperature;
    }

    const response = await openai.chat.completions.create(requestParams);

    return response.choices[0]?.message?.content || "";
  } catch (error: any) {
    // If temperature is not supported, retry without it
    if (error?.code === 'unsupported_value' && error?.param === 'temperature') {
      console.warn("[openai] Temperature not supported for this model, retrying without it");
      const retryParams: any = {
        model,
        messages,
      };
      if (options?.maxTokens) {
        retryParams.max_completion_tokens = options.maxTokens;
      }
      if (options?.jsonMode) {
        retryParams.response_format = { type: "json_object" };
      }
      const response = await openai.chat.completions.create(retryParams);
      return response.choices[0]?.message?.content || "";
    }

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
