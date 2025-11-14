# วิธีเพิ่มน้ำหนักราคาในการค้นหา

## ภาพรวม

มี 3 วิธีหลักในการเพิ่มน้ำหนักราคา:

1. **วิธีที่ 1: เพิ่มราคาใน Embedding** (ง่าย, ต้อง re-index)
2. **วิธีที่ 2: Re-ranking ด้วยราคา** (แม่นยำ, ใช้ได้ทันที) ✅ **แนะนำ**
3. **วิธีที่ 3: Price Filtering** (เร็ว, ต้องมี query ราคา)

---

## วิธีที่ 1: เพิ่มราคาใน Embedding

### แนวคิด
เพิ่มข้อมูลราคาเข้าไปใน text ก่อน embed → Embedding จะเรียนรู้ว่าราคาเป็นส่วนหนึ่งของ product

### ก่อนแก้:
```typescript
// lib/rag/ingest.ts:218
const summaryText = normalizeForRAG(
  `${product.name}. ${product.description || ""}`.trim()
);

// ตัวอย่าง text ที่ส่งไป embed:
// "Lenovo LOQ Gaming. โน๊ตบุ๊คเกมมิ่ง RTX 5060 16GB"
```

### หลังแก้:
```typescript
// lib/rag/ingest.ts:218
const priceText = product.price
  ? `ราคา ${product.price.toLocaleString()} บาท`
  : '';

const summaryText = normalizeForRAG(
  `${product.name}. ${priceText}. ${product.description || ""}`.trim()
);

// ตัวอย่าง text ที่ส่งไป embed:
// "Lenovo LOQ Gaming. ราคา 36,090 บาท. โน๊ตบุ๊คเกมมิ่ง RTX 5060 16GB"
```

### ข้อดี:
- ✅ ง่าย เพิ่ม 2-3 บรรทัด
- ✅ Embedding เรียนรู้ราคาธรรมชาติ
- ✅ Query "40K" จะจับคู่กับ "36,090 บาท" ได้

### ข้อเสีย:
- ❌ ต้อง re-index product ทั้งหมด (ใช้เวลานาน)
- ❌ ใช้ token มากขึ้น

### วิธีใช้:
```bash
# 1. แก้โค้ดตามด้านบน
# 2. Re-index products
npm run ingest:products

# หรือ re-index แค่บางส่วน
npx tsx scripts/reingest-products.ts --limit 1000
```

---

## วิธีที่ 2: Re-ranking ด้วยราคา ✅ แนะนำ

### แนวคิด
หลังจาก hybrid search แล้ว → คำนวณ price similarity → ปรับคะแนน

### สูตร Price Similarity:

```typescript
// ถ้าราคาต่างกัน 0% → score = 1.0 (100%)
// ถ้าราคาต่างกัน 20% → score = 0.8 (80%)
// ถ้าราคาต่างกัน 50% → score = 0.5 (50%)
// ถ้าราคาต่างกัน > 100% → score = 0.0 (0%)

function calculatePriceScore(queryPrice: number, productPrice: number): number {
  const diff = Math.abs(queryPrice - productPrice);
  const avgPrice = (queryPrice + productPrice) / 2;
  const percentDiff = diff / avgPrice;

  // Linear decay: 100% diff = 0 score
  return Math.max(0, 1 - percentDiff);
}
```

### ตัวอย่าง:

```
Query: 40,000 บาท

Product 1: 36,090 บาท
  diff = |40000 - 36090| = 3,910
  avg = (40000 + 36090) / 2 = 38,045
  percentDiff = 3910 / 38045 = 0.103 (10.3%)
  priceScore = 1 - 0.103 = 0.897 (89.7%) ✅

Product 2: 80,000 บาท
  diff = |40000 - 80000| = 40,000
  avg = (40000 + 80000) / 2 = 60,000
  percentDiff = 40000 / 60000 = 0.667 (66.7%)
  priceScore = 1 - 0.667 = 0.333 (33.3%) ❌
```

### การ Combine คะแนน:

