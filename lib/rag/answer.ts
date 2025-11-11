import { hybridSearch, SearchResult } from "./retriever";
import { smartHybridSearch } from "./retriever-v2";
import { chatCompletion, getChatModelInfo } from "./openai";
import { estimateContextCost, truncateContexts, countTokens } from "./tokenizer";
import { AnswerRequest, AnswerResponse } from "./schema";
import { generateCommentReply, ProductRecommendation } from "./comment-reply";

/**
 * Default system prompt for RAG
 */
const DEFAULT_SYSTEM_PROMPT = `You are a helpful YouTube comment assistant for a Thai channel. Your role is to provide accurate, friendly, and contextual responses based on the provided information.

Guidelines:
- Answer in Thai language naturally and conversationally
- Use information from the provided contexts (video transcripts, product details, or related comments)
- If the context doesn't contain relevant information, politely say you don't have that information
- Be concise but helpful (2-4 sentences typically)
- Include relevant product recommendations when appropriate
- Reference specific details from the video when relevant
- Maintain a friendly, approachable tone

Context information will be provided below. Use this context to inform your response.`;

/**
 * Generate answer using RAG
 */
export async function generateAnswer(
  request: AnswerRequest
): Promise<AnswerResponse> {
  const {
    query,
    videoId,
    includeProducts = true,
    includeTranscripts = true,
    includeComments = false,
    temperature = 0.7,
    maxTokens,
  } = request;

  // Use smart hybrid search (auto-selects two-stage if metadata available)
  const topK = parseInt(process.env.RAG_TOP_K || "6");

  console.log(`[answer] Using smartHybridSearch for video ${videoId}...`);

  const topContexts = await smartHybridSearch(query, videoId || "", {
    topK,
    includeTranscripts,
    includeProducts,
  });

  console.log(`[answer] Retrieved ${topContexts.length} contexts (top score: ${topContexts[0]?.score.toFixed(3) || 'N/A'})`);

  if (topContexts.length === 0) {
    // No relevant context found
    return {
      answer: "ขออภัยครับ ไม่พบข้อมูลที่เกี่ยวข้องกับคำถามของคุณ คุณสามารถลองถามในรูปแบบอื่นหรือให้รายละเอียดเพิ่มเติมได้ครับ",
      contexts: [],
      tokenUsage: {
        queryTokens: countTokens(query),
        systemTokens: countTokens(DEFAULT_SYSTEM_PROMPT),
        contextTokens: 0,
        totalTokens: countTokens(query) + countTokens(DEFAULT_SYSTEM_PROMPT),
      },
      model: getChatModelInfo().model,
    };
  }

  // Prepare context texts with truncation
  const maxContextTokens = parseInt(process.env.RAG_MAX_CONTEXT_TOKENS || "2800");
  const reservedTokens = 500; // Reserve for query, system prompt, and response

  const truncatedContexts = truncateContexts(
    topContexts.map((c) => ({ text: c.text, score: c.score })),
    maxContextTokens,
    reservedTokens
  );

  // Build context sections
  const contextSections = truncatedContexts.map((ctx, idx) => {
    const context = topContexts[idx];
    const sourceLabel =
      context.sourceType === "transcript"
        ? "📹 จากวิดีโอ"
        : context.sourceType === "product"
        ? "🛍️ ข้อมูลสินค้า"
        : "💬 จากคอมเมนต์";

    return `[${idx + 1}] ${sourceLabel}:\n${ctx.text}`;
  });

  const contextText = contextSections.join("\n\n");

  // Estimate token usage
  const tokenEstimate = estimateContextCost(
    [contextText],
    query,
    DEFAULT_SYSTEM_PROMPT
  );

  console.log(`[answer] Token usage: ${tokenEstimate.totalTokens} tokens`);

  if (!tokenEstimate.withinLimit) {
    console.warn(
      `[answer] Token limit exceeded: ${tokenEstimate.totalTokens} > ${maxContextTokens}`
    );
  }

  // Build messages
  const messages: Array<{ role: "system" | "user"; content: string }> = [
    {
      role: "system",
      content: `${DEFAULT_SYSTEM_PROMPT}\n\n--- Context Information ---\n\n${contextText}`,
    },
    {
      role: "user",
      content: query,
    },
  ];

  // Generate answer
  const answer = await chatCompletion(messages as any, {
    temperature,
    maxTokens,
  });

  return {
    answer,
    contexts: topContexts,
    tokenUsage: {
      queryTokens: tokenEstimate.queryTokens,
      systemTokens: tokenEstimate.systemTokens,
      contextTokens: tokenEstimate.contextTokens,
      totalTokens: tokenEstimate.totalTokens,
    },
    model: getChatModelInfo().model,
  };
}

/**
 * Generate answers for multiple comments in batch (grouped by video)
 * Now uses generateCommentReply for consistent JSON format and product recommendations
 */
