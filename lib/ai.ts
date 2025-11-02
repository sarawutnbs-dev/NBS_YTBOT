import OpenAI from "openai";
import { getEnv } from "./config";

export type DraftProduct = {
  name: string;
  affiliateUrl: string;
  price: number | null;
};

export type CommentInput = {
  commentId: string;
  text: string;
};

export type VideoTranscript = {
  chunks: Array<{
    ts: string;
    text: string;
  }>;
};

export type DraftReply = {
  commentId: string;
  reply: string;
  suggestedProducts: Array<{
    name: string;
    affiliateUrl: string;
  }>;
  scores: {
    engagement: number;
    relevance: number;
  };
};

export type BatchDraftRequest = {
  videoId: string;
  comments: CommentInput[];
  products: DraftProduct[];
  transcript: VideoTranscript;
};

export type BatchDraftResponse = {
  drafts: DraftReply[];
};

export async function generateDraftsBatch(
  request: BatchDraftRequest
): Promise<BatchDraftResponse> {
  const env = getEnv();
  if (!env.AI_API_KEY) {
    throw new Error("AI_API_KEY is not configured");
  }

  const client = new OpenAI({ apiKey: env.AI_API_KEY });

  const systemPrompt = `You are a helpful YouTube channel assistant that crafts concise, friendly replies to comments.
You have access to the video transcript and product catalog (with prices).
For each comment, generate an appropriate reply and suggest relevant products (if any).
When mentioning products, you may reference their prices if relevant to the comment.
Consider the video context from the transcript when crafting replies.
Output valid JSON only.`;

  const userContent = JSON.stringify({
    videoId: request.videoId,
    comments: request.comments,
    products: request.products,
    transcript: request.transcript.chunks
  });

  const response = await client.chat.completions.create({
    model: env.AI_MODEL,
    messages: [
      {
        role: "system",
        content: systemPrompt
      },
      {
        role: "user",
        content: userContent
      }
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "batch_draft_replies",
        schema: {
          type: "object",
          required: ["drafts"],
          additionalProperties: false,
          properties: {
            drafts: {
              type: "array",
              items: {
                type: "object",
                required: ["commentId", "reply", "suggestedProducts", "scores"],
                properties: {
                  commentId: { type: "string" },
                  reply: { type: "string" },
                  suggestedProducts: {
                    type: "array",
                    items: {
                      type: "object",
                      required: ["name", "affiliateUrl"],
                      properties: {
                        name: { type: "string" },
                        affiliateUrl: { type: "string", format: "uri" }
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
        }
      }
    }
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Unexpected AI response format");
  }

  const parsed = JSON.parse(content) as BatchDraftResponse;

  return parsed;
}
