async function postIssueKey(request, response, context) {
  if (!context.adapter || typeof context.adapter.issueKey !== 'function') {
    const error = new Error('Adapter does not support key issuance');
    error.statusCode = 503;
    error.code = 'ADAPTER_NOT_SUPPORTED';
    throw error;
  }

  const body = request.body || {};
  const result = await context.adapter.issueKey({
    owner: body.owner,
    group: body.group,
    plan: body.plan,
    metadata: body.metadata || {},
  });

  return {
    success: true,
    key: result,
  };
}

module.exports = {
  postIssueKey,
};
