# Video Transcript Manager - Testing Guide

## ✅ Completed Implementation

### Backend Components
1. **Database Schema** (`prisma/schema.prisma`)
   - `VideoIndex` model with fields: videoId, title, status, chunksJSON, summaryJSON, source, errorMessage
   - `IndexStatus` enum: NONE, INDEXING, READY, FAILED
   - Index on [status, updatedAt]

2. **Core Services**
   - `lib/transcript.ts` - YouTube caption fetching and processing
   - `jobs/indexVideo.ts` - Main indexing job with error handling
   - `lib/transcriptQueue.ts` - Queue management (ensureVideoIndexFor)
   - `lib/videoIndexService.ts` - Business logic layer

3. **Integration**
   - `jobs/syncComments.ts` - Tracks affected videos, triggers transcript indexing
   - `app/api/sync/comments/route.ts` - Returns affectedVideoIds

4. **API Routes**
   - `GET /api/transcripts` - List with search/filter/pagination
   - `POST /api/transcripts/ensure` - Queue single video
   - `POST /api/transcripts/ensure-missing` - Queue all missing videos
   - `GET /api/transcripts/[videoId]/preview` - Get full preview data

### Frontend Components
1. **TranscriptsTable.client.tsx** (Main UI)
   - SWR data fetching with pagination
   - Search by title/videoId
   - Status filter (ALL, NONE, INDEXING, READY, FAILED)
   - Action buttons: Run/Retry, Preview
   - Toolbar: Search, Filter, Run All (Missing only), Refresh

2. **PreviewModal.client.tsx** (Preview UI)
   - Summary card: totalChunks, keywords (tags), topics (tags), outline (list)
   - Transcript card: Scrollable 70vh container with timestamp + text
   - Copy All button for clipboard
   - Loading and error states

3. **page.tsx** (Route Wrapper)
   - Server component with auth check
   - Renders TranscriptsTable client component

4. **Navigation Integration**
   - Added "Transcripts" menu item in DashboardShell.client.tsx
   - Position: Between Products and Settings

---

## 🧪 Testing Checklist

### 1. Navigation
- [ ] Navigate to `/dashboard/transcripts`
- [ ] Verify "Transcripts" menu item is visible
- [ ] Verify page title "Video Transcripts" is displayed
- [ ] Verify table loads without errors

### 2. Table Display
- [ ] Verify columns: Title, Video ID, Status, Updated, Actions
- [ ] Verify data loads from database
- [ ] Verify pagination controls work
- [ ] Verify "Total X videos" counter is accurate
- [ ] Verify status tags have correct colors:
  - NONE: default (gray)
  - INDEXING: blue
  - READY: green
  - FAILED: red

### 3. Search Functionality
- [ ] Enter search query in search box
- [ ] Verify results filter by title OR videoId
- [ ] Clear search and verify table resets
- [ ] Test with non-existent query → empty results

### 4. Status Filter
- [ ] Select "All Status" → shows all records
- [ ] Select "NONE" → shows only NONE status
- [ ] Select "INDEXING" → shows only INDEXING status
- [ ] Select "READY" → shows only READY status
- [ ] Select "FAILED" → shows only FAILED status

### 5. Run/Retry Button
- [ ] Click "Run" on a NONE status video
- [ ] Verify success message appears
- [ ] Verify status changes to INDEXING in table (after refresh)
- [ ] Click "Retry" on a FAILED status video
- [ ] Verify video re-queues successfully

### 6. Preview Button
- [ ] Verify Preview button is DISABLED for non-READY videos
- [ ] Click Preview on a READY video
- [ ] Verify modal opens with:
  - Video title in header
  - VideoId tag
  - Status tag (green READY)
  - Summary section with:
    - Total chunks count
    - Keywords as blue tags
    - Topics as blue tags
    - Outline as bullet list
  - Transcript section with:
    - Scrollable container (70vh)
    - Timestamp + text chunks
    - Proper formatting

