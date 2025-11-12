/**
 * Generate AI-powered comment replies using RAG
 */

import { PrismaClient } from "@prisma/client";
import { chatCompletion } from "./openai";
import { smartSearchV3 } from "./retriever-v3";
import { COMMENT_REPLY_SYSTEM_PROMPT, FEW_SHOT_EXAMPLES } from "./prompts";
import { SearchResult } from "./schema";
import { detectQueryIntent } from "./query-intent";
import { NOTEBOOK_KNOWLEDGE_PACK, NOTEBOOK_USECASE_KEYWORDS, renderNotebookGuidance, COMPONENT_KNOWLEDGE_PACK, renderComponentGuidance } from "./knowledge-packs";

const prisma = new PrismaClient();

export interface CommentReplyRequest {
  commentText: string;
  videoId: string;
  includeProducts?: boolean;
  includeTranscripts?: boolean;
  maxTokens?: number;
  model?: string; // override chat model per request
}

export interface ProductRecommendation {
  id: string;
  url: string;
  reason: string;
  confidence: number;
}

export interface CommentReplyResponse {
  replyText: string;
  products: ProductRecommendation[];
  contexts: SearchResult[];
  tokenUsage: {
    queryTokens: number;
    systemTokens: number;
    contextTokens: number;
    totalTokens: number;
  };
  model: string;
  rawResponse?: string; // For debugging
}

/**
 * Count tokens (simplified estimation)
 */
function countTokens(text: string): number {
  // Rough estimation: ~4 characters per token for Thai
  return Math.ceil(text.length / 4);
}

/**
 * Generate comment reply with product recommendations
 */
