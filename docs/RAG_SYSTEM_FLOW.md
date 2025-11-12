# RAG System Complete Flow Documentation

## ภาพรวมระบบ RAG (Retrieval-Augmented Generation)

RAG ในระบบนี้ใช้สำหรับ **ตอบคอมเมนต์ YouTube อัตโนมัติ** โดยดึงข้อมูลจาก:
- **Transcripts** (เนื้อหาวิดีโอ)
- **Products** (สินค้า Affiliate)
- **Comments** (คอมเมนต์เก่าๆ - optional)

---

## 📊 Database Schema

```
RagDocument (เอกสาร)
├─ id: INT (PK)
├─ sourceType: ENUM('comment', 'transcript', 'product')
├─ sourceId: STRING (commentId | videoId | shopeeProductId)
├─ meta: JSONB (ข้อมูล metadata)
└─ chunks: RagChunk[]

RagChunk (ส่วนย่อยของเอกสาร)
├─ id: INT (PK)
├─ docId: INT (FK → RagDocument)
├─ chunkIndex: INT
├─ text: STRING (ข้อความในส่วนนี้)
├─ meta: JSONB (metadata เฉพาะ chunk)
└─ embedding: VECTOR(1536) ⭐ OpenAI Embedding
```

**สถิติปัจจุบัน:**
- Total Chunks: **16,016**
  - Transcript: **2,403** chunks
  - Product: **13,544** chunks
  - Comment: **69** chunks

---

## 🔄 PART 1: Data Ingestion (การนำข้อมูลเข้าระบบ)

### Step 1.1: Normalize Text
**ไฟล์:** `lib/rag/normalize.ts`

```typescript
normalizeForRAG(text, {
  removeEmojis: true,      // ลบ emoji
  cleanUrls: true,         // ทำความสะอาด URL
  maxLength: 500           // จำกัดความยาว
})
```

**ทำอะไร:**
- ลบ emoji, ตัวอักษรพิเศษ
- ทำความสะอาด URL
- แปลง Unicode characters
- Trim whitespace

---

### Step 1.2: Chunking (แบ่งข้อความเป็นส่วนย่อย)
**ไฟล์:** `lib/rag/chunk.ts`

#### 📝 Transcript Chunking
```typescript
chunkTranscript(text)
// Output: 300-500 tokens/chunk
// Overlap: 60 tokens
```

**ตัวอย่าง:**
```
Original: "วิดีโอนี้รีวิว Notebook 5 รุ่น... [5000 words]"

Chunk 1: [0-500 tokens] "วิดีโอนี้รีวิว Notebook 5 รุ่น..."
Chunk 2: [440-940 tokens] "...Notebook Dell XPS มีจอ OLED..."
Chunk 3: [880-1380 tokens] "...ราคา 35,000 บาท CPU i5..."
```

#### 🛍️ Product Chunking
```typescript
chunkProductDescription(description)
// Summary Chunk: ชื่อสินค้า + คำอธิบายสั้น (≤500 chars)
// Detail Chunks: รายละเอียดเต็ม (300-500 tokens/chunk)
```

**ตัวอย่าง:**
```
Product: "ASUS VivoBook 16 X1605VA"

Summary Chunk:
"ASUS VivoBook 16 X1605VA i7-13620H RAM16GB SSD512GB"

Detail Chunk 1:
"จอ 16 นิ้ว FHD IPS, CPU Intel Core i7-13620H..."

Detail Chunk 2:
"RAM 16GB DDR4, SSD 512GB NVMe, การ์ดจอ Intel Iris Xe..."
```

#### 💬 Comment Chunking
```typescript
chunkComment(text)
// Single chunk (คอมเมนต์สั้น ไม่แบ่ง)
```

---

### Step 1.3: Create Embeddings
**ไฟล์:** `lib/rag/openai.ts`

```typescript
createEmbeddings(chunks)
// Model: text-embedding-3-small
// Dimension: 1536
// Batch Size: 64 chunks/request
```

**Process:**
1. แบ่ง chunks เป็น batch (64 chunks/batch)
2. ส่งไป OpenAI Embeddings API
3. ได้ vector 1536 มิติต่อ chunk

**ตัวอย่าง:**
```
Input:  "ASUS VivoBook CPU i7 RAM 16GB"
Output: [0.023, -0.145, 0.891, ..., 0.234] (1536 numbers)
        ↑ Vector แทนความหมายของประโยค
```

---

### Step 1.4: Store in Database
**ไฟล์:** `lib/rag/ingest.ts`

```sql
-- 1. สร้าง RagDocument
INSERT INTO "RagDocument" (sourceType, sourceId, meta)
VALUES ('product', '27829041660', {...})

-- 2. สร้าง RagChunk พร้อม embedding
INSERT INTO "RagChunk" (docId, chunkIndex, text, meta, embedding)
VALUES (
  123,
  0,
  'ASUS VivoBook...',
  {...},
  '[0.023, -0.145, ...]'::vector
)
```

