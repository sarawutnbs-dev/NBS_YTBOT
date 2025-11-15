# syntax=docker/dockerfile:1

# Stage 1: Dependencies
FROM node:20-slim AS deps
WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

# Stage 2: Builder
FROM node:20-slim AS builder
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ARG BUILD_OPENAI_API_KEY=placeholder
ARG BUILD_AI_API_KEY=placeholder
ARG BUILD_AI_TRANSCRIPT_API_KEY=placeholder
ENV OPENAI_API_KEY=${BUILD_OPENAI_API_KEY}
ENV AI_API_KEY=${BUILD_AI_API_KEY}
ENV AI_TRANSCRIPT_API_KEY=${BUILD_AI_TRANSCRIPT_API_KEY}

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Install Playwright browsers and dependencies
RUN npx playwright install --with-deps chromium

# Build Next.js application
RUN npm run build

# Stage 3: Runner
FROM node:20-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# Install Playwright dependencies (runtime libraries only) and curl for health checks
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    curl \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libatspi2.0-0 \
    libxshmfence1 \
    libcairo2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs nextjs

# Copy necessary files
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/tiktoken ./node_modules/tiktoken
COPY --from=builder /app/node_modules/playwright ./node_modules/playwright
COPY --from=builder /app/prisma ./prisma

# Copy Playwright browsers
COPY --from=builder --chown=nextjs:nodejs /root/.cache/ms-playwright /home/nextjs/.cache/ms-playwright

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
