import dotenv from 'dotenv';
dotenv.config({ path: '.env.local', override: true });
dotenv.config({ override: false });

import { prisma } from '@/lib/db';
import { google } from 'googleapis';

async function main() {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw new Error('Missing YOUTUBE_API_KEY in env');

  const comment = await prisma.comment.findFirst({ orderBy: { createdAt: 'desc' } });
  if (!comment) {
    console.log('❌ No comments in DB');
    return;
  }

  const youtube = google.youtube({ version: 'v3', auth: apiKey });
  const { data } = await youtube.videos.list({ part: ['snippet'], id: [comment.videoId] });
  const video = data.items?.[0];
  if (!video) {
    console.log('❌ Video metadata not found for', comment.videoId);
    return;
  }

  console.log('🧭 Latest comment context:');
  console.log(`   Video ID: ${comment.videoId}`);
  console.log(`   Channel ID: ${video.snippet?.channelId}`);
  console.log(`   Channel Title: ${video.snippet?.channelTitle}`);
}

main().catch((err) => {
  console.error('Failed:', err?.message || err);
  process.exit(1);
});
