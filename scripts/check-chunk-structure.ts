/**
 * Check chunk structure in VideoIndex
 * Run: npx tsx scripts/check-chunk-structure.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("=== Checking Chunk Structure ===\n");

  try {
    // Get first READY video with chunks
    const video = await prisma.videoIndex.findFirst({
      where: {
        status: "READY",
        chunksJSON: { not: null },
      },
      select: {
        videoId: true,
        title: true,
        chunksJSON: true,
      },
    });

    if (!video) {
      console.log("No READY videos found with chunksJSON");
      return;
    }

    console.log(`Video ID: ${video.videoId}`);
    console.log(`Title: ${video.title}\n`);

    // Parse chunks
    const parsed = JSON.parse(video.chunksJSON!);
    console.log(`Type: ${typeof parsed}`);
    console.log(`Is Array: ${Array.isArray(parsed)}`);
    console.log(`Length/Keys: ${Array.isArray(parsed) ? parsed.length : Object.keys(parsed).length}\n`);

    // Show first chunk structure
    console.log("=== First Element ===");
    console.log(`Type of first element: ${typeof parsed[0]}`);
    console.log(`First element preview: ${String(parsed[0]).substring(0, 200)}...`);
    console.log("\n");

    // Show second chunk structure (if exists)
    if (chunks.length > 1) {
      console.log("=== Second Chunk Structure ===");
      console.log(JSON.stringify(chunks[1], null, 2));
      console.log("\n");
    }

    // Check field names
    console.log("=== Available Fields in First Chunk ===");
    console.log(Object.keys(chunks[0]));
    console.log("\n");

    // Try different extraction methods
    console.log("=== Extraction Test ===");
    const method1 = chunks.map((c: any) => c.text || "").join(" ");
    console.log(`Method 1 (c.text): Length = ${method1.length}, Preview = ${method1.substring(0, 100)}`);

    const method2 = chunks.map((c: any) => c.content || "").join(" ");
    console.log(`Method 2 (c.content): Length = ${method2.length}, Preview = ${method2.substring(0, 100)}`);

    const method3 = chunks.map((c: any) => c.text || c.content || "").join(" ");
    console.log(`Method 3 (c.text || c.content): Length = ${method3.length}, Preview = ${method3.substring(0, 100)}`);

    // Check all possible text fields
    const possibleFields = ['text', 'content', 'transcript', 'body', 'message', 'data'];
    console.log("\n=== Testing All Possible Fields ===");
    for (const field of possibleFields) {
      const testExtract = chunks.map((c: any) => c[field] || "").join(" ");
      if (testExtract.length > 0) {
        console.log(`✅ Field "${field}": Length = ${testExtract.length}, Preview = ${testExtract.substring(0, 100)}`);
      } else {
        console.log(`❌ Field "${field}": Empty`);
      }
    }

  } catch (error) {
    console.error("Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
