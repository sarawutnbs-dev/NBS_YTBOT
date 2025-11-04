import dotenv from 'dotenv';
// Load .env.local first, then fallback to .env
dotenv.config({ path: '.env.local', override: true });
dotenv.config({ override: false });
import { google } from 'googleapis';
import { prisma } from '@/lib/db';
import { upsertOAuthToken } from '@/lib/youtubeWrite';

async function main() {
  console.log('\n🛠️  Upserting YouTube OAuth token into DB');

  const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
  const NEXTAUTH_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000';
  const REFRESH_TOKEN = process.env.YOUTUBE_OAUTH_REFRESH_TOKEN;

  console.log(`🔑 Using refresh token: ${REFRESH_TOKEN ? (REFRESH_TOKEN.substring(0, 12) + '...') : 'MISSING'}`);

  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
    throw new Error('Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / YOUTUBE_OAUTH_REFRESH_TOKEN in env');
  }

  // Determine target email from env or CLI arg
  const targetEmail = process.env.TARGET_EMAIL || process.argv[2];
  if (!targetEmail) {
    throw new Error('Please provide TARGET_EMAIL env or pass email as first argument');
  }

  // Ensure target user exists and is allowed
  const targetUser = await prisma.user.upsert({
    where: { email: targetEmail },
    update: { allowed: true },
    create: { email: targetEmail, allowed: true, role: 'ADMIN' as any }
  });

  console.log(`👤 Target user: ${targetUser.email} (allowed=${targetUser.allowed}, role=${targetUser.role})`);

  // Build OAuth client and exchange refresh token for access token
  const oauth2Client = new google.auth.OAuth2(
    CLIENT_ID,
    CLIENT_SECRET,
    `${NEXTAUTH_URL}/api/auth/callback/google`
  );

  oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });

  console.log('🔄 Refreshing access token from provided refresh token...');
  const { credentials } = await oauth2Client.refreshAccessToken();

  if (!credentials.access_token) {
    throw new Error('Failed to obtain access token from refresh token');
  }

  console.log('✅ Access token obtained');
  console.log(`   Expires: ${credentials.expiry_date ? new Date(credentials.expiry_date).toISOString() : 'unknown'}`);
  console.log(`   Scope: ${credentials.scope}`);

  await upsertOAuthToken(targetUser.id, {
    accessToken: credentials.access_token,
    refreshToken: REFRESH_TOKEN,
    expiryDate: credentials.expiry_date ? new Date(credentials.expiry_date) : null,
    scope: credentials.scope || undefined
  });

  console.log('💾 Token upserted into database successfully');
}

main()
  .catch(async (err) => {
    console.error('❌ Failed to upsert token:', err?.message || err);
    if (err?.response?.data) {
      console.error('API error:', err.response.data);
    }
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
