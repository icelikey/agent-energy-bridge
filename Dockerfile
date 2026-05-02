FROM node:22-alpine

WORKDIR /app

# Copy package files first for layer caching
COPY package.json ./

# Install dependencies (none external, but good practice)
RUN npm install --production 2>/dev/null || true

# Copy source code
COPY src/ ./src/
COPY scripts/ ./scripts/
COPY bin/ ./bin/

# Create non-root user for security
RUN addgroup -g 1001 -S aeb && \
    adduser -S aeb -u 1001 -G aeb

USER aeb

EXPOSE 3100

ENV AEB_PORT=3100
ENV AEB_HOST=0.0.0.0
ENV NODE_ENV=production

CMD ["node", "scripts/start-server.js"]
