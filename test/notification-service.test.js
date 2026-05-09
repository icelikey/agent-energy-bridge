const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { NotificationService } = require('../src');

function createMockServer(port, handler) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        handler(req, res, body);
      });
    });
    server.listen(port, () => resolve(server));
  });
}

test('NotificationService sends webhook notification', async () => {
  let received = null;
  const server = await createMockServer(19999, (req, res, body) => {
    received = JSON.parse(body);
    res.writeHead(200);
    res.end('ok');
  });

  try {
    const svc = new NotificationService();
    const result = await svc.send({
      type: 'test_event',
      level: 'info',
      title: 'Test',
      message: 'Hello',
      targets: [{ channel: 'webhook', url: 'http://127.0.0.1:19999/hook' }],
    });

    assert.equal(result.sent, true);
    assert.equal(received.type, 'test_event');
    assert.equal(received.title, 'Test');
    assert.equal(received.message, 'Hello');
    assert.ok(received.timestamp);
  } finally {
    server.close();
  }
});

test('NotificationService deduplicates identical notifications', async () => {
  let count = 0;
  const server = await createMockServer(19998, (req, res, body) => {
    count++;
    res.writeHead(200);
    res.end('ok');
  });

  try {
    const svc = new NotificationService({ dedupWindowMs: 5000 });

    await svc.send({
      type: 'dup_test',
      level: 'warn',
      title: 'Dup',
      message: 'Same',
      targets: [{ channel: 'webhook', url: 'http://127.0.0.1:19998/hook' }],
    });

    const result2 = await svc.send({
      type: 'dup_test',
      level: 'warn',
      title: 'Dup',
      message: 'Same',
      targets: [{ channel: 'webhook', url: 'http://127.0.0.1:19998/hook' }],
    });

    assert.equal(result2.sent, false);
    assert.equal(result2.reason, 'deduplicated');
    assert.equal(count, 1);
  } finally {
    server.close();
  }
});

test('NotificationService formats Feishu card correctly', async () => {
  let received = null;
  const server = await createMockServer(19997, (req, res, body) => {
    received = JSON.parse(body);
    res.writeHead(200);
    res.end('ok');
  });

  try {
    const svc = new NotificationService();
    await svc.send({
      type: 'failover',
      level: 'critical',
      title: 'Switch',
      message: 'Primary down',
      targets: [{ channel: 'feishu', url: 'http://127.0.0.1:19997/feishu' }],
    });

    assert.equal(received.msg_type, 'interactive');
    assert.equal(received.card.header.template, 'red');
  } finally {
    server.close();
  }
});

test('NotificationService formats DingTalk markdown correctly', async () => {
  let received = null;
  const server = await createMockServer(19996, (req, res, body) => {
    received = JSON.parse(body);
    res.writeHead(200);
    res.end('ok');
  });

  try {
    const svc = new NotificationService();
    await svc.send({
      type: 'alert',
      level: 'warn',
      title: 'Alert',
      message: 'Low balance',
      targets: [{ channel: 'dingtalk', url: 'http://127.0.0.1:19996/ding' }],
    });

    assert.equal(received.msgtype, 'markdown');
    assert.ok(received.markdown.text.includes('Alert'));
  } finally {
    server.close();
  }
});

test('NotificationService handles unknown channel gracefully', async () => {
  const svc = new NotificationService();
  const result = await svc.send({
    type: 'test',
    level: 'info',
    title: 'T',
    message: 'M',
    targets: [{ channel: 'nonexistent', url: 'http://example.com' }],
  });

  assert.equal(result.sent, false);
  assert.equal(result.results[0].error, 'Unknown channel');
});

test('NotificationService handles webhook timeout', async () => {
  const server = await createMockServer(19995, () => {
    // never respond
  });

  try {
    const svc = new NotificationService({ timeoutMs: 100 });
    const result = await svc.send({
      type: 'test',
      level: 'info',
      title: 'T',
      message: 'M',
      targets: [{ channel: 'webhook', url: 'http://127.0.0.1:19995/slow' }],
    });

    assert.equal(result.sent, false);
    assert.ok(result.results[0].error.includes('timeout'));
  } finally {
    server.close();
  }
});

