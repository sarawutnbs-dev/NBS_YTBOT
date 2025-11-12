/**
 * ⚠️ DEPRECATED SCRIPT ⚠️
 *
 * This script is no longer needed. YouTube OAuth tokens are now read directly
 * from environment variables (.env) instead of being stored in the database.
 *
 * To configure YouTube API access:
 * 1. Set YOUTUBE_OAUTH_REFRESH_TOKEN in your .env file
 * 2. Set GOOGLE_CLIENT_ID in your .env file
 * 3. Set GOOGLE_CLIENT_SECRET in your .env file
 *
 * The system will automatically use these credentials when posting comments.
 * No database storage is required.
 */

console.log('\n⚠️  This script is deprecated.\n');
console.log('YouTube tokens are now read from .env file only.');
console.log('Please ensure these variables are set in your .env:\n');
console.log('  - YOUTUBE_OAUTH_REFRESH_TOKEN');
console.log('  - GOOGLE_CLIENT_ID');
console.log('  - GOOGLE_CLIENT_SECRET\n');
console.log('No database token storage is needed.\n');

async function main() {
  // Script deprecated - do nothing
  process.exit(0);
}

main()
  .catch((err) => {
    console.error('❌ Error:', err?.message || err);
    process.exit(1);
  });
