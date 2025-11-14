import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { PrismaClient } from "@prisma/client";
import { createEmbedding } from "@/lib/rag/openai";
import { hybridSearch } from "@/lib/rag/retriever";
import { extractPriceFromQuery, rerankByPrice, debugPriceReranking } from "@/lib/rag/price-reranking";

const prisma = new PrismaClient();

/**
 * POST /api/similarity/search
 * Test similarity search - returns transcript chunks and top products
 */
export async function POST(req: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await req.json();
    const { query, videoId, topK = 20 } = body;

    if (!query || typeof query !== "string") {
      return NextResponse.json(
        { error: "query parameter is required and must be a string" },
        { status: 400 }
      );
    }

    console.log(`[API] Similarity search: "${query.substring(0, 50)}..."`);

    // 1. Create embedding once
    const startTime = Date.now();
    const queryEmbedding = await createEmbedding(query);
    const embeddingTime = Date.now() - startTime;
    console.log(`[API] ✅ Embedding created in ${embeddingTime}ms`);

    // 2. Search transcripts
    const transcriptStartTime = Date.now();
    const transcriptResults = await hybridSearch(query, {
      topK: 10,
      sourceType: "transcript",
      videoId: videoId || undefined,
      minScore: 0.3,
      queryEmbedding,
    });
    const transcriptTime = Date.now() - transcriptStartTime;
    console.log(`[API] ✅ Transcript search completed in ${transcriptTime}ms (${transcriptResults.length} results)`);

    // 3. Search products (get more results for re-ranking)
    const productStartTime = Date.now();
    let productResults = await hybridSearch(query, {
      topK: topK * 2.5,  // Get 2.5x results for better re-ranking
      sourceType: "product",
      minScore: 0.3,
      queryEmbedding,
    });
    const productTime = Date.now() - productStartTime;
    console.log(`[API] ✅ Product search completed in ${productTime}ms (${productResults.length} results)`);

    // 4. Re-rank by price if query contains price
    const queryPrice = extractPriceFromQuery(query);
    let rerankedResults = productResults;
    let rerankingTime = 0;

    if (queryPrice) {
      const rerankStartTime = Date.now();
      console.log(`[API] 💰 Detected price: ${queryPrice.toLocaleString()} บาท`);

      rerankedResults = rerankByPrice(productResults, queryPrice, {
        priceWeight: 0.4,      // 40% weight for price
        semanticWeight: 0.6    // 60% weight for semantic
      });

      rerankingTime = Date.now() - rerankStartTime;
      console.log(`[API] ✅ Re-ranked by price in ${rerankingTime}ms`);

      // Debug output (optional - comment out for production)
      if (process.env.DEBUG_PRICE_RANKING === 'true') {
        debugPriceReranking(query, rerankedResults, queryPrice);
      }
    }

    // 5. Get product details from meta (since RagDocument may contain old product data)
    const productsWithScores = rerankedResults.slice(0, topK).map(result => {
      const meta = result.meta as any;
      return {
        id: result.sourceId,
        shopeeProductId: result.sourceId,
        name: meta.name || "Unknown Product",
        price: meta.price || null,
        shortUrl: meta.url || null,
        score: result.score,
        // Include debug info if available
        ...(meta._priceScore !== undefined && {
          priceScore: meta._priceScore,
          semanticScore: meta._semanticScore
        })
      };
    });

    const totalTime = Date.now() - startTime;

    return NextResponse.json({
      query,
      videoId: videoId || null,
      queryPrice: queryPrice || null,
      transcripts: transcriptResults,
      products: productsWithScores,
      metrics: {
        totalTime,
        embeddingTime,
        transcriptTime,
        productTime,
        rerankingTime: queryPrice ? rerankingTime : null,
        transcriptCount: transcriptResults.length,
        productCount: productsWithScores.length,
        priceReranked: queryPrice !== null
      }
    });
  } catch (error) {
    console.error("[API] /similarity/search error:", error);

    return NextResponse.json(
      {
        error: "Failed to perform similarity search",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
