import { encoding_for_model, Tiktoken, TiktokenModel } from "tiktoken";

let encoder: Tiktoken | null = null;

/**
 * Get or create tiktoken encoder
 */
function getEncoder(): Tiktoken {
  if (!encoder) {
    try {
      // Use cl100k_base encoding (for gpt-4, gpt-3.5-turbo, text-embedding-ada-002)
      encoder = encoding_for_model("gpt-4o" as TiktokenModel);
    } catch (error) {
      console.warn("[tokenizer] Failed to load gpt-4 encoding, falling back to cl100k_base");
      encoder = encoding_for_model("gpt-3.5-turbo" as TiktokenModel);
    }
  }
  return encoder;
}

/**
 * Count tokens in text
 */
export function countTokens(text: string): number {
  if (!text) return 0;

  try {
    const enc = getEncoder();
    const tokens = enc.encode(text);
    return tokens.length;
  } catch (error) {
    console.error("[tokenizer] Error counting tokens:", error);
    // Fallback: rough estimate (1 token ≈ 4 characters)
    return Math.ceil(text.length / 4);
  }
}

/**
 * Count tokens in multiple texts
 */
export function countTokensBatch(texts: string[]): number[] {
  return texts.map(text => countTokens(text));
}

/**
 * Truncate text to max tokens
 */
export function truncateToTokens(text: string, maxTokens: number): string {
  if (!text) return "";

  try {
    const enc = getEncoder();
    const tokens = enc.encode(text);

    if (tokens.length <= maxTokens) {
      return text;
    }

    // Truncate tokens and decode back
    const truncatedTokens = tokens.slice(0, maxTokens);
    const decoded = enc.decode(truncatedTokens);
    return typeof decoded === 'string' ? decoded : new TextDecoder().decode(decoded);
  } catch (error) {
    console.error("[tokenizer] Error truncating text:", error);
    // Fallback: truncate by character count (rough estimate)
    const maxChars = maxTokens * 4;
    return text.slice(0, maxChars);
  }
}

/**
 * Estimate token cost for context
 */
export function estimateContextCost(
  contexts: string[],
  query: string,
  systemPrompt: string
): {
  queryTokens: number;
  systemTokens: number;
  contextTokens: number;
  totalTokens: number;
  withinLimit: boolean;
} {
  const maxTokens = parseInt(process.env.RAG_MAX_CONTEXT_TOKENS || "2800");

  const queryTokens = countTokens(query);
  const systemTokens = countTokens(systemPrompt);
  const contextTokens = contexts.reduce((sum, ctx) => sum + countTokens(ctx), 0);
  const totalTokens = queryTokens + systemTokens + contextTokens;

  return {
    queryTokens,
    systemTokens,
    contextTokens,
    totalTokens,
    withinLimit: totalTokens <= maxTokens,
  };
}

/**
 * Truncate contexts to fit within token limit
 */
export function truncateContexts(
  contexts: Array<{ text: string; score?: number }>,
  maxTotalTokens: number,
  reservedTokens: number = 500 // Reserve for query + system prompt + response
): Array<{ text: string; score?: number; truncated: boolean }> {
  const availableTokens = maxTotalTokens - reservedTokens;
  const results: Array<{ text: string; score?: number; truncated: boolean }> = [];

  let usedTokens = 0;

  for (const context of contexts) {
    const tokenCount = countTokens(context.text);

    if (usedTokens + tokenCount <= availableTokens) {
      // Fits entirely
      results.push({ ...context, truncated: false });
      usedTokens += tokenCount;
    } else {
      // Need to truncate
      const remainingTokens = availableTokens - usedTokens;

      if (remainingTokens > 50) {
        // Worth including truncated version
        const truncated = truncateToTokens(context.text, remainingTokens);
        results.push({ ...context, text: truncated, truncated: true });
        usedTokens += remainingTokens;
      }

      // No more room
      break;
    }
  }

  return results;
}

/**
 * Free encoder resources
 */
export function freeEncoder() {
  if (encoder) {
    encoder.free();
    encoder = null;
  }
}
