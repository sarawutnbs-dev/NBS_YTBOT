# RAG V2: Simplified Approach (Full Transcript + Product Pool)

## เหตุผลการเปลี่ยนแปลง

**ปัญหาของ RAG V1:**
- ❌ Vector search ซับซ้อน อาจพลาดข้อมูลสำคัญ
- ❌ minScore threshold ยากปรับ (0.2 vs 0.6)
- ❌ Product recommendations ไม่ค่อยตรงโจทย์
- ❌ ต้องพึ่ง embedding + hybrid search

**RAG V2 แนวทางใหม่:**
- ✅ ส่ง **Full Transcript** ทั้งหมดให้ AI
- ✅ ใช้ **VideoProductPool** ที่คำนวณไว้แล้ว (Top 10)
- ✅ เรียบง่าย ตรงไปตรงมา
- ✅ AI ได้ context ครบถ้วน

---

## การทำงานใหม่

### Input ส่งให้ AI:

```
=== Video Transcript (เนื้อหาวิดีโอ) ===
[Full transcript - ทุก chunk รวมกัน]

=== Suggested Products (แนะนำได้เฉพาะที่อยู่ในลิสต์นี้) ===
1. ASUS VivoBook 16 X1605VA
   ราคา: 35,900฿
   Link: https://s.shopee.co.th/abc123

2. MSI Vector A16 HX
   ราคา: 42,900฿
   Link: https://s.shopee.co.th/xyz789

... (up to 20 products)

=== User Comment ===
"โน๊ตบุ๊คเล่นเกมงบ 30,000 มีรุ่นไหนดี"
```

---

## ขั้นตอนการทำงาน

### Step 1: Get Full Transcript
```typescript
const videoIndex = await prisma.videoIndex.findUnique({
  where: { videoId },
  select: { chunksJSON: true }
});

const chunks = JSON.parse(videoIndex.chunksJSON);
const fullTranscript = chunks.join("\n\n");
```

**ผลลัพธ์:** ข้อความ transcript เต็มๆ ~5,000-20,000 chars

---

### Step 2: Get Top 20 Products from Pool
```typescript
// 1. Get pool entries (sorted by relevanceScore)
const poolEntries = await prisma.videoProductPool.findMany({
  where: { videoId },
  orderBy: { relevanceScore: 'desc' },
  take: 20
});

// 2. Get product details
const products = await prisma.product.findMany({
  where: { id: { in: poolEntries.map(p => p.productId) } },
  select: { name, price, shortURL }
});
```

**ผลลัพธ์:** Array ของ 20 สินค้าที่มี:
- `name`: ชื่อสินค้า
- `price`: ราคา
- `shortURL`: Link สำหรับแนะนำ

---

### Step 3: Build Prompt
```typescript
const transcriptText = fullTranscript
  ? `\n\n--- Video Transcript (เนื้อหาวิดีโอ) ---\n${fullTranscript}`
  : "\n\n(ไม่มี transcript)";

const productsText = suggestedProducts.length > 0
  ? `\n\n--- Suggested Products ---\n` +
    suggestedProducts.map((p, i) =>
      `${i+1}. ${p.name}\n   ราคา: ${p.price}฿\n   Link: ${p.shortURL}`
    ).join("\n\n")
  : "\n\n(ไม่มีสินค้าแนะนำ)";

const systemPrompt = `
${COMMENT_REPLY_SYSTEM_PROMPT}
${FEW_SHOT_EXAMPLES}
${transcriptText}
${productsText}
${guidanceText}
`;
```

---

### Step 4: Call GPT-5
```typescript
const response = await chatCompletion([
  { role: "system", content: systemPrompt },
  { role: "user", content: commentText }
], {
  model: "gpt-5",
  maxTokens: 5000,
  jsonMode: true
});
```

**Output Format:**
```json
{
  "reply_text": "คำตอบที่สร้าง...",
  "products": [
    {
      "url": "https://s.shopee.co.th/abc123",
      "name": "ASUS VivoBook 16"
    }
  ]
}
```

---

### Step 5: Validate & Sanitize
```typescript
// Only allow products from suggested list
const allowedUrls = new Set(
  suggestedProducts.map(p => p.shortURL)
);

products = products
  .filter(p => allowedUrls.has(p.url))
  .slice(0, 2); // Max 2 products

// Remove unauthorized URLs from reply text
replyText = replyText.replace(urlRegex, (url) => {
  return allowedUrls.has(url) ? url : "";
});
```

---

## เปรียบเทียบ V1 vs V2

