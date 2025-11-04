/**
 * Google OAuth 2.0 - Get YouTube Refresh Token
 *
 * This script helps you obtain a refresh_token for YouTube Data API v3
 * Follow the steps below to get your refresh token.
 *
 * Usage:
 * 1. Make sure you have GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env file
 * 2. Run: node get-youtube-refresh-token.js
 * 3. Visit the URL shown in console
 * 4. Authorize the app
 * 5. Copy the code from the redirect URL
 * 6. Paste it back into the console
 * 7. Your refresh token will be saved to .env file
 */

const { google } = require('googleapis');
const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
require('dotenv').config();

// Load .env.local if present (overrides defaults)
const envLocalPath = path.join(__dirname, '.env.local');
if (fs.existsSync(envLocalPath)) {
  require('dotenv').config({ path: envLocalPath });
}

// ============================================================================
// STEP 1: Configuration
// ============================================================================

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:3000/oauth2callback';

// YouTube Data API v3 scope
const SCOPES = ['https://www.googleapis.com/auth/youtube.force-ssl'];

// ============================================================================
// STEP 2: Validate Environment Variables
// ============================================================================

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('\n❌ Error: Missing required environment variables!');
  console.error('   Please make sure you have the following in your .env file:');
  console.error('   - GOOGLE_CLIENT_ID');
  console.error('   - GOOGLE_CLIENT_SECRET\n');
  process.exit(1);
}

console.log('\n✅ Environment variables loaded successfully\n');

// ============================================================================
// STEP 3: Create OAuth2 Client
// ============================================================================

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

function ensureTokenKey() {
  if (!process.env.TOKEN_ENCRYPTION_KEY) {
    throw new Error('TOKEN_ENCRYPTION_KEY is required to encrypt refresh tokens');
  }
  return crypto.createHash('sha256').update(process.env.TOKEN_ENCRYPTION_KEY).digest();
}

function encryptRefreshToken(refreshToken) {
  const key = ensureTokenKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(refreshToken, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

async function upsertRefreshTokenInDb(tokens) {
  if (!tokens.refresh_token) {
    console.log('\n⚠️  Skipping DB update because refresh token is missing');
    return;
  }

  console.log('\n================================================================================');
  console.log('STEP 4: Update Refresh Token in Database');
  console.log('================================================================================\n');

  const prisma = new PrismaClient();

  try {
    const users = await prisma.user.findMany({
      where: { allowed: true },
      orderBy: { createdAt: 'asc' }
    });

    if (!users.length) {
      throw new Error('No allowed users found in database. Add an allowed user first.');
    }

    const targetUser = users[0];
    console.log(`👥 Using user: ${targetUser.email} (${targetUser.id})`);

    const oauthClient = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
    oauthClient.setCredentials({ refresh_token: tokens.refresh_token });

    const accessTokenResponse = await oauthClient.getAccessToken();
    const accessToken = typeof accessTokenResponse === 'string'
      ? accessTokenResponse
      : accessTokenResponse?.token;

    if (!accessToken) {
      throw new Error('Failed to obtain access token from refresh token');
    }

    const tokenInfo = await oauthClient.getTokenInfo(accessToken);
    const inferredScopes = tokenInfo.scopes || (tokenInfo.scope ? tokenInfo.scope.split(/[,\s]+/) : []);
    const scope = inferredScopes.join(' ');
    const expiresAt = tokens.expiry_date
      ? new Date(tokens.expiry_date)
      : accessTokenResponse?.res?.data?.expiry_date
        ? new Date(accessTokenResponse.res.data.expiry_date)
        : new Date(Date.now() + 3600 * 1000);

    if (!scope.includes('youtube')) {
      console.warn('⚠️  WARNING: youtube scope not present in access token!');
    }

    const encryptedRefreshToken = encryptRefreshToken(tokens.refresh_token);

    await prisma.oAuthToken.upsert({
      where: {
        userId_provider: {
          userId: targetUser.id,
          provider: 'google'
        }
      },
      update: {
        accessToken,
        refreshToken: encryptedRefreshToken,
        expiresAt,
        scope
      },
      create: {
        userId: targetUser.id,
        provider: 'google',
        accessToken,
        refreshToken: encryptedRefreshToken,
        expiresAt,
        scope
      }
    });

    console.log('\n✅ Refresh token stored in database');
    console.log(`   Access Token: ${accessToken.substring(0, 20)}...`);
    console.log(`   Scope: ${scope}`);
    console.log(`   Expires: ${expiresAt.toISOString()}\n`);

    // Quick verification call to YouTube API
    try {
      const youtube = google.youtube({ version: 'v3', auth: oauthClient });
      const channelResponse = await youtube.channels.list({ part: ['id'], mine: true });
      const channelCount = channelResponse.data.items?.length || 0;
      if (channelCount > 0) {
        console.log('✅ Verified YouTube API access (channels.list)');
      } else {
        console.warn('⚠️  Unable to verify YouTube API access (no channels returned)');
      }
    } catch (verifyError) {
      console.warn('⚠️  Warning: Failed to verify YouTube API access:', verifyError.message);
    }

    process.env.YOUTUBE_OAUTH_REFRESH_TOKEN = tokens.refresh_token;

  } finally {
    await prisma.$disconnect();
  }
}

// ============================================================================
// STEP 4: Generate Authorization URL
// ============================================================================

/**
 * Generate the URL that users will visit to authorize the application
 * - access_type: 'offline' ensures we get a refresh_token
 * - prompt: 'consent' forces the consent screen (required to get refresh_token)
 */
const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: SCOPES,
});

