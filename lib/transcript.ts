import { google } from "googleapis";
import { getEnv } from "./config";

type YoutubeClient = ReturnType<typeof google.youtube>;

let cachedOauthYoutube: YoutubeClient | null = null;
let cachedApiYoutube: YoutubeClient | null = null;

function getOauthYoutubeClient(): YoutubeClient | null {
  if (cachedOauthYoutube) {
    return cachedOauthYoutube;
  }

  const env = getEnv();

  if (!env.YOUTUBE_OAUTH_REFRESH_TOKEN) {
    return null;
  }

  const oauth2Client = new google.auth.OAuth2(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET);
  oauth2Client.setCredentials({ refresh_token: env.YOUTUBE_OAUTH_REFRESH_TOKEN });

  cachedOauthYoutube = google.youtube({
    version: "v3",
    auth: oauth2Client,
  });

  return cachedOauthYoutube;
}

function getApiKeyYoutubeClient(): YoutubeClient {
  if (!cachedApiYoutube) {
    const env = getEnv();
    cachedApiYoutube = google.youtube({
      version: "v3",
      auth: env.YOUTUBE_API_KEY,
    });
  }

  return cachedApiYoutube;
}

function getYoutubeClient(): YoutubeClient {
  return getOauthYoutubeClient() ?? getApiKeyYoutubeClient();
}

async function extractCaptionText(payload: unknown): Promise<string | null> {
  if (!payload) {
    return null;
  }

  if (typeof payload === "string") {
    return payload;
  }

  if (Buffer.isBuffer(payload)) {
    return payload.toString("utf-8");
  }

  if (payload instanceof Uint8Array) {
    return Buffer.from(payload).toString("utf-8");
  }

  const maybeAsync = payload as AsyncIterable<unknown>;

  if (maybeAsync && typeof maybeAsync[Symbol.asyncIterator] === "function") {
    let output = "";

    for await (const chunk of maybeAsync) {
      if (typeof chunk === "string") {
        output += chunk;
      } else if (Buffer.isBuffer(chunk)) {
        output += chunk.toString("utf-8");
      } else if (chunk instanceof Uint8Array) {
        output += Buffer.from(chunk).toString("utf-8");
      }
    }

    return output.length > 0 ? output : null;
  }

  return null;
}

export async function fetchVideoMeta(videoId: string) {
  const youtube = getYoutubeClient();
  try {
    const response = await youtube.videos.list({
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
  const youtube = getYoutubeClient();
  try {
    // ดึง caption tracks
    const response = await youtube.captions.list({
      part: ["id", "snippet"],
      videoId: videoId,
    });

    const captions = response.data.items;
    if (process.env.NODE_ENV !== "production") {
      const debugTracks = captions?.map((c) => ({
        id: c.id,
        language: c.snippet?.language,
        name: c.snippet?.name,
        trackKind: c.snippet?.trackKind,
        isAutoSynced: c.snippet?.isAutoSynced,
        isCC: c.snippet?.isCC,
        status: c.snippet?.status,
        lastUpdated: c.snippet?.lastUpdated,
      }));
      console.log("[getCaptions] Tracks discovered", { videoId, tracks: debugTracks });
    }
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
      id: preferredTrack.id,
      tfmt: "srt",
      alt: "media",
    });

    return await extractCaptionText(captionResponse.data);
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
