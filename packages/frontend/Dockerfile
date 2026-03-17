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

# Stage 3: Production
FROM node:22-alpine AS prod
WORKDIR /app
COPY --from=build /app/packages/frontend/build ./build
COPY --from=build /app/packages/frontend/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
EXPOSE 3000
CMD ["node", "build"]
