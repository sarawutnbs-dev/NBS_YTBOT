/**
 * Price-based re-ranking for product search
 *
 * Adjusts search results based on price similarity to improve relevance
 * when user specifies a budget in their query.
 */

import { SearchResult } from "./schema";

/**
 * Extract price from query text
 *
 * Patterns:
 * - "40K", "40k" → 40,000
 * - "40000 บาท" → 40,000
 * - "งบ 40000" → 40,000
 * - "ราคา 40,000" → 40,000
 * - "ไม่เกิน 40K" → 40,000
 */
export function extractPriceFromQuery(query: string): number | null {
  const patterns = [
    /(\d+)[kK]/,                    // 40K, 40k
    /([\d,]+)\s*บาท/,              // 40,000 บาท
    /งบ\s*([\d,]+)/,               // งบ 40000
    /ราคา\s*([\d,]+)/,             // ราคา 40000
    /ไม่เกิน\s*([\d,]+)/,          // ไม่เกิน 40000
    /ประมาณ\s*([\d,]+)/,           // ประมาณ 40000
    /\$\s*([\d,]+)/,               // $40,000
  ];

  for (const pattern of patterns) {
    const match = query.match(pattern);
    if (match) {
      let priceStr = match[1].replace(/,/g, '');

      // Convert K/k to thousands
      if (pattern.source.includes('[kK]')) {
        const value = parseInt(priceStr);
        return value * 1000;
      }

      return parseInt(priceStr);
    }
  }

  return null;
}

/**
 * Calculate price similarity score
 *
 * Score based on percentage difference from average:
 * - 0% difference → 1.0 (100%)
 * - 10% difference → 0.9 (90%)
 * - 50% difference → 0.5 (50%)
 * - 100%+ difference → 0.0 (0%)
 *
 * Formula: score = max(0, 1 - (abs(queryPrice - productPrice) / avg(queryPrice, productPrice)))
 */
export function calculatePriceScore(
  queryPrice: number,
  productPrice: number
): number {
  if (!productPrice || productPrice <= 0) {
    return 0;
  }

  const diff = Math.abs(queryPrice - productPrice);
  const avgPrice = (queryPrice + productPrice) / 2;
  const percentDiff = diff / avgPrice;

  // Linear decay: 100% diff = 0 score
  return Math.max(0, 1 - percentDiff);
}

/**
 * Re-rank search results based on price similarity
 *
 * Combines semantic similarity with price similarity using weighted average.
 *
 * finalScore = (semanticScore × semanticWeight) + (priceScore × priceWeight)
 *
 * @param results - Search results from hybrid search
 * @param queryPrice - Price extracted from query
 * @param options - Weighting options
 * @returns Re-ranked results sorted by finalScore
 */
export function rerankByPrice(
  results: SearchResult[],
  queryPrice: number,
  options: {
    priceWeight?: number;      // Weight for price (0-1), default 0.4
    semanticWeight?: number;   // Weight for semantic (0-1), default 0.6
    minPriceScore?: number;    // Minimum price score to keep, default 0.0
  } = {}
): SearchResult[] {
  const {
    priceWeight = 0.4,
    semanticWeight = 0.6,
    minPriceScore = 0.0
  } = options;

  // Validate weights
  if (priceWeight + semanticWeight !== 1.0) {
    throw new Error('priceWeight + semanticWeight must equal 1.0');
  }

  const reranked = results.map(result => {
    const meta = result.meta as any;
    const productPrice = meta.price;

    // If no price info, keep original score (semantic only)
    if (!productPrice || productPrice <= 0) {
      return {
        ...result,
        meta: {
          ...meta,
          _priceScore: null,
          _semanticScore: result.score,
          _reranked: false
        }
      };
    }

    // Calculate price score
    const priceScore = calculatePriceScore(queryPrice, productPrice);

    // Skip if price score is too low
    if (priceScore < minPriceScore) {
      return {
        ...result,
        score: result.score * semanticWeight, // Penalize low price match
        meta: {
          ...meta,
          _priceScore: priceScore,
          _semanticScore: result.score,
          _reranked: true,
          _penalized: true
        }
      };
    }

    // Combine scores
    const finalScore = (result.score * semanticWeight) + (priceScore * priceWeight);

    return {
      ...result,
      score: finalScore,
      meta: {
        ...meta,
        _priceScore: priceScore,
        _semanticScore: result.score,
        _reranked: true
      }
    };
  });

  // Sort by final score (descending)
  return reranked.sort((a, b) => b.score - a.score);
}

/**
 * Get price range for filtering
 *
 * Returns min/max prices based on query price and tolerance.
 *
 * @param queryPrice - Price from query
 * @param tolerance - Percentage tolerance (0-1), default 0.2 (±20%)
 */
export function getPriceRange(
  queryPrice: number,
  tolerance: number = 0.2
): { minPrice: number; maxPrice: number } {
  return {
    minPrice: Math.floor(queryPrice * (1 - tolerance)),
    maxPrice: Math.ceil(queryPrice * (1 + tolerance))
  };
}

/**
 * Format price for display
 */
export function formatPrice(price: number): string {
  return price.toLocaleString('th-TH');
}

/**
 * Debug price re-ranking
 *
 * Logs detailed information about re-ranking process
 */
export function debugPriceReranking(
  query: string,
  results: SearchResult[],
  queryPrice: number | null
): void {
  console.log('\n' + '='.repeat(60));
  console.log('Price Re-ranking Debug');
  console.log('='.repeat(60));
  console.log(`Query: "${query}"`);
  console.log(`Detected Price: ${queryPrice ? formatPrice(queryPrice) + ' บาท' : 'None'}`);

  if (!queryPrice) {
    console.log('No price detected - skipping re-ranking');
    return;
  }

  console.log('\nTop 5 Results:');
  results.slice(0, 5).forEach((r, i) => {
    const meta = r.meta as any;
    console.log(`\n${i + 1}. ${meta.name?.substring(0, 50) || 'Unknown'}...`);
    console.log(`   Product Price: ${meta.price ? formatPrice(meta.price) + ' บาท' : 'N/A'}`);
    console.log(`   Semantic Score: ${((meta._semanticScore || r.score) * 100).toFixed(1)}%`);
    if (meta._priceScore !== undefined && meta._priceScore !== null) {
      console.log(`   Price Score: ${(meta._priceScore * 100).toFixed(1)}%`);
    }
    console.log(`   Final Score: ${(r.score * 100).toFixed(1)}%`);
    console.log(`   Re-ranked: ${meta._reranked ? 'Yes' : 'No'}`);
  });

  console.log('\n' + '='.repeat(60));
}
