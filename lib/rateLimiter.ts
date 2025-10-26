type BucketKey = string;

type Bucket = {
  tokens: number;
  lastRefill: number;
};

export class RateLimiter {
  private readonly capacity: number;
  private readonly refillRate: number;
  private readonly buckets = new Map<BucketKey, Bucket>();

  constructor({ capacity, refillRate }: { capacity: number; refillRate: number }) {
    this.capacity = capacity;
    this.refillRate = refillRate; // tokens per ms
  }

  attempt(key: BucketKey, cost = 1) {
    const now = Date.now();
    const bucket = this.buckets.get(key) ?? {
      tokens: this.capacity,
      lastRefill: now
    };

    const elapsed = now - bucket.lastRefill;
    const refill = elapsed * this.refillRate;
    bucket.tokens = Math.min(this.capacity, bucket.tokens + refill);
    bucket.lastRefill = now;

    if (bucket.tokens < cost) {
      this.buckets.set(key, bucket);
      return false;
    }

    bucket.tokens -= cost;
    this.buckets.set(key, bucket);
    return true;
  }
}
