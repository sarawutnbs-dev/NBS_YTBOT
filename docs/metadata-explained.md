# Metadata ใน RAG System คืออะไร?

## 📋 สารบัญ
1. [Metadata คืออะไร](#metadata-คืออะไร)
2. [โครงสร้าง Metadata](#โครงสร้าง-metadata)
3. [การใช้งาน 5 ประเภท](#การใช้งาน-5-ประเภท)
4. [ตัวอย่างจริงจากระบบ](#ตัวอย่างจริงจากระบบ)
5. [Best Practices](#best-practices)

---

## Metadata คืออะไร?

**Metadata = ข้อมูลเกี่ยวกับข้อมูล (Data about Data)**

ในระบบ RAG, metadata คือข้อมูลเพิ่มเติมที่เก็บไว้กับแต่ละ chunk เพื่อ:
- ✅ **Filter** - กรองข้อมูลตามเงื่อนไข
- ✅ **Display** - แสดงข้อมูลโดยไม่ต้อง query table อื่น
- ✅ **Context** - ให้บริบทเพิ่มเติมสำหรับ AI
- ✅ **Trace** - ติดตามว่าข้อมูลมาจากไหน

---

## โครงสร้าง Metadata

### Database Schema

```typescript
// RagDocument table
model RagDocument {
  id         Int      @id @default(autoincrement())
  sourceType String   // "product" | "transcript" | "comment"
  sourceId   String   // ID ของแหล่งที่มา
  meta       Json     // ← Metadata เก็บที่นี่
  createdAt  DateTime
  updatedAt  DateTime
  chunks     RagChunk[]
}

// RagChunk table
model RagChunk {
  id         Int      @id @default(autoincrement())
  docId      Int      // Foreign key → RagDocument
  chunkIndex Int      // ลำดับ chunk (0, 1, 2, ...)
  text       String   // ข้อความของ chunk
  meta       Json     // ← Metadata ของ chunk นี้
  embedding  Vector   // Embedding 1536 มิติ
  createdAt  DateTime
}
```

### Metadata Types

#### 1. **Product Metadata**

```typescript
// RagDocument.meta (Product)
{
  "name": "Lenovo LOQ Gaming 15IRX10",
  "price": 36090,
  "url": "https://nbsi.me/ezt8",
  "tags": ["Lenovo", "Gaming"],
  "category": "Notebook"
}

// RagChunk.meta (Product Chunk)
{
  "name": "Lenovo LOQ Gaming 15IRX10",
  "price": 36090,
  "url": "https://nbsi.me/ezt8",
  "tags": ["Lenovo", "Gaming"],
  "chunkType": "summary"  // ← เพิ่มประเภท chunk
}
```

#### 2. **Transcript Metadata**

```typescript
// RagDocument.meta (Transcript)
{
  "videoId": "dWL68XA91qo",
  "title": "โน้ตบุ๊คเล่นเกมในงบไม่เกิน 40000 บาท",
  "channelName": "NotebookSPEC",
  "publishedAt": "2025-07-03T11:01:12.000Z",
  "duration": 785  // วินาที
}

// RagChunk.meta (Transcript Chunk)
{
  "videoId": "dWL68XA91qo",
  "title": "โน้ตบุ๊คเล่นเกมในงบไม่เกิน 40000 บาท",
  "channelName": "NotebookSPEC",
  "startTime": 120,  // ← เริ่มที่วินาทีที่ 120 (2 นาที)
  "endTime": 180     // ← จบที่วินาทีที่ 180 (3 นาที)
}
```

#### 3. **Comment Metadata**

```typescript
// RagDocument.meta (Comment)
{
  "videoId": "dWL68XA91qo",
  "authorName": "John Doe",
  "publishedAt": "2025-01-13T10:00:00.000Z",
  "likeCount": 42
}

// RagChunk.meta (Comment Chunk)
{
  "videoId": "dWL68XA91qo",
  "authorName": "John Doe",
  "publishedAt": "2025-01-13T10:00:00.000Z"
}
```

---

## การใช้งาน 5 ประเภท

### ✅ 1. Filter by Metadata (กรองข้อมูล)

**Use Case:** ค้นหา chunks เฉพาะจากวิดีโอที่ระบุ

```sql
-- PostgreSQL JSONB query
SELECT *
FROM "RagChunk" c
JOIN "RagDocument" d ON c."docId" = d.id
WHERE d."sourceType" = 'transcript'
  AND d.meta->>'videoId' = 'dWL68XA91qo'  -- ← Filter by videoId
ORDER BY c."chunkIndex"
```

**TypeScript Code:**

```typescript
// lib/rag/retriever.ts
export async function vectorSearch(
  queryEmbedding: number[],
  options: { videoId?: string }
) {
  if (options.videoId) {
    // เพิ่มเงื่อนไข filter
    conditions.push(`d.meta->>'videoId' = $${paramIndex}`);
    params.push(options.videoId);
  }

  // ...ทำ vector search เฉพาะ videoId นี้
}
```

**ผลลัพธ์:**
```
✅ ได้เฉพาะ transcript chunks จากวิดีโอ dWL68XA91qo
❌ ไม่ได้ chunks จากวิดีโออื่น
```

---

### ✅ 2. Display Information (แสดงข้อมูล)

**Use Case:** แสดงข้อมูลสินค้าโดยไม่ต้อง query Product table

```typescript
// app/api/similarity/search/route.ts

// ❌ แบบเก่า: Query Product table (ช้า + อาจไม่เจอ)
const products = await prisma.product.findMany({
  where: { shopeeProductId: { in: sourceIds } }
});

// ✅ แบบใหม่: ใช้ metadata จาก RagDocument (เร็ว + ได้แน่นอน)
const productsWithScores = productResults.map(result => {
  const meta = result.meta as any;
  return {
    id: result.sourceId,
    name: meta.name,        // ← จาก metadata
    price: meta.price,      // ← จาก metadata
    shortUrl: meta.url,     // ← จาก metadata
    score: result.score
  };
});
```

**ข้อดี:**
- ⚡ เร็วกว่า (ไม่ต้อง JOIN กับ Product table)
- 🎯 ได้แน่นอน (แม้สินค้าถูกลบจาก Product table แล้ว)
- 🔄 ข้อมูลสอดคล้องกับตอนที่ index

---

### ✅ 3. Context for AI (บริบทสำหรับ AI)

**Use Case:** ให้ AI เห็นข้อมูลเพิ่มเติม

```typescript
// lib/rag/comment-reply.ts

// Build context with metadata
const context = searchResults.map(r => {
  const meta = r.meta as any;

  if (r.sourceType === 'product') {
    return `
      สินค้า: ${meta.name}
      ราคา: ${meta.price} บาท
      URL: ${meta.url}
      Tags: ${meta.tags?.join(', ')}

      รายละเอียด: ${r.text}
    `;
  }

  if (r.sourceType === 'transcript') {
    return `
      วิดีโอ: ${meta.title}
      เวลา: ${meta.startTime}-${meta.endTime} วินาที

      ข้อความ: ${r.text}
    `;
  }
});

// Send to AI
const response = await openai.chat.completions.create({
  messages: [
    { role: 'system', content: 'คุณคือผู้ช่วยแนะนำโน๊ตบุ๊ค...' },
    { role: 'user', content: context.join('\n\n---\n\n') }
  ]
});
```

**ตัวอย่าง Context ที่ส่งให้ AI:**

```
สินค้า: Lenovo LOQ Gaming 15IRX10
ราคา: 36,090 บาท
URL: https://nbsi.me/ezt8
Tags: Lenovo, Gaming

รายละเอียด: โน๊ตบุ๊คเกมมิ่ง CPU Intel Core Ultra 7-155H
(16 Cores) การ์ดจอ RTX 5060 8GB หน่วยความจำ 16GB DDR5
---
วิดีโอ: โน้ตบุ๊คเล่นเกมในงบไม่เกิน 40000 บาท
เวลา: 120-180 วินาที

ข้อความ: แนะนำสินค้า Lenovo LOQ 15 Gen 10 รุ่น CTO
สั่งประกอบจากโรงงาน ราคาเริ่มต้น 36,090 บาท...
```

---

### ✅ 4. Chunk Type Filtering (กรอง chunk ตามประเภท)

**Use Case:** ค้นหาเฉพาะ summary chunks (ไม่เอา detail chunks)

```sql
-- Get only summary chunks
SELECT *
FROM "RagChunk" c
WHERE c.meta->>'chunkType' = 'summary'
```

**ทำไมต้องแยก chunk type?**

Product มี 2 ประเภท chunks:
1. **Summary chunk** - บทสรุป 1-2 ประโยค (สั้น)
2. **Detail chunk** - รายละเอียดเต็ม (ยาว)

```typescript
// Product chunks example
{
  chunkType: "summary",
  text: "Lenovo LOQ Gaming RTX 5060 ราคา 36,090 บาท"
}

{
  chunkType: "detail",
  text: "โน๊ตบุ๊คเกมมิ่ง CPU Intel Core Ultra 7-155H
        (16 Cores, 22 Threads) การ์ดจอ Nvidia GeForce RTX
        5060 8GB GDDR6 หน่วยความจำ 16GB DDR5-5600MHz..."
}
```

**Use Case:**
- ❓ User ถาม "แนะนำ notebook gaming" → ใช้ **summary** (รวดเร็ว)
- 📊 ต้องการข้อมูลครบ → ใช้ **detail** (ละเอียด)

---

### ✅ 5. Time-based Filtering (กรองตามเวลา)

**Use Case:** ค้นหา transcript หลังนาทีที่ 2

```sql
-- Get transcript after 2 minutes (120 seconds)
SELECT *
FROM "RagChunk" c
WHERE c.meta->>'startTime' >= '120'
ORDER BY CAST(c.meta->>'startTime' AS INTEGER)
```

**TypeScript:**

```typescript
// Get transcript from specific time range
const chunks = await prisma.$queryRaw`
  SELECT *
  FROM "RagChunk" c
  JOIN "RagDocument" d ON c."docId" = d.id
  WHERE d."sourceType" = 'transcript'
    AND CAST(c.meta->>'startTime' AS INTEGER) >= 120
    AND CAST(c.meta->>'startTime' AS INTEGER) <= 180
  ORDER BY CAST(c.meta->>'startTime' AS INTEGER)
`;

// Result: ได้ transcript ระหว่างนาทีที่ 2-3
```

**Use Case จริง:**
- 🎥 User คลิกเวลาในวิดีโอ → แสดง chunks ที่เกี่ยวข้อง
- 📝 สร้าง summary ของแต่ละช่วงเวลา
- 🔍 ค้นหาว่าสินค้าถูกกล่าวถึงตอนไหน

---

## ตัวอย่างจริงจากระบบ

### Example 1: Similarity Search API

```typescript
// app/api/similarity/search/route.ts

// Search with videoId filter
const transcriptResults = await hybridSearch(query, {
  topK: 10,
  sourceType: "transcript",
  videoId: videoId,  // ← Filter by metadata
  minScore: 0.3,
  queryEmbedding,
});

// Use metadata for display
const productsWithScores = productResults.map(result => {
  const meta = result.meta as any;
  return {
    name: meta.name,       // ← Display metadata
    price: meta.price,
    shortUrl: meta.url,
    score: result.score
  };
});
```

### Example 2: Comment Reply Generation

```typescript
// lib/rag/comment-reply.ts

// Get transcript chunks with metadata
const transcriptChunks = await prisma.$queryRaw`
  SELECT c.*, d.meta
  FROM "RagChunk" c
  JOIN "RagDocument" d ON c."docId" = d.id
  WHERE d."sourceType" = 'transcript'
    AND d.meta->>'videoId' = ${videoId}  // ← Filter
  ORDER BY c."chunkIndex"
`;

// Build context with metadata
transcriptChunks.forEach(chunk => {
  const meta = chunk.meta as any;
  contexts.push({
    type: 'transcript',
    videoTitle: meta.title,        // ← Use metadata
    videoId: meta.videoId,
    text: chunk.text,
    timestamp: `${meta.startTime}s - ${meta.endTime}s`
  });
});
```

---

## Best Practices

### ✅ DO

1. **เก็บข้อมูลที่ใช้บ่อย**
   ```typescript
   meta: {
     name: "Product Name",    // ✅ ใช้แสดงผล
     price: 36090,            // ✅ ใช้แสดงผล
     url: "https://...",      // ✅ ใช้แสดงผล
   }
   ```

2. **เก็บข้อมูลสำหรับ filter**
   ```typescript
   meta: {
     videoId: "dWL68XA91qo",  // ✅ ใช้ filter
     category: "Gaming",       // ✅ ใช้ filter
     chunkType: "summary"      // ✅ ใช้ filter
   }
   ```

3. **เก็บบริบทสำหรับ AI**
   ```typescript
   meta: {
     title: "Video Title",        // ✅ ให้ AI เห็นบริบท
     channelName: "Channel",      // ✅ ให้ AI รู้แหล่งที่มา
     publishedAt: "2025-01-13"    // ✅ ให้ AI รู้ว่าใหม่แค่ไหน
   }
   ```

### ❌ DON'T

1. **ไม่เก็บข้อมูลขนาดใหญ่**
   ```typescript
   meta: {
     fullDescription: "..." // ❌ เยอะเกินไป → เก็บใน text
   }
   ```

2. **ไม่เก็บข้อมูลที่เปลี่ยนบ่อย**
   ```typescript
   meta: {
     viewCount: 1000,  // ❌ เปลี่ยนทุกนาที → query จาก Video table
     likeCount: 50     // ❌ เปลี่ยนทุกนาที
   }
   ```

3. **ไม่เก็บข้อมูลที่ compute ได้**
   ```typescript
   meta: {
     priceFormatted: "36,090฿"  // ❌ format ตอนแสดงผล
   }
   ```

---

## สรุป

| ประเภท | จุดประสงค์ | ตัวอย่าง |
|--------|-----------|----------|
| **Filter** | กรองข้อมูล | `meta->>'videoId' = 'xxx'` |
| **Display** | แสดงผล | `meta.name`, `meta.price` |
| **Context** | ให้ AI | `meta.title`, `meta.tags` |
| **Type** | แยกประเภท | `meta.chunkType = 'summary'` |
| **Time** | ช่วงเวลา | `meta.startTime >= 120` |

**Metadata = ข้อมูลเล็กๆ ที่ช่วยให้:**
- 🚀 ค้นหาเร็วขึ้น (ไม่ต้อง JOIN)
- 🎯 แสดงผลได้ทันที (ไม่ต้อง query เพิ่ม)
- 🤖 AI ได้บริบทที่ดีขึ้น
- 🔍 Filter ได้แม่นยำ

**Golden Rule:** เก็บในที่เดียว อ่านได้ทุกที่! 📌
