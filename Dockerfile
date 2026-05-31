# ─── Stage 1: Builder ─────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install deps first (better layer caching)
COPY package*.json ./
RUN npm ci --omit=dev

# Generate Prisma client
COPY prisma ./prisma
RUN npx prisma generate

# Copy source
COPY . .

# ─── Stage 2: Production Image ────────────────────────────────────────────────
FROM node:20-alpine AS production

LABEL maintainer="Ankit Chauhan"
LABEL description="LinkForge Enterprise — URL Shortener"

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S linkforge -u 1001

WORKDIR /app

# Copy from builder
COPY --from=builder --chown=linkforge:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=linkforge:nodejs /app/prisma ./prisma
COPY --chown=linkforge:nodejs . .

# Create runtime directories
RUN mkdir -p public/qr logs && chown -R linkforge:nodejs public logs

USER linkforge

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "server.js"]
