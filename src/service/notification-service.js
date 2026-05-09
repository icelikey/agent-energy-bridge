/**
 * Lightweight notification service — zero external dependencies.
 * Supports generic webhooks and pre-built templates for popular channels
 * (Feishu/Lark, DingTalk, Slack, Discord).
 *
 * Design principle: one HTTP POST per notification. No SMTP client, no SDK.
 */

const { createHash } = require('crypto');

const DEFAULT_OPTIONS = Object.freeze({
  dedupWindowMs: 300_000, // 5 minutes
  maxDedupEntries: 500,
  timeoutMs: 10_000,
  defaultChannel: 'webhook',
});

class NotificationService {
  constructor(options = {}) {
    this.opts = { ...DEFAULT_OPTIONS, ...options };
    this.channels = new Map();
    this._recentHashes = new Map(); // deduplication cache
    this._lastCleanup = Date.now();

    // Register built-in channels
    this.registerChannel('webhook', this._webhookSender.bind(this));
    this.registerChannel('feishu', this._feishuSender.bind(this));
    this.registerChannel('dingtalk', this._dingtalkSender.bind(this));
    this.registerChannel('slack', this._slackSender.bind(this));
    this.registerChannel('wecom', this._wecomSender.bind(this));
    this.registerChannel('email', this._emailSender.bind(this));
  }

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------

  registerChannel(name, senderFn) {
    this.channels.set(name, senderFn);
  }

  /**
   * Send a notification.
   * @param {Object} notification
   * @param {string} notification.type - event type, e.g. 'failover_switched'
   * @param {string} notification.level - 'info' | 'warn' | 'critical'
   * @param {string} notification.title - short title
   * @param {string} notification.message - body text
   * @param {Object} [notification.meta] - extra structured data
   * @param {Array} [notification.targets] - [{ channel, url, secret?, config? }]
   */
  async send(notification) {
    const { type, level, title, message, meta, targets } = notification;

    // Deduplication
    const dedupKey = this._hashNotification(type, level, title, message);
    if (this._isDuplicate(dedupKey)) {
      return { sent: false, reason: 'deduplicated' };
    }
    this._recordHash(dedupKey);

    const results = [];
    const effectiveTargets = targets || this._buildDefaultTargets(notification);

    for (const target of effectiveTargets) {
      const sender = this.channels.get(target.channel);
      if (!sender) {
        results.push({ channel: target.channel, sent: false, error: 'Unknown channel' });
        continue;
      }

      try {
        const result = await sender(target, { type, level, title, message, meta });
        results.push({ channel: target.channel, sent: true, result });
      } catch (error) {
        results.push({ channel: target.channel, sent: false, error: error.message });
      }
    }

    return { sent: results.some((r) => r.sent), results };
  }

  /**
   * Convenience: send from environment variables.
   * Reads AEB_NOTIFY_WEBHOOK_URL, AEB_NOTIFY_FEISHU_URL, etc.
   */
  async sendFromEnv(notification) {
    const targets = this._parseEnvTargets();
    if (targets.length === 0) return { sent: false, reason: 'no_targets_configured' };
    return this.send({ ...notification, targets });
  }

  // ------------------------------------------------------------------
  // Built-in senders (zero deps)
  // ------------------------------------------------------------------