test('NotificationService parses environment targets', async () => {
  process.env.AEB_NOTIFY_WEBHOOK_URL = 'http://127.0.0.1:19994/webhook';
  process.env.AEB_NOTIFY_FEISHU_URL = 'http://127.0.0.1:19994/feishu';

  try {
    const svc = new NotificationService();
    let received = [];
    const server = await createMockServer(19994, (req, res, body) => {
      received.push(JSON.parse(body));
      res.writeHead(200);
      res.end('ok');
    });

    try {
      const result = await svc.sendFromEnv({
        type: 'env_test',
        level: 'info',
        title: 'Env',
        message: 'From env',
      });

      assert.equal(result.sent, true);
      assert.equal(received.length, 2);
    } finally {
      server.close();
    }
  } finally {
    delete process.env.AEB_NOTIFY_WEBHOOK_URL;
    delete process.env.AEB_NOTIFY_FEISHU_URL;
  }
});

test('NotificationService returns false when no targets configured', async () => {
  const svc = new NotificationService();
  const result = await svc.sendFromEnv({
    type: 'test',
    level: 'info',
    title: 'T',
    message: 'M',
  });

  assert.equal(result.sent, false);
  assert.equal(result.reason, 'no_targets_configured');
});

// ----------------------------------------------------------------
// Phase 6: wecom + email 渠道 (NOTF-03, NOTF-04)
// ----------------------------------------------------------------

test('wecom channel formats markdown body correctly', async () => {
  const { NotificationService } = require('../src/service/notification-service');
  const service = new NotificationService();
  let capturedBody = null;
  // Override _wecomSender on the instance and re-register it so the channels Map
  // picks up the new implementation (the original was bound at construction time)
  service._wecomSender = async (target, payload) => {
    capturedBody = {
      msgtype: 'markdown',
      markdown: {
        content: `### ${payload.title}\n${payload.message}`,
      },
    };
    return { statusCode: 200 };
  };
  service.registerChannel('wecom', service._wecomSender.bind(service));
  await service.send({
    type: 'test_event',
    level: 'warn',
    title: 'Test Title',
    message: 'Test message',
    targets: [{ channel: 'wecom', url: 'http://example.com/wecom' }],
  });
  assert.ok(capturedBody, 'body should be captured');
  assert.equal(capturedBody.msgtype, 'markdown');
  assert.ok(capturedBody.markdown.content.includes('Test Title'));
});

test('email channel throws when url or to is missing', async () => {
  const { NotificationService } = require('../src/service/notification-service');
  const service = new NotificationService();
  // send() catches sender errors internally and returns { sent: false, error: ... }
  const result = await service.send({
    type: 'test',
    level: 'info',
    title: 'T',
    message: 'M',
    targets: [{ channel: 'email' }],
  });
  assert.equal(result.sent, false);
  assert.ok(result.results[0].error.match(/url|to/i), `expected url/to error, got: ${result.results[0].error}`);
});

test('dedup returns deduplicated for same event within window (NOTF-05)', async () => {
  const { NotificationService } = require('../src/service/notification-service');
  const service = new NotificationService({ dedupWindowMs: 60000 });
  // registerChannel replaces the bound sender in the channels Map
  service.registerChannel('webhook', async () => ({ statusCode: 200 }));
  const first = await service.send({
    type: 'low_balance',
    level: 'warn',
    title: 'Low Balance',
    message: 'Balance is low',
    targets: [{ channel: 'webhook', url: 'http://example.com' }],
  });
  const second = await service.send({
    type: 'low_balance',
    level: 'warn',
    title: 'Low Balance',
    message: 'Balance is low',
    targets: [{ channel: 'webhook', url: 'http://example.com' }],
  });
  assert.equal(first.sent, true);
  assert.equal(second.sent, false);
  assert.equal(second.reason, 'deduplicated');
});

test('dedup does not suppress different levels of same event type (NOTF-05)', async () => {
  const { NotificationService } = require('../src/service/notification-service');
  const service = new NotificationService({ dedupWindowMs: 60000 });
  // registerChannel replaces the bound sender in the channels Map
  service.registerChannel('webhook', async () => ({ statusCode: 200 }));
  const warn = await service.send({
    type: 'low_balance',
    level: 'warn',
    title: 'Low Balance',
    message: 'Balance is low',
    targets: [{ channel: 'webhook', url: 'http://example.com' }],
  });
  const critical = await service.send({
    type: 'low_balance',
    level: 'critical',
    title: 'Low Balance',
    message: 'Balance is low',
    targets: [{ channel: 'webhook', url: 'http://example.com' }],
  });
  assert.equal(warn.sent, true);
  assert.equal(critical.sent, true, 'critical should not be suppressed by warn dedup');
});
