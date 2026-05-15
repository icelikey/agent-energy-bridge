/**
 * In-memory token-bucket rate limiter.
 * Zero external dependencies.
 */

const { createHash } = require('crypto');

const DEFAULT_OPTIONS = {
  windowMs: 60_000,       // 1 minute
  maxRequests: 100,       // 100 requests per window
  burstSize: 10,          // allow burst of 10
  keyGenerator: null,     // (req) => string; defaults to IP + path
  skipSuccessfulRequests: false,
  skipFailedRequests: false,
};

class RateLimiter {
  constructor(options = {}) {
    this.windowMs = options.windowMs ?? DEFAULT_OPTIONS.windowMs;
    this.maxRequests = options.maxRequests ?? DEFAULT_OPTIONS.maxRequests;
    this.burstSize = options.burstSize ?? DEFAULT_OPTIONS.burstSize;
    this.keyGenerator = options.keyGenerator ?? DEFAULT_OPTIONS.keyGenerator;
    this.skipSuccessfulRequests = options.skipSuccessfulRequests ?? DEFAULT_OPTIONS.skipSuccessfulRequests;
    this.skipFailedRequests = options.skipFailedRequests ?? DEFAULT_OPTIONS.skipFailedRequests;

    this.buckets = new Map();
    this.lastCleanup = Date.now();
  }

  _key(req) {
    if (this.keyGenerator) return this.keyGenerator(req);
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
      || req.socket?.remoteAddress
      || 'unknown';
    const path = req.url?.split('?')[0] || '/';
    return createHash('sha256').update(`${ip}:${path}`).digest('hex').slice(0, 32);
  }

  _cleanup() {
    const now = Date.now();
    if (now - this.lastCleanup < this.windowMs) return;
    const cutoff = now - this.windowMs * 2;
    for (const [key, bucket] of this.buckets) {
      if (bucket.lastRefill < cutoff) {
        this.buckets.delete(key);
      }
    }
    this.lastCleanup = now;
  }

  _consume(key) {
    const now = Date.now();
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { tokens: this.burstSize, lastRefill: now };
      this.buckets.set(key, bucket);
    }

    // Refill tokens based on elapsed time
    const elapsed = now - bucket.lastRefill;
    const tokensToAdd = (elapsed / this.windowMs) * this.maxRequests;
    bucket.tokens = Math.min(this.burstSize, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return { allowed: true, remaining: Math.floor(bucket.tokens), resetTime: now + this.windowMs };
    }

    return { allowed: false, remaining: 0, resetTime: bucket.lastRefill + this.windowMs };
  }

  middleware() {
    return (req, res, next) => {
      this._cleanup();
      const key = this._key(req);
      const result = this._consume(key);

      // Always set rate limit headers
      res.setHeader('x-ratelimit-limit', String(this.maxRequests));
      res.setHeader('x-ratelimit-remaining', String(result.remaining));
      res.setHeader('x-ratelimit-reset', String(Math.ceil(result.resetTime / 1000)));

      if (!result.allowed) {
        const error = new Error('Rate limit exceeded');
        error.statusCode = 429;
        error.code = 'RATE_LIMIT_EXCEEDED';
        error.retryAfter = Math.ceil((result.resetTime - Date.now()) / 1000);
        next(error);
        return;
      }

      next();
    };
  }
}

function createRateLimiter(options = {}) {
  return new RateLimiter(options);
}

module.exports = {
  RateLimiter,
  createRateLimiter,
};
