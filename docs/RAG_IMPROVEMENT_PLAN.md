# แผนการปรับปรุง RAG System ตามคำแนะนำ GPT-5

## สถานะปัจจุบัน

### ✅ สิ่งที่มีอยู่แล้ว
- pgvector (cosine similarity search)
- Hybrid search (vector 70% + keyword 30%)
- Metadata filtering (sourceType, videoId)
- Tag-based product matching
- Per-category product organization (9 categories)

### ❌ สิ่งที่ยังขาด
- Advanced metadata filters (brand, price, stock status)
- Video-product precomputed pool
- Two-stage retrieval (filter → ANN)
- HNSW/IVFFLAT index optimization
- Thai language optimization (PGroonga/OpenSearch)
- Sentence-window retrieval for transcripts

---

## 📋 แผนการปรับปรุง (4 Phases)

---

## Phase 1: Enhanced Metadata Filtering 🔥 (Priority: High)

### 1.1 เพิ่ม Metadata Fields

**Schema Changes (prisma/schema.prisma):**
```prisma
model Product {
  // ... existing fields
  categoryName  String?
  brand         String?        // ← NEW: แบรนด์ (extract จาก tags)
  inStock       Boolean @default(true)  // ← NEW
  hasAffiliate  Boolean @default(true)  // ← NEW (shopeeProductId != null)
  priceMin      Float?         // ← NEW: สำหรับ range filter
  priceMax      Float?         // ← NEW

  // ... rest
}

model VideoIndex {
  // ... existing fields
  categoryTags  String[] @default([])  // ← NEW: categories ที่เกี่ยวข้อง
  brandTags     String[] @default([])  // ← NEW: brands ที่พูดถึง
  priceRangeMin Float?                 // ← NEW
  priceRangeMax Float?                 // ← NEW
}
```

**Migration:**
```bash
npx prisma migrate dev --name add_advanced_metadata
```

**Extract Brand from Tags:**
```typescript
// lib/brandUtils.ts
export const KNOWN_BRANDS = [
  "ASUS", "Acer", "HP", "Lenovo", "Dell", "MSI",
  "Intel", "AMD", "NVIDIA", "Corsair", "Kingston",
  // ... เพิ่มแบรนด์ที่รู้จัก
];

export function extractBrand(tags: string[]): string | null {
  for (const tag of tags) {
    const upperTag = tag.toUpperCase();
    for (const brand of KNOWN_BRANDS) {
      if (upperTag.includes(brand.toUpperCase())) {
        return brand;
      }
    }
  }
  return null;
}
```

**Update Sync Script:**
```typescript
// app/api/products/sync-shopee/route.ts
import { extractBrand } from "@/lib/brandUtils";

// In sync loop:
const tags = extractProductTags(product.productName);
const brand = extractBrand(tags);

await prisma.product.create({
  data: {
    // ... existing
    brand: brand,
    inStock: true,
    hasAffiliate: true,
    priceMin: parseFloat(product.price) * 0.9,  // ±10% range
    priceMax: parseFloat(product.price) * 1.1,
  }
});
```

### 1.2 Two-Stage Retrieval Implementation

