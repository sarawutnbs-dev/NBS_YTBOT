// Simple script to trigger video indexing
// Usage: node scripts/trigger-indexing.mjs <videoId>

const videoId = process.argv[2] || 'iyR0Bb3Vjnk';

async function triggerIndexing() {
  console.log(`[Trigger] Importing ensureVideoIndex function...`);

  // Dynamic import to use ES modules
  const { ensureVideoIndex } = await import('../lib/videoIndexService.js');

  console.log(`[Trigger] Calling ensureVideoIndex for videoId: ${videoId}`);

  try {
    const result = await ensureVideoIndex(videoId, { forceReindex: true });
    console.log(`[Trigger] Result:`, JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(`[Trigger] Error:`, error);
    process.exit(1);
  }
}

triggerIndexing();
