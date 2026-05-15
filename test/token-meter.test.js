const test = require('node:test');
const assert = require('node:assert/strict');
const { TokenMeter } = require('../src');

function makeEntry(overrides = {}) {
  return {
    model: 'gpt-4',
    agentId: 'agent-1',
    taskType: 'coding',
    inputTokens: 1000,
    outputTokens: 500,
    costUsd: 0.05,
    latencyMs: 800,
    ...overrides,
  };
}

test('TokenMeter records entry and returns it', () => {
  const meter = new TokenMeter();
  const entry = meter.record(makeEntry());

  assert.equal(entry.model, 'gpt-4');
  assert.equal(entry.inputTokens, 1000);
  assert.equal(entry.outputTokens, 500);
  assert.equal(entry.totalTokens, 1500);
  assert.ok(entry.ts > 0);
});

test('TokenMeter getStats returns correct aggregates', () => {
  const meter = new TokenMeter();
  meter.record(makeEntry({ inputTokens: 1000, outputTokens: 500, costUsd: 0.05 }));
  meter.record(makeEntry({ inputTokens: 2000, outputTokens: 1000, costUsd: 0.10 }));

  const stats = meter.getStats({ windowDays: 30 });
  assert.equal(stats.count, 2);
  assert.equal(stats.inputTokens, 3000);
  assert.equal(stats.outputTokens, 1500);
  assert.equal(stats.totalTokens, 4500);
  assert.ok(Math.abs(stats.costUsd - 0.15) < 0.000001);
  assert.equal(stats.avgTokensPerCall, 2250);
});

test('TokenMeter getStats filters by model', () => {
  const meter = new TokenMeter();
  meter.record(makeEntry({ model: 'gpt-4', inputTokens: 1000, outputTokens: 500 }));
  meter.record(makeEntry({ model: 'claude-3', inputTokens: 2000, outputTokens: 1000 }));

  const stats = meter.getStats({ model: 'gpt-4' });
  assert.equal(stats.count, 1);
  assert.equal(stats.totalTokens, 1500);
});

test('TokenMeter getStats filters by agentId', () => {
  const meter = new TokenMeter();
  meter.record(makeEntry({ agentId: 'agent-1', inputTokens: 1000, outputTokens: 500 }));
  meter.record(makeEntry({ agentId: 'agent-2', inputTokens: 2000, outputTokens: 1000 }));

  const stats = meter.getStats({ agentId: 'agent-2' });
  assert.equal(stats.count, 1);
  assert.equal(stats.totalTokens, 3000);
});

test('TokenMeter getStats filters by taskType', () => {
  const meter = new TokenMeter();
  meter.record(makeEntry({ taskType: 'coding', inputTokens: 1000, outputTokens: 500 }));
  meter.record(makeEntry({ taskType: 'chat', inputTokens: 200, outputTokens: 100 }));

  const stats = meter.getStats({ taskType: 'coding' });
  assert.equal(stats.count, 1);
  assert.equal(stats.totalTokens, 1500);
});

test('TokenMeter getStats respects windowDays', () => {
  const meter = new TokenMeter();

  // Inject an old record by manipulating ts
  const old = meter.record(makeEntry({ inputTokens: 5000, outputTokens: 2000 }));
  old.ts = Date.now() - 10 * 24 * 60 * 60 * 1000; // 10 days ago

  meter.record(makeEntry({ inputTokens: 1000, outputTokens: 500 }));

  const stats7d = meter.getStats({ windowDays: 7 });
  assert.equal(stats7d.count, 1);
  assert.equal(stats7d.totalTokens, 1500);

  const stats30d = meter.getStats({ windowDays: 30 });
  assert.equal(stats30d.count, 2);
});

test('TokenMeter getModelBreakdown returns sorted list', () => {
  const meter = new TokenMeter();
  meter.record(makeEntry({ model: 'gpt-4', inputTokens: 100, outputTokens: 50 }));
  meter.record(makeEntry({ model: 'claude-3', inputTokens: 5000, outputTokens: 2000 }));
  meter.record(makeEntry({ model: 'gpt-4', inputTokens: 200, outputTokens: 100 }));

  const breakdown = meter.getModelBreakdown(30);
  assert.equal(breakdown[0].model, 'claude-3');
  assert.equal(breakdown[1].model, 'gpt-4');
  assert.equal(breakdown[1].count, 2);
  assert.equal(breakdown[1].totalTokens, 450);
});

test('TokenMeter getAgentBreakdown returns per-agent stats', () => {
  const meter = new TokenMeter();
  meter.record(makeEntry({ agentId: 'agent-a', inputTokens: 1000, outputTokens: 500 }));
  meter.record(makeEntry({ agentId: 'agent-b', inputTokens: 3000, outputTokens: 1000 }));

  const breakdown = meter.getAgentBreakdown(30);
  assert.equal(breakdown[0].agentId, 'agent-b');
  assert.equal(breakdown[0].totalTokens, 4000);
});

test('TokenMeter getTaskTypeBreakdown returns per-taskType stats', () => {
  const meter = new TokenMeter();
  meter.record(makeEntry({ taskType: 'coding', inputTokens: 2000, outputTokens: 1000 }));
  meter.record(makeEntry({ taskType: 'chat', inputTokens: 500, outputTokens: 200 }));

  const breakdown = meter.getTaskTypeBreakdown(30);
  assert.equal(breakdown[0].taskType, 'coding');
  assert.equal(breakdown[0].totalTokens, 3000);
});