export async function generateCommentReply(
  request: CommentReplyRequest
): Promise<CommentReplyResponse> {
  const {
    commentText,
    videoId,
    includeProducts = true,
    includeTranscripts = true,
    maxTokens = 3000, // Increased for GPT-5 reasoning model (needs tokens for reasoning + output)
    model
  } = request;

  console.log(`[CommentReply] Generating reply for: "${commentText.substring(0, 50)}..."`);

  // Detect intent from the comment to steer retrieval and guidance
  const intent = detectQueryIntent(commentText);

  // 1. Retrieve contexts using smart search V3 (with pool if available)
  const contexts = await smartSearchV3(commentText, videoId, {
    topK: 6,
    includeTranscripts,
    includeProducts,
    minScore: 0.6  // High threshold for maximum relevance
  });

  console.log(`[CommentReply] Retrieved ${contexts.length} contexts`);

  // Log top scores for debugging
  if (contexts.length > 0) {
    const topScores = contexts.slice(0, 3).map(c => c.score.toFixed(3)).join(', ');
    console.log(`[CommentReply] Top scores: ${topScores}`);
  }

  if (contexts.length === 0) {
    // No context found - use general knowledge instead of refusing
    console.warn(`[CommentReply] No contexts found for: "${commentText.substring(0, 50)}..."`);
    console.warn(`[CommentReply] Video: ${videoId}, includeTranscripts: ${includeTranscripts}, includeProducts: ${includeProducts}`);

    // Still try to answer using general knowledge (GPT-5 can handle it)
    console.log(`[CommentReply] Attempting answer with general knowledge (no RAG context)`);
  }

  // 2. Build suggested products pool (if any)
  const productContexts = contexts.filter(c => c.sourceType === "product");
  const suggestedProducts: Array<{ id: string; name: string; url: string; price: string }> = [];

  if (productContexts.length > 0) {
    // Get product details from database
    const productIds = [...new Set(productContexts.map(c => c.sourceId))];

    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: {
        id: true,
        name: true,
        shortURL: true,
        price: true,
        commission: true
      }
    });

    products.forEach(p => {
      // Only allow shortURL as the canonical link for recommendations
      if (p.shortURL) {
        suggestedProducts.push({
          id: p.id,
          name: p.name,
          url: p.shortURL,
          price: p.price?.toString() || ""
        });
      }
    });

    console.log(`[CommentReply] Suggested products: ${suggestedProducts.length}`);
  }

  // 3. Build context sections
  const contextSections = contexts.map((ctx, idx) => {
    const sourceLabel =
      ctx.sourceType === "transcript" ? "📹 จากวิดีโอ" :
      ctx.sourceType === "product" ? "🛍️ สินค้า" :
      "💬 คอมเมนต์";

    return `[${idx + 1}] ${sourceLabel} (score: ${ctx.score.toFixed(2)}):\n${ctx.text}`;
  });

  const contextText = contexts.length > 0
    ? contextSections.join("\n\n")
    : "(ไม่มีข้อมูลจากวิดีโอ - ใช้ความรู้ทั่วไปในการตอบ)";

  // 4. Build suggested products section
  const productsText = suggestedProducts.length > 0
    ? `\n\n--- Suggested Products (แนะนำได้เฉพาะที่อยู่ในลิสต์นี้) ---\n` +
      suggestedProducts.map((p, idx) =>
        `${idx + 1}. ID: ${p.id}\n   Name: ${p.name}\n   Price: ${p.price}\n   URL: ${p.url}`
      ).join("\n\n")
    : "";

  // 5. Build messages with few-shot examples
  // Attach guidance from Knowledge Packs: prefer Component guidance if the comment mentions components; otherwise Notebook guidance
  let guidanceText = "";
  if (intent.components && intent.components.length > 0) {
    // Choose the first detected component category
    const comp = intent.components[0];
    const pack = COMPONENT_KNOWLEDGE_PACK.find(p => p.category === comp) || COMPONENT_KNOWLEDGE_PACK[0];
    guidanceText = `\n\n--- Knowledge Pack (Component Guidance - ${pack.category}) ---\n${renderComponentGuidance(pack)}`;
  } else {
    // Fallback to Notebook guidance routed by usageCategory if available
    let targetPack = undefined as ReturnType<typeof NOTEBOOK_KNOWLEDGE_PACK.find>;
    if (intent.usageCategory) {
      targetPack = NOTEBOOK_KNOWLEDGE_PACK.find((p) => p.category === intent.usageCategory);
    }
    const pack = targetPack || NOTEBOOK_KNOWLEDGE_PACK[0];
    guidanceText = `\n\n--- Knowledge Pack (Notebook Guidance) ---\n${renderNotebookGuidance(pack)}`;
  }

  const systemPrompt = `${COMMENT_REPLY_SYSTEM_PROMPT}

${FEW_SHOT_EXAMPLES}

--- Context Information ---

${contextText}${productsText}${guidanceText}`;

  const messages = [
    {
      role: "system" as const,
      content: systemPrompt
    },
    {
      role: "user" as const,
      content: `คอมเมนต์: "${commentText}"\n\nกรุณาตอบเป็น valid JSON object เท่านั้น ตามรูปแบบ:\n{"reply_text": "...", "products": [...]}`
    }
  ];

  console.log(`[CommentReply] Calling AI with model: ${model || 'default'}, maxTokens: ${maxTokens}, estimated input tokens: ${countTokens(systemPrompt + commentText)}`);

  // 6. Generate reply with JSON mode enabled and preferred temperature
  const rawResponse = await chatCompletion(messages, {
    model,
    maxTokens,
    jsonMode: true // Force JSON output
  });

  console.log(`[CommentReply] Raw response: ${rawResponse.substring(0, 100)}...`);

  // 7. Parse JSON response
  let replyText = "";
  let products: ProductRecommendation[] = [];

  try {
    // Remove markdown code blocks if present
    let cleanedResponse = rawResponse.trim();
    if (cleanedResponse.startsWith("```json")) {
      cleanedResponse = cleanedResponse.replace(/```json\n?/g, "").replace(/```\n?/g, "");
    } else if (cleanedResponse.startsWith("```")) {
      cleanedResponse = cleanedResponse.replace(/```\n?/g, "");
    }

    // Check if response is empty or incomplete
    if (!cleanedResponse || cleanedResponse.length < 10) {
      console.error("[CommentReply] Empty or too short response:", cleanedResponse);
      throw new Error("AI response is empty or too short");
    }

    const parsed = JSON.parse(cleanedResponse);

    replyText = parsed.reply_text || parsed.replyText || "";
  products = parsed.products || [];

    // Validate products are in suggested pool and enforce canonical shortURL links
    const suggestedMap = new Map(suggestedProducts.map(p => [p.id, p.url] as const));
    products = (products as ProductRecommendation[])
      .filter(p => suggestedMap.has(p.id))
      .map(p => ({
        ...p,
        url: suggestedMap.get(p.id) as string
      }))
      .slice(0, 2); // enforce link limit ≤ 2

    console.log(`[CommentReply] Parsed: ${products.length} products recommended`);

    // Sanitize reply_text: remove any URLs not in the suggested pool
    // - If we have suggested products, only allow those URLs in the text
    // - If no suggested products, remove all URLs from reply_text
    try {
      const allowedUrls = new Set<string>([...suggestedMap.values()]);
      // Match URLs (basic pattern)
      const urlRegex = /(https?:\/\/[^\s)]+)\/??/g;
      replyText = replyText.replace(urlRegex, (m: string) => {
        // If we have allowed URLs and this one isn't allowed, strip it
        if (allowedUrls.size > 0) {
          return allowedUrls.has(m.replace(/[)\]\.,]$/g, "")) ? m : "";
        }
        // If no allowed URLs at all, remove every URL
        return "";
      }).replace(/ {2,}/g, " ").trim(); // Only replace multiple spaces, keep newlines
    } catch (_) {
      // Non-fatal: keep original replyText if sanitization fails
    }

    // Add shortURL to product recommendations in reply text if not already present
    if (products.length > 0 && replyText.includes("สินค้าแนะนำ")) {
      console.log(`[CommentReply] Attempting to add shortURLs for ${products.length} products`);
      try {
        // Build a map of product IDs to their info (name + shortURL)
        const productInfoMap = new Map<string, { name: string; url: string }>();
        for (const prod of products) {
          const suggestedProduct = suggestedProducts.find(p => p.id === prod.id);
          if (suggestedProduct) {
            productInfoMap.set(prod.id, {
              name: suggestedProduct.name,
              url: suggestedProduct.url
            });
            console.log(`[CommentReply] Product: ${suggestedProduct.name} -> ${suggestedProduct.url}`);
          }
        }

        // Check each product and add shortURL if missing
        for (const [productId, info] of productInfoMap) {
          // Extract key parts from product name for flexible matching
          // Remove prefix in brackets like [แนะนำ], [สินค้ามายด์]
          let nameForMatching = info.name.replace(/^\[[^\]]+\]/g, '').trim();
          
          // Get main brand and model (first few significant words)
          // e.g., "ASUS VIVOBOOK S16" or "MSI THIN 15"
          const nameParts = nameForMatching.split(/\s+/);
          const significantParts = nameParts.slice(0, Math.min(3, nameParts.length));
          
          // Try multiple patterns to match
          const patterns: RegExp[] = [];
          
          // Pattern 1: Match with prefix removal - line contains model number
          // e.g., "- [prefix]เอสุส รีวิวมือ ASUS VIVOBOOK 16 X1605VA-MB735WA"
          // Look for pattern: Letter+Digit+Hyphen (e.g., S3607VA-RP575WA)
          const modelMatch = nameForMatching.match(/[A-Z]\d+[A-Z]*-[A-Z0-9]+/);
          if (modelMatch) {
            const model = modelMatch[0];
            console.log(`[CommentReply] Extracted model: ${model} from ${nameForMatching}`);
            // Escape special characters in model number
            const escapedModel = model.replace(/[-]/g, '\\-');
            // Match line with this exact model number, followed by price, without URL
            patterns.push(new RegExp(`(-[^\\n]*${escapedModel}[^\\n]*?บาท)(?![^\\n]*https?://)`, 'gi'));
          } else {
            console.log(`[CommentReply] No model match found in: ${nameForMatching}`);
          }
          
          // Pattern 2: Match first 2-3 significant words (brand + series)
          if (significantParts.length >= 2) {
            const keyWords = significantParts.slice(0, 2).join('.*?');
            patterns.push(new RegExp(`(-[^\\n]*${keyWords}[^\\n]*?บาท)(?![^\\n]*https?://)`, 'gi'));
          }
          
          // Apply patterns
          for (const pattern of patterns) {
            const beforeReplace = replyText;
            replyText = replyText.replace(pattern, (match) => {
              console.log(`[CommentReply] Match found: "${match.substring(0, 50)}..."`);
              // Add shortURL if not present in this line
              return `${match} ${info.url}`;
            });
            
            // If we successfully added URL, break (don't try other patterns)
            if (replyText !== beforeReplace) {
              console.log(`[CommentReply] Successfully added shortURL: ${info.url}`);
              break;
            }
          }
        }
        
        console.log(`[CommentReply] Finished adding shortURLs to product recommendations`);
      } catch (err) {
        console.error(`[CommentReply] Failed to add shortURLs to reply text:`, err);
      }
    } else {
      console.log(`[CommentReply] Skipping shortURL addition: products.length=${products.length}, has "สินค้าแนะนำ"=${replyText.includes("สินค้าแนะนำ")}`);
    }

  } catch (error) {
    console.error(`[CommentReply] JSON parsing failed:`, error);
    console.error(`[CommentReply] Raw response (first 500 chars):`, rawResponse.substring(0, 500));
    console.error(`[CommentReply] Raw response (full):`, rawResponse);

    // Fallback: try to extract reply_text from partial JSON
    try {
      const replyMatch = rawResponse.match(/"reply_text"\s*:\s*"([^"]*)"/);
      if (replyMatch && replyMatch[1]) {
        replyText = replyMatch[1].replace(/\\n/g, "\n").replace(/\\"/g, '"');
        console.log(`[CommentReply] Extracted reply_text from partial JSON (${replyText.length} chars)`);
      } else {
        // Last resort: use raw response as reply
        replyText = "ขออภัยครับ ระบบประมวลผลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง";
        console.error(`[CommentReply] Could not extract reply_text, using fallback message`);
      }
    } catch (extractError) {
      replyText = "ขออภัยครับ ระบบประมวลผลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง";
      console.error(`[CommentReply] Fallback extraction failed:`, extractError);
    }
    products = [];
  }

  // 8. Calculate token usage
  const tokenUsage = {
    queryTokens: countTokens(commentText),
    systemTokens: countTokens(systemPrompt),
    contextTokens: countTokens(contextText),
    totalTokens: countTokens(systemPrompt + commentText + rawResponse)
  };

  return {
    replyText,
    products,
    contexts,
    tokenUsage,
    model: "gpt-4o-mini",
    rawResponse
  };
}

