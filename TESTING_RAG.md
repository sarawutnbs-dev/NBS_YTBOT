# RAG System Testing Guide

**No authentication needed!** Test directly using TypeScript.

---

## 🚀 Quick Test (30 seconds)

### **Step 1: Set OpenAI API Key**

Make sure you have `.env.local` with your OpenAI API key:

```bash
# If you don't have .env.local, copy from example
cp .env.example .env.local
```

Edit `.env.local` and add:
```env
OPENAI_API_KEY="sk-your-actual-openai-key-here"
```

### **Step 2: Run Tests**

Choose one:

#### **Option A: Full Automated Test Suite** (Recommended)
```bash
npm run rag:test
```

This runs 11 comprehensive tests and shows results.

#### **Option B: Simple Manual Test**
```bash
npx tsx manual-test.ts
```

This just checks your setup quickly.

---

## 📊 What to Expect

### **If Everything Works:**

```
✅ Database connected!
📄 Documents: 0
📦 Chunks: 0

📊 Statistics:
   Total Documents: 0
   Total Chunks: 0
   Embedding Coverage: 0%
   Storage: 0 KB

✅ Tests complete!
```

This is normal if you haven't ingested data yet!

### **If You Have Data:**

```
✅ Database connected!
📄 Documents: 15
📦 Chunks: 120

📊 Statistics:
   Total Documents: 15
   Total Chunks: 120
   Embedding Coverage: 100%
   Storage: 738 KB

📁 By Type:
   Comments: 5 docs
   Transcripts: 3 docs
   Products: 7 docs

✅ Tests complete!
```

---

## 🔧 Common Issues & Solutions

### **Error: "Cannot connect to database"**

**Problem:** PostgreSQL not running or wrong connection string.

**Solution:**
```bash
# Check if PostgreSQL is running
docker ps | findstr postgres

# If not running, start it:
docker start nbs-ytbot-postgres

# Or create new one:
docker run --name nbs-ytbot-postgres \
  -e POSTGRES_USER=nbsytbot \
  -e POSTGRES_PASSWORD=nbsytbot123 \
  -e POSTGRES_DB=nbsytbot \
  -p 5433:5432 \
  -d pgvector/pgvector:pg16
```

### **Error: "OPENAI_API_KEY not found"**

**Problem:** Environment variable not set.

**Solution:**
1. Make sure you have `.env.local` (not just `.env.example`)
2. Add your OpenAI API key to `.env.local`
3. The key should start with `sk-`

### **Error: "Invalid API key"**

**Problem:** API key is wrong or account has no credits.

**Solution:**
1. Check your API key at: https://platform.openai.com/api-keys
2. Verify your account has credits
3. Generate a new key if needed

### **Error: "Table 'RagDocument' does not exist"**

**Problem:** Database not migrated.

**Solution:**
```bash
npx prisma migrate deploy
```

---

## 📝 Next Steps After Testing

### **1. Ingest Some Data**

**Test with sample data (from automated test):**
```bash
npm run rag:test
```

**Or ingest your real data:**

```bash
# Transcripts (preview first)
npm run rag:ingest:transcripts -- --limit 3 --dry-run
npm run rag:ingest:transcripts -- --limit 3

# Products
npm run rag:ingest:products -- --limit 10 --dry-run
npm run rag:ingest:products -- --limit 10

# Comments for specific video
npm run rag:ingest:comments -- --video-id YOUR_VIDEO_ID --limit 20
```

### **2. Test Search & Answers**

Uncomment the tests in `manual-test.ts` and run:

```bash
npx tsx manual-test.ts
```

Or edit the file to try different queries!

### **3. View Data in Prisma Studio**

```bash
npm run studio
```

Then open: http://localhost:5555

Navigate to:
- `RagDocument` - See indexed documents
- `RagChunk` - See chunks with embeddings

---

## 🎯 Testing Without Browser/API

All the tests work **directly with the database**, so you don't need:
- ❌ Browser authentication
- ❌ HTTP requests
- ❌ Session cookies
- ❌ API keys (except OpenAI)

Just run:
```bash
npm run rag:test
```

And everything is tested automatically!

---

## 💡 Tips

1. **Start with automated test:** `npm run rag:test`
2. **Check results in Prisma Studio:** `npm run studio`
3. **Use dry-run first:** `--dry-run` flag previews without changes
4. **Test small batches:** Use `--limit 5` when starting
5. **Monitor costs:** Each embedding ≈ $0.00002

---

## 📚 More Help

- **Full Documentation:** [RAG_SYSTEM.md](RAG_SYSTEM.md)
- **Quick Start Guide:** [QUICK_START_RAG.md](QUICK_START_RAG.md)
- **Test Script Source:** [test-rag-system.ts](test-rag-system.ts)

---

## ✅ Ready?

Just run this one command:

```bash
npm run rag:test
```

It will test everything and tell you exactly what's working! 🚀
