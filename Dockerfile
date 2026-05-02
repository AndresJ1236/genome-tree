FROM node:20-alpine AS base

FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG APP_HOSTNAME=""
ENV APP_HOSTNAME=${APP_HOSTNAME}
ENV BUILD_STANDALONE=1
RUN npx prisma generate
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs

# Standalone build output
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static    ./.next/static

# Prisma schema + CLI for db push on startup
COPY --from=builder /app/prisma                     ./prisma
COPY --from=builder /app/node_modules/.bin/prisma*  ./node_modules/.bin/
COPY --from=builder /app/node_modules/prisma        ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma       ./node_modules/@prisma
# WASM files needed by the Prisma CLI binary at runtime
RUN find /app/node_modules/prisma -name "*.wasm" -exec cp {} /app/node_modules/.bin/ \; 2>/dev/null || true

# pg driver adapter deps that standalone tracing misses
COPY --from=builder /app/node_modules/postgres-array ./node_modules/postgres-array
COPY --from=builder /app/node_modules/pgpass         ./node_modules/pgpass
COPY --from=builder /app/node_modules/pg-cloudflare  ./node_modules/pg-cloudflare

# Startup script
COPY docker/entrypoint.sh /entrypoint.sh
RUN sed -i 's/\r//' /entrypoint.sh && chmod 755 /entrypoint.sh

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENTRYPOINT ["/entrypoint.sh"]
