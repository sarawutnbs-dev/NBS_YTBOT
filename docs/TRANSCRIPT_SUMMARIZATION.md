# Transcript Summarization Flow (GPT-5)

## Overview

เปลี่ยนจากการ Embed transcript chunks โดยตรง เป็นการให้ GPT-5 สรุปก่อน แล้วค่อย Embed summary

**เดิม (Old Flow):**
```
YouTube Transcript → Chunk (12KB chunks) → Embed → Store in RAG
```

**ใหม่ (New Flow):**
```
YouTube Transcript → GPT-5 Summarize → Embed Summary → Store in RAG
                   ↓
                Save full transcript to VideoIndex.chunksJSON
```

---

## Benefits

### 1. Better Embedding Quality
- Summary มีข้อมูลที่กระชับ เข้าใจง่าย
- Embedding จับ context ได้ดีกว่า raw transcript chunks
- Semantic search แม่นยำขึ้น

### 2. Reduced Token Usage
- แทนที่จะ embed transcript ยาว 20,000 chars (หลาย chunks)
- ตอนนี้ embed แค่ summary 2,000-3,000 chars (1 chunk)
- ประหยัด embedding cost ประมาณ 80-90%

### 3. Category Detection
- GPT-5 จัดหมวดหมู่สินค้าให้อัตโนมัติ
- Categories: `Notebook`, `PC Component`, `Smartphone`, `Tablet`, `Unknown`
- ใช้ได้สำหรับ filtering และ analytics

### 4. Human-Readable Summary
- สรุปที่ GPT-5 สร้างอ่านง่าย เข้าใจได้
- สามารถนำไปแสดงใน UI ได้เลย
- ไม่ต้องอ่าน transcript ยาวๆ

---

## Implementation Details

### 1. Database Schema Changes

**Added to VideoIndex:**
```prisma
model VideoIndex {
  // ... existing fields
  summaryText     String?  // GPT-5 generated summary (400-600 words)
  summaryCategory String?  // Category: Notebook | PC Component | Smartphone | Tablet | Unknown
  // ... existing fields
}
```

**Migration:**
```bash
npx prisma db push
```

---

### 2. GPT-5 Summarizer

**File:** `lib/rag/transcript-summarizer.ts`

**Function:**
```typescript
summarizeTranscriptWithGPT5(
  transcript: string,
  videoTitle: string
): Promise<TranscriptSummary>
```

**Output:**
```json
{
  "video_title": "ชื่อวิดีโอรีวิว",
  "category": "Notebook | PC Component | Smartphone | Tablet | Unknown",
  "summary_text": "สรุปรีวิวทั้งหมด 400-600 คำ..."
}
```

**Features:**
- ✅ JSON mode output
- ✅ 400-600 word summaries
- ✅ Automatic category detection
- ✅ Fallback mechanism (returns first 2000 chars if GPT-5 fails)
- ✅ Proper error handling

---

### 3. Modified Transcript Processing

**File:** `lib/videoIndexService.ts`

**Function:** `scrapeAndProcessTranscript()`

**New Steps:**
1. Scrape transcript from YouTube
2. **NEW:** Summarize with GPT-5
3. **NEW:** Save summary to `summaryText` and `summaryCategory`
4. Create chunks for backward compatibility
5. **CHANGED:** Ingest summary (not full transcript) into RAG

**Code:**
```typescript
// NEW: Summarize with GPT-5
const gpt5Summary = await summarizeTranscriptWithGPT5(text, current.title);

// NEW: Ingest summary instead of full transcript
await ingestTranscript({
  transcript: gpt5Summary.summary_text,  // Use summary!
  // ... other fields
}, false);

// NEW: Save summary to DB
await prisma.videoIndex.updateMany({
  data: {
    summaryText: gpt5Summary.summary_text,
    summaryCategory: gpt5Summary.category,
    // ...
  },
});
```

---

### 4. RAG Integration

**File:** `lib/rag/ingest.ts`

**Function:** `ingestTranscript()`