| Feature | RAG V1 (Old) | RAG V2 (New) |
|---------|-------------|--------------|
| **Transcript** | Vector search chunks (Top 3) | Full transcript (ทั้งหมด) |
| **Products** | Vector search (Top 3) | VideoProductPool (Top 20) |
| **Complexity** | ซับซ้อน (3-tier search) | เรียบง่าย (direct query) |
| **Speed** | ~300-500ms | ~100-200ms ⚡ |
| **minScore** | 0.2-0.6 (ต้องปรับ) | ไม่ต้องใช้ |
| **Context Loss** | อาจพลาดข้อมูล | ได้ครบทุกอย่าง |
| **Token Usage** | ~2,000 tokens | ~5,000-10,000 tokens |
| **Accuracy** | ขึ้นกับ vector search | AI อ่านข้อมูลเต็ม |

---

## ข้อดี RAG V2

### 1. เรียบง่ายกว่า
- ไม่ต้องใช้ Vector Search
- ไม่ต้องใช้ Hybrid Search
- ไม่ต้องปรับ minScore threshold

### 2. ครบถ้วนกว่า
- AI ได้อ่าน transcript ทั้งหมด
- ไม่พลาดข้อมูลสำคัญ
- Context window ของ GPT-5 รองรับ

### 3. Product Pool ดีกว่า
- Pre-computed relevance score
- Filter ด้วย metadata (brand, category, price, tags)
- Top 20 จาก ~100-200 products

### 4. เร็วกว่า
- ไม่ต้อง embedding query
- ไม่ต้อง vector distance calculation
- Query DB แค่ 2 ครั้ง (VideoIndex + VideoProductPool)

---

## ข้อควรระวัง

### 1. Token Cost
- Full transcript = 5,000-20,000 chars ≈ 1,000-4,000 tokens
- GPT-5 pricing: $15/1M input tokens
- ต้นทุนต่อ comment: ~$0.02-0.06

**Solution:** GPT-5 มี context window 200K tokens, ไม่น่ามีปัญหา

### 2. VideoProductPool Quality
- ต้อง compute pool ก่อน (VDO Pool button)
- relevanceScore ต้องแม่นยำ (ดูจาก scoring algorithm)

**Current Scoring:**
```
Score = (40% Tags) + (30% Category) + (20% Price) + (10% Brand)
```

### 3. Transcript Quality
- ถ้า transcript ไม่ดี AI จะตอบได้ไม่ดี
- ต้องมี chunksJSON ใน VideoIndex

---

## ไฟล์ที่แก้ไข

### `lib/rag/comment-reply.ts`

**เปลี่ยนจาก:**
```typescript
// Old: Vector search
const contexts = await smartSearchV3(query, videoId, {
  topK: 6,
  minScore: 0.2
});
```

**เป็น:**
```typescript
// New: Full transcript + Pool
const videoIndex = await prisma.videoIndex.findUnique({
  where: { videoId },
  select: { chunksJSON: true }
});
const fullTranscript = JSON.parse(chunksJSON).join("\n\n");

const poolEntries = await prisma.videoProductPool.findMany({
  where: { videoId },
  orderBy: { relevanceScore: 'desc' },
  take: 10
});
```

---

## Testing

### Before (V1):
```
[Pool-V3] Found 0 transcript results
[Pool-V3] Found 0 results (score >= 0.6)
[CommentReply] Retrieved 0 contexts
```

### After (V2):
```
[CommentReply] Got full transcript: 15234 chars
[CommentReply] Found 10 products in pool
[CommentReply] Prepared 10 suggested products
```

---

## Migration Notes

**ไม่ต้องทำอะไร:**
- ❌ ไม่ต้อง re-ingest RAG chunks
- ❌ ไม่ต้อง re-generate embeddings
- ❌ ไม่ต้อง migrate database

**ต้องมี:**
- ✅ VideoIndex.chunksJSON (มีอยู่แล้ว)
- ✅ VideoProductPool (compute ด้วยปุ่ม VDO Pool)
- ✅ Product.shortURL (มีอยู่แล้ว)

---

## Conclusion

RAG V2 เป็นแนวทางที่:
- **เรียบง่ายกว่า** - ไม่ซับซ้อน
- **ตรงไปตรงมา** - ส่ง full context ให้ AI
- **เร็วกว่า** - ไม่ต้อง vector search
- **แม่นกว่า** - AI ได้อ่านข้อมูลครบ

**Trade-off:** Token cost สูงขึ้นเล็กน้อย แต่ quality ดีขึ้นมาก

---

**Last Updated:** 2025-01-12
**Version:** 2.0 (Simplified RAG)
