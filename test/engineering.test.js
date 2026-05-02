const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { Logger, LEVELS, loadConfig, loadConfigFile } = require('../src');

test('Logger writes messages at or above configured level', () => {
  const lines = [];
  const logger = new Logger({ namespace: 'test', level: 'warn', sink: { write: (line) => lines.push(line) } });

  logger.debug('debug-msg');
  logger.info('info-msg');
  logger.warn('warn-msg');
  logger.error('error-msg');

  assert.equal(lines.length, 2);
  assert.match(lines[0], /WARN/);
  assert.match(lines[0], /warn-msg/);
  assert.match(lines[1], /ERROR/);
  assert.match(lines[1], /error-msg/);
});

test('Logger includes meta when provided', () => {
  const lines = [];
  const logger = new Logger({ namespace: 'test', level: 'info', sink: { write: (line) => lines.push(line) } });

  logger.info('hello', { user: 'alice' });

  assert.equal(lines.length, 1);
  assert.match(lines[0], /"user":"alice"/);
});

test('Logger respects AEB_LOG_LEVEL env fallback', () => {
  const original = process.env.AEB_LOG_LEVEL;
  process.env.AEB_LOG_LEVEL = 'error';

  const lines = [];
  const logger = new Logger({ sink: { write: (line) => lines.push(line) } });

  logger.warn('warn-msg');
  logger.error('error-msg');

  assert.equal(lines.length, 1);
  assert.match(lines[0], /ERROR/);

  process.env.AEB_LOG_LEVEL = original;
});

test('loadConfigFile loads JSON config', () => {
  const tmp = path.join(os.tmpdir(), `aeb-test-${Date.now()}.json`);
  fs.writeFileSync(tmp, JSON.stringify({ port: 9999, budgetGuard: { dailyBudgetUsd: 50 } }));

  const config = loadConfigFile(tmp);
  assert.equal(config.port, 9999);
  assert.equal(config.budgetGuard.dailyBudgetUsd, 50);

  fs.unlinkSync(tmp);
});

test('loadConfigFile returns null for missing file', () => {
  const config = loadConfigFile('/nonexistent/path/aeb.config.json');
  assert.strictEqual(config, null);
});

test('loadConfig with explicit path loads config', () => {
  const tmp = path.join(os.tmpdir(), `aeb-test-${Date.now()}.json`);
  fs.writeFileSync(tmp, JSON.stringify({ host: '0.0.0.0' }));

  const config = loadConfig({ configPath: tmp });
  assert.equal(config.host, '0.0.0.0');

  fs.unlinkSync(tmp);
});

test('loadConfig returns null when no config found', () => {
  const config = loadConfig({ paths: ['/nonexistent/aeb.config.json'] });
  assert.strictEqual(config, null);
});

test('Module exports include engineering utilities', () => {
  const bridge = require('../src');
  assert.ok(bridge.Logger);
  assert.ok(bridge.LEVELS);
  assert.ok(bridge.loadConfig);
  assert.ok(bridge.loadConfigFile);
  assert.ok(bridge.DEFAULT_SEARCH_PATHS);
});
