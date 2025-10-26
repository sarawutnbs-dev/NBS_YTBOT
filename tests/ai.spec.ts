import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/config", () => ({
  getEnv: () => ({
    AI_API_KEY: "fake-key",
    AI_MODEL: "stub-model"
  })
}));

const createResponse = {
  output: [
    {
      content: [
        {
          type: "output_text",
          text: JSON.stringify({
            reply: "Thanks for watching!",
            products: [
              { id: "p1", name: "Product 1", affiliate_url: "https://example.com/p1" }
            ],
            scores: { engagement: 0.8, relevance: 0.9 }
          })
        }
      ]
    }
  ]
};

vi.mock("openai", () => ({
  default: class {
    responses = {
      create: vi.fn().mockResolvedValue(createResponse)
    };
  }
}));

describe("generateDraft", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normalizes AI response", async () => {
    const { generateDraft } = await import("@/lib/ai");

    const result = await generateDraft({
      comment: "Is this good for streaming?",
      products: [{ id: "p1", name: "Product 1", affiliateUrl: "https://example.com/p1" }]
    });

    expect(result.reply).toContain("Thanks");
    expect(result.products[0].affiliateUrl).toMatch("example.com");
    expect(result.scores.engagement).toBeGreaterThan(0);
  });
});
