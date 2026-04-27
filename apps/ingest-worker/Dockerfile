FROM node:20-slim AS builder
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages packages
COPY apps/ingest-worker apps/ingest-worker
RUN npm ci
RUN npm -w @openlarm/core run build \
 && npm -w @openlarm/regions-taiwan run build \
 && npm -w @openlarm/ingest-types run build \
 && npm -w @openlarm/ingest-sources run build \
 && npm -w @openlarm/ingest-worker run build

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /repo/node_modules ./node_modules
COPY --from=builder /repo/packages ./packages
COPY --from=builder /repo/apps/ingest-worker/dist ./dist
COPY --from=builder /repo/apps/ingest-worker/package.json ./package.json
EXPOSE 3000
CMD ["node", "dist/index.js"]
