const test = require('node:test');
const assert = require('node:assert/strict');
const { SessionStore } = require('../src');

test('SessionStore adds session and assigns storedAt', () => {
  const store = new SessionStore();
  const len = store.addSession({ taskType: 'coding', energyScore: 85 });

  assert.equal(len, 1);
  const recent = store.getRecentSessions(1);
  assert.equal(recent[0].taskType, 'coding');
  assert.equal(recent[0].energyScore, 85);
  assert.ok(recent[0].storedAt);
});

test('SessionStore getRecentSessions returns most recent sessions', () => {
  const store = new SessionStore();
  store.addSession({ taskType: 'coding', energyScore: 80 });
  store.addSession({ taskType: 'chat', energyScore: 90 });
  store.addSession({ taskType: 'analysis', energyScore: 70 });

  const recent = store.getRecentSessions(2);
  assert.equal(recent.length, 2);
  assert.equal(recent[0].taskType, 'chat');
  assert.equal(recent[1].taskType, 'analysis');
});

test('SessionStore getSessionsByTaskType filters correctly', () => {
  const store = new SessionStore();
  store.addSession({ taskType: 'coding', energyScore: 80 });
  store.addSession({ taskType: 'chat', energyScore: 90 });
  store.addSession({ taskType: 'coding', energyScore: 85 });

  const coding = store.getSessionsByTaskType('coding');
  assert.equal(coding.length, 2);
  assert.ok(coding.every((s) => s.taskType === 'coding'));

  const chat = store.getSessionsByTaskType('chat');
  assert.equal(chat.length, 1);
});

test('SessionStore getSessionsByModel filters correctly', () => {
  const store = new SessionStore();
  store.addSession({ taskType: 'coding', model: 'gpt-4', energyScore: 80 });
  store.addSession({ taskType: 'chat', model: 'claude-3', energyScore: 90 });
  store.addSession({ taskType: 'coding', model: 'gpt-4', energyScore: 85 });

  const gpt4 = store.getSessionsByModel('gpt-4');
  assert.equal(gpt4.length, 2);
  assert.ok(gpt4.every((s) => s.model === 'gpt-4'));
});

test('SessionStore respects maxSize and evicts oldest', () => {
  const store = new SessionStore({ maxSize: 3 });
  store.addSession({ taskType: 't1' });
  store.addSession({ taskType: 't2' });
  store.addSession({ taskType: 't3' });
  store.addSession({ taskType: 't4' });

  assert.equal(store.size(), 3);
  const recent = store.getRecentSessions(3);
  assert.equal(recent[0].taskType, 't2');
  assert.equal(recent[2].taskType, 't4');
});

test('SessionStore clear empties all sessions', () => {
  const store = new SessionStore();
  store.addSession({ taskType: 'coding' });
  store.clear();
  assert.equal(store.size(), 0);
  assert.equal(store.getRecentSessions().length, 0);
});

test('SessionStore getSessionsByTaskType respects limit', () => {
  const store = new SessionStore();
  for (let i = 0; i < 5; i++) {
    store.addSession({ taskType: 'coding', energyScore: i });
  }

  const coding = store.getSessionsByTaskType('coding', 2);
  assert.equal(coding.length, 2);
  assert.equal(coding[0].energyScore, 3);
  assert.equal(coding[1].energyScore, 4);
});

test('SessionStore getSessionsByModel respects limit', () => {
  const store = new SessionStore();
  for (let i = 0; i < 5; i++) {
    store.addSession({ model: 'gpt-4', energyScore: i });
  }

  const models = store.getSessionsByModel('gpt-4', 2);
  assert.equal(models.length, 2);
});

test('SessionStore default maxSize is 1000', () => {
  const store = new SessionStore();
  assert.equal(store.maxSize, 1000);
});

test('SessionStore preserves all session fields', () => {
  const store = new SessionStore();
  const session = {
    taskType: 'coding',
    inputTokens: 1000,
    outputTokens: 500,
    qualityScore: 0.9,
    successRate: 1,
    latencyMs: 500,
    costUsd: 0.3,
    energyScore: 85,
    model: 'gpt-4',
  };

  store.addSession(session);
  const recent = store.getRecentSessions(1)[0];
  assert.equal(recent.inputTokens, 1000);
  assert.equal(recent.outputTokens, 500);
  assert.equal(recent.qualityScore, 0.9);
  assert.equal(recent.successRate, 1);
  assert.equal(recent.latencyMs, 500);
  assert.equal(recent.costUsd, 0.3);
  assert.equal(recent.energyScore, 85);
  assert.equal(recent.model, 'gpt-4');
});