console.log('================================================================================');
console.log('🔐 Google OAuth 2.0 - YouTube Refresh Token Generator');
console.log('================================================================================\n');

console.log('📋 Configuration:');
console.log(`   Client ID: ${CLIENT_ID.substring(0, 20)}...`);
console.log(`   Redirect URI: ${REDIRECT_URI}`);
console.log(`   Scopes: ${SCOPES.join(', ')}\n`);

console.log('================================================================================');
console.log('STEP 1: Authorize the Application');
console.log('================================================================================\n');

console.log('🌐 Please visit this URL to authorize the application:\n');
console.log(`   ${authUrl}\n`);

// ============================================================================
// STEP 5: Start Local Server to Handle OAuth Callback
// ============================================================================

/**
 * Create a local HTTP server to handle the OAuth callback
 * This server will:
 * 1. Receive the authorization code from Google
 * 2. Exchange it for access_token and refresh_token
 * 3. Save the refresh_token to .env file
 */
const server = http.createServer(async (req, res) => {
  try {
    // Only handle the callback path
    if (!req.url.startsWith('/oauth2callback')) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }

    // Parse the URL to get the authorization code
    const qs = new url.URL(req.url, `http://localhost:3000`).searchParams;
    const code = qs.get('code');
    const error = qs.get('error');

    // ========================================================================
    // Handle Authorization Errors
    // ========================================================================

    if (error) {
      console.error('\n❌ Authorization failed:', error);
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <html>
          <body style="font-family: Arial; padding: 40px; text-align: center;">
            <h1 style="color: red;">❌ Authorization Failed</h1>
            <p>Error: ${error}</p>
            <p>You can close this window and try again.</p>
          </body>
        </html>
      `);
      server.close();
      process.exit(1);
      return;
    }

    if (!code) {
      res.writeHead(400);
      res.end('Missing authorization code');
      return;
    }

    console.log('\n✅ Authorization code received!\n');
    console.log('================================================================================');
    console.log('STEP 2: Exchange Authorization Code for Tokens');
    console.log('================================================================================\n');

    // ========================================================================
    // STEP 6: Exchange Authorization Code for Tokens
    // ========================================================================

    console.log('🔄 Exchanging authorization code for access token and refresh token...\n');

    const { tokens } = await oauth2Client.getToken(code);

    console.log('✅ Tokens received successfully!\n');
    console.log('📊 Token Information:');
    console.log(`   Access Token: ${tokens.access_token ? '✅ Received' : '❌ Missing'}`);
    console.log(`   Refresh Token: ${tokens.refresh_token ? '✅ Received' : '❌ Missing'}`);
    console.log(`   Expiry Date: ${tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : 'Not set'}`);
    console.log(`   Token Type: ${tokens.token_type || 'Not set'}`);
    console.log(`   Scope: ${tokens.scope || 'Not set'}\n`);

    // ========================================================================
    // STEP 7: Validate Refresh Token
    // ========================================================================

    if (!tokens.refresh_token) {
      console.error('⚠️  WARNING: No refresh token received!');
      console.error('   This usually happens when:');
      console.error('   1. You have already authorized this app before');
      console.error('   2. You need to revoke access at: https://myaccount.google.com/permissions');
      console.error('   3. Then run this script again\n');
    }

    // ========================================================================
    // STEP 8: Save Refresh Token to .env File
    // ========================================================================

    if (tokens.refresh_token) {
      console.log('================================================================================');
      console.log('STEP 3: Save Refresh Token to .env File');
      console.log('================================================================================\n');

      const envPath = path.join(__dirname, '.env');
      const envLocalPath = path.join(__dirname, '.env.local');

      // Determine which .env file to update
      let targetEnvFile = envPath;
      if (fs.existsSync(envLocalPath)) {
        targetEnvFile = envLocalPath;
      }

      console.log(`💾 Saving to: ${path.basename(targetEnvFile)}\n`);

      // Read existing .env content
      let envContent = '';
      if (fs.existsSync(targetEnvFile)) {
        envContent = fs.readFileSync(targetEnvFile, 'utf8');
      }

      // Check if YOUTUBE_OAUTH_REFRESH_TOKEN already exists
      const refreshTokenKey = 'YOUTUBE_OAUTH_REFRESH_TOKEN';
      const refreshTokenLine = `${refreshTokenKey}="${tokens.refresh_token}"`;

      if (envContent.includes(refreshTokenKey)) {
        // Replace existing refresh token
        envContent = envContent.replace(
          new RegExp(`${refreshTokenKey}=.*`),
          refreshTokenLine
        );
        console.log('   ✅ Updated existing YOUTUBE_OAUTH_REFRESH_TOKEN\n');
      } else {
        // Add new refresh token
        envContent += `\n# YouTube OAuth Refresh Token\n${refreshTokenLine}\n`;
        console.log('   ✅ Added new YOUTUBE_OAUTH_REFRESH_TOKEN\n');
      }

      // Write back to .env file
      fs.writeFileSync(targetEnvFile, envContent);

      console.log('================================================================================');
      console.log('🎉 SUCCESS! Refresh Token Saved');
      console.log('================================================================================\n');

      console.log('📝 Your refresh token:');
      console.log(`   ${tokens.refresh_token}\n`);

      console.log('💡 Next Steps:');
      console.log('   1. Restart your application to load the new environment variable');
      console.log('   2. Your app can now use the refresh token to get new access tokens');
      console.log('   3. Keep your refresh token secure and never commit it to version control\n');

      try {
        await upsertRefreshTokenInDb(tokens);
      } catch (dbError) {
        console.error('\n❌ Failed to update refresh token in database:', dbError.message);
        console.error('   You can run: npx tsx scripts/update-refresh-token.ts\n');
      }
    }

    // ========================================================================
    // STEP 9: Display All Token Information
    // ========================================================================

    console.log('================================================================================');
    console.log('📋 Complete Token Information (for debugging)');
    console.log('================================================================================\n');
    console.log(JSON.stringify(tokens, null, 2));
    console.log('\n');

    // Send success response to browser
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <html>
        <body style="font-family: Arial; padding: 40px; text-align: center;">
          <h1 style="color: green;">✅ Success!</h1>
          <h2>Authorization completed successfully</h2>
          <p><strong>Refresh Token:</strong> ${tokens.refresh_token ? 'Saved to .env file' : 'Not received (see console)'}</p>
          <p>You can close this window now.</p>
          <p>Check your terminal for the complete token information.</p>
        </body>
      </html>
    `);

    // Close the server after successful authentication
    server.close();

  } catch (error) {
    console.error('\n❌ Error during token exchange:', error.message);
    console.error('Full error:', error);

    res.writeHead(500, { 'Content-Type': 'text/html' });
    res.end(`
      <html>
        <body style="font-family: Arial; padding: 40px; text-align: center;">
          <h1 style="color: red;">❌ Error</h1>
          <p>${error.message}</p>
          <p>Check your terminal for more details.</p>
        </body>
      </html>
    `);

    server.close();
    process.exit(1);
  }
});

// ============================================================================
// STEP 10: Start Server and Try to Open Browser
// ============================================================================

server.listen(3000, async () => {
  console.log('🚀 Local server started on http://localhost:3000');
  console.log('   Waiting for OAuth callback...\n');

  // Try to open the browser using dynamic import
  try {
    const open = (await import('open')).default;
    await open(authUrl);
    console.log('   ✅ Browser opened automatically\n');
  } catch (error) {
    console.log('   ⚠️  Could not open browser automatically.');
    console.log('   Please copy and paste the URL above into your browser.\n');
  }
});

// Handle server errors
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error('\n❌ Error: Port 3000 is already in use!');
    console.error('   Please stop any other applications using port 3000 and try again.\n');
  } else {
    console.error('\n❌ Server error:', error.message);
  }
  process.exit(1);
});

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\n\n⚠️  Process interrupted by user');
  console.log('   Closing server...\n');
  server.close();
  process.exit(0);
});
