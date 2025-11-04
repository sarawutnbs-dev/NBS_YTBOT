# RAG Improvements Summary

## Overview
Three progressive optimizations implemented to improve RAG product retrieval performance for handling large product catalogs (10,000+ products).

---

## ✅ Option 1: Two-Stage Retrieval (COMPLETED)

### What Was Built
- **Two-stage filtering system**: Metadata filtering (SQL) → ANN Vector Search (pgvector)
- **Enhanced metadata**: Added `brand`, `categoryName`, `inStock`, `hasAffiliate`, `priceMin`, `priceMax` to Product model
- **Video metadata**: Added `categoryTags`, `brandTags`, `priceRangeMin`, `priceRangeMax` to VideoIndex
- **Brand extraction**: 40+ known brands with intelligent pattern matching

### Files Created/Modified
- `lib/brandUtils.ts` - Brand extraction logic
- `lib/rag/retriever-v2.ts` - Two-stage retrieval implementation
- `lib/rag/answer.ts` - Updated to use smartHybridSearch
- `prisma/schema.prisma` - Added metadata fields
- `scripts/test-option1-with-ingest.ts` - Test script

### Test Results
- **Metadata filtering:** Reduced from 100 products → 23 candidates
- **Vector search:** Retrieved 3 relevant products with scores 0.522-0.554
- **Search time:** ~500-1000ms per query
- **Match breakdown:**
  - Brand + Category + Price: 23 products (perfect match!)

### Performance Impact
- **Current (100 products):** Minimal impact, both stages search similar candidates
- **At scale (10,000+ products):** Would reduce from 10,000 → ~100 candidates (99% reduction)

---

## ✅ Option 2: VideoProductPool (COMPLETED)

### What Was Built
- **VideoProductPool model**: Precomputed product pools with relevance scoring
- **Relevance scoring**: Brand (40%) + Category (30%) + Price (20%) + Tags (10%)
- **Pool computation**: Batch processing for all videos with metadata
- **Retriever V3**: Pool-based search with automatic fallback

### Files Created/Modified
- `prisma/schema.prisma` - Added VideoProductPool model
- `lib/rag/video-product-pool.ts` - Pool computation logic
- `lib/rag/retriever-v3.ts` - Pool-based retrieval
- `scripts/test-option2-pool.ts` - Test script
- `scripts/compute-video-pools.ts` - Batch computation script

### Test Results
- **Pool size:** 100 products (all products matched due to small dataset)
- **Computation time:** 67ms (one-time cost)
- **Score range:** 0.300 - 0.925
- **Search time:** ~579-1058ms per query
- **Match breakdown:**
  - Category only: 24 products
  - Brand + Category: 9 products
  - Brand + Category + Price: 23 products
  - Category + Price: 44 products

### Performance Impact
- **Current (100 products):** No visible benefit (pool = all products)
- **At scale (10,000+ products):**
  - Eliminates metadata filtering on every query
  - Precomputation cost: ~1-2 seconds per video (periodic batch job)
  - Query benefit: No filtering overhead, direct pool lookup

---

## ✅ Option 3: HNSW Index (COMPLETED)

### What Was Built
- **HNSW index**: Hierarchical Navigable Small World graph for pgvector
- **Index parameters:** m=16 (connections), ef_construction=64 (build quality)
- **Direct SQL migration**: Applied HNSW index via raw SQL
- **Benchmark testing**: Performance measurement across multiple queries

### Files Created/Modified
- `prisma/migrations/20251104090355_add_hnsw_index/migration.sql` - HNSW index creation
- `scripts/apply-hnsw-index.ts` - Direct SQL application script
- `scripts/test-option3-hnsw.ts` - Benchmark test
- `scripts/check-indexes.ts` - Index verification

### Test Results
- **Index size:** 328 kB (for 40 embeddings)
- **Build time:** 10ms
- **Average search time:** 685ms (range: 603-814ms)
- **Queries tested:** 3 queries × 3 runs each

### Performance Impact
- **Current (40 embeddings):** Minimal impact, dataset too small
- **At scale (10,000+ embeddings):**
  - Search complexity: O(log n) vs O(n)
  - Expected speedup: 10-100x for large datasets
  - Trade-off: Approximate results (>95% recall) vs exact search

### HNSW Tuning Options
- **m (connections):** 2-100, default 16
  - Higher = better recall, more memory
- **ef_construction:** 4-1000, default 64
  - Higher = better quality, slower build
- **ef_search:** Query-time parameter (default 40)
  - Set with: `SET hnsw.ef_search = 100;`
  - Higher = better accuracy, slower queries

---

