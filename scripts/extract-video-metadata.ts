/**
 * Extract metadata (categoryTags, brandTags, priceRange) from video transcripts
 * This script uses AI to analyze transcripts and extract structured metadata
 */

import dotenv from 'dotenv';
dotenv.config({ path: '.env.local', override: true });
dotenv.config({ override: false });

import { PrismaClient, IndexStatus } from '@prisma/client';
import { chatCompletion } from '@/lib/rag/openai';

const prisma = new PrismaClient();

interface ExtractedMetadata {
  categoryTags: string[];
  brandTags: string[];
  priceRangeMin: number | null;
  priceRangeMax: number | null;
}

/**
 * Extract metadata from transcript using AI
 */
async function extractMetadata(transcript: string, videoTitle: string): Promise<ExtractedMetadata> {
  const systemPrompt = `คุณคือ AI ที่เชี่ยวชาญในการวิเคราะห์เนื้อหาวิดีโอ Notebook, PC Component และ Smartphone

จงวิเคราะห์ transcript และ extract metadata ต่อไปนี้:

1. categoryTags: หมวดหมู่ที่กล่าวถึง (เลือกจาก: "Notebook", "PC Component", "Smartphone", "GPU", "CPU", "RAM", "SSD", "Monitor", "Keyboard", "Mouse")
2. brandTags: แบรนด์ที่กล่าวถึง (เช่น "ASUS", "MSI", "Lenovo", "HP", "Dell", "Acer", "Apple", "Samsung", "Intel", "AMD", "NVIDIA")
3. priceRangeMin: ราคาต่ำสุดที่กล่าวถึง (บาท)
4. priceRangeMax: ราคาสูงสุดที่กล่าวถึง (บาท)

Return valid JSON only:
{
  "categoryTags": ["..."],
  "brandTags": ["..."],
  "priceRangeMin": 10000,
  "priceRangeMax": 50000
}

หมายเหตุ:
- ถ้าไม่มีราคาให้ใส่ null
- ให้ระบุเฉพาะหมวดหมู่และแบรนด์ที่กล่าวถึงชัดเจนใน transcript เท่านั้น
- ถ้าไม่มีข้อมูลให้ส่ง array ว่าง []
`;

  const userPrompt = `Video Title: ${videoTitle}

Transcript (first 3000 chars):
${transcript.substring(0, 3000)}

กรุณาวิเคราะห์และ extract metadata เป็น JSON`;

  try {
    const response = await chatCompletion(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      {
        maxTokens: 1000,
        jsonMode: true
      }
    );

    // Parse JSON response
    const cleanedResponse = response.trim()
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '');

    const parsed = JSON.parse(cleanedResponse);

    return {
      categoryTags: Array.isArray(parsed.categoryTags) ? parsed.categoryTags : [],
      brandTags: Array.isArray(parsed.brandTags) ? parsed.brandTags : [],
      priceRangeMin: typeof parsed.priceRangeMin === 'number' ? parsed.priceRangeMin : null,
      priceRangeMax: typeof parsed.priceRangeMax === 'number' ? parsed.priceRangeMax : null,
    };
  } catch (error) {
    console.error('Failed to extract metadata:', error);
    return {
      categoryTags: [],
      brandTags: [],
      priceRangeMin: null,
      priceRangeMax: null,
    };
  }
}

/**
 * Process all videos that need metadata extraction
 */
async function main() {
  console.log('\n🔍 Extracting metadata from video transcripts...');
  console.log('='.repeat(80));

  // Get all READY videos
  const videos = await prisma.videoIndex.findMany({
    where: {
      status: IndexStatus.READY,
      chunksJSON: { not: null },
    },
    select: {
      videoId: true,
      title: true,
      chunksJSON: true,
      categoryTags: true,
      brandTags: true,
      priceRangeMin: true,
      priceRangeMax: true,
    },
    orderBy: { updatedAt: 'desc' },
  });

  console.log(`Found ${videos.length} READY videos`);

  // Filter videos that need metadata extraction
  const videosNeedingMetadata = videos.filter(v => {
    const hasCategories = v.categoryTags && v.categoryTags.length > 0;
    const hasBrands = v.brandTags && v.brandTags.length > 0;
    const hasPriceRange = v.priceRangeMin !== null && v.priceRangeMax !== null;

    return !hasCategories || !hasBrands || !hasPriceRange;
  });

  console.log(`Found ${videosNeedingMetadata.length} videos needing metadata extraction`);

  if (videosNeedingMetadata.length === 0) {
    console.log('✅ All videos have metadata!');
    return;
  }

  let processed = 0;
  let updated = 0;

  for (const video of videosNeedingMetadata) {
    try {
      console.log(`\n[${processed + 1}/${videosNeedingMetadata.length}] Processing ${video.videoId}: ${video.title}`);

      // Parse transcript
      let transcript = '';
      if (video.chunksJSON) {
        try {
          const chunks = JSON.parse(video.chunksJSON);
          transcript = Array.isArray(chunks) ? chunks.join(' ') : '';
        } catch (e) {
          console.error('Failed to parse chunksJSON:', e);
          continue;
        }
      }

      if (!transcript || transcript.length < 100) {
        console.log('⏭️  Skipping - transcript too short');
        continue;
      }

      // Extract metadata
      console.log('🤖 Extracting metadata with AI...');
      const metadata = await extractMetadata(transcript, video.title);

      console.log('📊 Extracted metadata:', {
        categoryTags: metadata.categoryTags,
        brandTags: metadata.brandTags,
        priceRange: [metadata.priceRangeMin, metadata.priceRangeMax],
      });

      // Update database
      await prisma.videoIndex.update({
        where: { videoId: video.videoId },
        data: {
          categoryTags: metadata.categoryTags,
          brandTags: metadata.brandTags,
          priceRangeMin: metadata.priceRangeMin,
          priceRangeMax: metadata.priceRangeMax,
        },
      });

      updated++;
      console.log('✅ Updated');

      processed++;

      // Add delay to avoid rate limiting
      if (processed < videosNeedingMetadata.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error: any) {
      console.error(`❌ Failed to process ${video.videoId}:`, error.message);
      processed++;
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log(`✅ Completed: ${updated}/${processed} videos updated`);
}

main()
  .catch((err) => {
    console.error('\n❌ Fatal error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
