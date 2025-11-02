# YouTube Token Refresh Implementation

## What Was Done

I successfully refactored your YouTube API reply functionality to use the existing token management infrastructure with automatic refresh capability.

### Changes Made:

#### 1. **lib/auth.ts** - Added Database Token Storage
- Imported `upsertOAuthToken` from `lib/youtubeWrite.ts`
- Updated JWT callback to save OAuth tokens to database (OAuthToken table)
- Tokens are now stored in TWO places:
  - JWT session (for quick access)
  - Database with encryption (for long-term storage and refresh)

```typescript
// Store OAuth tokens in JWT
if (account) {
  token.accessToken = account.access_token;
  token.refreshToken = account.refresh_token;

  // Also store tokens in database for YouTube API with automatic refresh
  if (token.id && account.access_token) {
    await upsertOAuthToken(token.id as string, {
      accessToken: account.access_token,
      refreshToken: account.refresh_token ?? null,
      expiryDate: account.expires_at ? new Date(account.expires_at * 1000) : null,
      scope: account.scope ?? null
    });
  }
}
```

#### 2. **app/api/comments/[id]/reply/route.ts** - Simplified with Auto-Refresh
- Removed manual Google OAuth2 client setup
- Removed manual YouTube API client creation
- Now uses `replyToComment()` from `lib/youtubeWrite.ts`
- **Benefits**:
  - Automatic token refresh when expired
  - Encrypted token storage
  - Cleaner code (went from ~40 lines to ~10 lines)
  - Better error handling

```typescript
// Old approach (manual, no refresh):
const oauth2Client = new google.auth.OAuth2(...);
oauth2Client.setCredentials({ access_token, refresh_token });
const youtube = google.youtube({ version: "v3", auth: oauth2Client });
const response = await youtube.comments.insert(...);

// New approach (automatic refresh):
const response = await replyToComment({
  userId: session.user.id,
  parentId: comment.commentId,
  text: comment.draft.reply
});
```

## How Token Refresh Works

The existing `lib/youtubeWrite.ts` infrastructure handles everything:

1. **Token Storage**: Tokens are stored encrypted in the `OAuthToken` table
2. **Token Retrieval**: `getStoredToken()` decrypts and retrieves tokens
3. **Auto-Refresh**: Google OAuth2 client automatically refreshes expired access tokens using the refresh token
4. **YouTube Client**: `getYouTubeClientForUser()` creates a YouTube client with all credentials configured

## What You Need to Do Now

### Step 1: Logout and Login Again

Your current session doesn't have YouTube tokens stored in the database yet. You need to:

1. **Logout**:
   - Go to http://localhost:3001/api/auth/signout
   - Or click "Sign Out" in your app

2. **Login**:
   - Go to http://localhost:3001
   - Login with Google
   - **IMPORTANT**: Google will ask for YouTube permissions - **Accept All**

3. **Verify**:
   - Check the server logs for:
     ```
     [Auth] 💾 Storing OAuth tokens in database
     [Auth] ✅ Tokens stored successfully
     ```

### Step 2: Verify Tokens in Database

After logging in, you can check if tokens are stored:

```bash
cd NBS_YTBOT
npx tsx check-tokens.ts
```

I'll create this script for you to verify the tokens are stored correctly.

### Step 3: Test Posting a Reply

1. Go to http://localhost:3001/dashboard/moderation
2. Find a PENDING comment
3. Click the expand button (▶)
4. Click "Post"
5. Check server logs for:
   ```
   [API] 📤 Posting reply to YouTube...
   [API] ✅ Reply posted to YouTube: [youtube-comment-id]
   ```

## Benefits of This Implementation

1. **Automatic Token Refresh** - No more 403 errors from expired tokens
2. **Encrypted Storage** - Refresh tokens are encrypted in database
3. **Better Error Handling** - Clear error messages when tokens are missing
4. **Future-Proof** - All YouTube API calls can use this infrastructure
5. **Cleaner Code** - One function call instead of 40 lines of setup

## Troubleshooting

### If you get "Missing YouTube OAuth credentials" error:

1. Check if you logged out and logged in again after the code changes
2. Verify tokens in database using the check-tokens.ts script
3. Make sure Google OAuth Consent Screen includes YouTube scope
4. Check that YouTube Data API v3 is enabled in Google Cloud Console

### If you get 403 "Insufficient permissions" error:

1. Check Google Cloud Console: https://console.cloud.google.com/apis/credentials
2. Verify OAuth Consent Screen includes: `https://www.googleapis.com/auth/youtube.force-ssl`
3. Verify YouTube Data API v3 is enabled
4. Try logout and login again

## Google Cloud Console Checklist

✅ YouTube Data API v3 enabled
✅ OAuth 2.0 Client ID configured
✅ Redirect URI: `http://localhost:3001/api/auth/callback/google`
✅ OAuth Consent Screen includes scopes:
  - openid
  - email
  - profile
  - https://www.googleapis.com/auth/youtube.force-ssl

## Files Modified

1. `lib/auth.ts` - Added database token storage
2. `app/api/comments/[id]/reply/route.ts` - Refactored to use youtubeWrite helper
3. This documentation file

## Next Steps

After verifying the token refresh works, you can use the same pattern for other YouTube API operations:

```typescript
import { getYouTubeClientForUser } from "@/lib/youtubeWrite";

// Any other YouTube API operation
const youtube = await getYouTubeClientForUser(userId);
const result = await youtube.videos.list({ part: ["snippet"], id: [videoId] });
```