**Behavior:**
- Receives `gpt5Summary.summary_text` instead of full transcript
- Normalizes the summary
- Chunks the summary (typically 1 chunk since summary is ~2000 chars)
- Creates embedding(s) for the summary
- Stores in RagDocument and RagChunk tables

**Result:**
- Old: 10-20 transcript chunks per video
- New: 1 summary chunk per video

---

## Testing

### Test Script

**File:** `scripts/test-transcript-summarizer.ts`

**Run:**
```bash
npx tsx scripts/test-transcript-summarizer.ts
```

**Test Cases:**
1. ✅ GPT-5 summarization API call
2. ✅ JSON output validation
3. ✅ Category detection
4. ✅ Summary length check (300-800 words)
5. ✅ Fallback mechanism on error

**Example Output:**
```
Video Title: รีวิว ASUS VivoBook 16 X1605VA โน๊ตบุ๊คสเปกดี ราคาไม่เกิน 20,000 บาท
Category: Notebook
Summary Length: 2345 chars
Time Taken: 461ms
```

---

## Usage Flow

### 1. Video Indexing

When a new video is indexed:

```typescript
// User clicks "Refresh" or system auto-indexes
ensureVideoIndex(videoId, { forceReindex: true });
  ↓
scrapeAndProcessTranscript(videoId);
  ↓
const transcript = await scrapeTranscriptFromTubeTranscript(videoId);
  ↓
const summary = await summarizeTranscriptWithGPT5(transcript, title);
  ↓
await ingestTranscript({ transcript: summary.summary_text }, false);
  ↓
await prisma.videoIndex.updateMany({
  data: {
    chunksJSON: JSON.stringify(chunks),        // Full transcript
    summaryText: summary.summary_text,         // NEW: GPT-5 summary
    summaryCategory: summary.category,         // NEW: Category
    // ...
  }
});
```

### 2. Comment Reply Generation

When AI replies to a comment:

```typescript
// RAG V2: Full transcript + Product pool
const videoIndex = await prisma.videoIndex.findUnique({
  select: { chunksJSON: true, summaryText: true }
});

// Use FULL transcript (not summary) for comment replies
const fullTranscript = JSON.parse(videoIndex.chunksJSON).join("\n\n");

// Use VideoProductPool for products
const products = await prisma.videoProductPool.findMany({
  where: { videoId },
  orderBy: { relevanceScore: 'desc' },
  take: 20
});

// Send to GPT-5
await chatCompletion([
  { role: "system", content: systemPrompt + fullTranscript + products },
  { role: "user", content: commentText }
]);
```

**Note:** We still use **full transcript** for comment replies (RAG V2 approach), but store **summary embeddings** for potential future uses like video search/discovery.

---

## Cost Analysis

### Token Usage

**Old Approach:**
- Transcript: 20,000 chars = ~5,000 tokens
- Create 10-20 chunks
- Embedding cost: 10-20 × embed_model_cost

**New Approach:**
- Transcript: 20,000 chars (stored, not embedded)
- GPT-5 summarization: ~5,000 input + ~1,000 output = ~6,000 tokens
- Summary: 2,000 chars = ~500 tokens
- Embedding cost: 1 × embed_model_cost

**Savings:**
- Embedding: -80-90%
- Additional: GPT-5 summarization cost (~$0.03-0.05 per video)
- Overall: Break-even or slight savings, with much better quality

---

## GPT-5 Prompt

**System Prompt:**
```
คุณเป็น AI ที่ช่วยสรุปเนื้อหาวิดีโอรีวิวสินค้าเทคโนโลยี

หน้าที่ของคุณ:
1. อ่าน Transcript ของวิดีโอรีวิวทั้งหมด
2. สรุปเนื้อหาที่สำคัญแบบรัดกุม ชัดเจน ครบถ้วน
3. ระบุหมวดหมู่สินค้าที่รีวิว (Notebook, PC Component, Smartphone, Tablet, Unknown)
4. จัดรูปแบบเป็น JSON

คำแนะนำการสรุป:
- ความยาว: 400-600 คำ (ไม่เกิน 1 หน้า A4)
- โครงสร้าง: แนะนำสินค้า → คุณสมบัติเด่น → จุดเด่น/จุดด้อย → ราคาและความคุ้มค่า → สรุปคำแนะนำ
- เนื้อหา: ชื่อรุ่น, สเปก, ราคา, จุดเด่น/ด้อย, การใช้งาน, คำแนะนำ
- ภาษา: ไทยที่เป็นธรรมชาติ อ่านง่าย
```

