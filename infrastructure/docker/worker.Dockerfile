FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache openssl

FROM base AS deps
COPY package.json turbo.json tsconfig.base.json .npmrc ./
COPY infrastructure/docker/npm-install.sh ./npm-install.sh
COPY apps/worker/package.json ./apps/worker/
COPY apps/ai-engine/package.json ./apps/ai-engine/
COPY apps/mcp-server/package.json ./apps/mcp-server/
COPY apps/api/package.json ./apps/api/
COPY packages/config/package.json ./packages/config/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/kubernetes-sdk/package.json ./packages/kubernetes-sdk/
COPY packages/ai-sdk/package.json ./packages/ai-sdk/
COPY prisma ./prisma/
RUN chmod +x ./npm-install.sh
RUN --mount=type=cache,target=/root/.npm ./npm-install.sh

FROM deps AS build
COPY packages/shared-types ./packages/shared-types
COPY apps/worker ./apps/worker
COPY prisma ./prisma
RUN npx prisma generate
RUN npm run build -w @buildpipe/shared-types
RUN npm run build -w @buildpipe/worker

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/worker/dist ./apps/worker/dist
COPY --from=build /app/apps/worker/package.json ./apps/worker/
COPY --from=build /app/packages/shared-types/dist ./packages/shared-types/dist
COPY --from=build /app/packages/shared-types/package.json ./packages/shared-types/
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./
RUN mkdir -p /app/data
CMD ["node", "apps/worker/dist/main.js"]