---

### 📌 Ingestion Functions Summary

| Function | Input | Output | Use Case |
|----------|-------|--------|----------|
| `ingestTranscript()` | TranscriptSource | docId, chunksCreated | เมื่อมีวิดีโอใหม่ |
| `ingestProduct()` | ProductSource | docId, chunksCreated | เมื่อมีสินค้าใหม่ |
| `ingestComment()` | CommentSource | docId, chunksCreated | เก็บคอมเมนต์เก่า (optional) |

---

## 🔍 PART 2: Retrieval (การค้นหาข้อมูล)

### Architecture: 3-Tier Retrieval System

```
┌─────────────────────────────────────────────┐
│ User Query: "โน๊ตบุ๊คเล่นเกมราคา 30,000"  │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│         Pool-V3 (ถ้ามี VideoProductPool)   │
│  - ใช้ precomputed pool (100 products)     │
│  - เร็วที่สุด ⚡                            │
└─────────────────────────────────────────────┘
                    ↓ (fallback ถ้าไม่มี pool)
┌─────────────────────────────────────────────┐
│         Two-Stage Retrieval (V2)            │
│  Stage 1: Metadata Filter (SQL)            │
│  Stage 2: Vector Search (pgvector)         │
└─────────────────────────────────────────────┘
                    ↓ (fallback)
┌─────────────────────────────────────────────┐
│         Hybrid Search (V1)                  │
│  - Vector Search + Keyword Search          │
│  - ค้นหาทั้ง database                      │
└─────────────────────────────────────────────┘
```

---

### 2.1: Pool-V3 (Fastest) ⚡
**ไฟล์:** `lib/rag/retriever-v3.ts`

```typescript
poolBasedHybridSearch(query, videoId, {
  topK: 6,
  minScore: 0.2
})
```

**Process:**
```
1. Get Pool Products (100 products)
   ↓
   VideoProductPool
   WHERE videoId = 'XYZ123'
   ORDER BY relevanceScore DESC
   LIMIT 100

2. Convert Product.id → shopeeProductId
   ↓
   Product.findMany({
     where: { id: IN [pool_ids] },
     select: { shopeeProductId }
   })

3. Vector Search on Pool
   ↓
   SELECT * FROM RagChunk
   WHERE sourceId IN [shopee_ids]
   ORDER BY embedding <=> query_embedding
   LIMIT 3

4. Hybrid Search Transcripts
   ↓
   SELECT * FROM RagChunk
   WHERE sourceType = 'transcript'
     AND videoId = 'XYZ123'
   ORDER BY embedding <=> query_embedding
   LIMIT 3

5. Merge & Sort
   ↓
   [3 transcript + 3 product] → Top 6 results
```

**Advantage:**
- ⚡ เร็วมาก (ค้นหาแค่ 100 products แทน 10,000+)
- 🎯 relevance ดี (filter ด้วย metadata แล้ว)

---

### 2.2: Two-Stage Retrieval (V2)
**ไฟล์:** `lib/rag/retriever-v2.ts`

```typescript
twoStageHybridSearch(query, videoId, {
  topK: 6,
  minScore: 0.2
})
```

**Stage 1: Metadata Filtering (Fast SQL)**
```sql
-- Intent Detection: "โน๊ตบุ๊คเล่นเกม 30,000"
-- → Category: Notebook
-- → Tags: gaming
-- → Price: 25,000-35,000

SELECT id FROM Product
WHERE categoryName = 'Notebook'
  AND tags && ARRAY['gaming']
  AND price BETWEEN 25000 AND 35000
  AND inStock = true
  AND hasAffiliate = true
LIMIT 100  -- ลดจาก 10,000+ เหลือ 100
```

**Stage 2: Vector Search (Precise)**
```sql
-- ค้นหาใน 100 products ที่ผ่าน filter แล้ว
SELECT * FROM RagChunk c
JOIN RagDocument d ON c.docId = d.id
WHERE d.sourceId IN [filtered_100_ids]
ORDER BY c.embedding <=> query_embedding
LIMIT 3
```

---

### 2.3: Hybrid Search (V1 - Fallback)
**ไฟล์:** `lib/rag/retriever.ts`

```typescript
hybridSearch(query, {
  topK: 6,
  sourceType: 'product',
  minScore: 0.2
})
```

**Formula:**
```
Hybrid Score = (0.7 × Vector Score) + (0.3 × Keyword Score)

Vector Score: cosine similarity (embedding distance)
Keyword Score: ts_rank (PostgreSQL full-text search)
```

