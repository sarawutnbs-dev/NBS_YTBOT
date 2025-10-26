import OpenAI from "openai";
import { getEnv } from "./config";

export type DraftProduct = {
  id: string;
  name: string;
  affiliateUrl: string;
};

export type DraftReply = {
  reply: string;
  products: DraftProduct[];
  scores: {
    engagement: number;
    relevance: number;
  };
};

export async function generateDraft({
  comment,
  products
}: {
  comment: string;
  products: DraftProduct[];
}): Promise<DraftReply> {
  const env = getEnv();
  if (!env.AI_API_KEY) {
    throw new Error("AI_API_KEY is not configured");
  }

  const client = new OpenAI({ apiKey: env.AI_API_KEY });

  const response = await client.responses.create({
    model: env.AI_MODEL,
    input: [
      {
        role: "system",
        content:
          "You craft concise, friendly YouTube replies that increase engagement and gently highlight relevant affiliate products. Output valid JSON only."
      },
      {
        role: "user",
        content: JSON.stringify({ comment, products })
      }
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "draft_reply",
        schema: {
          type: "object",
          required: ["reply", "products", "scores"],
          additionalProperties: false,
          properties: {
            reply: { type: "string" },
            products: {
              type: "array",
              items: {
                type: "object",
                required: ["id", "name", "affiliate_url"],
                properties: {
                  id: { type: "string" },
                  name: { type: "string" },
                  affiliate_url: { type: "string", format: "uri" }
                }
              }
            },
            scores: {
              type: "object",
              required: ["engagement", "relevance"],
              properties: {
                engagement: { type: "number", minimum: 0, maximum: 1 },
                relevance: { type: "number", minimum: 0, maximum: 1 }
              }
            }
          }
        }
      }
    }
  });

  const content = response.output?.[0]?.content?.[0];
  if (content?.type !== "output_text") {
    throw new Error("Unexpected AI response format");
  }

  const parsed = JSON.parse(content.text) as {
    reply: string;
    products: Array<{ id: string; name: string; affiliate_url: string }>;
    scores: { engagement: number; relevance: number };
  };

  return {
    reply: parsed.reply,
    products: parsed.products.map(item => ({
      id: item.id,
      name: item.name,
      affiliateUrl: item.affiliate_url
    })),
    scores: parsed.scores
  } satisfies DraftReply;
}
