/**
 * Compute VideoProductPool for all videos
 *
 * This script should be run:
 * - After new videos are indexed
 * - After products are synced
 * - Periodically (e.g., daily) to refresh pools
 */

import { prisma } from "@/lib/db";
import { computeAllVideoProductPools } from "@/lib/rag/video-product-pool";

async function computeAllPools() {
  console.log("🔄 Computing VideoProductPools for all videos\n");

  try {
    const startTime = Date.now();

    const result = await computeAllVideoProductPools({
      maxPoolSize: 200,
      minRelevanceScore: 0.1,
      overwrite: true // Set to false for incremental updates
    });

    const elapsed = Date.now() - startTime;

    console.log(`\n${"=".repeat(60)}`);
    console.log(`✅ Pool Computation Complete!`);
    console.log(`${"=".repeat(60)}\n`);

    console.log(`📊 Summary:`);
    console.log(`   Videos processed: ${result.processed}`);
    console.log(`   Total products in pools: ${result.totalProducts}`);
    console.log(`   Average pool size: ${result.avgPoolSize.toFixed(1)} products/video`);
    console.log(`   Total time: ${(elapsed / 1000).toFixed(1)}s`);
    console.log(`   Avg time per video: ${(elapsed / result.processed).toFixed(0)}ms\n`);

    // Get pool statistics
    const poolStats = await prisma.videoProductPool.groupBy({
      by: ['videoId'],
      _count: true
    });

    console.log(`📈 Pool Distribution:`);
    const distribution = poolStats.reduce((acc, stat) => {
      const bucket = Math.floor(stat._count / 50) * 50;
      acc[bucket] = (acc[bucket] || 0) + 1;
      return acc;
    }, {} as Record<number, number>);

    Object.entries(distribution)
      .sort(([a], [b]) => parseInt(a) - parseInt(b))
      .forEach(([bucket, count]) => {
        console.log(`   ${bucket}-${parseInt(bucket) + 49} products: ${count} videos`);
      });

    console.log();

  } catch (error) {
    console.error("\n❌ Pool computation failed:", error);
    throw error;
  }
}

computeAllPools()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
