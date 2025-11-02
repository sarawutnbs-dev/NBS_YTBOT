# RAG System - Quick Start Guide

Get your RAG system up and running in 5 minutes!

---

## Prerequisites Checklist

- ✅ PostgreSQL with pgvector running (port 5433)
- ✅ Database migrated (`npx prisma migrate deploy`)
- ✅ OpenAI API key configured in `.env.local`
- ✅ Dev server running (`npm run dev`)

---

## Step 1: Configure Environment

Make sure your `.env.local` has:

```env
# Required
OPENAI_API_KEY="sk-your-actual-openai-key-here"

# Optional (these have defaults)
EMBED_MODEL="text-embedding-3-small"
EMBED_DIMENSIONS="1536"
CHAT_MODEL="gpt-4o-mini"
RAG_TOP_K="6"
RAG_MAX_CONTEXT_TOKENS="2800"
EMBED_BATCH="64"
```

**Important:** Replace `"sk-your-actual-openai-key-here"` with your real OpenAI API key!

---

## Step 2: Test Your Setup

Run the automated test suite:

```bash
npm run rag:test
```

This will:
- ✅ Check database connection
- ✅ Verify pgvector extension
- ✅ Test RAG tables
- ✅ Validate OpenAI configuration
- ✅ Ingest sample data (transcript, product, comment)
- ✅ Test vector search
- ✅ Test hybrid search
- ✅ Generate a sample answer
- ✅ Show statistics

**Expected Output:**
```
╔════════════════════════════════════════════════════════════╗
║              RAG SYSTEM TEST SUITE                         ║
╚════════════════════════════════════════════════════════════╝

============================================================
 Test 1: Database Connection
============================================================

✓ Database connection successful

============================================================
 Test 2: pgvector Extension
============================================================

✓ pgvector extension installed (version 0.7.0)

... (more tests)

============================================================
 Test Summary
============================================================

Total: 11
Passed: 11

✓ All tests passed! 🎉
✓ Your RAG system is ready to use!
```

---

## Step 3: Ingest Your Real Data

### Option A: Ingest Transcripts (Recommended First)

Preview what will be ingested:
```bash
npm run rag:ingest:transcripts -- --limit 5 --dry-run
```

Actually ingest:
```bash
npm run rag:ingest:transcripts -- --limit 5
```

For recent videos only:
```bash
npm run rag:ingest:transcripts -- --only-recent --limit 10
```

### Option B: Ingest Products

Preview:
```bash
npm run rag:ingest:products -- --limit 20 --dry-run
```

Ingest:
```bash
npm run rag:ingest:products -- --limit 20
```

By category:
```bash
npm run rag:ingest:products -- --category electronics
```

### Option C: Ingest Comments

For a specific video:
```bash
npm run rag:ingest:comments -- --video-id YOUR_VIDEO_ID --limit 50
```

Top comments only (5+ likes, no replies):
```bash
npm run rag:ingest:comments -- --min-likes 5 --skip-replies --limit 100
```

---

## Step 4: Test Search & Answers

### Test via API (Using curl)

**Health Check:**
```bash
curl http://localhost:3000/api/rag/stats?type=health
```

**Get Statistics:**
```bash
curl http://localhost:3000/api/rag/stats
```

**Generate Answer:**
```bash
curl -X POST http://localhost:3000/api/answer \
  -H "Content-Type: application/json" \
  -H "Cookie: YOUR_SESSION_COOKIE" \
  -d '{
    "query": "What is this video about?",
    "videoId": "YOUR_VIDEO_ID",
    "includeTranscripts": true,
    "includeProducts": true
  }'
```

**Preview Contexts (Debug):**
```bash
curl "http://localhost:3000/api/answer?query=microphone&videoId=YOUR_VIDEO_ID"
```

### Test via Code

Create a test file `test-query.ts`:

```typescript
import { generateAnswer } from "./lib/rag/answer";

async function testQuery() {
  const response = await generateAnswer({
    query: "What products do you recommend for YouTube recording?",
    includeProducts: true,
    includeTranscripts: true,
    temperature: 0.7,
  });

  console.log("Answer:", response.answer);
  console.log("\nContexts used:", response.contexts.length);
  console.log("Tokens:", response.tokenUsage.totalTokens);
}

testQuery();
```

Run it:
```bash
npx tsx test-query.ts
```

---

## Step 5: Monitor Your System

### Check Statistics

```bash
curl http://localhost:3000/api/rag/stats
```

