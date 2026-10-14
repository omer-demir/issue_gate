# syntax=docker/dockerfile:1
#
# Builds the issue_gate backend (MSM-10..MSM-13 sync service) for local
# Docker Compose use first, and as the same reusable artifact for an
# optional later VPS/cloud deployment (MSM-17 scope). No build step here
# deploys anything; it only produces a local image.

FROM node:20.17.0-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20.17.0-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

# Non-root runtime user (MSM-17 non-functional: least-privilege execution).
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1

CMD ["node", "dist/server.js"]
