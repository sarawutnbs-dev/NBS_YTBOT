import { prisma } from "../lib/db";
import { chunkTranscript } from "../lib/transcript";

async function main() {
  const videoId = "msZNZdYeSnY"; // 8,412 chars, previously only 1 chunk

  console.log(`🧪 Testing chunking fix for: ${videoId}\n`);

  const videoIndex = await prisma.videoIndex.findUnique({
    where: { videoId },
    select: {
      chunksJSON: true,
    },
  });

  if (!videoIndex?.chunksJSON) {
    console.log("❌ No chunksJSON found");
    await prisma.$disconnect();
    return;
  }

  // Get the original chunks
  const originalChunks = JSON.parse(videoIndex.chunksJSON) as string[];
  const transcript = originalChunks.join(" ");

  console.log(`📄 Original transcript:`);
  console.log(`   Length: ${transcript.length} chars`);
  console.log(`   Old chunks: ${originalChunks.length}`);
  console.log();

  // Test new chunking
  const newChunks = chunkTranscript(transcript, 400);

  console.log(`✨ New chunking:`);
  console.log(`   New chunks: ${newChunks.length}`);
  console.log();

  // Show first few chunks
  console.log(`📦 First 5 chunks:`);
  for (let i = 0; i < Math.min(5, newChunks.length); i++) {
    console.log(`\n  Chunk ${i + 1} (${newChunks[i].length} chars):`);
    console.log(`  ${newChunks[i].substring(0, 100)}...`);
  }

  console.log(`\n✅ Fix verified! Went from ${originalChunks.length} chunk(s) to ${newChunks.length} chunks`);

  await prisma.$disconnect();
}

main().catch(console.error);