**Expected Response:**
```json
{
  "overview": {
    "totalDocuments": 35,
    "totalChunks": 350,
    "chunksWithEmbeddings": 350,
    "embeddingCoverage": 100,
    "estimatedStorageKB": 2150
  },
  "bySourceType": {
    "comments": { "documents": 10, "chunks": 10, "avgChunksPerDoc": 1 },
    "transcripts": { "documents": 5, "chunks": 50, "avgChunksPerDoc": 10 },
    "products": { "documents": 20, "chunks": 40, "avgChunksPerDoc": 2 }
  }
}
```

### Check Health

```bash
curl http://localhost:3000/api/rag/stats?type=health
```

**Expected Response:**
```json
{
  "status": "healthy",
  "issues": [],
  "checks": {
    "databaseConnected": true,
    "hasDocuments": true,
    "hasEmbeddings": true,
    "embeddingCoverageOk": true
  }
}
```

---

## Common Workflows

### 1. Daily Auto-Ingest

Create a cron job or scheduled task:

```bash
# Every day at 2 AM: Ingest new transcripts
0 2 * * * cd /path/to/NBS_YTBOT && npm run rag:ingest:transcripts -- --only-recent

# Every day at 3 AM: Ingest new comments
0 3 * * * cd /path/to/NBS_YTBOT && npm run rag:ingest:comments -- --min-likes 3 --limit 200
```

### 2. Update Product Catalog

When products change:

```bash
npm run rag:ingest:products -- --overwrite
```

### 3. Re-generate Embeddings

If you switch embedding models:

```typescript
import { regenerateEmbeddings } from "./lib/rag/ingest";

// Regenerate all embeddings
await regenerateEmbeddings();

// Or just one type
await regenerateEmbeddings("transcript");
```

### 4. Clean Up Old Data

```bash
# Delete all comments
curl -X DELETE "http://localhost:3000/api/ingest/comments?commentId=COMMENT_ID"

# Delete transcript
curl -X DELETE "http://localhost:3000/api/ingest/transcripts?videoId=VIDEO_ID"
```

---

## Troubleshooting

### Issue: "OPENAI_API_KEY not found"

**Solution:** Make sure you have `.env.local` (not just `.env.example`):

```bash
cp .env.example .env.local
# Edit .env.local and add your OpenAI API key
```

### Issue: "pgvector extension not available"

**Solution:** Use the correct Docker image:

```bash
docker stop nbs-ytbot-postgres
docker rm nbs-ytbot-postgres

docker run --name nbs-ytbot-postgres \
  -e POSTGRES_USER=nbsytbot \
  -e POSTGRES_PASSWORD=nbsytbot123 \
  -e POSTGRES_DB=nbsytbot \
  -p 5433:5432 \
  -d pgvector/pgvector:pg16

# Re-run migrations
npx prisma migrate deploy
```

### Issue: "No results found"

**Solution:** Make sure you've ingested some data:

```bash
npm run rag:ingest:transcripts -- --limit 5
```

### Issue: "Token limit exceeded"

**Solution:** Reduce context tokens in `.env.local`:

```env
RAG_MAX_CONTEXT_TOKENS="2000"  # Default: 2800
RAG_TOP_K="4"                   # Default: 6
```

### Issue: Tests pass but API returns 401 Unauthorized

**Solution:** You need to be authenticated. Either:
1. Login to your app and copy the session cookie
2. Or test using the TypeScript functions directly (bypass API)

---

## Performance Tips

1. **Start Small:** Test with 5-10 items first, then scale up
2. **Use Dry Run:** Always preview with `--dry-run` before ingesting
3. **Monitor Coverage:** Keep `embeddingCoverage` at 100%
4. **Batch Wisely:** Don't ingest 1000 items at once - use smaller batches
5. **Check Costs:** Each embedding costs $0.00002 (for text-embedding-3-small)

---

## Next Steps

Once everything is working:

1. **Integrate with UI:** Use the API endpoints in your frontend
2. **Set up scheduled jobs:** Auto-ingest new content daily
3. **Customize prompts:** Edit [lib/rag/answer.ts:12](lib/rag/answer.ts#L12)
4. **Add monitoring:** Track query performance and costs
5. **Optimize:** Tune `RAG_TOP_K` and `RAG_MAX_CONTEXT_TOKENS` for your use case

---

## Need Help?

- 📖 **Full Documentation:** [RAG_SYSTEM.md](RAG_SYSTEM.md)
- 🔍 **Check Logs:** Look for `[job:ingest-*]`, `[rag/*]` prefixes
- 📊 **Monitor Stats:** `curl http://localhost:3000/api/rag/stats`
- 🏥 **Health Check:** `curl http://localhost:3000/api/rag/stats?type=health`

---

**You're all set! 🚀**

Run `npm run rag:test` to verify everything is working, then start ingesting your data!
