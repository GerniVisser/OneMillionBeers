# Stage 1: Install dependencies
FROM node:22-alpine AS deps
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/collector/package.json ./packages/collector/
RUN pnpm install --frozen-lockfile

# Stage 2: Dev
FROM deps AS dev
COPY packages/shared/src ./packages/shared/src
COPY packages/collector/src ./packages/collector/src
WORKDIR /app/packages/collector
CMD ["pnpm", "dev"]

# Stage 3: Build
FROM deps AS build
COPY packages/shared/src ./packages/shared/src
COPY packages/shared/tsconfig.json ./packages/shared/
COPY packages/collector/src ./packages/collector/src
COPY packages/collector/tsconfig.json ./packages/collector/
COPY tsconfig.json ./
RUN pnpm --filter @omb/shared build
RUN pnpm --filter @omb/collector build

# Stage 3: Production
FROM node:22-alpine AS prod
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY --from=build /app/packages/collector/dist ./dist
COPY --from=build /app/packages/collector/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
EXPOSE 3001
CMD ["node", "dist/index.js"]