**SQL:**
```sql
WITH vector_search AS (
  SELECT *,
    (1 - (embedding <=> query_vec)) as vec_score
  FROM RagChunk
  ORDER BY embedding <=> query_vec
  LIMIT 20
),
keyword_search AS (
  SELECT *,
    ts_rank(to_tsvector('thai', text), query) as kw_score
  FROM RagChunk
  WHERE to_tsvector('thai', text) @@ query
  LIMIT 20
)
SELECT *,
  (0.7 * vec_score + 0.3 * kw_score) as hybrid_score
FROM (
  SELECT * FROM vector_search
  UNION
  SELECT * FROM keyword_search
)
ORDER BY hybrid_score DESC
LIMIT 6
```

---

### 📌 Retrieval Flow Summary

```
User Query
    ↓
smartSearchV3()
    ↓
   มี Pool?
    ↓ Yes          ↓ No
Pool-V3      Two-Stage (V2)
    ↓                ↓
    └────────┬───────┘
             ↓
      Search Results
       (6 contexts)
```

---

## 🤖 PART 3: Response Generation

### 3.1: Context Preparation
**ไฟล์:** `lib/rag/comment-reply.ts`

```typescript
// 1. Retrieve contexts
const contexts = await smartSearchV3(query, videoId, {
  topK: 6,
  includeTranscripts: true,
  includeProducts: true,
  minScore: 0.2
})

// 2. Separate by type
const transcriptContexts = contexts.filter(c => c.sourceType === 'transcript')
const productContexts = contexts.filter(c => c.sourceType === 'product')

// 3. Build context text
const contextText = transcriptContexts
  .map((c, i) => `[Context ${i+1}]\n${c.text}`)
  .join('\n\n')

// 4. Build products text
const productsText = productContexts
  .map(c => {
    const meta = c.meta as ProductMeta
    return `- ${meta.name} (${meta.price}฿) ${meta.url}`
  })
  .join('\n')
```

---

### 3.2: Prompt Engineering
**ไฟล์:** `lib/rag/prompts.ts`

```typescript
const systemPrompt = `
คุณคือผู้ช่วยตอบคอมเมนต์ YouTube ของ NotebookSPEC

กฎการตอบ:
1. ใช้ข้อมูลจาก Context (transcript) เป็นหลัก
2. แนะนำสินค้าได้แค่ที่อยู่ใน Suggested Products
3. จำกัด 2 สินค้า/ครั้ง
4. ต้องมี "ราคา" + "shortURL"
5. Mirror language (ตามภาษาคอมเมนต์)
`

const userPrompt = `
Comment: "${commentText}"

=== Context from Video ===
${contextText}

=== Suggested Products ===
${productsText}

=== Intent ===
${intent} (technical | purchase | general)
`
```

---

### 3.3: GPT-5 Response Generation
**ไฟล์:** `lib/rag/openai.ts`

```typescript
// GPT-5 uses Responses API
const response = await openai.responses.create({
  model: "gpt-5",
  input: [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ],
  reasoning: {
    effort: "medium"  // High quality reasoning
  },
  text: {
    verbosity: "medium"
  },
  max_output_tokens: 5000
})
```

**Output Example:**
```
เกมนี้ต้องการสเปกสูงนะครับ จากวิดีโอที่รีวิว
แนะนำโน๊ตบุ๊คที่มี CPU แรงๆ อย่าง i7 Gen 13
และ RAM อย่างน้อย 16GB

สินค้าแนะนำ:
1. ASUS VivoBook 16 X1605VA (35,900฿)
   https://s.shopee.co.th/abc123

2. MSI Vector A16 HX (42,900฿)
   https://s.shopee.co.th/xyz789
```

---

### 3.4: Response Sanitization

```typescript
// Remove URLs ที่ไม่ได้อยู่ใน allowedUrls
replyText = replyText.replace(/https?:\/\/[^\s]+/g, (url) => {
  if (allowedProductUrls.has(url)) {
    return url  // Keep it
  }
  return ""  // Remove it
})
```

---