  async _webhookSender(target, payload) {
    const url = new URL(target.url);
    const isHttps = url.protocol === 'https:';
    const httpModule = isHttps ? require('https') : require('http');

    const body = JSON.stringify({
      ...payload,
      timestamp: new Date().toISOString(),
      ...target.config,
    });

    return new Promise((resolve, reject) => {
      const req = httpModule.request(
        url,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'content-length': Buffer.byteLength(body),
            ...(target.headers || {}),
          },
          timeout: this.opts.timeoutMs,
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve({ statusCode: res.statusCode, body: data });
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
            }
          });
        },
      );

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.write(body);
      req.end();
    });
  }

  async _feishuSender(target, payload) {
    const card = {
      msg_type: 'interactive',
      card: {
        header: {
          title: { tag: 'plain_text', content: payload.title },
          template: payload.level === 'critical' ? 'red' : payload.level === 'warn' ? 'orange' : 'blue',
        },
        elements: [
          { tag: 'div', text: { tag: 'lark_md', content: payload.message } },
          { tag: 'hr' },
          {
            tag: 'note',
            elements: [{ tag: 'plain_text', content: `Event: ${payload.type} | ${new Date().toLocaleString('zh-CN')}` }],
          },
        ],
      },
    };

    return this._webhookSender(
      { ...target, config: card },
      payload,
    );
  }

  async _dingtalkSender(target, payload) {
    const body = {
      msgtype: 'markdown',
      markdown: {
        title: payload.title,
        text: `### ${payload.title}\n${payload.message}\n\n> Event: ${payload.type} | ${new Date().toLocaleString('zh-CN')}`,
      },
    };

    return this._webhookSender(
      { ...target, config: body },
      payload,
    );
  }

  async _slackSender(target, payload) {
    const body = {
      text: payload.title,
      attachments: [
        {
          color: payload.level === 'critical' ? 'danger' : payload.level === 'warn' ? 'warning' : 'good',
          fields: [
            { title: 'Event', value: payload.type, short: true },
            { title: 'Level', value: payload.level, short: true },
            { title: 'Message', value: payload.message, short: false },
          ],
          footer: 'Agent Energy Bridge',
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    };

    return this._webhookSender(
      { ...target, config: body },
      payload,
    );
  }

  async _wecomSender(target, payload) {
    const body = {
      msgtype: 'markdown',
      markdown: {
        content: `### ${payload.title}\n${payload.message}\n> Event: ${payload.type} | Level: ${payload.level}`,
      },
    };
    return this._webhookSender({ ...target, config: body }, payload);
  }

  async _emailSender(target, payload) {
    // HTTP API email (Mailgun/SendGrid/Aliyun DM compatible)
    const apiUrl = target.url || process.env.AEB_NOTIFY_EMAIL_API_URL;
    const apiKey = target.apiKey || process.env.AEB_NOTIFY_EMAIL_API_KEY;
    const to = target.to || process.env.AEB_NOTIFY_EMAIL_TO;
    const from = target.from || process.env.AEB_NOTIFY_EMAIL_FROM || 'aeb@noreply.local';

    if (!apiUrl || !to) {
      throw new Error('email channel requires url and to address');
    }

    const emailPayload = {
      from,
      to,
      subject: `[AEB ${payload.level.toUpperCase()}] ${payload.title}`,
      text: `${payload.message}\n\nEvent: ${payload.type}\nTimestamp: ${new Date().toISOString()}`,
    };

    const headers = {};
    if (apiKey) headers['authorization'] = `Bearer ${apiKey}`;

    return this._webhookSender({ url: apiUrl, headers }, emailPayload);
  }

  // ------------------------------------------------------------------
  // Deduplication
  // ------------------------------------------------------------------

  _hashNotification(type, level, title, message) {
    const raw = `${type}:${level}:${title}:${message?.slice(0, 200) || ''}`;
    return createHash('sha256').update(raw).digest('hex').slice(0, 32);
  }

  _isDuplicate(hash) {
    this._cleanupDedup();
    const entry = this._recentHashes.get(hash);
    if (!entry) return false;
    return Date.now() - entry < this.opts.dedupWindowMs;
  }

  _recordHash(hash) {
    this._recentHashes.set(hash, Date.now());
  }

  _cleanupDedup() {
    const now = Date.now();
    if (now - this._lastCleanup < 60_000) return;
    const cutoff = now - this.opts.dedupWindowMs;
    for (const [hash, ts] of this._recentHashes) {
      if (ts < cutoff) this._recentHashes.delete(hash);
    }
    // Hard limit
    if (this._recentHashes.size > this.opts.maxDedupEntries) {
      const sorted = [...this._recentHashes.entries()].sort((a, b) => a[1] - b[1]);
      const toDelete = sorted.slice(0, sorted.length - this.opts.maxDedupEntries);
      for (const [hash] of toDelete) this._recentHashes.delete(hash);
    }
    this._lastCleanup = now;
  }

  // ------------------------------------------------------------------
  // Environment parsing
  // ------------------------------------------------------------------

  _parseEnvTargets() {
    const targets = [];

    const webhookUrl = process.env.AEB_NOTIFY_WEBHOOK_URL;
    if (webhookUrl) {
      targets.push({ channel: 'webhook', url: webhookUrl });
    }

    const feishuUrl = process.env.AEB_NOTIFY_FEISHU_URL;
    if (feishuUrl) {
      targets.push({ channel: 'feishu', url: feishuUrl });
    }

    const dingtalkUrl = process.env.AEB_NOTIFY_DINGTALK_URL;
    if (dingtalkUrl) {
      targets.push({ channel: 'dingtalk', url: dingtalkUrl });
    }

    const slackUrl = process.env.AEB_NOTIFY_SLACK_URL;
    if (slackUrl) {
      targets.push({ channel: 'slack', url: slackUrl });
    }

    const wecomUrl = process.env.AEB_NOTIFY_WECOM_URL;
    if (wecomUrl) {
      targets.push({ channel: 'wecom', url: wecomUrl });
    }

    const emailApiUrl = process.env.AEB_NOTIFY_EMAIL_API_URL;
    const emailTo = process.env.AEB_NOTIFY_EMAIL_TO;
    if (emailApiUrl && emailTo) {
      targets.push({ channel: 'email', url: emailApiUrl, to: emailTo });
    }

    return targets;
  }

  _buildDefaultTargets(notification) {
    return this._parseEnvTargets();
  }
}

module.exports = {
  NotificationService,
  DEFAULT_OPTIONS,
};