**File: `lib/rag/retriever-v2.ts`**
```typescript
/**
 * Stage 1: Metadata Filtering (Fast)
 */
export async function filterProductCandidates(
  videoId: string,
  options: {
    categories?: string[];
    brands?: string[];
    tags?: string[];
    priceRange?: [number, number];
    maxCandidates?: number;
  } = {}
): Promise<string[]> {  // Return product IDs
  const { maxCandidates = 100 } = options;

  const filters = {
    // Business rules (MUST)
    shopeeProductId: { not: null },
    inStock: true,
    hasAffiliate: true,

    // Metadata filters (SHOULD)
    ...(options.categories?.length && {
      categoryName: { in: options.categories }
    }),
    ...(options.brands?.length && {
      brand: { in: options.brands }
    }),
    ...(options.tags?.length && {
      tags: { hasSome: options.tags }
    }),
    ...(options.priceRange && {
      price: {
        gte: options.priceRange[0],
        lte: options.priceRange[1]
      }
    }),
  };

  const products = await prisma.product.findMany({
    where: filters,
    select: { id: true, shopeeProductId: true },
    take: maxCandidates,
  });

  return products.map(p => p.shopeeProductId!);
}

/**
 * Stage 2: ANN Vector Search (Focused)
 */
export async function vectorSearchWithFilter(
  queryEmbedding: number[],
  candidateIds: string[],  // From Stage 1
  options: {
    topK?: number;
    minScore?: number;
  } = {}
): Promise<SearchResult[]> {
  const { topK = 50, minScore = 0.3 } = options;

  // Build WHERE clause with ID filter
  const query = `
    SELECT
      c.id,
      c."docId",
      c."chunkIndex",
      c.text,
      c.meta,
      d."sourceType",
      d."sourceId",
      1 - (c.embedding <=> $1::vector) as score
    FROM "RagChunk" c
    JOIN "RagDocument" d ON c."docId" = d.id
    WHERE d."sourceType" = 'product'
      AND d."sourceId" = ANY($2::text[])
      AND c.embedding IS NOT NULL
    ORDER BY c.embedding <=> $1::vector
    LIMIT $3
  `;

  const results = await prisma.$queryRawUnsafe<any[]>(
    query,
    JSON.stringify(queryEmbedding),
    candidateIds,
    topK
  );

  return results
    .filter(r => r.score >= minScore)
    .map(r => ({
      id: r.id,
      docId: r.docId,
      chunkIndex: r.chunkIndex,
      text: r.text,
      meta: r.meta,
      score: r.score,
      sourceType: r.sourceType,
      sourceId: r.sourceId,
    }));
}

/**
 * Combined: Two-Stage Hybrid Search
 */
export async function twoStageHybridSearch(
  query: string,
  videoId: string,
  options: {
    topK?: number;
    includeTranscripts?: boolean;
    includeProducts?: boolean;
  } = {}
): Promise<SearchResult[]> {
  const { topK = 6, includeTranscripts = true, includeProducts = true } = options;

  // Get video metadata
  const video = await prisma.videoIndex.findUnique({
    where: { videoId },
    select: {
      categoryTags: true,
      brandTags: true,
      priceRangeMin: true,
      priceRangeMax: true,
      tags: true
    }
  });

  const results: SearchResult[] = [];

  // 1. Transcripts (no filtering needed)
  if (includeTranscripts) {
    const embedding = await createEmbedding(query);
    const transcriptResults = await vectorSearch(embedding, {
      topK: Math.ceil(topK / 2),
      sourceType: "transcript",
      videoId,
      minScore: 0.3
    });
    results.push(...transcriptResults);
  }

  // 2. Products (two-stage)
  if (includeProducts && video) {
    // Stage 1: Filter candidates (metadata)
    const candidateIds = await filterProductCandidates(videoId, {
      categories: video.categoryTags,
      brands: video.brandTags,
      tags: video.tags,
      priceRange: video.priceRangeMin && video.priceRangeMax
        ? [video.priceRangeMin, video.priceRangeMax]
        : undefined,
      maxCandidates: 100,  // จาก 10,000+ → 100
    });

    console.log(`[Two-Stage] Filtered to ${candidateIds.length} candidates`);

    // Stage 2: ANN search on candidates only
    const embedding = await createEmbedding(query);
    const productResults = await vectorSearchWithFilter(
      embedding,
      candidateIds,
      {
        topK: Math.ceil(topK / 2),
        minScore: 0.4  // Higher threshold for products
      }
    );
    results.push(...productResults);
  }

  // Sort and return top K
  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
```

---

## Phase 2: Video-Product Precomputed Pool 🚀 (Priority: Medium)

### 2.1 Precompute Product Pool per Video

**Schema Addition:**
```prisma
model VideoProductPool {
  id          String   @id @default(cuid())
  videoId     String   @unique
  productIds  String[] // Precomputed relevant product IDs
  confidence  Json     // { productId: score }
  computedAt  DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([videoId])
}
```

**Computation Job:**
```typescript
// jobs/compute-video-product-pools.ts
export async function computeVideoProductPool(videoId: string) {
  // 1. Get video embedding (from transcript summary)
  const video = await prisma.videoIndex.findUnique({
    where: { videoId },
    select: { summaryJSON: true, tags: true }
  });

  const summary = video?.summaryJSON as any;
  const videoEmbedding = await createEmbedding(summary?.summary || "");

  // 2. Filter candidates by metadata
  const candidateIds = await filterProductCandidates(videoId, {
    tags: video?.tags,
    maxCandidates: 500  // Broader initial pool
  });

  // 3. Vector search to rank
  const rankedProducts = await vectorSearchWithFilter(
    videoEmbedding,
    candidateIds,
    { topK: 100, minScore: 0.35 }
  );

  // 4. Save pool
  const confidence = rankedProducts.reduce((acc, r) => {
    acc[r.sourceId] = r.score;
    return acc;
  }, {} as Record<string, number>);

  await prisma.videoProductPool.upsert({
    where: { videoId },
    create: {
      videoId,
      productIds: rankedProducts.map(r => r.sourceId),
      confidence: confidence as any
    },
    update: {
      productIds: rankedProducts.map(r => r.sourceId),
      confidence: confidence as any,
      updatedAt: new Date()
    }
  });

  console.log(`✅ Computed pool for ${videoId}: ${rankedProducts.length} products`);
}
```

**Usage in Retrieval:**
```typescript
// lib/rag/retriever-v2.ts
export async function retrieveWithPool(
  query: string,
  videoId: string
): Promise<SearchResult[]> {
  // Check if pool exists
  const pool = await prisma.videoProductPool.findUnique({
    where: { videoId }
  });

  if (!pool) {
    // Fallback to two-stage search
    return await twoStageHybridSearch(query, videoId);
  }

  // Use precomputed pool (FAST!)
  const queryEmbedding = await createEmbedding(query);
  const results = await vectorSearchWithFilter(
    queryEmbedding,
    pool.productIds,  // Already filtered!
    { topK: 6, minScore: 0.4 }
  );

  // Boost by pool confidence
  return results.map(r => ({
    ...r,
    score: r.score * 0.7 + (pool.confidence[r.sourceId] || 0) * 0.3
  })).sort((a, b) => b.score - a.score);
}
```

