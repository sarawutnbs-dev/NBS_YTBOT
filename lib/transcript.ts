import { google } from "googleapis";
import { getEnv } from "./config";

const youtube = google.youtube("v3");

export async function fetchVideoMeta(videoId: string) {
  const env = getEnv();
  try {
    const response = await youtube.videos.list({
      key: env.YOUTUBE_API_KEY,
      part: ["snippet"],
      id: [videoId],
    });

    const video = response.data.items?.[0];
    return video
      ? {
          title: video.snippet?.title ?? "",
          description: video.snippet?.description ?? "",
          channelTitle: video.snippet?.channelTitle ?? "",
        }
      : null;
  } catch (error) {
    console.error("Error fetching video meta:", error);
    return null;
  }
}

export async function getCaptions(videoId: string): Promise<string | null> {
  const env = getEnv();
  try {
    // ดึง caption tracks
    const response = await youtube.captions.list({
      key: env.YOUTUBE_API_KEY,
      part: ["snippet"],
      videoId: videoId,
    });

    const captions = response.data.items;
    if (!captions || captions.length === 0) {
      return null;
    }

    // หา track ภาษาไทยหรืออังกฤษ
    const preferredTrack =
      captions.find((c) => c.snippet?.language === "th") ||
      captions.find((c) => c.snippet?.language === "en") ||
      captions[0];

    if (!preferredTrack?.id) {
      return null;
    }

    // ดาวน์โหลด caption (ต้องใช้ OAuth token ถ้าเป็น private video)
    // สำหรับ public video สามารถใช้ API key ได้
    const captionResponse = await youtube.captions.download({
      key: env.YOUTUBE_API_KEY,
      id: preferredTrack.id,
      tfmt: "srt",
    });

    return captionResponse.data as string;
  } catch (error) {
    console.error("Error fetching captions:", error);
    return null;
  }
}

export function chunkTranscript(text: string, maxChars = 400): string[] {
  const chunks: string[] = [];
  const sentences = text.split(/[.!?]\s+/);
  let currentChunk = "";

  for (const sentence of sentences) {
    if ((currentChunk + sentence).length > maxChars && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = sentence;
    } else {
      currentChunk += (currentChunk ? " " : "") + sentence;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

export async function buildIndex(chunks: string[]): Promise<{
  summaryJSON: {
    totalChunks: number;
    keywords: string[];
    topics: string[];
  };
}> {
  // TODO: ใช้ AI สร้าง summary/keywords จากชุด chunks
  // ตอนนี้ใช้แบบง่ายๆ ก่อน
  const allText = chunks.join(" ");
  const words = allText.toLowerCase().split(/\s+/);
  const wordCount: Record<string, number> = {};

  words.forEach((word) => {
    if (word.length > 3) {
      wordCount[word] = (wordCount[word] || 0) + 1;
    }
  });

  const topKeywords = Object.entries(wordCount)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([word]) => word);

  return {
    summaryJSON: {
      totalChunks: chunks.length,
      keywords: topKeywords,
      topics: [], // TODO: Extract topics using AI
    },
  };
}
