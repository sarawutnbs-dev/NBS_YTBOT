import { ingestTranscript } from "@/lib/rag/ingest";

async function main() {
  const sampleTranscript = {
    videoId: "TEST_VIDEO_001",
    title: "Sample: Notebook Buying Guide",
    channelName: "NBS Sample",
    publishedAt: new Date().toISOString(),
    transcript: `ในวิดีโอนี้เราจะพูดถึงวิธีเลือกโน้ตบุ๊กสำหรับการทำงานและการเล่นเกม \nเลือกซีพียู i5/i7 หรือ Ryzen 5/7 พร้อม RAM 16GB ขึ้นไป และ SSD อย่างน้อย 512GB\nสำหรับเกม 1080p เลือกการ์ดจอ RTX 3060 หรือเทียบเท่า`,
    duration: 300,
    viewCount: 100,
  };

  const result = await ingestTranscript(sampleTranscript, true);
  console.log("✅ Ingested sample transcript:", result);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
