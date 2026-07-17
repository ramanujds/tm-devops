# syntax=docker/dockerfile:1

# ---- Stage 1: builder -------------------------------------------------
# Installs production-only dependencies in an isolated layer so the final
# image never contains npm's cache, devDependencies, or build tooling.
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY sql ./sql

# ---- Stage 2: runtime ---------------------------------------------------
FROM node:20-alpine

# Run as a dedicated non-root user rather than the image default (root).
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
RUN apk update && apk upgrade --no-cache

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/sql ./sql
COPY package.json ./

RUN rm -rf /usr/local/lib/node_modules/npm \
           /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
           /opt/yarn-v*

# USER appuser

EXPOSE 3000

# Liveness check for local `docker run` / Compose usage; Kubernetes will use
# its own probes against /health and /ready in the later labs.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 3000) + '/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "src/index.js"]
