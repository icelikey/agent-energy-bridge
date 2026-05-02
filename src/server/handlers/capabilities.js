async function getCapabilities(request, response, context) {
  if (!context.modelSelector) {
    const error = new Error('Model selector not available');
    error.statusCode = 503;
    error.code = 'SERVICE_NOT_CONFIGURED';
    throw error;
  }

  const budgetTier = request.query?.budgetTier;
  const protocol = request.query?.protocol;
  const catalog = context.modelSelector.listCatalog({ budgetTier, protocol });

  return {
    success: true,
    models: catalog,
    count: catalog.length,
  };
}

module.exports = {
  getCapabilities,
};
