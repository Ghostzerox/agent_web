FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-alpine AS production-dependencies
WORKDIR /app
COPY package.json package-lock.json ./
# tsx is a runtime dependency: both entrypoints execute TypeScript.
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
# npm also installs this dev-only driver as Drizzle's optional peer.
# Production exclusively uses postgres-js; keep native optional packages for tsx/Next.
RUN node -e "require('node:fs').rmSync('node_modules/@electric-sql/pglite', { recursive: true, force: true })"

FROM dependencies AS builder
ENV NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN npm run build
# Build cache is disposable, not part of the serving artifact.
RUN node -e "require('node:fs').rmSync('.next/cache', { recursive: true, force: true })"

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/.next ./.next
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/drizzle ./drizzle
COPY --from=builder --chown=node:node /app/lib ./lib
COPY --from=builder --chown=node:node /app/scripts/db-migrate.ts ./scripts/db-migrate.ts
COPY --from=builder --chown=node:node /app/scripts/db-rollback.ts ./scripts/db-rollback.ts
COPY --from=builder --chown=node:node /app/scripts/reminder-worker.ts ./scripts/reminder-worker.ts
COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/tsconfig.json ./tsconfig.json
COPY --from=builder --chown=node:node /app/docker-entrypoint.sh ./docker-entrypoint.sh
COPY --from=builder --chown=node:node /app/worker-entrypoint.sh ./worker-entrypoint.sh

RUN chmod +x ./docker-entrypoint.sh ./worker-entrypoint.sh
USER node
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
