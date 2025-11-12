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

  console.log(`[CommentReply] New approach: AI Summary + VideoProductPool`);

  // 1. Get AI-generated summary from VideoIndex (GPT-5 summary, 400-600 words)
  let fullTranscript = "";
  if (includeTranscripts) {
    const videoIndex = await prisma.videoIndex.findUnique({
      where: { videoId },
      select: {
        summaryText: true,
        summaryCategory: true,
        title: true,
      },
    });

    if (videoIndex?.summaryText) {
      fullTranscript = videoIndex.summaryText;

      const transcriptLength = fullTranscript.length;
      const estimatedTokens = Math.ceil(transcriptLength / 4); // Rough estimate: 1 token ≈ 4 chars

      console.log(`[CommentReply] Got AI summary: ${transcriptLength} chars (~${estimatedTokens} tokens)`);
      console.log(`[CommentReply] Category: ${videoIndex.summaryCategory || 'Unknown'}`);

      // AI summaries are already concise (400-600 words), but let's have a safety check
      const MAX_SUMMARY_TOKENS = 2000; // ~8000 chars
      const MAX_SUMMARY_CHARS = MAX_SUMMARY_TOKENS * 4;

      if (transcriptLength > MAX_SUMMARY_CHARS) {
        console.warn(`[CommentReply] Summary unexpectedly long (${transcriptLength} chars), truncating to ${MAX_SUMMARY_CHARS}`);
        fullTranscript = fullTranscript.substring(0, MAX_SUMMARY_CHARS) + "\n\n... (summary truncated)";
      }
    } else {
      console.warn(`[CommentReply] No AI summary found for video ${videoId}`);
    }
  }

  // 2. Get Top 20 products from VideoProductPool
  const suggestedProducts: Array<{
    name: string;
    price: number | null;
    shortURL: string | null;
  }> = [];

  if (includeProducts) {
    const poolEntries = await prisma.videoProductPool.findMany({
      where: { videoId },
      orderBy: { relevanceScore: 'desc' },
      take: 20,
    });

    console.log(`[CommentReply] Found ${poolEntries.length} products in pool`);

    // Get product details
    const productIds = poolEntries.map(p => p.productId);
    const products = await prisma.product.findMany({
      where: {
        id: { in: productIds },
      },
      select: {
        id: true,
        name: true,
        price: true,
        shortURL: true,
      },
    });

    // Map to keep order from pool
    const productMap = new Map(products.map(p => [p.id, p]));

    for (const entry of poolEntries) {
      const product = productMap.get(entry.productId);
      if (product && product.shortURL) {
        suggestedProducts.push({
          name: product.name,
          price: product.price,
          shortURL: product.shortURL,
        });
      }
    }

    console.log(`[CommentReply] Prepared ${suggestedProducts.length} suggested products`);
  }

  if (!fullTranscript && suggestedProducts.length === 0) {
    console.warn(`[CommentReply] No transcript and no products for video ${videoId}`);
    console.log(`[CommentReply] Attempting answer with general knowledge only`);
  }

  // 3. Build transcript context section
  const transcriptText = fullTranscript
    ? `\n\n--- Video Transcript (เนื้อหาวิดีโอ) ---\n${fullTranscript}`
    : "\n\n(ไม่มี transcript - ใช้ความรู้ทั่วไปในการตอบ)";

  // 4. Build suggested products section
  const productsText = suggestedProducts.length > 0
    ? `\n\n--- Suggested Products (แนะนำได้เฉพาะที่อยู่ในลิสต์นี้) ---\n` +
      suggestedProducts.map((p, idx) => {
        const priceStr = p.price ? `${p.price.toLocaleString()}฿` : "ราคาไม่ระบุ";
        return `${idx + 1}. ${p.name}\n   ราคา: ${priceStr}\n   Link: ${p.shortURL}`;
      }).join("\n\n")
    : "\n\n(ไม่มีสินค้าแนะนำสำหรับวิดีโอนี้)";

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

