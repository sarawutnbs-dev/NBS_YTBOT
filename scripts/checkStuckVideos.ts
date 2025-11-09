import { prisma } from "../lib/db";

async function main() {
  console.log("🔍 Checking videos stuck in INDEXING status...\n");

  const stuck = await prisma.videoIndex.findMany({
    where: { status: "INDEXING" },
    select: {
      videoId: true,
      title: true,
      updatedAt: true,
      errorMessage: true,
      chunksJSON: true,
      summaryJSON: true,
      source: true,
    },
    orderBy: { updatedAt: "desc" },
    take: 20,
  });

  console.log(`Found ${stuck.length} video(s) stuck in INDEXING:\n`);

  stuck.forEach((video) => {
    const hasChunks = !!video.chunksJSON;
    const hasSummary = !!video.summaryJSON;
    const age = Date.now() - video.updatedAt.getTime();
    const ageMinutes = Math.floor(age / 1000 / 60);

    console.log(`📹 ${video.videoId}`);
    console.log(`   Title: ${video.title || "(No title)"}`);
    console.log(`   Source: ${video.source || "N/A"}`);
    console.log(`   Updated: ${video.updatedAt.toISOString()} (${ageMinutes} minutes ago)`);
    console.log(`   Error: ${video.errorMessage || "N/A"}`);
    console.log(`   Has chunks: ${hasChunks ? "✅" : "❌"}`);
    console.log(`   Has summary: ${hasSummary ? "✅" : "❌"}`);
    console.log();
  });

  await prisma.$disconnect();
}

main().catch(console.error);
