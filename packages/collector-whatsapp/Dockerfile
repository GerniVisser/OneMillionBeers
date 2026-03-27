# Stage 1: Install dependencies
FROM node:22-alpine AS deps
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json               ./packages/shared/
COPY packages/collector-core/package.json       ./packages/collector-core/
COPY packages/collector-whatsapp/package.json   ./packages/collector-whatsapp/
RUN pnpm install --frozen-lockfile

# Stage 2: Dev (hot reload)
FROM deps AS dev
COPY packages/shared/src          ./packages/shared/src
COPY packages/shared/tsconfig.json ./packages/shared/
COPY packages/collector-core/src       ./packages/collector-core/src
COPY packages/collector-core/tsconfig.json ./packages/collector-core/
COPY tsconfig.json ./
RUN pnpm --filter @omb/shared build
RUN pnpm --filter @omb/collector-core build
COPY packages/collector-whatsapp/src       ./packages/collector-whatsapp/src
WORKDIR /app/packages/collector-whatsapp
CMD ["pnpm", "dev"]

# Stage 3: Build
FROM deps AS build
COPY packages/shared/src          ./packages/shared/src
COPY packages/shared/tsconfig.json ./packages/shared/
COPY packages/collector-core/src       ./packages/collector-core/src
COPY packages/collector-core/tsconfig.json ./packages/collector-core/
COPY packages/collector-whatsapp/src       ./packages/collector-whatsapp/src
COPY packages/collector-whatsapp/tsconfig.json ./packages/collector-whatsapp/
COPY tsconfig.json ./
RUN pnpm --filter @omb/shared build
RUN pnpm --filter @omb/collector-core build
RUN pnpm --filter @omb/collector-whatsapp build
RUN pnpm deploy --filter @omb/collector-whatsapp --prod --legacy /deploy/collector-whatsapp

# Stage 4: Production
FROM node:22-alpine AS prod
WORKDIR /app
COPY --from=build /deploy/collector-whatsapp/node_modules ./node_modules
COPY --from=build /app/packages/collector-whatsapp/dist   ./dist
COPY --from=build /app/packages/collector-whatsapp/package.json ./package.json
CMD ["node", "dist/index.js"]
