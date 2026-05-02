async function postRenderDocs(request, response, context) {
  if (!context.adapter || typeof context.adapter.renderDocs !== 'function') {
    const error = new Error('Adapter does not support docs rendering');
    error.statusCode = 503;
    error.code = 'ADAPTER_NOT_SUPPORTED';
    throw error;
  }

  const body = request.body || {};
  const result = await context.adapter.renderDocs({
    template: body.template,
    data: body.data || {},
  });

  return {
    success: true,
    docs: result,
  };
}

module.exports = {
  postRenderDocs,
};
