# Troubleshooting: Draft Generation Issues

## 🔍 Problem: Draft Status Stays "PENDING"

### Symptoms
- คลิกปุ่ม "Send to AI"
- Draft ถูกสร้างแต่ status ยังคงเป็น `PENDING`
- ไม่มีการเปลี่ยนแปลงแม้รอนาน

---

## 🛠️ Root Cause Analysis

### Case Study: Video `XipK40MQCrw`

เมื่อรัน diagnostic script:

```bash
npx tsx debug-video.ts
```

**ผลการตรวจสอบ:**

```
✅ Video found:
   - Title: 5 แท็บเล็ต 2025 ราคาคุ้ม จอใหญ่
   - Status: READY
   - Tags: No brand
   - Has transcript: NO          ⚠️
   - Transcript length: 0 chars  ❌ ปัญหาตรงนี้!

✅ Matching products: 495
✅ Comments: 1 (with draft)
⚠️ Transcript NOT indexed in RAG
```

### **สาเหตุหลัก:**

Video มี `status: READY` แต่ **transcript field เป็นค่าว่าง** (empty string หรือ null)

ระบบเดิมเช็คแค่ `status === READY` แต่ไม่ได้เช็คว่า transcript มีเนื้อหาจริงหรือไม่

---

## ✅ Solution

### 1. Fixed Code

แก้ไขใน `lib/draftServiceWithRAG.ts`:

**Before:**
```typescript
if (!videoIndex || videoIndex.status !== IndexStatus.READY) {
  console.log(`Skipping video ${videoId} - transcript not ready`);
  continue;
}
```

**After:**
```typescript
if (!videoIndex || videoIndex.status !== IndexStatus.READY) {
  console.log(`Skipping video ${videoId} - transcript not ready`);
  continue;
}

// ✅ เพิ่มการเช็ค transcript content
if (!videoIndex.transcript || videoIndex.transcript.trim().length === 0) {
  console.log(`Skipping video ${videoId} - transcript is empty`);
  continue;
}
```

### 2. Diagnostic Script

สร้าง script สำหรับตรวจสอบ video:

```bash
npx tsx debug-video.ts
```

Script นี้จะตรวจสอบ:
- ✅ Video status และ metadata
- ✅ Transcript content (มีหรือไม่)
- ✅ Comments และ drafts
- ✅ Matching products
- ✅ RAG indexing status

---

## 📋 Checklist: ก่อนใช้ "Send to AI"

เมื่อต้องการใช้ปุ่ม "Send to AI" ตรวจสอบว่า:

1. **Video ต้องมี Transcript:**
   - ❌ Status `READY` อย่างเดียว **ไม่พอ**
   - ✅ ต้องมีเนื้อหา transcript จริงๆ (length > 0)

2. **Video ต้องมี Tags:**
   - Tags จะใช้หา products ที่เกี่ยวข้อง
   - ถ้าไม่มี tags = ไม่มี products = ไม่สามารถ generate ได้

3. **ต้องมี Products ที่ match tags:**
   - ต้องมีอย่างน้อย 1 product ที่มี tag ตรงกับ video

4. **Comment ต้องยังไม่มี Draft:**
   - ระบบจะข้ามcomments ที่มี draft อยู่แล้ว

---

## 🔧 How to Fix Empty Transcript

### ตัวเลือก 1: Process Transcript ใหม่

```bash
# ใช้ API endpoint เพื่อ process transcript ใหม่
curl -X POST "http://localhost:3000/api/videos/process?videoId=XipK40MQCrw"
```

### ตัวเลือก 2: Manual Update via Prisma Studio

1. เปิด Prisma Studio:
   ```bash
   npx prisma studio
   ```

2. ไปที่ table `VideoIndex`

3. หา record ที่ `videoId = XipK40MQCrw`

4. เช็ค field `transcript`:
   - ถ้าเป็น `null` หรือ `""` (empty)
   - แสดงว่า YouTube API ไม่ส่ง transcript มา (อาจเป็น video ที่ไม่มี subtitle)

### ตัวเลือก 3: Use Video with Transcript

เลือก video อื่นที่มี transcript จริงๆ:

```bash
# Check videos ที่มี transcript
npx prisma studio
# เปิด VideoIndex table
# กรอง WHERE transcript IS NOT NULL AND transcript != ''
```

---

