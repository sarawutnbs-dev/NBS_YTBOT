# วิธีการคำนวณคะแนน Similarity

## ภาพรวม

ระบบใช้ **Hybrid Search** ผสมผสานระหว่าง:
1. **Vector Search (70%)** - ความหมายทางความหมาย (semantic similarity)
2. **Keyword Search (30%)** - การจับคู่คำที่แน่นอน (exact keyword matching)

---

## 1. Vector Search (Semantic Similarity)

### 1.1 Embedding คืออะไร?

Embedding คือการแปลงข้อความเป็น **vector ตัวเลข 1,536 มิติ**

```
ข้อความ: "ต้องการ Notebook gaming 40K"
       ↓ (OpenAI text-embedding-3-small)
Embedding: [0.123, -0.456, 0.789, ..., 0.321]  // 1,536 ตัวเลข
```

**คุณสมบัติสำคัญ:**
- คำที่มีความหมายใกล้กัน → embedding ใกล้กัน
- เช่น: "gaming laptop", "โน๊ตบุ๊คเล่นเกม" → embedding คล้ายกัน

### 1.2 การคำนวณ Cosine Similarity

ใช้ **Cosine Distance** จาก pgvector:

```sql
-- Cosine Distance Operator: <=>
-- คำนวณระยะห่างระหว่าง 2 vectors
score = 1 - (embedding1 <=> embedding2)
```

**สูตร Cosine Similarity:**

```
             A · B
cos(θ) = ───────────
          |A| × |B|
```

โดยที่:
- `A · B` = dot product (ผลคูณของแต่ละมิติแล้วรวมกัน)
- `|A|`, `|B|` = magnitude (ความยาวของ vector)
- `θ` = มุมระหว่าง 2 vectors

**ตัวอย่างการคำนวณ:**

```javascript
Query:   [0.8, 0.6]  // 2D example (จริงมี 1536 มิติ)
Product: [0.9, 0.5]

// Step 1: Dot Product
A · B = (0.8 × 0.9) + (0.6 × 0.5) = 0.72 + 0.30 = 1.02

// Step 2: Magnitudes
|A| = √(0.8² + 0.6²) = √(0.64 + 0.36) = √1.0 = 1.0
|B| = √(0.9² + 0.5²) = √(0.81 + 0.25) = √1.06 = 1.03

// Step 3: Cosine Similarity
cos(θ) = 1.02 / (1.0 × 1.03) = 0.990

// Final Score
score = 0.990 → 99.0% similarity ✅
```

**ช่วงคะแนน:**
- `1.0` (100%) = เหมือนกันทุกประการ
- `0.7-0.9` = คล้ายกันมาก
- `0.5-0.7` = คล้ายกันปานกลาง
- `0.3-0.5` = คล้ายกันเล็กน้อย
- `< 0.3` = ไม่ค่อยคล้ายกัน

### 1.3 Query SQL จริง

```sql
SELECT
  c.id,
  c.text,
  d."sourceType",
  d."sourceId",
  1 - (c.embedding <=> $1::vector) as score  -- Cosine Similarity
FROM "RagChunk" c
JOIN "RagDocument" d ON c."docId" = d.id
WHERE d."sourceType" = 'product'
  AND c.embedding IS NOT NULL
ORDER BY c.embedding <=> $1::vector  -- เรียงตามระยะห่างน้อยสุด
LIMIT 20
```

**ตัวอย่างผลลัพธ์:**

```
Query: "ต้องการ Notebook gaming 40K"

Results:
1. Lenovo LOQ Gaming    → score: 0.396 (39.6%)
2. Gigabyte A16 Gaming  → score: 0.396 (39.6%)
3. Lenovo Legion Slim   → score: 0.384 (38.4%)
4. Acer Nitro Lite      → score: 0.380 (38.0%)
```

---

## 2. Keyword Search (BM25-like)

### 2.1 PostgreSQL Full-Text Search

ใช้ `ts_rank` สำหรับจัดอันดับคำที่พบ:

