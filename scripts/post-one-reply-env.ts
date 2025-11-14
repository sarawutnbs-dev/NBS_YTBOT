import dotenv from 'dotenv';
dotenv.config({ override: true });
dotenv.config({ override: false });

import { google } from 'googleapis';
import { prisma } from '@/lib/db';

async function main() {
  console.log('\n🧪 Posting a single YouTube reply using ENV refresh token');
  console.log('='.repeat(80));

  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, NEXTAUTH_URL, YOUTUBE_OAUTH_REFRESH_TOKEN } = process.env as Record<string, string | undefined>;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !YOUTUBE_OAUTH_REFRESH_TOKEN) {
    throw new Error('Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / YOUTUBE_OAUTH_REFRESH_TOKEN in env');
  }

  const target = await prisma.comment.findFirst({ where: { canReply: true }, orderBy: { createdAt: 'desc' } });
  if (!target) {
    console.log('❌ No comments available to reply to. Aborting.');
    process.exit(1);
  }

  const oauth2Client = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    `${NEXTAUTH_URL || 'http://localhost:3000'}/api/auth/callback/google`
  );
  oauth2Client.setCredentials({ refresh_token: YOUTUBE_OAUTH_REFRESH_TOKEN });

  console.log('🔄 Refreshing access token...');
  const { credentials } = await oauth2Client.refreshAccessToken();
  if (!credentials.access_token) throw new Error('Failed to obtain access token from refresh token');
  console.log('✅ Access token obtained');
  console.log(`   Scope: ${credentials.scope}`);

  const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
  const text = 'ขอบคุณสำหรับคอมเมนต์ครับ 🙏 (ทดสอบโพสต์จากระบบ NBS ด้วย ENV Token)';

  console.log('📤 Posting reply via YouTube API...');
  const response = await youtube.comments.insert({
    part: ['snippet'],
    requestBody: { snippet: { parentId: target.commentId, textOriginal: text } }
  });

  console.log('✅ Reply posted successfully!');
  console.log(`   YouTube Reply ID: ${response.data.id}`);
  console.log(`   Published at: ${response.data.snippet?.publishedAt}`);
}

main()
  .catch((err) => {
    console.error('\n❌ Failed to post with ENV token:', err?.message || err);
    if ((err as any)?.response?.data) {
      console.error('API error:', (err as any).response.data);
    }
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
