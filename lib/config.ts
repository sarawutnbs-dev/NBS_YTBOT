import { z } from "zod";

const envSchema = z.object({
  YOUTUBE_API_KEY: z.string().min(1, "Missing YOUTUBE_API_KEY"),
  YOUTUBE_CHANNEL_ID: z.string().min(1, "Missing YOUTUBE_CHANNEL_ID"),
  GOOGLE_CLIENT_ID: z.string().min(1, "Missing GOOGLE_CLIENT_ID"),
  GOOGLE_CLIENT_SECRET: z.string().min(1, "Missing GOOGLE_CLIENT_SECRET"),
  YOUTUBE_OAUTH_REFRESH_TOKEN: z.string().optional(),
  NEXTAUTH_SECRET: z.string().min(1, "Missing NEXTAUTH_SECRET"),
  NEXTAUTH_URL: z.string().optional(),
  TOKEN_ENCRYPTION_KEY: z.string().min(32, "Missing TOKEN_ENCRYPTION_KEY"),
  AI_MODEL: z.string().default("gpt-4o-mini"),
  AI_API_KEY: z.string().optional()
});

export type AppEnv = z.infer<typeof envSchema>;

let cachedEnv: AppEnv | null = null;

export function getEnv(options: { skipCache?: boolean } = {}): AppEnv {
  // Allow forcing a fresh read of environment variables
  if (options.skipCache || !cachedEnv) {
    const runtimeEnv = (
      (globalThis as typeof globalThis & {
        process?: { env?: Record<string, string | undefined> };
      }).process?.env ?? {}
    ) as Record<string, string | undefined>;

    const parsed = envSchema.safeParse(runtimeEnv);

    if (!parsed.success) {
      const formatted = parsed.error.format();
      throw new Error(`Environment validation error: ${JSON.stringify(formatted)}`);
    }

    cachedEnv = parsed.data;
  }

  return cachedEnv;
}

export const appConfig = {
  sync: {
    defaultDays: 14,
    maxDays: 30,
    maxResults: 100
  }
};