### 7. Copy All Functionality
- [ ] Open preview modal for READY video
- [ ] Click "Copy All" button
- [ ] Verify success message appears
- [ ] Paste clipboard content
- [ ] Verify format: `[HH:MM:SS] text\n` for each chunk

### 8. Run All (Missing only) Button
- [ ] Click "Run All (Missing only)" button
- [ ] Verify success message shows count: "Queued X video(s) for indexing"
- [ ] Check database → verify new VideoIndex records created with INDEXING status
- [ ] Wait a few seconds → verify videos transition to READY or FAILED

### 9. Refresh Button
- [ ] Make changes in another tab/tool (e.g., run sync comments)
- [ ] Click Refresh button
- [ ] Verify table data updates without page reload

### 10. Pagination
- [ ] Change page number → verify new data loads
- [ ] Change page size (10/20/50/100) → verify items per page updates
- [ ] Verify "Total X videos" remains accurate across pages

---

## 🔄 Integration Testing

### Test Flow 1: Comment Sync → Auto Transcript
1. Go to "Moderation" page
2. Click "Sync Comments" button
3. Wait for sync to complete
4. Go to "Transcripts" page
5. **Expected**: New videos from synced comments appear with INDEXING status
6. Wait 10-30 seconds (depending on caption size)
7. **Expected**: Status changes to READY or FAILED

### Test Flow 2: Manual Single Video
1. Get a YouTube videoId (e.g., from URL: `watch?v=ABC123`)
2. Manually insert into Comments table if not exists
3. Go to Transcripts page
4. Verify video appears (or search for it)
5. Click "Run" button
6. **Expected**: Status → INDEXING → READY (with captions) or FAILED (no captions)

### Test Flow 3: Bulk Missing Videos
1. Ensure you have videos in Comments table without VideoIndex records
2. Go to Transcripts page
3. Click "Run All (Missing only)"
4. **Expected**: Success message with count
5. Refresh table
6. **Expected**: New videos appear with INDEXING status
7. Wait for processing
8. **Expected**: All videos transition to READY/FAILED

---

## 🐛 Expected Error Cases

### Video Without Captions
- **Behavior**: Status → FAILED
- **Error Message**: "No captions available for this video"
- **User Action**: Check video on YouTube → manually add captions → Retry

### YouTube API Rate Limit
- **Behavior**: Status → FAILED
- **Error Message**: "YouTube API quota exceeded" (or similar)
- **User Action**: Wait for quota reset (daily) → Retry

### Invalid Video ID
- **Behavior**: Status → FAILED
- **Error Message**: "Video not found or unavailable"
- **User Action**: Remove video or update videoId

### Network Timeout
- **Behavior**: Status → FAILED
- **Error Message**: "Network timeout" or "Request failed"
- **User Action**: Click Retry button

---

## 📊 Database Verification

### Check VideoIndex Records
```sql
-- All videos with their status
SELECT videoId, title, status, updatedAt 
FROM "VideoIndex" 
ORDER BY updatedAt DESC 
LIMIT 20;

-- Count by status
SELECT status, COUNT(*) 
FROM "VideoIndex" 
GROUP BY status;

-- Videos in comments without index
SELECT DISTINCT c.videoId 
FROM "Comment" c
LEFT JOIN "VideoIndex" v ON c.videoId = v.videoId
WHERE v.videoId IS NULL;

-- Failed videos with errors
SELECT videoId, title, errorMessage, updatedAt
FROM "VideoIndex"
WHERE status = 'FAILED'
ORDER BY updatedAt DESC;
```

---

## 🎯 Success Criteria

- ✅ All navigation works without errors
- ✅ Table displays real VideoIndex data
- ✅ Search and filter work correctly
- ✅ Run/Retry triggers indexing (status → INDEXING)
- ✅ Preview shows Summary + Full Transcript for READY videos
- ✅ Copy All copies entire transcript to clipboard
- ✅ Run All (Missing only) queues all videos without transcripts
- ✅ Comment sync automatically triggers transcript indexing for new/updated videos
- ✅ All TypeScript types are correct (no compilation errors)
- ✅ No console errors in browser

