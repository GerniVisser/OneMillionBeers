# Stage 1: Install dependencies
FROM node:22-alpine AS deps
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json              ./packages/shared/
COPY packages/collector-core/package.json      ./packages/collector-core/
COPY packages/collector-telegram/package.json  ./packages/collector-telegram/
RUN pnpm install --frozen-lockfile

# Stage 2: Dev (hot reload)
FROM deps AS dev
COPY packages/shared/src         ./packages/shared/src
COPY packages/shared/tsconfig.json ./packages/shared/
COPY packages/collector-core/src      ./packages/collector-core/src
COPY packages/collector-core/tsconfig.json ./packages/collector-core/
COPY tsconfig.json ./
RUN pnpm --filter @omb/shared build
RUN pnpm --filter @omb/collector-core build
COPY packages/collector-telegram/src      ./packages/collector-telegram/src
WORKDIR /app/packages/collector-telegram
CMD ["pnpm", "dev"]

# Stage 3: Build
FROM deps AS build
COPY packages/shared/src         ./packages/shared/src
COPY packages/shared/tsconfig.json ./packages/shared/
COPY packages/collector-core/src      ./packages/collector-core/src
COPY packages/collector-core/tsconfig.json ./packages/collector-core/
COPY packages/collector-telegram/src      ./packages/collector-telegram/src
COPY packages/collector-telegram/tsconfig.json ./packages/collector-telegram/
COPY tsconfig.json ./
RUN pnpm --filter @omb/shared build
RUN pnpm --filter @omb/collector-core build
RUN pnpm --filter @omb/collector-telegram build
# pnpm deploy resolves workspace deps (collector-core, shared) into a self-contained directory
RUN pnpm deploy --filter @omb/collector-telegram --prod --legacy /deploy/collector-telegram

# Stage 4: Production
FROM node:22-alpine AS prod
WORKDIR /app
COPY --from=build /deploy/collector-telegram/node_modules ./node_modules
COPY --from=build /app/packages/collector-telegram/dist   ./dist
COPY --from=build /app/packages/collector-telegram/package.json ./package.json
CMD ["node", "dist/index.js"]