export async function generateBatchAnswers(
  videoId: string,
  commentQueries: Array<{ commentId: string; text: string }>,
  options: {
    includeProducts?: boolean;
    includeTranscripts?: boolean;
    temperature?: number;
  } = {}
): Promise<{
  results: Array<{
    commentId: string;
    answer: string;
    products: ProductRecommendation[];
    contexts: SearchResult[];
  }>;
  totalTokensUsed: number;
}> {
  const {
    includeProducts = true,
    includeTranscripts = true,
  } = options;

  let totalTokens = 0;
  const results: Array<{
    commentId: string;
    answer: string;
    products: ProductRecommendation[];
    contexts: SearchResult[];
  }> = [];

  console.log(`[answer] Starting batch generation for ${commentQueries.length} comments in video ${videoId}`);

  // Process each comment using generateCommentReply (consistent with main system)
  for (const { commentId, text } of commentQueries) {
    try {
      const response = await generateCommentReply({
        commentText: text,
        videoId,
        includeProducts,
        includeTranscripts,
      });

      results.push({
        commentId,
        answer: response.replyText,
        products: response.products,
        contexts: response.contexts,
      });

      totalTokens += response.tokenUsage.totalTokens;

      console.log(`[answer] ✅ Comment ${commentId}: ${response.products.length} products, ${response.tokenUsage.totalTokens} tokens`);
    } catch (error) {
      console.error(`[answer] ❌ Failed to generate answer for comment ${commentId}:`, error);

      // Add error response
      results.push({
        commentId,
        answer: "ขออภัยครับ เกิดข้อผิดพลาดในการประมวลผลคำถามของคุณ กรุณาลองใหม่อีกครั้งครับ",
        products: [],
        contexts: [],
      });
    }
  }

  console.log(
    `[answer] Batch completed: ${results.length} answers, ${totalTokens} tokens used`
  );

  return {
    results,
    totalTokensUsed: totalTokens,
  };
}

/**
 * Generate answer with custom system prompt
 */
export async function generateAnswerWithPrompt(
  query: string,
  systemPrompt: string,
  contexts: SearchResult[],
  options: {
    temperature?: number;
    maxTokens?: number;
  } = {}
): Promise<{ answer: string; tokenUsage: any }> {
  const { temperature = 0.7, maxTokens } = options;

  if (contexts.length === 0) {
    throw new Error("At least one context is required");
  }

  // Truncate contexts
  const maxContextTokens = parseInt(process.env.RAG_MAX_CONTEXT_TOKENS || "2800");
  const truncatedContexts = truncateContexts(
    contexts.map((c) => ({ text: c.text, score: c.score })),
    maxContextTokens,
    500
  );

  // Build context text
  const contextSections = truncatedContexts.map((ctx, idx) => {
    const context = contexts[idx];
    return `[${idx + 1}] ${context.sourceType}:\n${ctx.text}`;
  });

  const contextText = contextSections.join("\n\n");

  // Estimate tokens
  const tokenEstimate = estimateContextCost([contextText], query, systemPrompt);

  // Build messages
  const messages: Array<{ role: "system" | "user"; content: string }> = [
    {
      role: "system",
      content: `${systemPrompt}\n\n--- Context Information ---\n\n${contextText}`,
    },
    {
      role: "user",
      content: query,
    },
  ];

  // Generate answer
  const answer = await chatCompletion(messages as any, {
    temperature,
    maxTokens,
  });

  return {
    answer,
    tokenUsage: {
      queryTokens: tokenEstimate.queryTokens,
      systemTokens: tokenEstimate.systemTokens,
      contextTokens: tokenEstimate.contextTokens,
      totalTokens: tokenEstimate.totalTokens,
    },
  };
}

/**
 * Preview contexts for a query without generating answer (for debugging)
 */
export async function previewContexts(
  query: string,
  options: {
    videoId?: string;
    includeProducts?: boolean;
    includeTranscripts?: boolean;
    includeComments?: boolean;
    topK?: number;
  } = {}
): Promise<{
  contexts: SearchResult[];
  tokenEstimate: any;
}> {
  const {
    videoId,
    includeProducts = true,
    includeTranscripts = true,
    includeComments = false,
    topK = 6,
  } = options;

  // Determine source types
  const sourceTypes: Array<"comment" | "transcript" | "product"> = [];
  if (includeComments) sourceTypes.push("comment");
  if (includeTranscripts) sourceTypes.push("transcript");
  if (includeProducts) sourceTypes.push("product");

  // Search
  const searchPromises = sourceTypes.map((sourceType) =>
    hybridSearch(query, {
      topK: Math.ceil(topK / sourceTypes.length),
      sourceType,
      videoId: sourceType !== "product" ? videoId : undefined,
      minScore: 0.3,
    })
  );

  const searchResults = await Promise.all(searchPromises);
  const allContexts = searchResults.flat();

  // Sort and limit
  const topContexts = allContexts
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  // Build context text
  const contextTexts = topContexts.map((c) => c.text);

  // Estimate tokens
  const tokenEstimate = estimateContextCost(
    contextTexts,
    query,
    DEFAULT_SYSTEM_PROMPT
  );

  return {
    contexts: topContexts,
    tokenEstimate,
  };
}

/**
 * Find similar comments to a given comment (for finding related discussions)
 */
export async function findSimilarComments(
  commentText: string,
  videoId?: string,
  topK: number = 5
): Promise<SearchResult[]> {
  return hybridSearch(commentText, {
    topK,
    sourceType: "comment",
    videoId,
    minScore: 0.5, // Higher threshold for similarity
  });
}

/**
 * Find relevant products for a query
 */
export async function findRelevantProducts(
  query: string,
  topK: number = 3
): Promise<SearchResult[]> {
  return hybridSearch(query, {
    topK,
    sourceType: "product",
    minScore: 0.4,
  });
}
