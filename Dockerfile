# Multi-stage Dockerfile for hf-access-manager using Next.js standalone build

# 1. Base stage
FROM node:22-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat

# 2. Dependencies stage
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci

# 3. Builder stage
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Dummy environment variables for standalone build step (actual secrets injected at runtime)
ENV HF_TOKEN="build-time-dummy"
ENV HF_REPOSITORIES="model:dummy/build-model"
ENV APP_PASSWORD="build-time-dummy-password"
ENV AUTH_SECRET="build-time-dummy-secret-key-at-least-32-chars"
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# 4. Runner stage
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV NEXT_TELEMETRY_DISABLED=1

# Run as non-root user for container security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone build and static files
COPY --from=builder /app/public* ./public/
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
