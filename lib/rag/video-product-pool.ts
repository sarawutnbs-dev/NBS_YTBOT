/**
 * Video Product Pool: Precomputed product pools for fast retrieval
 *
 * Instead of filtering products on every query, we precompute a pool
 * of relevant products for each video based on metadata matching.
 * This reduces query time from O(all_products) to O(pool_size).
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface PoolComputeOptions {
  maxPoolSize?: number;      // Max products per video (default: 200)
  minRelevanceScore?: number; // Min score to include (default: 0.1)
  overwrite?: boolean;        // Overwrite existing pool (default: false)
}

/**
 * Compute relevance score based on metadata matching
 */
function computeRelevanceScore(
  product: {
    brand: string | null;
    categoryName: string | null;
    price: number | null;
    tags: string[];
  },
  video: {
    brandTags: string[];
    categoryTags: string[];
    priceRangeMin: number | null;
    priceRangeMax: number | null;
    tags: string[];
  }
): {
  score: number;
  matchedBrand: boolean;
  matchedCategory: boolean;
  matchedPriceRange: boolean;
} {
  let score = 0;
  let matchedBrand = false;
  let matchedCategory = false;
  let matchedPriceRange = false;

  // Tag matching (40% weight)
  if (video.tags.length > 0 && product.tags.length > 0) {
    const matchedTags = product.tags.filter(pt =>
      video.tags.some(vt => vt.toLowerCase() === pt.toLowerCase())
    );
    const tagScore = (matchedTags.length / video.tags.length) * 0.4;
    score += tagScore;
  }

  // Category matching (30% weight)
  if (product.categoryName && video.categoryTags.length > 0) {
    if (video.categoryTags.some(c => c.toLowerCase() === product.categoryName?.toLowerCase())) {
      score += 0.3;
      matchedCategory = true;
    }
  }

  // Price range matching (20% weight)
  if (product.price && video.priceRangeMin && video.priceRangeMax) {
    const priceMin = product.price * 0.9;
    const priceMax = product.price * 1.1;

    // Check if price ranges overlap
    if (priceMin <= video.priceRangeMax && priceMax >= video.priceRangeMin) {
      score += 0.2;
      matchedPriceRange = true;
    }
  }

  // Brand matching (10% weight)
  if (product.brand && video.brandTags.length > 0) {
    if (video.brandTags.some(b => b.toLowerCase() === product.brand?.toLowerCase())) {
      score += 0.1;
      matchedBrand = true;
    }
  }

  return { score, matchedBrand, matchedCategory, matchedPriceRange };
}

/**
 * Compute product pool for a single video
 */
export async function computeVideoProductPool(
  videoId: string,
  options: PoolComputeOptions = {}
): Promise<{ poolSize: number; avgScore: number }> {
  const {
    maxPoolSize = 200,
    minRelevanceScore = 0.1,
    overwrite = false
  } = options;

  console.log(`[Pool] Computing product pool for video ${videoId}...`);

  // Get video metadata
  const video = await prisma.videoIndex.findUnique({
    where: { videoId },
    select: {
      categoryTags: true,
      brandTags: true,
      priceRangeMin: true,
      priceRangeMax: true,
      tags: true
    }
  });

  if (!video) {
    throw new Error(`Video ${videoId} not found`);
  }

  // Check if video has metadata
  const hasMetadata = (
    video.categoryTags.length > 0 ||
    video.brandTags.length > 0 ||
    (video.priceRangeMin !== null && video.priceRangeMax !== null)
  );

  if (!hasMetadata) {
    console.log(`[Pool] Video ${videoId} has no metadata, skipping pool computation`);
    return { poolSize: 0, avgScore: 0 };
  }

  // Check if pool already exists
  if (!overwrite) {
    const existingPool = await prisma.videoProductPool.count({
      where: { videoId }
    });

    if (existingPool > 0) {
      console.log(`[Pool] Pool already exists for video ${videoId} (${existingPool} products)`);
      return { poolSize: existingPool, avgScore: 0 };
    }
  } else {
    // Delete existing pool
    await prisma.videoProductPool.deleteMany({
      where: { videoId }
    });
    console.log(`[Pool] Deleted existing pool for video ${videoId}`);
  }

  // Get all eligible products
  const products = await prisma.product.findMany({
    where: {
      shopeeProductId: { not: null },
      inStock: true,
      hasAffiliate: true,
    },
    select: {
      id: true,
      brand: true,
      categoryName: true,
      price: true,
      tags: true,
    }
  });

  console.log(`[Pool] Scoring ${products.length} products...`);

  // Compute scores and filter
  const scoredProducts = products
    .map(product => ({
      productId: product.id,
      ...computeRelevanceScore(product, video)
    }))
    .filter(item => item.score >= minRelevanceScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxPoolSize);

  if (scoredProducts.length === 0) {
    console.log(`[Pool] No products met minimum relevance score (${minRelevanceScore})`);
    return { poolSize: 0, avgScore: 0 };
  }

  // Insert pool entries
  console.log(`[Pool] Creating pool with ${scoredProducts.length} products...`);

  await prisma.videoProductPool.createMany({
    data: scoredProducts.map(item => ({
      videoId,
      productId: item.productId,
      relevanceScore: item.score,
      matchedBrand: item.matchedBrand,
      matchedCategory: item.matchedCategory,
      matchedPriceRange: item.matchedPriceRange,
    }))
  });

  const avgScore = scoredProducts.reduce((sum, item) => sum + item.score, 0) / scoredProducts.length;

  console.log(`[Pool] ✅ Pool created: ${scoredProducts.length} products, avg score: ${avgScore.toFixed(3)}`);

  return { poolSize: scoredProducts.length, avgScore };
}

