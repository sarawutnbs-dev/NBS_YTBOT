# ShortLink Integration Guide

## Overview

This document describes the integration between NBS_YTBOT and the shortLink service for URL shortening of Shopee affiliate links.

## Architecture

```
NBS_YTBOT (TypeScript/Next.js)
    |
    | HTTP POST /api/shorten (batch 1000)
    v
shortLink Service (Go)
    |
    | Redis Queue Processing
    v
MySQL Database
    |
    | HTTP POST /api/batch-stats
    v
NBS_YTBOT Updates shortURL field
```

## Prerequisites

1. **NBS_YTBOT** running with PostgreSQL (port 5433)
2. **shortLink service** running with MySQL (port 3306) and Redis (port 6379)

## Setup Instructions

### 1. Start shortLink Service

```bash
cd c:\Users\Slim\Git\shortLink
docker-compose up --build -d
```

Verify services:
```bash
# Check if services are running
docker-compose ps

# Check logs
docker-compose logs -f app
```

### 2. Configure NBS_YTBOT

Add these variables to `.env.local`:

```env
# shortLink service base URL (production)
SHORTLINK_API_URL="https://nbsi.me"

# Shopee affiliate ID
SHORTLINK_AFFILIATE_ID="15175090000"

# Optional tuning
SHORTLINK_BATCH_SIZE="1000"
SHORTLINK_DELAY_MINUTES="5"
SHORTLINK_DRY_RUN="false"
```

### 3. Database Schema

The `Product` table now includes a `shortURL` field:

```prisma
model Product {
  id              String   @id @default(cuid())
  name            String
  affiliateUrl    String
  productLink     String?
  shopeeProductId String?  @unique
  shortURL        String?  // NEW FIELD
  ...
}
```

## Usage

### Running the Sync Script

```bash
cd c:\Users\Slim\Git\NBS_YTBOT
npm run shortlink:sync
```

### What the Script Does

1. **Fetches products** from database in batches of 1000 where:
   - `shopeeProductId` is not null
   - `productLink` is not null
   - `shortURL` is null (not yet processed)

2. **Transforms URLs** to affiliate redirect format:
   ```
   Original: https://shopee.co.th/product/81421161/9976411954

   Transformed: https://s.shopee.co.th/an_redir?origin_link=https://shopee.co.th/product/81421161/9976411954?&affiliate_id=15175090000
   ```

3. **Sends batch** to shortLink service via `POST /api/shorten`

4. **Waits 5 minutes** for the shortLink service to process the queue

5. **Fetches results** via `POST /api/batch-stats` with product IDs

6. **Updates database** with shortURLs in format: `https://nbsi.me/{code}`

### Script Configuration

Use environment variables (above) to change batch size, delay, and affiliate ID. You no longer need to edit the TypeScript file.

## API Endpoints

### shortLink Service

#### 1. Create Shortlinks (Batch)

**Endpoint:** `POST /api/shorten`

**Request:**
```json
{
  "items": [
    {
      "product_id": "81421161_9976411954",
      "url": "https://s.shopee.co.th/an_redir?origin_link=https://shopee.co.th/product/81421161/9976411954?&affiliate_id=15175090000"
    }
  ]
}
```

**Response:**
```json
{
  "message": "Enqueued for shortening",
  "queued": 1
}
```

#### 2. Get Batch Statistics

**Endpoint:** `POST /api/batch-stats`

**Request:**
```json
{
  "product_ids": ["81421161_9976411954", "12345678_87654321"]
}
```

**Response:**
```json
{
  "81421161_9976411954": "http://localhost:8080/abc1",
  "12345678_87654321": "http://localhost:8080/def2"
}
```

## Testing

### 1. Manual API Test

Test the shortLink service directly:

```bash
# Send a test batch
curl -X POST https://nbsi.me/api/shorten \
  -H 'Content-Type: application/json' \
  -d '{
    "items": [
      {
        "product_id": "test_123",
        "url": "https://s.shopee.co.th/an_redir?origin_link=https://shopee.co.th/product/81421161/9976411954?&affiliate_id=15175090000"
      }
    ]
  }'

# Wait 5-10 seconds for processing

# Fetch results
curl -X POST https://nbsi.me/api/batch-stats \
  -H 'Content-Type: application/json' \
  -d '{
    "product_ids": ["test_123"]
  }'

# Expected response:
# {"test_123":"https://nbsi.me/abc1"}
```

### 2. Test Redirect

```bash
# Get the short code from the response above (e.g., abc1)
curl -I https://nbsi.me/abc1

# Should return 302 redirect to the original Shopee URL
```

### 3. Full Integration Test

```bash
# Ensure both services are running
cd c:\Users\Slim\Git\shortLink
docker-compose ps

# Run the sync script
cd c:\Users\Slim\Git\NBS_YTBOT
npm run shortlink:sync
```

Expected output:
```
========================================
Starting ShortLink Sync
========================================
Config:
  - Batch Size: 1000
  - Delay: 5 minutes
  - ShortLink API: https://nbsi.me
  - Affiliate ID: 15175090000

📊 Found X products to process

--- Batch 1 ---
📦 Processing X products...
✓ Sent X products to shortLink service
⏳ Waiting 5 minutes for processing...
✓ Fetched X shortURLs from service
✓ Updated X products with shortURLs
```

## Monitoring

### Check shortLink Queue

```bash
# Check Redis queue length
docker exec -it shortlink-redis-1 redis-cli LLEN shortlink:queue

# Should be 0 when idle
```

### Check MySQL Data

```bash
# Access MySQL
docker exec -it shortlink-mysql-1 mysql -uuser -ppass -D shortlink

# Query shortlinks
SELECT product_id, short_code, original FROM shortlinks LIMIT 10;
```

### Check PostgreSQL Data

```bash
# Use Prisma Studio
npm run studio

# Navigate to Product table and check shortURL field
```

## Troubleshooting

### Issue: "Failed to send batch"

**Cause:** shortLink service is not running

**Solution:**
```bash
cd c:\Users\Slim\Git\shortLink
docker-compose up -d
docker-compose logs -f app
```

### Issue: "No shortURLs returned"

**Cause:** Queue worker hasn't processed items yet

**Solution:** Increase `DELAY_MINUTES` in the script or check queue worker logs:
```bash
docker-compose logs -f app | grep "Queue worker"
```

### Issue: "Database connection failed"

**Cause:** MySQL or PostgreSQL not running

**Solution:**
```bash
# Check MySQL
docker-compose ps mysql

# Check PostgreSQL (for NBS_YTBOT)
# Ensure PostgreSQL container is running on port 5433
```

## Production Considerations

1. **Change BASE_URL** in shortLink `.env` to production domain:
   ```env
   BASE_URL=https://short.yourdomain.com
   ```

2. **Adjust batch size** based on API rate limits and processing capacity

3. **Add error handling** and retry logic for failed batches

4. **Monitor queue length** and processing time

5. **Consider cron job** for automatic sync:
   ```bash
   # Add to crontab
   0 2 * * * cd /path/to/NBS_YTBOT && npm run shortlink:sync
   ```

## Files Modified/Created

### NBS_YTBOT
- ✅ `prisma/schema.prisma` - Added `shortURL` field to Product model
- ✅ `jobs/sync-shortlinks.ts` - New sync script
- ✅ `package.json` - Added `shortlink:sync` script
- ✅ `.env.local` - Added `SHORTLINK_API_URL`
- ✅ `SHORTLINK_INTEGRATION.md` - This documentation

### shortLink
- ✅ `main.go` - Added `batchStatsHandler` endpoint
- ✅ `.env.local` - Added `BASE_URL`

## Summary

The integration is now complete! You can:

1. ✅ Store short URLs in the Product table
2. ✅ Send batches of 1000 products at a time to shortLink service
3. ✅ Automatically transform Shopee links to affiliate redirect format
4. ✅ Fetch results after 5 minutes
5. ✅ Update database with shortURLs
6. ✅ Run everything via `npm run shortlink:sync`
7. ✅ Test with curl commands