```sql
-- แปลงข้อความเป็น tsvector
to_tsvector('english', 'Notebook gaming 40K RTX 5060')
  → 'gaming':2 'notebook':1 'rtx':4 '5060':5 '40k':3

-- สร้าง query
to_tsquery('english', 'notebook & gaming & 40k')
```

**การคำนวณ ts_rank:**

```javascript
// Simplified BM25 formula
score = Σ (term_frequency × IDF × normalization)

โดยที่:
- term_frequency = จำนวนครั้งที่คำปรากฏ
- IDF = log(total_docs / docs_with_term)  // ความหายาก
- normalization = 1 / (doc_length + avg_length)
```

**ตัวอย่าง:**

```
Query: "notebook gaming"
Document: "LENOVO NOTEBOOK GAMING LOQ 15"

term_frequency:
- "notebook" = 1 ครั้ง
- "gaming" = 1 ครั้ง

IDF (สมมุติ):
- "notebook" → log(7107/3000) = 0.37
- "gaming" → log(7107/500) = 1.15

ts_rank score ≈ (1 × 0.37) + (1 × 1.15) = 1.52
normalized → 0.60 (60%)
```

---

## 3. Hybrid Search (รวม Vector + Keyword)

### 3.1 การผสมคะแนน

```javascript
// Default weights
vectorWeight = 0.7    // 70%
keywordWeight = 0.3   // 30%

// ถ้าพบในทั้ง 2 วิธี
if (foundInBoth) {
  finalScore = (vectorScore × 0.7) + (keywordScore × 0.3)
}

// ถ้าพบแค่ vector
else if (foundInVectorOnly) {
  finalScore = vectorScore × 0.7
}

// ถ้าพบแค่ keyword
else if (foundInKeywordOnly) {
  finalScore = keywordScore × 0.3
}
```

### 3.2 ตัวอย่างการคำนวณ

**Query: "ต้องการ Notebook gaming 40K"**

**Product 1: Lenovo LOQ Gaming**
```
Vector Search:
  - cosine similarity = 0.565
  - weighted = 0.565 × 0.7 = 0.396 (39.6%)

Keyword Search:
  - ts_rank = 0.823
  - weighted = 0.823 × 0.3 = 0.247 (24.7%)

Final Score = 0.396 + 0.247 = 0.643 (64.3%) ✅
```

**Product 2: HP ProBook (office laptop)**
```
Vector Search:
  - cosine similarity = 0.280
  - weighted = 0.280 × 0.7 = 0.196 (19.6%)

Keyword Search:
  - ts_rank = 0.0 (ไม่มีคำ "gaming")
  - weighted = 0.0 × 0.3 = 0.0

Final Score = 0.196 + 0.0 = 0.196 (19.6%) ❌
```

---

## 4. Flow การคำนวณ (Step by Step)

```
[1] User Query
    "ต้องการ Notebook gaming 40K"
           ↓
[2] Create Embedding (OpenAI API)
    [0.123, -0.456, ..., 0.321]  // 1,536 dimensions
           ↓
[3] Parallel Search
    ┌─────────────────┐    ┌──────────────────┐
    │ Vector Search   │    │ Keyword Search   │
    │ (Cosine Sim)    │    │ (ts_rank)        │
    └────────┬────────┘    └────────┬─────────┘
             │                      │
    [4] Top 40 results      [5] Top 40 results
             │                      │
             └──────────┬───────────┘
                        ↓
           [6] Combine & Re-rank
              (weighted sum)
                        ↓
           [7] Sort by finalScore
                        ↓
              [8] Top 20 Results
```

---

## 5. ตัวอย่างผลลัพธ์จริง

**Query:** "ต้องการ Notebook gaming 40K"
**Video ID:** dWL68XA91qo

### Transcript Results:
```
1. Score: 32.9% - "ด้อย - ตัวเครื่องพลาสติกทั้งใบ, มี USB-C..."
2. Score: 32.7% - "แนะนำสินค้า: Lenovo LOQ 15 Gen 10..."
3. Score: 31.3% - "คีย์บอร์ด Full-size มี Numpad..."
```

