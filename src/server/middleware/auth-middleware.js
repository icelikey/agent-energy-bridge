/**
 * API Key authentication middleware.
 * Zero external dependencies.
 *
 * Protects management endpoints (e.g., POST /notify/test) with X-API-Key header.
 * When AEB_API_KEY env var is not configured, the middleware is a no-op to preserve
 * developer-friendly defaults.
 */

const crypto = require('node:crypto');

// Process-level random key used solely for constant-time comparison.
// This key is not stored or transmitted; it exists only in memory for
// the lifetime of the process. Compromising it does not reveal the
// actual API key because HMAC-SHA256 is a one-way function.
const COMPARE_KEY = crypto.randomBytes(32);

/**
 * Constant-time string comparison to prevent timing attacks.
 * Uses HMAC-SHA256 to produce fixed-length digests (32 bytes) so that
 * the comparison time is independent of input length, eliminating
 * length-leakage vulnerabilities.
 */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const hashA = crypto.createHmac('sha256', COMPARE_KEY).update(a).digest();
  const hashB = crypto.createHmac('sha256', COMPARE_KEY).update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

function createAuthMiddleware(options = {}) {
  const apiKey = options.apiKey || process.env.AEB_API_KEY || null;

  return function authMiddleware(request, response, context) {
    // 未配置 API Key 时跳过认证（开发友好）
    if (!apiKey) return;

    const headers = request.headers || {};
    const providedKey = headers['x-api-key'] || null;

    if (!safeEqual(providedKey, apiKey)) {
      const error = new Error('Unauthorized: invalid or missing API key');
      error.statusCode = 401;
      error.code = 'UNAUTHORIZED';
      throw error;
    }
  };
}

module.exports = { createAuthMiddleware };