/**
 * Generate replies for multiple comments in batch
 */
export async function generateBatchCommentReplies(
  videoId: string,
  comments: Array<{ id: string; text: string }>,
  options: {
    includeProducts?: boolean;
    includeTranscripts?: boolean;
    temperature?: number;
  } = {}
): Promise<{
  results: Array<{
    commentId: string;
    replyText: string;
    products: ProductRecommendation[];
    success: boolean;
    error?: string;
  }>;
  totalTokensUsed: number;
}> {
  const results: Array<{
    commentId: string;
    replyText: string;
    products: ProductRecommendation[];
    success: boolean;
    error?: string;
  }> = [];

  let totalTokens = 0;

  for (const comment of comments) {
    try {
      const response = await generateCommentReply({
        commentText: comment.text,
        videoId,
        ...options
      });

      results.push({
        commentId: comment.id,
        replyText: response.replyText,
        products: response.products,
        success: true
      });

      totalTokens += response.tokenUsage.totalTokens;

    } catch (error: any) {
      console.error(`[CommentReply] Failed for comment ${comment.id}:`, error);

      results.push({
        commentId: comment.id,
        replyText: "ขออภัยครับ เกิดข้อผิดพลาดในการประมวลผล",
        products: [],
        success: false,
        error: error.message
      });
    }
  }

  console.log(`[CommentReply] Batch completed: ${results.length} replies, ${totalTokens} tokens`);

  return {
    results,
    totalTokensUsed: totalTokens
  };
}
