# Stage 1: Install dependencies
FROM node:22-alpine AS deps
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/frontend/package.json ./packages/frontend/
RUN pnpm install --frozen-lockfile

# Stage 2: Dev
FROM deps AS dev
COPY packages/frontend ./packages/frontend
WORKDIR /app/packages/frontend
CMD ["pnpm", "dev", "--host", "0.0.0.0"]

# Stage 3: Build
FROM deps AS build
COPY packages/frontend ./packages/frontend
RUN pnpm --filter @omb/frontend build
# Prune to prod-only deps — resolves workspace packages into a self-contained dir
RUN pnpm deploy --filter @omb/frontend --prod --legacy /deploy/frontend

# Stage 4: Production
FROM node:22-alpine AS prod
WORKDIR /app
COPY --from=build /deploy/frontend/node_modules ./node_modules
COPY --from=build /app/packages/frontend/build ./build
COPY --from=build /app/packages/frontend/package.json ./package.json
EXPOSE 3001
CMD ["node", "build"]
