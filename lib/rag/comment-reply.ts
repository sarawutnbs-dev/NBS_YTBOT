/**
 * Generate AI-powered comment replies using RAG
 * Updated: 2-Stage Prompt System
 */

import { PrismaClient } from "@prisma/client";
import { chatCompletion, createEmbedding } from "./openai";
import { hybridSearch } from "./retriever";
import { FIRST_PROMPT, PURCHASE_PROMPT } from "./prompts";
import { SearchResult } from "./schema";
import { extractPriceFromQuery, rerankByPrice } from "./price-reranking";

const prisma = new PrismaClient();

export interface CommentReplyRequest {
  commentText: string;
  videoId: string;
  includeProducts?: boolean;
  includeTranscripts?: boolean;
  maxTokens?: number;
  model?: string; // override chat model per request
  temperature?: number;
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

// ============================================
// Stage 1: Classification Response Schema
// ============================================
interface Stage1ResponseOther {
  intent: "other";
  reply_text: string;
}

interface Stage1ResponsePurchase {
  intent: "purchase";
  category: "Notebook" | "PC Component" | "Smartphone" | "Unknown";
  filters: {
    product_type?: string | null;
    budget_min?: number | null;
    budget_max?: number | null;
    brand_prefer?: string[];
    brand_avoid?: string[];
    usage_notes?: string | null;
    other_constraints?: string | null;
  };
  retrieval_plan: {
    max_products: number;
    AI_query: string;
    product_query: string;
  };
}

type Stage1Response = Stage1ResponseOther | Stage1ResponsePurchase;

// ============================================
// Stage 2: Purchase Response Schema
// ============================================
interface Stage2Response {
  reply_text: string;
  products: Array<{
    id: string;
    url: string;
    reason: string;
    confidence: number;
  }>;
}

/**
 * Count tokens (simplified estimation)
 */
function countTokens(text: string): number {
  // Rough estimation: ~4 characters per token for Thai
  return Math.ceil(text.length / 4);
}

/**
 * Stage 1: Call AI to classify intent
 */
async function callStage1Classification(
  commentText: string,
  transcripts: string,
  model: string,
  temperature?: number
): Promise<Stage1Response> {
  console.log(`[Stage 1] Calling classification AI...`);

  const messages = [
    {
      role: "system" as const,
      content: FIRST_PROMPT
    },
    {
      role: "user" as const,
      content: `--- Video Transcript ---\n${transcripts}\n\n--- User Comment ---\n"${commentText}"\n\nกรุณาวิเคราะห์และตอบเป็น JSON object เท่านั้น`
    }
  ];

  const rawResponse = await chatCompletion(messages, {
    model: model || "gpt-4o-mini",
    maxTokens: 1500,
    jsonMode: true,
    temperature
  });

  console.log(`[Stage 1] Raw response: ${rawResponse.substring(0, 200)}...`);

  // Parse response
  let cleanedResponse = rawResponse.trim();
  if (cleanedResponse.startsWith("```json")) {
    cleanedResponse = cleanedResponse.replace(/```json\n?/g, "").replace(/```\n?/g, "");
  } else if (cleanedResponse.startsWith("```")) {
    cleanedResponse = cleanedResponse.replace(/```\n?/g, "");
  }

  const parsed = JSON.parse(cleanedResponse);

  // Determine intent
  if (parsed.reply_text && !parsed.category && !parsed.filters) {
    // This is "other" response
    return {
      intent: "other",
      reply_text: parsed.reply_text
    } as Stage1ResponseOther;
  } else {
    // This is "purchase" response
    return {
      intent: "purchase",
      category: parsed.category || "Unknown",
      filters: parsed.filters || {},
      retrieval_plan: parsed.retrieval_plan || {
        max_products: 30,
        AI_query: commentText,
        product_query: commentText
      }
    } as Stage1ResponsePurchase;
  }
}

/**
 * Search products by category + filters
 * Note: ใช้ original comment text แทนการสร้าง query จาก filters
 * เพราะ embedding ทำงานได้ดีกับภาษาธรรมชาติมากกว่า structured query
 */
async function searchByCategoryFilters(
  filters: Stage1ResponsePurchase["filters"],
  commentText: string,
  maxProducts: number,
  category: string
): Promise<SearchResult[]> {
  console.log(`[Search 2.1] Searching by category + filters...`);
  console.log(`[Search 2.1] Filters:`, JSON.stringify(filters, null, 2));

  // เพิ่มชื่อ category เข้าไปใน query เพื่อให้ search ได้แม่นยำขึ้น
  let categoryKeyword = "";
  if (category === "Notebook") {
    categoryKeyword = " โน้ตบุ๊ก notebook";
  } else if (category === "Smartphone") {
    categoryKeyword = " มือถือ smartphone";
  } else if (category === "PC Component") {
    categoryKeyword = " PC component คอมพิวเตอร์";
  }

  const searchQuery = commentText + categoryKeyword;
  console.log(`[Search 2.1] Query (with category): "${searchQuery}"`);

  // Perform hybrid search with category filter
  // Don't pass queryEmbedding - let hybridSearch create it from searchQuery
  const results = await hybridSearch(searchQuery, {
    topK: maxProducts,
    sourceType: "product",
    minScore: 0.2,  // Lowered from 0.3 to work with longer Thai queries
    category  // Filter by category to ensure we get correct product type
  });

  console.log(`[Search 2.1] Found ${results.length} products`);

  // Apply price re-ranking if budget specified
  if (filters.budget_max) {
    const reranked = rerankByPrice(results, filters.budget_max, {
      priceWeight: 0.4,
      semanticWeight: 0.6
    });
    console.log(`[Search 2.1] Re-ranked by price (budget: ${filters.budget_max})`);
    return reranked;
  }

  return results;
}

/**
 * Search products by product_query
 */
async function searchByProductQuery(
  productQuery: string,
  maxProducts: number,
  category: string
): Promise<SearchResult[]> {
  console.log(`[Search 2.2] Searching by product_query: "${productQuery}"`);

  // Extract price from product_query
  const queryPrice = extractPriceFromQuery(productQuery);

  // Perform hybrid search with category filter
  // Don't pass queryEmbedding - let hybridSearch create it from productQuery
  let results = await hybridSearch(productQuery, {
    topK: maxProducts,
    sourceType: "product",
    minScore: 0.2,  // Lowered from 0.3 to work with longer Thai queries
    category  // Filter by category
  });

  console.log(`[Search 2.2] Found ${results.length} products`);

  // Apply price re-ranking if price detected
  if (queryPrice) {
    results = rerankByPrice(results, queryPrice, {
      priceWeight: 0.4,
      semanticWeight: 0.6
    });
    console.log(`[Search 2.2] Re-ranked by price (${queryPrice} บาท)`);
  }

  return results;
}

/**
 * Stage 2: Call AI for purchase recommendation
 */
async function callStage2Purchase(
  commentText: string,
  aiQuery: string,
  transcripts: string,
  products: Array<{
    id: string;
    name: string;
    price: number | null;
    shortURL: string | null;
  }>,
  model: string,
  temperature: number | undefined,
  filters?: {
    budget_min?: number | null;
    budget_max?: number | null;
  }
): Promise<Stage2Response> {
  console.log(`[Stage 2] Calling purchase recommendation AI...`);

  // Build budget context
  let budgetContext = "";
  if (filters?.budget_max) {
    const budgetMin = filters.budget_min || 0;
    const budgetMax = filters.budget_max;
    budgetContext = `\n\n--- งบประมาณ ---\nงบประมาณ: ${budgetMin.toLocaleString()}-${budgetMax.toLocaleString()} บาท\n**สำคัญ**: ต้องเลือกสินค้าที่มีราคาอยู่ในงบประมาณนี้เท่านั้น ห้ามแนะนำสินค้าที่เกิน ${budgetMax.toLocaleString()} บาท`;
  }

  // Build suggested products context
  const productsText = products.length > 0
    ? `\n\n--- Suggested Products ---\n` +
      products.map((p, idx) => {
        const priceStr = p.price ? `${p.price.toLocaleString()}฿` : "ราคาไม่ระบุ";
        return `${idx + 1}. id="${p.id}" name="${p.name}" price=${priceStr} url="${p.shortURL}"`;
      }).join("\n")
    : "\n\n(ไม่มีสินค้าแนะนำ)";

  const systemPrompt = `${PURCHASE_PROMPT}

--- Context Information ---

--- Video Transcript ---
${transcripts}

--- AI Query (จากการวิเคราะห์ก่อนหน้า) ---
${aiQuery}
${budgetContext}
${productsText}`;

  const messages = [
    {
      role: "system" as const,
      content: systemPrompt
    },
    {
      role: "user" as const,
      content: `คอมเมนต์: "${commentText}"\n\nกรุณาตอบเป็น valid JSON object เท่านั้น ตามรูปแบบที่กำหนด:\n\n**สำคัญ**: ต้องมีทั้ง reply_text และ products array (ถ้ามี suggested products ให้เลือกอย่างน้อย 1-2 รุ่นที่เหมาะสมที่สุด)\n\n{\n  "reply_text": "...",\n  "products": [\n    {"id": "...", "url": "...", "reason": "...", "confidence": 0.8}\n  ]\n}`
    }
  ];

  const rawResponse = await chatCompletion(messages, {
    model: model || "gpt-4o-mini",
    maxTokens: 2000,
    jsonMode: true,
    temperature
  });

  // Parse response
  let cleanedResponse = rawResponse.trim();
  if (cleanedResponse.startsWith("```json")) {
    cleanedResponse = cleanedResponse.replace(/```json\n?/g, "").replace(/```\n?/g, "");
  } else if (cleanedResponse.startsWith("```")) {
    cleanedResponse = cleanedResponse.replace(/```\n?/g, "");
  }

  const parsed = JSON.parse(cleanedResponse);

  console.log(`[Stage 2] Parsed reply_text length: ${(parsed.reply_text || "").length} chars`);
  console.log(`[Stage 2] Parsed products array: ${parsed.products ? parsed.products.length : 0} items`);
  if (parsed.products && parsed.products.length > 0) {
    console.log(`[Stage 2] First product:`, JSON.stringify(parsed.products[0], null, 2));
  }

  return {
    reply_text: parsed.reply_text || "",
    products: parsed.products || []
  };
}

/**
 * Get all transcript chunks for a video
 */
async function getAllTranscripts(videoId: string): Promise<string> {
  console.log(`[Transcripts] Fetching all transcript chunks for video ${videoId}...`);

  const allTranscriptChunks = await prisma.$queryRaw<Array<{
    id: number;
    docId: number;
    chunkIndex: number;
    text: string;
    meta: any;
  }>>`
    SELECT
      c.id,
      c."docId",
      c."chunkIndex",
      c.text,
      c.meta
    FROM "RagChunk" c
    JOIN "RagDocument" d ON c."docId" = d.id
    WHERE d."sourceType" = 'transcript'
      AND d.meta->>'videoId' = ${videoId}
    ORDER BY c."chunkIndex" ASC
  `;

  console.log(`[Transcripts] Found ${allTranscriptChunks.length} total transcript chunks`);

  return allTranscriptChunks.map(chunk => chunk.text).join('\n\n---\n\n');
}

/**
 * Generate comment reply with 2-stage prompt system
 */
export async function generateCommentReply(
  request: CommentReplyRequest
): Promise<CommentReplyResponse> {
  const {
    commentText,
    videoId,
    maxTokens = 3000,
    model,
    temperature
  } = request;

  console.log(`[CommentReply] 2-Stage System: Generating reply for: "${commentText.substring(0, 50)}..."`);

  const startTime = Date.now();

  // ============================================
  // STAGE 1: Classification & Intent Analysis
  // ============================================

  // Step 1: Get all transcripts
  const transcripts = await getAllTranscripts(videoId);

  // Step 2: Call Stage 1 AI
  let stage1Response: Stage1Response;
  try {
    stage1Response = await callStage1Classification(commentText, transcripts, model || "gpt-4o-mini", temperature);
  } catch (error) {
    console.error(`[Stage 1] Error:`, error);
    throw error;
  }

  console.log(`[Stage 1] Intent: ${stage1Response.intent}`);

  // If intent is "other", return immediately
  if (stage1Response.intent === "other") {
    console.log(`[Stage 1] Non-purchase query - returning direct response`);

    const tokenUsage = {
      queryTokens: countTokens(commentText),
      systemTokens: countTokens(FIRST_PROMPT),
      contextTokens: countTokens(transcripts),
      totalTokens: countTokens(FIRST_PROMPT + commentText + transcripts + stage1Response.reply_text)
    };

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[CommentReply] ✅ Completed in ${duration}s (Stage 1 only)`);

    return {
      replyText: stage1Response.reply_text,
      products: [],
      contexts: [],
      tokenUsage,
      model: model || "gpt-4o-mini"
    };
  }

  // ============================================
  // STAGE 2: Purchase Recommendation
  // ============================================

  const purchaseResponse = stage1Response as Stage1ResponsePurchase;
  console.log(`[Stage 2] Category: ${purchaseResponse.category}`);
  console.log(`[Stage 2] Max products: ${purchaseResponse.retrieval_plan.max_products}`);

  // Step 2.1: Search by category + filters (using original comment text)
  const filterResults = await searchByCategoryFilters(
    purchaseResponse.filters,
    commentText,
    purchaseResponse.retrieval_plan.max_products,
    purchaseResponse.category
  );

  const filterMaxScore = filterResults.length > 0
    ? Math.max(...filterResults.map(r => r.score))
    : 0;

  console.log(`[Search 2.1] Max score: ${filterMaxScore.toFixed(3)}`);

  // Step 2.2: Search by product_query
  const queryResults = await searchByProductQuery(
    purchaseResponse.retrieval_plan.product_query,
    purchaseResponse.retrieval_plan.max_products,
    purchaseResponse.category
  );

  const queryMaxScore = queryResults.length > 0
    ? Math.max(...queryResults.map(r => r.score))
    : 0;

  console.log(`[Search 2.2] Max score: ${queryMaxScore.toFixed(3)}`);

  // Step 3: Compare and select better results
  let selectedResults: SearchResult[];
  let selectedMethod: string;

  if (queryMaxScore > filterMaxScore) {
    selectedResults = queryResults;
    selectedMethod = "product_query";
    console.log(`[Search] ✅ Using product_query results (score: ${queryMaxScore.toFixed(3)} > ${filterMaxScore.toFixed(3)})`);
  } else {
    selectedResults = filterResults;
    selectedMethod = "category+filters";
    console.log(`[Search] ✅ Using category+filters results (score: ${filterMaxScore.toFixed(3)} >= ${queryMaxScore.toFixed(3)})`);
  }

  // Step 4: Get product details
  console.log(`[Stage 2] Fetching product details...`);

  const productSourceIds = Array.from(new Set(selectedResults.map(r => r.sourceId)));
  console.log(`[Stage 2] Product source IDs (${productSourceIds.length}):`, productSourceIds.slice(0, 5));

  // First, try without filters to see if products exist
  const allProducts = await prisma.product.findMany({
    where: {
      shopeeProductId: { in: productSourceIds },
    },
    select: {
      id: true,
      name: true,
      price: true,
      shortURL: true,
      shopeeProductId: true,
      inStock: true,
      hasAffiliate: true,
    },
    take: 20,
  });

  console.log(`[Stage 2] Found ${allProducts.length} products in DB (before filters)`);
  console.log(`[Stage 2] Products with shortURL: ${allProducts.filter(p => p.shortURL).length}`);
  console.log(`[Stage 2] Products inStock: ${allProducts.filter(p => p.inStock).length}`);
  console.log(`[Stage 2] Products hasAffiliate: ${allProducts.filter(p => p.hasAffiliate).length}`);

  // Apply filters
  const productsFromDb = allProducts.filter(p => p.inStock && p.hasAffiliate && p.shortURL);

  // Filter by budget if specified
  let filteredByBudget = productsFromDb;
  if (purchaseResponse.filters.budget_max) {
    const budgetMax = purchaseResponse.filters.budget_max;
    const budgetMin = purchaseResponse.filters.budget_min || 0;

    filteredByBudget = productsFromDb.filter(p => {
      if (!p.price) return false;
      return p.price >= budgetMin && p.price <= budgetMax;
    });

    console.log(`[Stage 2] Filtered by budget ${budgetMin}-${budgetMax}: ${productsFromDb.length} → ${filteredByBudget.length} products`);
  }

  const suggestedProducts = filteredByBudget
    .filter(p => p.shortURL)
    .map(p => ({
      id: p.id,
      name: p.name,
      price: p.price,
      shortURL: p.shortURL
    }));

  console.log(`[Stage 2] Prepared ${suggestedProducts.length} suggested products`);
  if (suggestedProducts.length > 0) {
    console.log(`[Stage 2] Sample suggested product:`, {
      id: suggestedProducts[0].id,
      name: suggestedProducts[0].name?.substring(0, 50),
      url: suggestedProducts[0].shortURL
    });
  }

  // Step 5: Call Stage 2 AI
  let stage2Response: Stage2Response;
  try {
    stage2Response = await callStage2Purchase(
      commentText,
      purchaseResponse.retrieval_plan.AI_query,
      transcripts,
      suggestedProducts,
      model || "gpt-4o-mini",
      temperature,
      {
        budget_min: purchaseResponse.filters.budget_min,
        budget_max: purchaseResponse.filters.budget_max
      }
    );
  } catch (error) {
    console.error(`[Stage 2] Error:`, error);
    throw error;
  }

  // Step 6: Validate and filter products
  const allowedUrls = new Set(suggestedProducts.map(p => p.shortURL).filter((url): url is string => url !== null));

  console.log(`[Stage 2] Allowed URLs count: ${allowedUrls.size}`);
  console.log(`[Stage 2] AI returned products count: ${stage2Response.products.length}`);

  if (stage2Response.products.length > 0) {
    console.log(`[Stage 2] AI product URLs:`, stage2Response.products.map(p => p.url));
    console.log(`[Stage 2] Sample allowed URLs:`, Array.from(allowedUrls).slice(0, 5));
  }

  let products = stage2Response.products
    .filter(p => p.url && allowedUrls.has(p.url))
    .slice(0, 3); // Max 3 products

  console.log(`[Stage 2] Validated ${products.length} products`);

  // Step 7: Add shortURLs to reply text if missing
  let replyText = stage2Response.reply_text;

  if (products.length > 0 && replyText.includes("สินค้าแนะนำ")) {
    console.log(`[Stage 2] Adding shortURLs to reply text...`);

    try {
      for (const prod of products) {
        const suggestedProduct = suggestedProducts.find(p => p.id === prod.id);
        if (suggestedProduct && suggestedProduct.shortURL && suggestedProduct.name) {
          // Extract model number for matching
          const modelMatch = suggestedProduct.name.match(/[A-Z]\d+[A-Z]*-[A-Z0-9]+/);
          if (modelMatch) {
            const model = modelMatch[0];
            const escapedModel = model.replace(/[-]/g, '\\-');
            const pattern = new RegExp(`(-[^\\n]*${escapedModel}[^\\n]*?บาท)(?![^\\n]*https?://)`, 'gi');

            const beforeReplace = replyText;
            replyText = replyText.replace(pattern, (match) => {
              return `${match} ${suggestedProduct.shortURL}`;
            });

            if (replyText !== beforeReplace) {
              console.log(`[Stage 2] ✅ Added shortURL: ${suggestedProduct.shortURL}`);
            }
          }
        }
      }
    } catch (err) {
      console.error(`[Stage 2] Failed to add shortURLs:`, err);
    }
  }

  // Step 8: Calculate token usage
  const tokenUsage = {
    queryTokens: countTokens(commentText),
    systemTokens: countTokens(FIRST_PROMPT + PURCHASE_PROMPT),
    contextTokens: countTokens(transcripts),
    totalTokens: countTokens(FIRST_PROMPT + PURCHASE_PROMPT + commentText + transcripts + replyText)
  };

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`[CommentReply] ✅ Completed in ${duration}s (2-Stage: ${selectedMethod})`);

  return {
    replyText,
    products,
    contexts: selectedResults,
    tokenUsage,
    model: model || "gpt-4o-mini"
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