```typescript
// Original weights
semanticScore = vectorScore * 0.7 + keywordScore * 0.3

// New weights with price
finalScore = semanticScore * 0.6 + priceScore * 0.4

// ตัวอย่าง:
semanticScore = 0.65 (65%)
priceScore = 0.897 (89.7%)
finalScore = 0.65 * 0.6 + 0.897 * 0.4 = 0.749 (74.9%) ✅
```

### Implementation:

```typescript
// lib/rag/price-reranking.ts

export function extractPriceFromQuery(query: string): number | null {
  // Pattern: "40K", "40k", "40000", "40,000"
  const patterns = [
    /(\d+)[kK]/,           // 40K
    /([\d,]+)\s*บาท/,     // 40,000 บาท
    /งบ\s*([\d,]+)/,      // งบ 40000
    /ราคา\s*([\d,]+)/     // ราคา 40000
  ];

  for (const pattern of patterns) {
    const match = query.match(pattern);
    if (match) {
      let price = match[1].replace(/,/g, '');

      // Convert K to actual number
      if (query.includes('k') || query.includes('K')) {
        price = String(parseInt(price) * 1000);
      }

      return parseInt(price);
    }
  }

  return null;
}

export function calculatePriceScore(
  queryPrice: number,
  productPrice: number
): number {
  if (!productPrice) return 0;

  const diff = Math.abs(queryPrice - productPrice);
  const avgPrice = (queryPrice + productPrice) / 2;
  const percentDiff = diff / avgPrice;

  // Linear decay
  return Math.max(0, 1 - percentDiff);
}

export function rerankByPrice(
  results: SearchResult[],
  queryPrice: number,
  options: {
    priceWeight?: number;    // Weight for price (0-1)
    semanticWeight?: number; // Weight for semantic (0-1)
  } = {}
): SearchResult[] {
  const {
    priceWeight = 0.4,
    semanticWeight = 0.6
  } = options;

  return results.map(result => {
    const meta = result.meta as any;
    const productPrice = meta.price;

    if (!productPrice) {
      // No price info → keep original score
      return result;
    }

    const priceScore = calculatePriceScore(queryPrice, productPrice);
    const finalScore = (result.score * semanticWeight) + (priceScore * priceWeight);

    return {
      ...result,
      score: finalScore,
      // Store original scores for debugging
      meta: {
        ...meta,
        _priceScore: priceScore,
        _semanticScore: result.score
      }
    };
  }).sort((a, b) => b.score - a.score);
}
```

### การใช้งาน:

```typescript
// app/api/similarity/search/route.ts

import { extractPriceFromQuery, rerankByPrice } from "@/lib/rag/price-reranking";

// 3. Search products
const productResults = await hybridSearch(query, {
  topK: 50,  // เพิ่มจาก 20 → 50 เพื่อให้มีตัวเลือกมากขึ้น
  sourceType: "product",
  minScore: 0.3,
  queryEmbedding,
});

// 4. Re-rank by price (if query contains price)
const queryPrice = extractPriceFromQuery(query);
let finalResults = productResults;

if (queryPrice) {
  console.log(`[API] Detected price in query: ${queryPrice.toLocaleString()} บาท`);

  finalResults = rerankByPrice(productResults, queryPrice, {
    priceWeight: 0.4,      // 40% weight for price
    semanticWeight: 0.6    // 60% weight for semantic
  });

  console.log(`[API] Re-ranked by price`);
}

// 5. Take top 20 after re-ranking
const top20 = finalResults.slice(0, 20);
```

### ข้อดี:
- ✅ **ใช้ได้ทันที** - ไม่ต้อง re-index
- ✅ **ปรับน้ำหนักได้ง่าย** - เปลี่ยน priceWeight ได้เลย
- ✅ **โปร่งใส** - เห็นคะแนนแต่ละส่วน
- ✅ **ยืดหยุ่น** - ปรับสูตรได้ตามต้องการ

### ข้อเสีย:
- ❌ ต้อง extract ราคาจาก query (อาจพลาด)
- ❌ ช้ากว่าเล็กน้อย (ต้องคำนวณเพิ่ม)

---

## วิธีที่ 3: Price Range Filtering

### แนวคิด
กรอง product ตามช่วงราคาก่อนค้นหา → ค้นหาเฉพาะในช่วงนั้น