/**
 * Compute pools for all videos with metadata
 */
export async function computeAllVideoProductPools(
  options: PoolComputeOptions = {}
): Promise<{
  processed: number;
  totalProducts: number;
  avgPoolSize: number;
}> {
  console.log(`[Pool] Computing product pools for all videos...`);

  // Get all videos with metadata
  const videos = await prisma.videoIndex.findMany({
    where: {
      status: "READY",
      OR: [
        { categoryTags: { isEmpty: false } },
        { brandTags: { isEmpty: false } },
        {
          AND: [
            { priceRangeMin: { not: null } },
            { priceRangeMax: { not: null } }
          ]
        }
      ]
    },
    select: { videoId: true }
  });

  console.log(`[Pool] Found ${videos.length} videos with metadata`);

  let totalProducts = 0;
  let processed = 0;

  for (const video of videos) {
    try {
      const result = await computeVideoProductPool(video.videoId, options);
      totalProducts += result.poolSize;
      processed++;

      if (processed % 10 === 0) {
        console.log(`[Pool] Progress: ${processed}/${videos.length} videos`);
      }
    } catch (error) {
      console.error(`[Pool] Failed to compute pool for ${video.videoId}:`, error);
    }
  }

  const avgPoolSize = processed > 0 ? totalProducts / processed : 0;

  console.log(`[Pool] ✅ Completed: ${processed} videos, ${totalProducts} total products, avg ${avgPoolSize.toFixed(1)} per video`);

  return { processed, totalProducts, avgPoolSize };
}

/**
 * Get product IDs from precomputed pool
 */
export async function getVideoProductPool(
  videoId: string,
  options: {
    topK?: number;
    minScore?: number;
  } = {}
): Promise<string[]> {
  const { topK = 100, minScore = 0.1 } = options;

  const poolItems = await prisma.videoProductPool.findMany({
    where: {
      videoId,
      relevanceScore: { gte: minScore }
    },
    orderBy: { relevanceScore: 'desc' },
    take: topK,
    select: { productId: true }
  });

  return poolItems.map(item => item.productId);
}

/**
 * Get pool statistics for a video
 */
export async function getVideoPoolStats(videoId: string) {
  const stats = await prisma.videoProductPool.aggregate({
    where: { videoId },
    _count: true,
    _avg: { relevanceScore: true },
    _max: { relevanceScore: true },
    _min: { relevanceScore: true }
  });

  const matchCounts = await prisma.videoProductPool.groupBy({
    where: { videoId },
    by: ['matchedBrand', 'matchedCategory', 'matchedPriceRange'],
    _count: true
  });

  return {
    totalProducts: stats._count,
    avgScore: stats._avg.relevanceScore || 0,
    maxScore: stats._max.relevanceScore || 0,
    minScore: stats._min.relevanceScore || 0,
    matchCounts
  };
}
