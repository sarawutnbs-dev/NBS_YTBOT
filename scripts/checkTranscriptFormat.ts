import { prisma } from "../lib/db";

async function main() {
  const videoId = "msZNZdYeSnY"; // 8,412 chars but only 1 chunk

  console.log(`🔍 Checking transcript format for: ${videoId}\n`);

  const videoIndex = await prisma.videoIndex.findUnique({
    where: { videoId },
    select: {
      videoId: true,
      title: true,
      chunksJSON: true,
    },
  });

  if (!videoIndex?.chunksJSON) {
    console.log("❌ No chunksJSON found");
    await prisma.$disconnect();
    return;
  }

  const chunks = JSON.parse(videoIndex.chunksJSON) as string[];

  console.log(`📦 Chunks: ${chunks.length}`);
  console.log(`📏 Total length: ${chunks.join(" ").length} chars\n`);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    console.log(`\n--- Chunk ${i + 1} (${chunk.length} chars) ---`);
    console.log(chunk.substring(0, 500));

    // Check for sentence endings
    const periodCount = (chunk.match(/\.\s/g) || []).length;
    const exclamCount = (chunk.match(/!\s/g) || []).length;
    const questionCount = (chunk.match(/\?\s/g) || []).length;

    console.log(`\nSentence endings found:`);
    console.log(`  Periods (.): ${periodCount}`);
    console.log(`  Exclamations (!): ${exclamCount}`);
    console.log(`  Questions (?): ${questionCount}`);
    console.log(`  Total: ${periodCount + exclamCount + questionCount}`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