### Product Results:
```
Rank | Score  | Name                          | Price
-----|--------|-------------------------------|--------
  1  | 39.6%  | Lenovo LOQ Gaming 15IRX10     | 36,090฿
  2  | 39.6%  | Gigabyte A16 3THK Gaming      | 39,660฿
  3  | 38.4%  | Lenovo Legion Slim 5          | 52,990฿
  4  | 38.0%  | Lenovo LOQ 15IRX9             | 27,190฿
  5  | 38.0%  | Acer Nitro Lite 16            | 23,990฿
```

**สังเกต:**
- ราคาใกล้ 40K = คะแนนสูง (38-40%)
- คำว่า "gaming" = คะแนนสูง
- Brand ที่เหมาะสม (Lenovo, Acer, Gigabyte)

---

## 6. ปัจจัยที่มีผลต่อคะแนน

### ✅ ปัจจัยที่ทำให้คะแนนสูง:

1. **ความหมายใกล้เคียง**
   - "gaming laptop" ≈ "โน๊ตบุ๊คเล่นเกม"
   - "40K" ≈ "ราคา 40,000"

2. **คำตรงทุกตัว**
   - Query: "Lenovo gaming"
   - Product: "LENOVO NOTEBOOK GAMING"
   - → คะแนน keyword สูง

3. **บริบทเดียวกัน**
   - Query มี "RTX"
   - Product มี "RTX 5060"
   - → embedding ใกล้กัน

### ❌ ปัจจัยที่ทำให้คะแนนต่ำ:

1. **ความหมายต่างกัน**
   - "gaming" vs "office work"
   - → embedding ห่างกัน

2. **ไม่มีคำตรง**
   - Query: "เล่นเกม"
   - Product: "gaming" (ไม่มีคำไทย)
   - → keyword score = 0

3. **ราคาต่างกันมาก**
   - Query: "40K"
   - Product: "120,000฿"
   - → คะแนนลดลง

---

## 7. การปรับแต่งคะแนน

### 7.1 เปลี่ยน Weights

```javascript
// ค้นหาแบบเน้นความหมาย
vectorWeight = 0.9, keywordWeight = 0.1

// ค้นหาแบบเน้นคำที่แน่นอน
vectorWeight = 0.5, keywordWeight = 0.5

// Default (balanced)
vectorWeight = 0.7, keywordWeight = 0.3
```

### 7.2 ปรับ minScore

```javascript
// เข้มงวดมาก (เฉพาะที่ตรงมาก)
minScore = 0.7  // 70%

// ปานกลาง
minScore = 0.5  // 50%

// ผ่อนปรน (รับทุกอย่าง)
minScore = 0.3  // 30%
```

### 7.3 ปรับ topK

```javascript
// ดึงผลลัพธ์เยอะ → คุณภาพลด
topK = 50

// ดึงผลลัพธ์น้อย → คุณภาพสูง
topK = 10
```

---

## 8. สรุป

| วิธีการ | การทำงาน | น้ำหนัก | จุดเด่น | จุดด้อย |
|---------|---------|---------|---------|---------|
| **Vector Search** | Cosine Similarity | 70% | จับความหมาย, ภาษาไทย-อังกฤษ | ช้า, ต้อง embed |
| **Keyword Search** | BM25 (ts_rank) | 30% | เร็ว, จับคำที่แน่นอน | ไม่เข้าใจความหมาย |
| **Hybrid** | รวม 2 วิธี | 100% | ได้ทั้ง 2 ข้อดี | ซับซ้อนกว่า |

**คะแนน 39.6% ดีไหม?**
- ✅ **ดีมาก** สำหรับ product search (ปกติ 30-45%)
- Query เฉพาะเจาะจง (gaming, 40K) → จับคู่ได้แม่นยำ
- ถ้าคะแนน > 50% แปลว่าตรงมาก (แทบจะเหมือนกัน)

