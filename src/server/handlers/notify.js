function requireNotificationService(context) {
  if (!context.notificationService) {
    const error = new Error('Notification service not available');
    error.statusCode = 503;
    error.code = 'SERVICE_NOT_CONFIGURED';
    throw error;
  }
}

async function getNotifyConfig(request, response, context) {
  requireNotificationService(context);
  const channels = [...context.notificationService.channels.keys()];
  const configured = [];

  if (process.env.AEB_NOTIFY_WEBHOOK_URL) configured.push('webhook');
  if (process.env.AEB_NOTIFY_FEISHU_URL) configured.push('feishu');
  if (process.env.AEB_NOTIFY_DINGTALK_URL) configured.push('dingtalk');
  if (process.env.AEB_NOTIFY_SLACK_URL) configured.push('slack');
  if (process.env.AEB_NOTIFY_WECOM_URL) configured.push('wecom');
  if (process.env.AEB_NOTIFY_EMAIL_API_URL && process.env.AEB_NOTIFY_EMAIL_TO) configured.push('email');

  return {
    availableChannels: channels,
    configuredChannels: configured,
    dedupWindowMs: context.notificationService.opts.dedupWindowMs,
  };
}

async function postNotifyTest(request, response, context) {
  requireNotificationService(context);
  const body = request.body || {};
  const channel = body.channel || null;
  const level = body.level || 'info';
  const title = body.title || 'AEB Test Notification';
  const message = body.message || 'This is a test notification from Agent Energy Bridge.';

  const notification = {
    type: 'test',
    level,
    title,
    message,
    meta: { source: 'manual_test', timestamp: new Date().toISOString() },
  };

  let result;
  if (channel) {
    const url = body.url;
    if (!url) {
      const err = new Error('url is required when channel is specified');
      err.statusCode = 400;
      err.code = 'MISSING_URL';
      throw err;
    }
    result = await context.notificationService.send({
      ...notification,
      targets: [{ channel, url }],
    });
  } else {
    result = await context.notificationService.sendFromEnv(notification);
  }

  return result;
}

module.exports = { getNotifyConfig, postNotifyTest };