---

## Phase 3: Index Optimization ⚡ (Priority: Medium)

### 3.1 Add HNSW Index

**Migration:**
```sql
-- prisma/migrations/xxx_add_hnsw_index/migration.sql

-- Drop old index if exists
DROP INDEX IF EXISTS "RagChunk_embedding_idx";

-- Create HNSW index (faster than default)
CREATE INDEX "RagChunk_embedding_hnsw_idx"
ON "RagChunk"
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Set runtime search parameters
ALTER DATABASE nbsytbot SET hnsw.ef_search = 64;
```

**Performance:**
- **Before:** ~500-1000ms for 10k vectors
- **After:** ~50-100ms with HNSW

### 3.2 Add IVFFLAT for Larger Datasets

```sql
-- For datasets > 100k vectors
CREATE INDEX "RagChunk_embedding_ivfflat_idx"
ON "RagChunk"
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);  -- sqrt(N) where N = number of vectors

-- Runtime
SET ivfflat.probes = 10;
```

---

## Phase 4: Advanced Features 🎯 (Priority: Low)

### 4.1 Query Rewriting

```typescript
// lib/rag/query-rewrite.ts
export async function rewriteQuery(
  comment: string,
  videoTitle: string,
  topTranscripts: string[]
): Promise<string> {
  const context = topTranscripts.slice(0, 3).join(" ");

  return `${comment} ${videoTitle} ${context}`.slice(0, 500);
}
```

### 4.2 Sentence-Window Retrieval

```typescript
// lib/rag/sentence-window.ts
export function extractSentenceWindow(
  transcript: string,
  keyPhrases: string[],
  windowSize: number = 3
): string[] {
  const sentences = transcript.split(/[.!?]/).filter(s => s.trim());
  const windows: string[] = [];

  sentences.forEach((sent, idx) => {
    if (keyPhrases.some(phrase => sent.includes(phrase))) {
      const start = Math.max(0, idx - windowSize);
      const end = Math.min(sentences.length, idx + windowSize + 1);
      windows.push(sentences.slice(start, end).join(". "));
    }
  });

  return windows;
}
```

### 4.3 Thai Language Optimization (Future)

**Option 1: PGroonga (Postgres Extension)**
```bash
# Install PGroonga for better Thai tokenization
# Requires server-side installation
```

**Option 2: OpenSearch/Meilisearch**
```typescript
// Separate service for keyword search
// Keep pgvector for semantic search
// Combine results in hybrid search
```

---

## 📊 Expected Performance Improvements

| Metric | Before | After Phase 1-2 | After Phase 3 |
|--------|--------|-----------------|---------------|
| **Product Search Time** | 500-1000ms | 100-200ms | 50-100ms |
| **Candidate Pool Size** | 10,000+ | 100 | 100 |
| **Precision** | ~60% | ~80% | ~80% |
| **Recall** | ~70% | ~85% | ~85% |

---

## 🛠️ Implementation Priority

### Sprint 1 (1-2 weeks): Phase 1.1 + 1.2
- ✅ Add metadata fields (brand, stock, price range)
- ✅ Implement two-stage retrieval
- ✅ Test with 100 products

### Sprint 2 (1 week): Phase 2
- ✅ Add VideoProductPool model
- ✅ Implement precomputation job
- ✅ Integrate with retrieval

### Sprint 3 (3 days): Phase 3
- ✅ Add HNSW index
- ✅ Benchmark performance

### Future: Phase 4
- ⏳ Query rewriting
- ⏳ Sentence windows
- ⏳ Thai language optimization

---

## 🧪 Testing Strategy

**Test Case 1: High Product Volume**
- 10,000 products in database
- Video with "ASUS laptop" topic
- Comment: "สเปคแรมเท่าไหร่ดีครับ"
- Expected: Top 3 ASUS laptop products with RAM info

**Test Case 2: Price Filtering**
- Video mentions "งบ 20,000 บาท"
- Comment: "อยากได้แบบคุ้มๆ"
- Expected: Products in 15k-25k range

**Test Case 3: Category Precision**
- Video about "CPU"
- Comment: "แนะนำ Intel หน่อยครับ"
- Expected: Only Intel CPUs, no other categories

---

## 📝 Summary

คำแนะนำจาก GPT-5 **ทำได้ทั้งหมด** และควรทำตามลำดับ priority:

1. ✅ **Phase 1** (High Priority): Two-stage retrieval + metadata filters
2. ✅ **Phase 2** (Medium): Precomputed video-product pools
3. ✅ **Phase 3** (Medium): HNSW index optimization
4. ⏳ **Phase 4** (Low): Advanced features (query rewriting, Thai optimization)

ระบบปัจจุบันมี foundation ที่ดีอยู่แล้ว (pgvector + hybrid search) แค่ต้องเพิ่ม:
- **Smarter filtering** (metadata)
- **Precomputation** (caching)
- **Better indexing** (HNSW)