**User Prompt:**
```
วิดีโอ: "{videoTitle}"

Transcript:
{fullTranscript}

---

โปรดสรุป Transcript ข้างต้นเป็น JSON ตามรูปแบบที่กำหนด
```

---

## Error Handling

### Fallback Mechanism

If GPT-5 fails (API error, timeout, etc.):

```typescript
try {
  const summary = await summarizeTranscriptWithGPT5(transcript, title);
} catch (error) {
  // Fallback: Use first 2000 chars of transcript
  return {
    video_title: videoTitle,
    category: "Unknown",
    summary_text: transcript.substring(0, 2000) + "...",
  };
}
```

**Advantages:**
- ✅ System continues to work even if GPT-5 is down
- ✅ Transcript is still stored and indexed
- ✅ Can retry summarization later
- ✅ User experience not disrupted

---

## Future Enhancements

### 1. Video Search/Discovery
Use summary embeddings to find similar videos:
```typescript
const query = "โน๊ตบุ๊คเล่นเกม RTX 4060";
const results = await vectorSearch(query, {
  sourceType: "transcript",
  topK: 10
});
```

### 2. Topic Clustering
Group videos by similarity using summary embeddings:
```typescript
const clusters = await kMeansClustering(summaryEmbeddings, k=10);
```

### 3. Smart Recommendations
Recommend related videos based on summary similarity:
```typescript
const relatedVideos = await findSimilarVideos(currentVideoId, limit=5);
```

### 4. Analytics Dashboard
Show category distribution and trends:
```sql
SELECT summaryCategory, COUNT(*)
FROM VideoIndex
WHERE summaryCategory IS NOT NULL
GROUP BY summaryCategory;
```

---

## Migration Notes

### Existing Videos

Old videos (without summaries) will still work:
- `summaryText` and `summaryCategory` are nullable
- Fallback to `chunksJSON` if summary not available
- Can trigger re-indexing with "Refresh" button

### Re-summarize All Videos

To regenerate summaries for all existing videos:

```bash
# Force re-index all videos
npx tsx scripts/reindex-all-videos.ts --force
```

---

## Monitoring

### Logs to Watch

```typescript
[TranscriptSummarizer] Summarizing transcript...
[TranscriptSummarizer] Title: {title}
[TranscriptSummarizer] Transcript length: {length} chars
[openai:gpt-5] Calling Responses API with 2 messages
[TranscriptSummarizer] ✅ Summary generated successfully
[TranscriptSummarizer] Category: {category}
[TranscriptSummarizer] Summary length: {length} chars
```

### Metrics to Track

- Summary generation success rate
- Average summary length
- Category distribution
- GPT-5 API latency
- Fallback usage rate

---

## Troubleshooting

### Issue: GPT-5 Returns Empty Summary

**Cause:** JSON parsing failed or output_text not found

**Solution:** Check GPT-5 response structure in logs
```typescript
console.log("[openai:gpt-5] Response structure:", JSON.stringify(response, null, 2));
```

### Issue: Category is Always "Unknown"

**Cause:** GPT-5 not detecting category from transcript

**Solution:** Improve system prompt or add more context

### Issue: Summary Too Short/Long

**Cause:** GPT-5 not following word count guideline

**Solution:** Adjust `maxTokens` parameter or improve prompt

---

## Files Modified

1. **prisma/schema.prisma** - Added `summaryText` and `summaryCategory` fields
2. **lib/rag/transcript-summarizer.ts** - NEW: GPT-5 summarization function
3. **lib/videoIndexService.ts** - Modified transcript processing flow
4. **scripts/test-transcript-summarizer.ts** - NEW: Test script

---

**Last Updated:** 2025-01-12
**Version:** 1.0 (GPT-5 Summarization)
