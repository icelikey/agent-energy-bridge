const { createHash } = require('crypto');

const DEFAULT_MAX_BODY_SIZE = 1_048_576; // 1 MB

function parseJsonBody(request, options = {}) {
  const maxBodySize = options.maxBodySize ?? DEFAULT_MAX_BODY_SIZE;

  return new Promise((resolve, reject) => {
    let totalLength = 0;
    const chunks = [];

    request.on('data', (chunk) => {
      totalLength += chunk.length;
      if (totalLength > maxBodySize) {
        const error = new Error(`Request body exceeds ${maxBodySize} bytes`);
        error.statusCode = 413;
        error.code = 'PAYLOAD_TOO_LARGE';
        reject(error);
        return;
      }
      chunks.push(chunk);
    });

    request.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(Object.assign(new Error('Invalid JSON body'), { statusCode: 400, code: 'INVALID_JSON' }));
      }
    });

    request.on('error', reject);
  });
}

module.exports = {
  parseJsonBody,
  DEFAULT_MAX_BODY_SIZE,
};
