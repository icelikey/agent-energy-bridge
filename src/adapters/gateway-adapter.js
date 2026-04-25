class GatewayAdapter {
  async listModels() {
    throw new Error('listModels() must be implemented by a gateway adapter');
  }

  async getUsage() {
    throw new Error('getUsage() must be implemented by a gateway adapter');
  }

  async getBalance() {
    throw new Error('getBalance() must be implemented by a gateway adapter');
  }

  async redeemCode() {
    throw new Error('redeemCode() must be implemented by a gateway adapter');
  }

  async issueKey() {
    throw new Error('issueKey() must be implemented by a gateway adapter');
  }

  async rotateKey() {
    throw new Error('rotateKey() must be implemented by a gateway adapter');
  }

  async renderDocs() {
    throw new Error('renderDocs() must be implemented by a gateway adapter');
  }
}

module.exports = {
  GatewayAdapter,
};
