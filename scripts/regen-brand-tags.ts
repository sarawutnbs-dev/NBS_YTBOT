/**
 * Brand Regeneration Script
 *
 * จับคู่ brand จาก BrandTag table กับ video title และ transcript
 * แล้ว update VideoIndex.brandTags
 *
 * Run: npx tsx scripts/regen-brand-tags.ts
 * Options:
 *   --video-id <id>  - Process specific video
 *   --limit <n>      - Limit number of videos to process
 *   --dry-run        - Show what would be updated without saving
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface BrandMatch {
  brand: string;
  category: string;
  matchedIn: "title" | "transcript" | "both";
}

/**
 * Search for brand mentions in text (case-insensitive)
 */
function findBrandInText(text: string, brand: string): boolean {
  const lowerText = text.toLowerCase();
  const lowerBrand = brand.toLowerCase();

  // Try exact match first
  if (lowerText.includes(lowerBrand)) {
    return true;
  }

  // Try word boundary match (more precise)
  const wordBoundaryRegex = new RegExp(`\\b${lowerBrand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
  return wordBoundaryRegex.test(text);
}

/**
 * Find all brand matches in video title and transcript
 */
function findBrandMatches(
  title: string,
  transcript: string,
  brandList: Array<{ brand: string; category: string }>
): BrandMatch[] {
  const matches: BrandMatch[] = [];

  for (const { brand, category } of brandList) {
    const inTitle = findBrandInText(title, brand);
    const inTranscript = findBrandInText(transcript, brand);

    if (inTitle || inTranscript) {
      matches.push({
        brand,
        category,
        matchedIn: inTitle && inTranscript ? "both" : inTitle ? "title" : "transcript",
      });
    }
  }

  return matches;
}

async function main() {
  const args = process.argv.slice(2);
  const videoIdArg = args.find((arg, i) => arg === "--video-id" && args[i + 1]) ? args[args.indexOf("--video-id") + 1] : undefined;
  const limitArg = args.find((arg, i) => arg === "--limit" && args[i + 1]) ? parseInt(args[args.indexOf("--limit") + 1]) : undefined;
  const dryRun = args.includes("--dry-run");

  console.log("=== Brand Regeneration Script ===\n");
  console.log(`Mode: ${dryRun ? "DRY RUN (no changes will be saved)" : "LIVE"}`);
  if (videoIdArg) console.log(`Target: Specific video (${videoIdArg})`);
  if (limitArg) console.log(`Limit: ${limitArg} videos`);
  console.log();

  try {
    // 1. Load all brands from BrandTag table
    console.log("Loading brands from BrandTag table...");
    const brandTags = await prisma.brandTag.findMany({
      select: {
        brand: true,
        category: true,
      },
      orderBy: {
        brand: "asc",
      },
    });

    console.log(`Found ${brandTags.length} brands across ${new Set(brandTags.map(b => b.category)).size} categories\n`);

    if (brandTags.length === 0) {
      console.log("No brands found in BrandTag table. Please import brands first.");
      return;
    }

    // Show sample brands
    console.log("Sample brands:");
    brandTags.slice(0, 10).forEach((b) => {
      console.log(`  - ${b.brand} (${b.category})`);
    });
    if (brandTags.length > 10) {
      console.log(`  ... and ${brandTags.length - 10} more`);
    }
    console.log();

    // 2. Load videos to process
    console.log("Loading videos...");
    const where: any = {
      status: "READY",
      chunksJSON: { not: null },
    };

    if (videoIdArg) {
      where.videoId = videoIdArg;
    }

    const videos = await prisma.videoIndex.findMany({
      where,
      select: {
        id: true,
        videoId: true,
        title: true,
        brandTags: true,
        chunksJSON: true,
      },
      orderBy: { updatedAt: "desc" },
      take: limitArg || undefined,
    });

    console.log(`Found ${videos.length} videos to process\n`);

    if (videos.length === 0) {
      console.log("No videos found with status READY and transcript");
      return;
    }

    // 3. Process each video
    let updatedCount = 0;
    let unchangedCount = 0;
    let errorCount = 0;

    for (const [index, video] of videos.entries()) {
      console.log(`\n[${index + 1}/${videos.length}] Processing: ${video.title}`);
      console.log(`Video ID: ${video.videoId}`);

      try {
        // Parse transcript
        const chunks = JSON.parse(video.chunksJSON!);
        const transcriptText = Array.isArray(chunks) ? chunks.join(" ") : String(chunks);

        // Find brand matches
        const matches = findBrandMatches(video.title, transcriptText, brandTags);

        // Extract unique brand names
        const newBrandTags = [...new Set(matches.map(m => m.brand))].sort();
        const currentBrandTags = video.brandTags.sort();

        console.log(`Current brands (${currentBrandTags.length}): ${JSON.stringify(currentBrandTags)}`);
        console.log(`Detected brands (${newBrandTags.length}): ${JSON.stringify(newBrandTags)}`);

        // Show match details
        if (matches.length > 0) {
          console.log("Match details:");
          matches.forEach((m) => {
            console.log(`  - ${m.brand} (${m.category}) - matched in ${m.matchedIn}`);
          });
        }

        // Check if update is needed
        const tagsAreSame = JSON.stringify(currentBrandTags) === JSON.stringify(newBrandTags);

        if (tagsAreSame) {
          console.log("Status: No changes needed ⏭️");
          unchangedCount++;
        } else {
          if (dryRun) {
            console.log("Status: Would update (DRY RUN) 📝");
          } else {
            await prisma.videoIndex.update({
              where: { id: video.id },
              data: { brandTags: newBrandTags },
            });
            console.log("Status: Updated ✅");
          }
          updatedCount++;
        }

        // Throttle to avoid overwhelming the database
        if (index < videos.length - 1 && (index + 1) % 10 === 0) {
          console.log("\n⏸️  Pausing 1 second...");
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      } catch (error) {
        console.error(`Error processing video ${video.videoId}:`, error);
        errorCount++;
      }
    }

    // Summary
    console.log("\n=== Summary ===");
    console.log(`Total processed: ${videos.length}`);
    console.log(`Updated: ${updatedCount}`);
    console.log(`Unchanged: ${unchangedCount}`);
    console.log(`Errors: ${errorCount}`);

    if (dryRun) {
      console.log("\nℹ️  This was a DRY RUN. Run without --dry-run to save changes.");
    }
  } catch (error) {
    console.error("Fatal error:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then(() => {
    console.log("\n✅ Script completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Script failed:", error);
    process.exit(1);
  });