---

## 🔧 Manual Testing Commands

### Check Docker PostgreSQL
```powershell
docker ps | Select-String postgres
docker logs nbs-ytbot-postgres --tail 50
```

### Prisma Studio (Visual DB Inspection)
```powershell
npx prisma studio
```
Navigate to: http://localhost:5555
Browse VideoIndex table

### Check API Responses
```powershell
# List transcripts (replace with your auth token)
curl http://localhost:3000/api/transcripts?page=1&pageSize=10

# Preview specific video
curl http://localhost:3000/api/transcripts/ABC123/preview

# Queue single video
curl -X POST http://localhost:3000/api/transcripts/ensure -d '{"videoId":"ABC123"}' -H "Content-Type: application/json"

# Queue all missing
curl -X POST http://localhost:3000/api/transcripts/ensure-missing
```

---

## 📝 Development Notes

### Current Implementation
- Queue system uses `Promise.resolve().then()` for fire-and-forget execution
- Index building uses simple word frequency for keyword extraction
- No ASR (Automatic Speech Recognition) support yet
- No retry logic with exponential backoff

### Future Enhancements (Not Yet Implemented)
- [ ] Replace with BullMQ or Upstash for proper queue management
- [ ] Add AI-powered topic extraction (OpenAI/Anthropic)
- [ ] Implement ASR for videos without captions (Whisper API)
- [ ] Add retry logic with exponential backoff
- [ ] Add progress indicators for long-running jobs
- [ ] Add bulk selection and batch operations
- [ ] Add YouTube API rate limit monitoring
- [ ] Add cron job for periodic re-indexing

---

## 🚀 Quick Start Testing

1. **Start Dev Server**
   ```powershell
   npm run dev
   ```

2. **Login to Dashboard**
   Navigate to: http://localhost:3000/signin

3. **Sync Comments** (to populate videos)
   Go to: http://localhost:3000/dashboard/moderation
   Click "Sync Comments"

4. **Open Transcripts Page**
   Go to: http://localhost:3000/dashboard/transcripts

5. **Test Run All**
   Click "Run All (Missing only)"
   Wait 10-30 seconds
   Click "Refresh"

6. **Test Preview**
   Find a READY video
   Click "Preview"
   Verify Summary + Transcript display
   Click "Copy All"
   Paste and verify format

---

## ✅ Pre-Deployment Checklist

- [ ] All TypeScript errors resolved (`npm run build`)
- [ ] Database migration applied (`npx prisma migrate deploy`)
- [ ] Environment variables configured (YOUTUBE_API_KEY, DATABASE_URL)
- [ ] Docker PostgreSQL running and accessible
- [ ] Comment sync tested and working
- [ ] Transcript indexing tested on multiple videos
- [ ] Preview modal tested with various video types
- [ ] Error handling tested (videos without captions)
- [ ] No console errors in production build
- [ ] Performance tested with 100+ videos in table

---

## 📞 Troubleshooting

### Issue: Table shows "No data"
- Check database connection: `npx prisma studio`
- Verify VideoIndex table exists
- Run "Sync Comments" first to populate videos
- Check browser console for API errors

### Issue: Preview button always disabled
- Verify video status is READY (not INDEXING/NONE/FAILED)
- Check VideoIndex.chunksJSON is not null
- Inspect API response: GET /api/transcripts/[videoId]/preview

### Issue: Status stuck on INDEXING
- Check application logs for errors
- Verify YouTube API key is valid
- Check video has captions on YouTube
- Manually check VideoIndex.errorMessage in database

### Issue: Copy All doesn't work
- Check browser clipboard permissions
- Try on different browser (Chrome/Edge/Firefox)
- Verify chunks data exists in preview response
- Check browser console for JavaScript errors

---

**Last Updated**: 2025-10-27  
**Status**: ✅ Implementation Complete - Ready for Testing
