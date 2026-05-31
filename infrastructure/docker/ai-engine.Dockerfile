FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json turbo.json tsconfig.base.json .npmrc ./
COPY infrastructure/docker/npm-install.sh ./npm-install.sh
COPY apps/ai-engine/package.json ./apps/ai-engine/
COPY apps/api/package.json ./apps/api/
COPY apps/worker/package.json ./apps/worker/
COPY apps/mcp-server/package.json ./apps/mcp-server/
COPY packages/config/package.json ./packages/config/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/kubernetes-sdk/package.json ./packages/kubernetes-sdk/
COPY packages/ai-sdk/package.json ./packages/ai-sdk/
RUN chmod +x ./npm-install.sh
RUN --mount=type=cache,target=/root/.npm ./npm-install.sh

FROM deps AS build
COPY packages ./packages
COPY apps/ai-engine ./apps/ai-engine
RUN npm run build -w @buildpipe/shared-types
RUN npm run build -w @buildpipe/ai-sdk
RUN npm run build -w @buildpipe/ai-engine

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/ai-engine/dist ./apps/ai-engine/dist
COPY --from=build /app/apps/ai-engine/package.json ./apps/ai-engine/
COPY --from=build /app/packages ./packages
EXPOSE 3001
CMD ["node", "apps/ai-engine/dist/main.js"]