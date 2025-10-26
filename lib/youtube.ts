import axios from "axios";
import { formatISO, subDays } from "date-fns";
import { appConfig, getEnv } from "./config";

const API_BASE = "https://youtube.googleapis.com/youtube/v3";

let cachedChannelLookup: { input: string; channelId: string } | null = null;

async function resolveChannelId(rawId: string, apiKey: string) {
  if (!rawId) {
    throw new Error("YouTube channel identifier is missing");
  }

  // Canonical channel IDs always start with UC, reuse cached lookups when possible.
  if (rawId.startsWith("UC")) {
    return rawId;
  }

  if (cachedChannelLookup && cachedChannelLookup.input === rawId) {
    return cachedChannelLookup.channelId;
  }

  try {
    const usernameParams = new URLSearchParams({
      part: "id",
      forUsername: rawId.replace(/^@/, ""),
      key: apiKey
    });

    const { data } = await axios.get(`${API_BASE}/channels`, {
      params: usernameParams
    });

    let channelId: string | undefined = data.items?.[0]?.id;

    if (!channelId) {
      const searchParams = new URLSearchParams({
        part: "snippet",
        type: "channel",
        maxResults: "1",
        q: rawId.replace(/^@/, ""),
        key: apiKey
      });

      const search = await axios.get(`${API_BASE}/search`, {
        params: searchParams
      });

      channelId = search.data?.items?.[0]?.snippet?.channelId;
    }

    if (!channelId) {
      throw new Error(`Could not resolve channel id for "${rawId}"`);
    }

    cachedChannelLookup = { input: rawId, channelId };
    return channelId;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to resolve YouTube channel ID for "${rawId}": ${message}`);
  }
}

export type YouTubeComment = {
  commentId: string;
  textOriginal: string;
  updatedAt: string;
  likeCount: number;
  authorDisplayName: string;
  authorProfileImageUrl?: string;
  authorChannelId?: string;
  videoId: string;
  canReply: boolean;
  totalReplyCount: number;
  publishedAt: string;
  parentId?: string;
};

export type CommentThreadSyncResult = {
  comments: YouTubeComment[];
  nextPageToken?: string;
};

function resolveCutoff(daysBack?: number) {
  const config = appConfig.sync;
  if (!daysBack) return formatISO(subDays(new Date(), config.defaultDays));

  const safeDays = Math.min(Math.max(daysBack, 1), config.maxDays);
  return formatISO(subDays(new Date(), safeDays));
}

export async function listRecentChannelComments({
  channelId,
  daysBack,
  pageToken
}: {
  channelId?: string;
  daysBack?: number;
  pageToken?: string;
}): Promise<CommentThreadSyncResult> {
  const env = getEnv();
  const cutoff = resolveCutoff(daysBack);

  const resolvedChannelId = await resolveChannelId(channelId ?? env.YOUTUBE_CHANNEL_ID, env.YOUTUBE_API_KEY);

  const params = new URLSearchParams({
    part: "snippet,replies",
    maxResults: String(appConfig.sync.maxResults),
    order: "time",
    textFormat: "plainText",
    key: env.YOUTUBE_API_KEY,
    allThreadsRelatedToChannelId: resolvedChannelId,
    publishedAfter: cutoff
  });

  if (pageToken) {
    params.set("pageToken", pageToken);
  }

  let data: any;

  try {
    const response = await axios.get(`${API_BASE}/commentThreads`, { params });
    data = response.data;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const details =
      (error as any)?.response?.data?.error?.message ??
      (error as any)?.response?.statusText ??
      "Unknown YouTube API error";

    throw new Error(`YouTube commentThreads request failed: ${details} (${message})`);
  }

  const items = (data.items ?? []) as Array<Record<string, any>>;

  const comments: YouTubeComment[] = items.map(item => {
    const snippet = item.snippet?.topLevelComment?.snippet ?? {};
    return {
      commentId: item.id,
      textOriginal: snippet.textOriginal ?? "",
      updatedAt: snippet.updatedAt ?? snippet.publishedAt ?? new Date().toISOString(),
      likeCount: snippet.likeCount ?? 0,
      authorDisplayName: snippet.authorDisplayName ?? "",
      authorProfileImageUrl: snippet.authorProfileImageUrl,
      authorChannelId: snippet.authorChannelId?.value,
      videoId: snippet.videoId ?? item.snippet?.videoId ?? "",
      canReply: Boolean(item.snippet?.canReply),
      totalReplyCount: item.snippet?.totalReplyCount ?? 0,
      publishedAt: snippet.publishedAt ?? new Date().toISOString()
    } satisfies YouTubeComment;
  });

  return {
    comments,
    nextPageToken: data.nextPageToken
  };
}

export async function resolveCommentThread(commentId: string) {
  const env = getEnv();
  const params = new URLSearchParams({
    part: "snippet",
    id: commentId,
    key: env.YOUTUBE_API_KEY
  });

  const { data } = await axios.get(`${API_BASE}/comments`, { params });
  return data;
}
