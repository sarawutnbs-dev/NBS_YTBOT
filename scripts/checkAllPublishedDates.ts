import { config } from "dotenv";
import { resolve } from "path";
import { PrismaClient } from "@prisma/client";

config({ path: resolve(process.cwd(), ".env.local") });

const prisma = new PrismaClient();

async function main() {
  const videos = await prisma.videoIndex.findMany({
    take: 10,
    orderBy: { updatedAt: "desc" },
    select: {
      videoId: true,
      title: true,
      publishedAt: true,
      status: true,
      updatedAt: true,
    },
  });

  console.log("\n📋 Recent Videos - Published Dates:\n");

  videos.forEach((video, index) => {
    console.log(`${index + 1}. ${video.videoId}`);
    console.log(`   Title: ${video.title.substring(0, 50)}...`);
    console.log(`   Status: ${video.status}`);
    console.log(`   Published: ${video.publishedAt ? video.publishedAt.toISOString() : "❌ Not set"}`);
    console.log(`   Updated: ${video.updatedAt.toISOString()}`);
    console.log();
  });

  const withPublished = videos.filter((v) => v.publishedAt).length;
  const withoutPublished = videos.filter((v) => !v.publishedAt).length;

  console.log(`Summary: ${withPublished}/${videos.length} videos have publishedAt`);
  if (withoutPublished > 0) {
    console.log(`⚠️  ${withoutPublished} videos don't have publishedAt (need to be re-indexed)`);
  }

  await prisma.$disconnect();
}

main();