test('TokenMeter getReport returns all windows and breakdowns', () => {
  const meter = new TokenMeter();
  meter.record(makeEntry());

  const report = meter.getReport();
  assert.ok(report.windows['7d']);
  assert.ok(report.windows['30d']);
  assert.ok(report.windows['90d']);
  assert.ok(Array.isArray(report.modelBreakdown));
  assert.ok(Array.isArray(report.agentBreakdown));
  assert.ok(Array.isArray(report.taskTypeBreakdown));
  assert.equal(report.totalRecords, 1);
});

test('TokenMeter respects maxEntries and evicts oldest', () => {
  const meter = new TokenMeter({ maxEntries: 5 });
  for (let i = 0; i < 10; i++) {
    meter.record(makeEntry({ inputTokens: i * 100, outputTokens: 50 }));
  }

  assert.equal(meter._records.length, 5);
  assert.equal(meter._records[0].inputTokens, 500);
});

test('TokenMeter getRecentRecords returns last N entries', () => {
  const meter = new TokenMeter();
  for (let i = 0; i < 10; i++) {
    meter.record(makeEntry({ inputTokens: i * 100, outputTokens: 50 }));
  }

  const recent = meter.getRecentRecords(3);
  assert.equal(recent.length, 3);
  assert.equal(recent[2].inputTokens, 900);
});

test('TokenMeter clear resets all state', () => {
  const meter = new TokenMeter();
  meter.record(makeEntry());
  meter.clear();

  assert.equal(meter._records.length, 0);
  const stats = meter.getStats();
  assert.equal(stats.count, 0);
  assert.equal(stats.totalTokens, 0);
});

test('TokenMeter onFlush callback fires on each record', () => {
  const flushed = [];
  const meter = new TokenMeter({ onFlush: (e) => flushed.push(e) });
  meter.record(makeEntry());
  meter.record(makeEntry({ model: 'claude-3' }));

  assert.equal(flushed.length, 2);
  assert.equal(flushed[1].model, 'claude-3');
});

test('TokenMeter handles missing optional fields gracefully', () => {
  const meter = new TokenMeter();
  const entry = meter.record({ model: 'gpt-4', inputTokens: 100, outputTokens: 50 });

  assert.equal(entry.agentId, 'default');
  assert.equal(entry.taskType, 'general');
  assert.equal(entry.costUsd, 0);
  assert.equal(entry.latencyMs, 0);
});

test('TokenMeter avgLatencyMs excludes zero-latency records', () => {
  const meter = new TokenMeter();
  meter.record(makeEntry({ latencyMs: 0 }));
  meter.record(makeEntry({ latencyMs: 500 }));
  meter.record(makeEntry({ latencyMs: 1000 }));

  const stats = meter.getStats();
  assert.equal(stats.avgLatencyMs, 750);
});

test('TokenMeter getStats returns zeros when no records match', () => {
  const meter = new TokenMeter();
  meter.record(makeEntry({ model: 'gpt-4' }));

  const stats = meter.getStats({ model: 'nonexistent' });
  assert.equal(stats.count, 0);
  assert.equal(stats.totalTokens, 0);
  assert.equal(stats.costUsd, 0);
});

test('TokenMeter getRecentRecords(0) returns empty array', () => {
  const meter = new TokenMeter();
  meter.record(makeEntry());
  assert.deepEqual(meter.getRecentRecords(0), []);
});

test('TokenMeter getRecentRecords negative returns empty array', () => {
  const meter = new TokenMeter();
  meter.record(makeEntry());
  assert.deepEqual(meter.getRecentRecords(-5), []);
});

test('TokenMeter maxEntries=0 falls back to default 100000', () => {
  const meter = new TokenMeter({ maxEntries: 0 });
  assert.equal(meter.maxEntries, 100_000);
});

test('TokenMeter maxEntries=1 keeps only last record', () => {
  const meter = new TokenMeter({ maxEntries: 1 });
  assert.equal(meter.maxEntries, 1);
  meter.record(makeEntry());
  meter.record(makeEntry({ model: 'claude-3' }));
  assert.equal(meter._records.length, 1);
  assert.equal(meter._records[0].model, 'claude-3');
});

test('TokenMeter onFlush error does not propagate to record()', () => {
  const meter = new TokenMeter({
    onFlush: () => { throw new Error('flush failed'); },
  });
  // Should not throw
  const entry = meter.record(makeEntry());
  assert.ok(entry.model);
  assert.equal(meter._records.length, 1);
});

test('TokenMeter onFlushError callback fires when onFlush throws', () => {
  const errors = [];
  const meter = new TokenMeter({
    onFlush: () => { throw new Error('flush failed'); },
    onFlushError: (err) => errors.push(err.message),
  });
  meter.record(makeEntry());
  assert.equal(errors.length, 1);
  assert.equal(errors[0], 'flush failed');
});

test('TokenMeter getStats windowDays=0 defaults to 30', () => {
  const meter = new TokenMeter();
  meter.record(makeEntry());
  const stats = meter.getStats({ windowDays: 0 });
  assert.equal(stats.count, 1);
});

test('TokenMeter getStats windowDays=Infinity falls back to default 30', () => {
  const meter = new TokenMeter();
  meter.record(makeEntry());
  const stats = meter.getStats({ windowDays: Infinity });
  assert.equal(stats.count, 1);
  assert.equal(stats.windowDays, 30);
});

test('TokenMeter getReport accepts breakdownWindowDays param', () => {
  const meter = new TokenMeter();
  meter.record(makeEntry());
  const report = meter.getReport(7);
  assert.equal(report.modelBreakdown[0].windowDays, 7);
});

test('TokenMeter clear removes all records', () => {
  const meter = new TokenMeter();
  meter.record(makeEntry());
  meter.record(makeEntry());
  meter.clear();
  assert.equal(meter._records.length, 0);
  assert.equal(meter.getStats().count, 0);
});
