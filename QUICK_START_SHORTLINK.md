# Quick Start: ShortLink Integration

## ✅ Setup Complete!

All integration work is done. Here's how to use it:

## 1. Start Services

### Start shortLink Service (Already Running)
```bash
cd c:\Users\Slim\Git\shortLink
docker-compose ps

# If not running:
docker-compose up -d
```

### Check Services Status
```bash
# shortLink should show:
# - app (port 8080) ✓
# - mysql (port 3306) ✓
# - redis (port 6379) ✓
```

## 2. Run the Sync

```bash
cd c:\Users\Slim\Git\NBS_YTBOT
npm run shortlink:sync
```

### What It Does:
1. Finds all products with `shopeeProductId` and `productLink` but no `shortURL`
2. Processes in batches of 1000
3. Transforms URLs to Shopee affiliate format
4. Sends to shortLink service
5. Waits 5 minutes
6. Fetches short URLs
7. Updates database

### Expected Output:
```
========================================
Starting ShortLink Sync
========================================
Config:
  - Batch Size: 1000
  - Delay: 5 minutes
  - ShortLink API: http://localhost:8080
  - Affiliate ID: 15175090000

📊 Found X products to process

--- Batch 1 ---
📦 Processing X products...
✓ Sent X products to shortLink service
  Response: { message: 'Enqueued for shortening', queued: X }
⏳ Waiting 5 minutes for processing...
✓ Fetched X shortURLs from service
✓ Updated X products with shortURLs

✓ Batch 1 complete: X/X updated
📈 Progress: X/X (100%)

========================================
✓ ShortLink Sync Complete!
📊 Total processed: X products
========================================
```

## 3. Test Manually (Optional)

### Test API Endpoint
```bash
# Send test batch
curl -X POST http://localhost:8080/api/shorten \
  -H 'Content-Type: application/json' \
  -d '{
    "items": [
      {
        "product_id": "test_123",
        "url": "https://s.shopee.co.th/an_redir?origin_link=https://shopee.co.th/product/81421161/9976411954?&affiliate_id=15175090000"
      }
    ]
  }'

# Wait 10 seconds

# Get results
curl -X POST http://localhost:8080/api/batch-stats \
  -H 'Content-Type: application/json' \
  -d '{"product_ids": ["test_123"]}'
```

### Expected Response:
```json
{"test_123":"http://localhost:8080/abc1"}
```

### Test Redirect
```bash
# Copy the short code from response (e.g., abc1)
curl -L http://localhost:8080/abc1
# Should redirect to Shopee page
```

## 4. Verify in Database

```bash
# Open Prisma Studio
npm run studio

# Navigate to: http://localhost:5555
# Go to Product table
# Check shortURL column - should have values like "http://localhost:8080/abc1"
```

## Configuration

### Change Batch Size or Delay

Edit [jobs/sync-shortlinks.ts](jobs/sync-shortlinks.ts):

```typescript
const BATCH_SIZE = 1000;        // Products per batch
const DELAY_MINUTES = 5;         // Wait time between send and fetch
```

### Change API URL (for production)

Edit [.env.local](.env.local):
```env
SHORTLINK_API_URL="https://your-production-url.com"
```

And edit shortLink `.env`:
```env
BASE_URL="https://your-production-url.com"
```

## Monitoring

### Check Queue Length
```bash
docker exec -it shortlink-redis-1 redis-cli LLEN shortlink:queue
# Should be 0 when idle
```

### Check Logs
```bash
cd c:\Users\Slim\Git\shortLink
docker-compose logs -f app
```

### Check Database
```bash
# MySQL (shortLink)
docker exec -it shortlink-mysql-1 mysql -uuser -ppass -D shortlink -e "SELECT COUNT(*) FROM shortlinks;"

# PostgreSQL (NBS_YTBOT) - use Prisma Studio
npm run studio
```

## Troubleshooting

### Error: Connection refused
**Solution:** Start shortLink service
```bash
cd c:\Users\Slim\Git\shortLink
docker-compose up -d
```

### Error: No shortURLs returned
**Solution:** Increase delay or check queue
```bash
# Check queue
docker exec -it shortlink-redis-1 redis-cli LLEN shortlink:queue

# Check logs
docker-compose logs -f app
```

### Error: Database connection failed
**Solution:** Check PostgreSQL is running
```bash
# NBS_YTBOT uses PostgreSQL on port 5433
# Make sure it's running
```

## Files Summary

### NBS_YTBOT (Modified/Created)
- ✅ `prisma/schema.prisma` - Added `shortURL` field
- ✅ `jobs/sync-shortlinks.ts` - Sync script
- ✅ `package.json` - Added `shortlink:sync` command
- ✅ `.env.local` - Added `SHORTLINK_API_URL`
- ✅ `SHORTLINK_INTEGRATION.md` - Full documentation
- ✅ `QUICK_START_SHORTLINK.md` - This guide

### shortLink (Modified)
- ✅ `main.go` - Added `/api/batch-stats` endpoint
- ✅ `.env.local` - Added `BASE_URL`

## URL Format Examples

### Original Product Link:
```
https://shopee.co.th/product/81421161/9976411954
```

### After Transformation (sent to shortLink):
```
https://s.shopee.co.th/an_redir?origin_link=https://shopee.co.th/product/81421161/9976411954?&affiliate_id=15175090000
```

### Final Short URL (stored in database):
```
http://localhost:8080/abc1
```

## Next Steps

1. ✅ All setup is complete
2. ✅ Services are running
3. ✅ Integration tested successfully
4. 🚀 Run `npm run shortlink:sync` whenever you need to sync new products
5. 📊 Check results in Prisma Studio

## Need Help?

See full documentation: [SHORTLINK_INTEGRATION.md](SHORTLINK_INTEGRATION.md)