## 🎯 ตัวอย่างการใช้งาน

### 1. เช็ค Video ก่อนใช้

```typescript
// สร้างไฟล์ check-video.ts
import { prisma } from "./lib/db";

const videoId = "YOUR_VIDEO_ID";

const video = await prisma.videoIndex.findUnique({
  where: { videoId },
  select: {
    status: true,
    transcript: true,
    tags: true,
  },
});

console.log({
  hasTranscript: !!video?.transcript && video.transcript.length > 0,
  transcriptLength: video?.transcript?.length || 0,
  status: video?.status,
  tags: video?.tags,
});
```

```bash
npx tsx check-video.ts
```

### 2. หา Videos ที่พร้อมใช้

```typescript
const readyVideos = await prisma.videoIndex.findMany({
  where: {
    status: "READY",
    transcript: { not: null },
    tags: { isEmpty: false },
  },
  select: {
    videoId: true,
    title: true,
    tags: true,
  },
});

console.log(`Found ${readyVideos.length} videos ready for draft generation`);
```

---

## 📊 Common Error Messages

### "Skipping video - transcript not ready"

**สาเหตุ:**
- Video status ไม่ใช่ `READY`
- อาจเป็น `PENDING`, `PROCESSING`, `ERROR`

**แก้ไข:**
- รอให้ processing เสร็จ
- หรือ re-process video

### "Skipping video - transcript is empty"

**สาเหตุ:**
- Video status เป็น `READY` แต่ transcript เป็นค่าว่าง
- YouTube ไม่มี subtitle/caption สำหรับ video นี้

**แก้ไข:**
- เลือก video อื่นที่มี transcript
- หรืออัปโหลด caption เอง (ถ้าเป็น video ของตัวเอง)

### "No products found with tags matching video tags"

**สาเหตุ:**
- Video มี tags แต่ไม่มี product ไหนที่มี tag ตรงกัน

**แก้ไข:**
- เพิ่ม tags ให้ products
- หรือเปลี่ยน tags ของ video

### "No comments to process"

**สาเหตุ:**
- Comments ทั้งหมดมี draft อยู่แล้ว

**แก้ไข:**
- ลบ drafts ที่ต้องการ generate ใหม่
- หรือรอcomment ใหม่

---

## 🚀 Best Practices

### 1. ตรวจสอบก่อนใช้

```bash
# Run diagnostic script
VIDEO_ID="XipK40MQCrw" npx tsx debug-video.ts
```

### 2. Process Videos in Bulk

```typescript
// แนะนำให้ process videos ที่มี transcript พร้อมก่อน
const readyVideos = await prisma.videoIndex.findMany({
  where: {
    status: "READY",
    transcript: {
      not: null,
      not: ""  // Not empty
    },
    tags: { isEmpty: false },
  },
});

console.log(`${readyVideos.length} videos ready for processing`);
```

### 3. Monitor Logs

เช็ค dev server logs ดูว่า video ถูก skip หรือไม่:

```
[draftService:RAG] ⏭️  Skipping video XipK40MQCrw - transcript is empty
```

### 4. Use RAG Stats

```bash
curl http://localhost:3000/api/rag/stats
```

เช็คว่า transcripts และ products ถูก index แล้วหรือยัง

---

## 📝 Summary

**การแก้ปัญหา Draft ค้าง PENDING:**

1. ✅ **เพิ่มการเช็ค transcript content** (ไม่ใช่แค่ status)
2. ✅ **สร้าง diagnostic script** เพื่อตรวจสอบ video
3. ✅ **Log ชัดเจน** ว่าทำไมถึง skip video
4. ✅ **Documentation** สำหรับ troubleshooting

**Next Steps:**

- เลือก video ที่มี transcript จริงๆ ทดสอบ
- ถ้าต้องการใช้ video `XipK40MQCrw` ต้อง process transcript ก่อน
- ใช้ `debug-video.ts` เช็คก่อนทุกครั้ง

---

## 🔗 Related Files

- [lib/draftServiceWithRAG.ts](lib/draftServiceWithRAG.ts) - Main draft generation service
- [debug-video.ts](debug-video.ts) - Diagnostic script
- [RAG_INTEGRATION.md](RAG_INTEGRATION.md) - RAG integration docs
- [TESTING_RAG.md](TESTING_RAG.md) - Testing guide