## 🎯 Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    USER POSTS COMMENT                       │
│         "โน๊ตบุ๊คเล่นเกมงบ 30,000 มีรุ่นไหนดี"            │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│              1. QUERY PREPROCESSING                         │
│  - detectQueryIntent() → "purchase"                         │
│  - Extract filters: category=Notebook, price=25k-35k        │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│              2. CONTEXT RETRIEVAL (RAG)                     │
│  smartSearchV3(query, videoId, {topK: 6})                   │
│     ↓                                                        │
│  Pool-V3 (if pool exists)                                   │
│    - Get 100 products from VideoProductPool                 │
│    - Vector search → 3 products                             │
│    - Hybrid search transcripts → 3 chunks                   │
│     ↓                                                        │
│  Results: [3 transcript + 3 product contexts]               │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│              3. PROMPT CONSTRUCTION                         │
│  System: "คุณคือผู้ช่วยตอบคอมเมนต์..."                    │
│  User: "Comment + Contexts + Products"                      │
│  Intent: "purchase" → Use product recommendation style      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│              4. GPT-5 GENERATION                            │
│  openai.responses.create({                                  │
│    model: "gpt-5",                                          │
│    reasoning: { effort: "medium" },                         │
│    max_output_tokens: 5000                                  │
│  })                                                         │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│              5. RESPONSE SANITIZATION                       │
│  - Remove unauthorized URLs                                 │
│  - Keep only shortURL from suggested products               │
│  - Clean up formatting                                      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│              6. SAVE AS DRAFT                               │
│  Draft {                                                    │
│    commentId, reply, status: PENDING,                       │
│    suggestedProducts: [...]                                 │
│  }                                                          │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│              7. SHOW IN MODERATION UI                       │
│  Admin reviews & approves → Post to YouTube                │
└─────────────────────────────────────────────────────────────┘
```

---

## 📈 Performance Metrics

### Ingestion Speed
- **Transcripts:** ~5-10 sec/video (depends on length)
- **Products:** ~2-3 sec/product
- **Batch:** 64 items/request (OpenAI limit)

### Retrieval Speed
- **Pool-V3:** ~100-200ms ⚡
- **Two-Stage:** ~300-500ms
- **Hybrid:** ~500-1000ms

### Quality Metrics
- **minScore 0.2:** High recall, may include less relevant
- **minScore 0.6:** Low recall, very relevant only
- **Recommended:** 0.2-0.3 for balance

---

## 🔧 Key Configuration

### Environment Variables
```env
# OpenAI
OPENAI_API_KEY=sk-proj-...
AI_MODEL=gpt-5
EMBED_MODEL=text-embedding-3-small
EMBED_DIMENSIONS=1536
EMBED_BATCH=64

# RAG Parameters
RAG_TOP_K=6
RAG_MIN_SCORE=0.2
```

### Database Indexes
```sql
-- Vector similarity search (pgvector)
CREATE INDEX ON "RagChunk" USING ivfflat (embedding vector_cosine_ops);

-- Full-text search
CREATE INDEX ON "RagChunk" USING gin (to_tsvector('thai', text));

-- Metadata filtering
CREATE INDEX ON "RagDocument" (sourceType, sourceId);
CREATE INDEX ON "Product" (categoryName, inStock, hasAffiliate);
```

---

## 🐛 Common Issues & Solutions

### Issue 1: 0 Results from Retrieval
**Symptoms:** `[Pool-V3] Found 0 results`

**Causes:**
1. ❌ minScore too high (0.6+)
2. ❌ Product ID mismatch (internal ID vs shopeeProductId)
3. ❌ No embeddings in database

**Solutions:**
✅ Lower minScore to 0.2
✅ Convert Product.id → shopeeProductId before search
✅ Check `SELECT COUNT(*) FROM RagChunk WHERE embedding IS NOT NULL`

---

### Issue 2: Slow Response Time
**Symptoms:** Reply generation takes >10 seconds

**Causes:**
1. ❌ No VideoProductPool (using slow fallback)
2. ❌ Too many chunks (topK too high)
3. ❌ OpenAI API latency

**Solutions:**
✅ Run VDO Pool computation
✅ Lower topK to 4-6
✅ Use streaming responses

---

### Issue 3: Irrelevant Product Recommendations
**Symptoms:** แนะนำสินค้าไม่ตรงกับคำถาม

**Causes:**
1. ❌ Pool quality low (wrong relevance scores)
2. ❌ Intent detection wrong
3. ❌ Product embeddings outdated

**Solutions:**
✅ Re-compute VideoProductPool with better scoring
✅ Improve query-intent.ts
✅ Re-generate product embeddings

---

## 📚 File Reference

| File | Purpose |
|------|---------|
| `lib/rag/schema.ts` | Type definitions |
| `lib/rag/ingest.ts` | Data ingestion |
| `lib/rag/chunk.ts` | Text chunking |
| `lib/rag/normalize.ts` | Text normalization |
| `lib/rag/openai.ts` | OpenAI API calls |
| `lib/rag/retriever.ts` | Hybrid search (V1) |
| `lib/rag/retriever-v2.ts` | Two-stage search |
| `lib/rag/retriever-v3.ts` | Pool-based search |
| `lib/rag/comment-reply.ts` | Reply generation |
| `lib/rag/prompts.ts` | System prompts |
| `lib/rag/query-intent.ts` | Intent detection |
| `lib/rag/video-product-pool.ts` | Pool computation |

---

**Last Updated:** 2025-01-12
**Version:** 3.0 (Pool-V3 + GPT-5)
