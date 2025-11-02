# How to Get YouTube OAuth Refresh Token

This guide explains how to obtain a YouTube OAuth refresh token using the `get-youtube-refresh-token.js` script.

## Prerequisites

1. **Google Cloud Project** with YouTube Data API v3 enabled
2. **OAuth 2.0 Client ID** configured in Google Cloud Console
3. **Environment variables** set in `.env` or `.env.local`:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`

## Setup Instructions

### Step 1: Configure Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Select your project or create a new one
3. Enable **YouTube Data API v3**:
   - Go to "APIs & Services" > "Library"
   - Search for "YouTube Data API v3"
   - Click "Enable"

4. Create OAuth 2.0 Credentials:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth 2.0 Client ID"
   - Application type: "Web application"
   - Name: "YouTube Bot OAuth"
   - Authorized redirect URIs: Add `http://localhost:3000/oauth2callback`
   - Click "Create"
   - Copy the **Client ID** and **Client Secret**

5. Configure OAuth Consent Screen:
   - Go to "APIs & Services" > "OAuth consent screen"
   - Add the following scope:
     - `https://www.googleapis.com/auth/youtube.force-ssl`
   - Add your Google account as a test user (if in testing mode)

### Step 2: Set Environment Variables

Add to your `.env` or `.env.local` file:

```env
GOOGLE_CLIENT_ID="your-client-id-here.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your-client-secret-here"
```

### Step 3: Install Dependencies

The script requires the `open` package. Install it:

```bash
npm install open
```

or if you don't have it:

```bash
npm install open --save-dev
```

### Step 4: Run the Script

**IMPORTANT**: Before running this script, you need to **stop your dev server** because both use port 3000.

```bash
# Stop the dev server first (Ctrl+C in the terminal where it's running)

# Then run the script
node get-youtube-refresh-token.js
```

### Step 5: Authorize the Application

1. The script will automatically open your browser
2. If it doesn't open automatically, copy the URL from the console
3. Select your Google account
4. Review the permissions:
   - "Manage your YouTube account"
   - This is required for posting comments
5. Click "Allow"
6. You'll be redirected to `http://localhost:3000/oauth2callback`
7. The script will automatically:
   - Extract the authorization code
   - Exchange it for access and refresh tokens
   - Save the refresh token to your `.env` file

### Step 6: Verify the Refresh Token

Check your `.env` or `.env.local` file. You should see:

```env
# YouTube OAuth Refresh Token
YOUTUBE_OAUTH_REFRESH_TOKEN="1//your-refresh-token-here"
```

### Step 7: Restart Your Dev Server

```bash
npm run dev
```

## What the Script Does

The script performs the following steps:

1. **Validates** environment variables (CLIENT_ID, CLIENT_SECRET)
2. **Creates** OAuth2 client with googleapis library
3. **Generates** authorization URL with:
   - `access_type: 'offline'` - ensures refresh_token is returned
   - `prompt: 'consent'` - forces consent screen (required for refresh_token)
   - `scope: youtube.force-ssl` - YouTube Data API v3 permissions
4. **Starts** local HTTP server on port 3000 to handle OAuth callback
5. **Opens** browser to authorization URL
6. **Receives** authorization code from Google redirect
7. **Exchanges** code for access_token and refresh_token
8. **Saves** refresh_token to `.env` file automatically
9. **Displays** all token information in console

## Important Notes

### Port 3000 Conflict

- The script uses port 3000 for the OAuth callback
- You **MUST stop your Next.js dev server** before running this script
- After getting the token, restart your dev server

### Refresh Token Not Received?

If you don't get a refresh_token, it means you've already authorized this app before. To fix:

1. Go to [Google Account Permissions](https://myaccount.google.com/permissions)
2. Find your application
3. Click "Remove Access"
4. Run the script again
5. Authorize the application again

### Security

- **Never commit** your `.env` file to version control
- **Never share** your refresh token publicly
- Add `.env` and `.env.local` to `.gitignore`
- The refresh token allows long-term access to the YouTube account

### Token Expiration

- **Access Token**: Expires after ~1 hour
- **Refresh Token**: Never expires (unless revoked)
- Your app should use the refresh token to get new access tokens automatically
- The existing code in `lib/youtubeWrite.ts` already handles this!

## Troubleshooting

### Error: Port 3000 is already in use

**Solution**: Stop your Next.js dev server first

```bash
# Windows
taskkill //F //IM node.exe

# Then run the script again
node get-youtube-refresh-token.js
```

### Error: Missing required environment variables

**Solution**: Make sure you have `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in your `.env` file

### Error: Redirect URI mismatch

**Solution**: Make sure you added `http://localhost:3000/oauth2callback` to the authorized redirect URIs in Google Cloud Console

### Browser doesn't open automatically

**Solution**: Copy the URL from the console and paste it into your browser manually

## Using the Refresh Token

Once you have the refresh token saved in your `.env` file, your application can use it to authenticate YouTube API requests.

The existing code in your project already handles this:

```typescript
// lib/youtubeWrite.ts already has the logic
import { replyToComment } from "@/lib/youtubeWrite";

// Post a reply to YouTube
const response = await replyToComment({
  userId: "user-id",
  parentId: "youtube-comment-id",
  text: "Your reply text"
});
```

The `getYouTubeClientForUser()` function in `lib/youtubeWrite.ts` automatically:
1. Retrieves the refresh token from the database
2. Uses it to get a new access token if the current one is expired
3. Returns a ready-to-use YouTube API client

## Next Steps

After obtaining the refresh token:

1. **Restart your dev server**: `npm run dev`
2. **Logout and login** to your app at http://localhost:3000
3. **Check tokens in database**: `npx tsx check-tokens.ts`
4. **Test posting a reply** in the moderation UI

## Files Created

- `get-youtube-refresh-token.js` - Main script to get refresh token
- `GET-YOUTUBE-TOKEN-GUIDE.md` - This guide (documentation)

## Alternative: Using NextAuth Flow

Instead of using this script, you can also get the refresh token through the NextAuth login flow:

1. Make sure `lib/auth.ts` has the YouTube scope configured (already done)
2. Logout from your app: http://localhost:3000/api/auth/signout
3. Login again: http://localhost:3000
4. Accept YouTube permissions
5. The tokens will be automatically stored in the database

The advantage of the NextAuth flow is that it's integrated into your application. However, this script is useful for:
- Getting a standalone refresh token
- Testing OAuth flow independently
- Debugging authentication issues
- Understanding how OAuth 2.0 works
