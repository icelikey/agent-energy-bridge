const test = require('node:test');
const assert = require('node:assert/strict');
const { createAuthMiddleware } = require('../src/server/middleware/auth-middleware');

test('auth middleware passes when no API key configured', () => {
  const middleware = createAuthMiddleware({ apiKey: null });
  assert.doesNotThrow(() => middleware({ headers: {} }, {}, {}));
});

test('auth middleware passes with correct X-API-Key', () => {
  const middleware = createAuthMiddleware({ apiKey: 'secret-123' });
  assert.doesNotThrow(() => middleware({ headers: { 'x-api-key': 'secret-123' } }, {}, {}));
});

test('auth middleware throws 401 with wrong X-API-Key', () => {
  const middleware = createAuthMiddleware({ apiKey: 'secret-123' });
  assert.throws(
    () => middleware({ headers: { 'x-api-key': 'wrong' } }, {}, {}),
    { statusCode: 401, code: 'UNAUTHORIZED' }
  );
});

test('auth middleware throws 401 with missing X-API-Key', () => {
  const middleware = createAuthMiddleware({ apiKey: 'secret-123' });
  assert.throws(
    () => middleware({ headers: {} }, {}, {}),
    { statusCode: 401, code: 'UNAUTHORIZED' }
  );
});
