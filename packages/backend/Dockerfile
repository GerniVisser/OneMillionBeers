# Stage 0: fetch AWS RDS CA bundle (public file, no secrets)
FROM node:22-alpine AS certs
RUN wget -qO /rds-ca-bundle.pem \
    https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem

# Stage 1: Install dependencies
FROM node:22-alpine AS deps
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/backend/package.json ./packages/backend/
RUN pnpm install --frozen-lockfile

# Stage 2: Dev
FROM deps AS dev
COPY packages/shared/src ./packages/shared/src
COPY packages/shared/tsconfig.json ./packages/shared/
COPY tsconfig.json ./
RUN pnpm --filter @omb/shared build
COPY packages/backend/src ./packages/backend/src
WORKDIR /app/packages/backend
CMD ["pnpm", "dev"]

# Stage 3: Build
FROM deps AS build
COPY packages/shared/src ./packages/shared/src
COPY packages/shared/tsconfig.json ./packages/shared/
COPY packages/backend/src ./packages/backend/src
COPY packages/backend/tsconfig.json ./packages/backend/
COPY tsconfig.json ./
RUN pnpm --filter @omb/shared build
RUN pnpm --filter @omb/backend build
# Prune to prod-only deps — resolves workspace packages into a self-contained dir
RUN pnpm deploy --filter @omb/backend --prod --legacy /deploy/backend

# Stage 4: Production
FROM node:22-alpine AS prod
WORKDIR /app
COPY --from=build /deploy/backend/node_modules ./node_modules
COPY --from=build /app/packages/backend/dist ./dist
COPY --from=build /app/packages/backend/package.json ./package.json
COPY --from=certs /rds-ca-bundle.pem /app/certs/rds-ca-bundle.pem
EXPOSE 3000
CMD ["node", "dist/index.js"]
