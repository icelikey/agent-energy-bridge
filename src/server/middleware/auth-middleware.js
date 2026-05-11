/**
 * API Key authentication middleware.
 * Zero external dependencies.
 *
 * Protects management endpoints (e.g., POST /notify/test) with X-API-Key header.
 * When AEB_API_KEY env var is not configured, the middleware is a no-op to preserve
 * developer-friendly defaults.
 */

const crypto = require('node:crypto');

/**
 * Constant-time string comparison to prevent timing attacks.
 * Returns false if inputs are not strings or have different lengths.
 */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
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