### Implementation:

```typescript
// lib/rag/retriever.ts

export async function vectorSearchWithPriceFilter(
  queryEmbedding: number[],
  options: {
    topK?: number;
    minPrice?: number;
    maxPrice?: number;
  } = {}
): Promise<SearchResult[]> {
  const { topK = 20, minPrice, maxPrice } = options;

  // Build WHERE clause with price filter
  const conditions = ["c.embedding IS NOT NULL"];

  if (minPrice !== undefined) {
    conditions.push(`CAST(d.meta->>'price' AS INTEGER) >= ${minPrice}`);
  }

  if (maxPrice !== undefined) {
    conditions.push(`CAST(d.meta->>'price' AS INTEGER) <= ${maxPrice}`);
  }

  const query = `
    SELECT
      c.id,
      c.text,
      c.meta,
      d."sourceId",
      1 - (c.embedding <=> $1::vector) as score
    FROM "RagChunk" c
    JOIN "RagDocument" d ON c."docId" = d.id
    WHERE ${conditions.join(" AND ")}
    ORDER BY c.embedding <=> $1::vector
    LIMIT $2
  `;

  const results = await prisma.$queryRawUnsafe(query,
    JSON.stringify(queryEmbedding),
    topK
  );

  return results;
}
```

### การใช้งาน:

```typescript
// app/api/similarity/search/route.ts

const queryPrice = extractPriceFromQuery(query);
let searchOptions = { topK: 20, minScore: 0.3, queryEmbedding };

if (queryPrice) {
  // ±20% range
  searchOptions.minPrice = queryPrice * 0.8;
  searchOptions.maxPrice = queryPrice * 1.2;

  console.log(`[API] Filtering price range: ${searchOptions.minPrice.toLocaleString()} - ${searchOptions.maxPrice.toLocaleString()}`);
}

const productResults = await vectorSearchWithPriceFilter(queryEmbedding, searchOptions);
```

### ข้อดี:
- ✅ **เร็วมาก** - กรองก่อนค้นหา → candidates น้อยลง
- ✅ **แม่นยำ** - ได้เฉพาะในช่วงราคาที่ต้องการ

### ข้อเสีย:
- ❌ **เข้มงวด** - ถ้าช่วงแคบเกินอาจไม่เจออะไร
- ❌ **ต้องมีราคาใน query** - ไม่งั้นใช้ไม่ได้

---

## เปรียบเทียบ 3 วิธี

| วิธี | ความยาก | Re-index | ความแม่นยำ | ความเร็ว | ยืดหยุ่น |
|------|---------|----------|------------|----------|----------|
| **1. Embedding** | ง่าย | ✅ ต้อง | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ |
| **2. Re-ranking** | ปานกลาง | ❌ ไม่ต้อง | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **3. Filtering** | ยาก | ❌ ไม่ต้อง | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ |

---

## แนะนำ: ใช้วิธีที่ 2 (Re-ranking) ✅

**เหตุผล:**
1. ใช้ได้ทันที ไม่ต้อง re-index
2. ปรับน้ำหนักได้ง่าย (เปลี่ยน priceWeight)
3. เห็นคะแนนแต่ละส่วนชัดเจน
4. ทำงานได้ดีแม้ไม่มีราคาใน query (ใช้ semantic score)

**ผลลัพธ์ที่คาดหวัง:**

```
Query: "ต้องการ Notebook gaming 40K"

Before re-ranking:
1. Lenovo LOQ 36K    → 39.6% (semantic only)
2. Gigabyte A16 40K  → 39.6% (semantic only)
3. MSI 80K           → 38.9% (semantic only) ← ราคาเกินมาก

After re-ranking (priceWeight=0.4):
1. Gigabyte A16 40K  → 79.7% (semantic 39.6% + price 100%)
2. Lenovo LOQ 36K    → 75.0% (semantic 39.6% + price 89.7%)
3. MSI 80K           → 43.4% (semantic 38.9% + price 33.3%) ← ลดลง
```

**ดูไหม?** สินค้าที่ราคาใกล้เคียงจะได้คะแนนสูงขึ้น! 🎯