${transcriptText}${productsText}${guidanceText}`;

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

  const estimatedInputTokens = countTokens(systemPrompt + commentText);
  console.log(`[CommentReply] Calling AI with model: ${model || 'gpt-5'}, maxTokens: ${maxTokens || 5000}`);
  console.log(`[CommentReply] Estimated input tokens: ${estimatedInputTokens}`);
  console.log(`[CommentReply] System prompt length: ${systemPrompt.length} chars`);
  console.log(`[CommentReply] Full transcript length: ${fullTranscript.length} chars`);

  // 6. Generate reply with JSON mode enabled and preferred temperature
  let rawResponse = "";
  let attemptedModel = model || "gpt-5";

  try {
    rawResponse = await chatCompletion(messages, {
      model: attemptedModel,
      maxTokens,
      jsonMode: true // Force JSON output
    });

    console.log(`[CommentReply] Raw response received: ${rawResponse.length} chars`);
    console.log(`[CommentReply] Raw response preview: ${rawResponse.substring(0, 200)}...`);
  } catch (error: any) {
    console.error(`[CommentReply] ${attemptedModel} failed:`, error.message);

    // Fallback to GPT-4 if GPT-5 fails
    if (attemptedModel === "gpt-5") {
      console.log(`[CommentReply] Falling back to gpt-4o-mini...`);
      attemptedModel = "gpt-4o-mini";

      try {
        rawResponse = await chatCompletion(messages, {
          model: attemptedModel,
          maxTokens,
          jsonMode: true
        });

        console.log(`[CommentReply] Fallback success: ${rawResponse.length} chars`);
      } catch (fallbackError: any) {
        console.error(`[CommentReply] Fallback also failed:`, fallbackError.message);
        throw new Error(`Both GPT-5 and GPT-4 failed: ${error.message}`);
      }
    } else {
      throw error;
    }
  }

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
      console.error("[CommentReply] Empty or too short response:");
      console.error("  Raw response length:", rawResponse.length);
      console.error("  Raw response:", rawResponse.substring(0, 500));
      console.error("  Cleaned response:", cleanedResponse);
      console.error("  System prompt length:", systemPrompt.length);
      console.error("  Transcript length:", fullTranscript.length);
      throw new Error(`AI response is empty or too short (${cleanedResponse?.length || 0} chars)`);
    }

    const parsed = JSON.parse(cleanedResponse);

    replyText = parsed.reply_text || parsed.replyText || "";
  products = parsed.products || [];

    // Validate products are in suggested pool and enforce canonical shortURL links
    const allowedUrls = new Set(suggestedProducts.map(p => p.shortURL).filter((url): url is string => url !== null));

    // Filter products to only those in the suggested list
    products = (products as ProductRecommendation[])
      .filter(p => p.url && allowedUrls.has(p.url))
      .slice(0, 2); // enforce link limit ≤ 2

    console.log(`[CommentReply] Parsed: ${products.length} products recommended`);

    // Sanitize reply_text: remove any URLs not in the suggested pool
    // - If we have suggested products, only allow those URLs in the text
    // - If no suggested products, remove all URLs from reply_text
    try {
      const allowedProductUrls = new Set(suggestedProducts.map(p => p.shortURL).filter((url): url is string => url !== null));
      // Match URLs (basic pattern)
      const urlRegex = /(https?:\/\/[^\s)]+)\/??/g;
      replyText = replyText.replace(urlRegex, (url: string) => {
        // Keep URL if it's in the allowed set
        if (allowedProductUrls.has(url)) {
          return url;
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
    contextTokens: countTokens(fullTranscript),
    totalTokens: countTokens(systemPrompt + commentText + rawResponse)
  };

  return {
    replyText,
    products,
    contexts: [], // No longer using context chunks
    tokenUsage,
    model: attemptedModel, // Return the model that actually worked
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
