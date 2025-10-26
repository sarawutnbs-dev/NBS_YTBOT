import { describe, expect, it, vi, beforeEach } from "vitest";
import fixture from "../fixtures/youtube-commentThreads.json";

const axiosGet = vi.fn();

vi.mock("axios", () => ({
  default: {
    get: axiosGet
  }
}));

vi.mock("@/lib/config", () => ({
  getEnv: () => ({
    YOUTUBE_API_KEY: "test-key",
    YOUTUBE_CHANNEL_ID: "NotebookSPEC",
    GOOGLE_CLIENT_ID: "client",
    GOOGLE_CLIENT_SECRET: "secret",
    NEXTAUTH_SECRET: "test",
    TOKEN_ENCRYPTION_KEY: "12345678901234567890123456789012",
    AI_MODEL: "stub",
    AI_API_KEY: "stub"
  }),
  appConfig: {
    sync: {
      defaultDays: 14,
      maxDays: 30,
      maxResults: 100
    }
  }
}));

describe("listRecentChannelComments", () => {
  beforeEach(() => {
    axiosGet.mockResolvedValue({ data: fixture });
  });

  it("returns normalized comments", async () => {
    const { listRecentChannelComments } = await import("@/lib/youtube");
    const result = await listRecentChannelComments({ daysBack: 7 });
    expect(result.comments[0].commentId).toEqual(fixture.items[0].id);
    expect(axiosGet).toHaveBeenCalledWith(expect.any(String), expect.any(Object));
  });
});
