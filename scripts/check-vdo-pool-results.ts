/**
 * Check VideoProductPool results after running VDO Pool
 * Run: npx tsx scripts/check-vdo-pool-results.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("=== Checking VDO Pool Results ===\n");

  try {
    // 1. Count total pools
    const totalPools = await prisma.videoProductPool.count();
    console.log(`Total VideoProductPool entries: ${totalPools}\n`);

    // 2. Count pools per video
    const poolsByVideo = await prisma.videoProductPool.groupBy({
      by: ['videoId'],
      _count: {
        productId: true,
      },
      orderBy: {
        _count: {
          productId: 'desc',
        },
      },
      take: 10,
    });

    console.log("=== Top 10 Videos by Pool Size ===");
    for (const pool of poolsByVideo) {
      const video = await prisma.videoIndex.findUnique({
        where: { videoId: pool.videoId },
        select: { title: true, categoryTags: true, brandTags: true },
      });

      console.log(`\nVideo: ${pool.videoId}`);
      console.log(`  Title: ${video?.title.substring(0, 60)}...`);
      console.log(`  Categories: ${video?.categoryTags.join(", ") || "none"}`);
      console.log(`  Brands: ${video?.brandTags.join(", ") || "none"}`);
      console.log(`  Pool size: ${pool._count.productId} products`);
    }

    // 3. Sample pool entries
    console.log("\n=== Sample Pool Entries (First 5) ===");
    const samplePools = await prisma.videoProductPool.findMany({
      take: 5,
      orderBy: { relevanceScore: 'desc' },
    });

    for (const pool of samplePools) {
      const video = await prisma.videoIndex.findUnique({
        where: { videoId: pool.videoId },
        select: { title: true },
      });

      const product = await prisma.product.findUnique({
        where: { id: pool.productId },
        select: { name: true },
      });

      console.log(`\nVideo: ${pool.videoId} - ${video?.title.substring(0, 40) || "Unknown"}...`);
      console.log(`Product: ${product?.name.substring(0, 50) || "Unknown"}...`);
      console.log(`Relevance Score: ${pool.relevanceScore.toFixed(3)}`);
      console.log(`Matched: Brand=${pool.matchedBrand}, Category=${pool.matchedCategory}, Price=${pool.matchedPriceRange}`);
    }

    // 4. Statistics
    console.log("\n=== Pool Statistics ===");
    const stats = await prisma.videoProductPool.aggregate({
      _avg: {
        relevanceScore: true,
      },
      _min: {
        relevanceScore: true,
      },
      _max: {
        relevanceScore: true,
      },
    });

    console.log(`Average relevance score: ${stats._avg.relevanceScore?.toFixed(3) || "N/A"}`);
    console.log(`Min relevance score: ${stats._min.relevanceScore?.toFixed(3) || "N/A"}`);
    console.log(`Max relevance score: ${stats._max.relevanceScore?.toFixed(3) || "N/A"}`);

    // 5. Count videos with pools
    const videosWithPools = await prisma.videoProductPool.groupBy({
      by: ['videoId'],
    });
    console.log(`\nTotal videos with pools: ${videosWithPools.length}`);

    // 6. Count READY videos
    const readyVideos = await prisma.videoIndex.count({
      where: { status: "READY" },
    });
    console.log(`Total READY videos: ${readyVideos}`);
    console.log(`Coverage: ${((videosWithPools.length / readyVideos) * 100).toFixed(1)}%`);

  } catch (error) {
    console.error("Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