## Performance Comparison Summary

| Metric | Baseline | Option 1 | Option 2 | Option 3 |
|--------|----------|----------|----------|----------|
| **Search Space** | All products | Filtered candidates | Precomputed pool | Same as input |
| **Metadata Filtering** | Per query | Per query | One-time (precomputed) | N/A |
| **Vector Search** | O(n) linear scan | O(n) on filtered | O(n) on pool | O(log n) HNSW |
| **Current Performance** | Baseline | ~500-1000ms | ~579-1058ms | ~685ms |
| **At Scale (10k+ products)** | Slow | Faster | Fastest queries | Fastest vector ops |

---

## Recommendations

### Current State (100 products)
All three options are **functionally working** but benefits are **not visible** due to small dataset.

### For Production (10,000+ products)

**Best Approach: Combine All Three Options**

1. **Use Option 2 (VideoProductPool)** as primary retrieval method:
   - Precompute pools for all videos (nightly batch job)
   - Fast queries with no metadata filtering overhead
   - Pool refresh: Daily or when products sync

2. **Keep Option 1 (Two-Stage)** as fallback:
   - For videos without metadata
   - For new videos before pool computation
   - Provides graceful degradation

3. **Keep Option 3 (HNSW Index)** always enabled:
   - Database-level optimization
   - Benefits all vector searches
   - No query-time overhead

### Implementation Priority
1. ✅ **All code implemented and tested**
2. 📦 **Sync more products** (target: 1,000+ for meaningful testing)
3. 🔄 **Setup periodic pool computation** (e.g., cron job)
4. 📊 **Monitor performance** with real workload

---

## Testing Scripts

### Test Individual Options
```bash
# Option 1: Two-Stage Retrieval
npx tsx scripts/test-option1-with-ingest.ts

# Option 2: VideoProductPool
npx tsx scripts/test-option2-pool.ts

# Option 3: HNSW Index
npx tsx scripts/test-option3-hnsw.ts
```

### Utility Scripts
```bash
# Sync products from Shopee
npx tsx scripts/test-sync-100.ts

# Compute video pools (all videos)
npx tsx scripts/compute-video-pools.ts

# Apply HNSW index
npx tsx scripts/apply-hnsw-index.ts

# Check database indexes
npx tsx scripts/check-indexes.ts

# Check pool statistics
npx tsx scripts/check-pool-stats.ts
```

---

## Architecture Diagram

```
User Query
    ↓
Video Metadata
    ↓
┌─────────────────────────────────────┐
│  Option 2: VideoProductPool Lookup  │ ← Primary (fastest)
│  - Precomputed pool (200 products)  │
│  - No filtering overhead            │
└─────────────────────────────────────┘
    ↓ (if pool not found)
┌─────────────────────────────────────┐
│  Option 1: Two-Stage Retrieval      │ ← Fallback
│  Stage 1: SQL metadata filter       │
│  Stage 2: Vector search on filter   │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│  Option 3: HNSW Vector Search       │ ← Database level
│  - O(log n) search complexity       │
│  - Applies to all vector queries    │
└─────────────────────────────────────┘
    ↓
RAG Answer Generation
```

---

## Key Insights

1. **Dataset Size Matters**: All optimizations require 10,000+ products to show meaningful benefits
2. **Complementary, Not Competing**: Options work together at different levels (application, query, database)
3. **Precomputation Wins**: Option 2's pool approach provides best query-time performance
4. **Index Always Helps**: Option 3's HNSW index improves all vector operations
5. **Metadata Quality Critical**: Brand/category extraction accuracy directly impacts relevance

---

## Next Steps

1. **Sync More Products**:
   - Target: 10,000+ products across all 9 categories
   - Run: `app/api/products/sync-shopee/route.ts`

2. **Compute All Pools**:
   - After product sync: `npx tsx scripts/compute-video-pools.ts`
   - Setup cron job for periodic refresh

3. **Benchmark at Scale**:
   - Re-run all tests with 10,000+ products
   - Compare actual performance improvements
   - Document real-world results

4. **Monitor Production**:
   - Track query times
   - Monitor pool hit rates
   - Adjust HNSW parameters if needed

---

## Conclusion

All three RAG improvement options are **successfully implemented and tested**. While current test results show limited performance gains due to small dataset (100 products), the architecture is ready for production scale (10,000+ products) where significant improvements are expected:

- **Option 1**: 99% reduction in search space (10,000 → 100)
- **Option 2**: Elimination of per-query filtering
- **Option 3**: 10-100x faster vector operations

The combined approach provides robust, scalable product retrieval with graceful fallbacks.
