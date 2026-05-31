FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache openssl

FROM base AS deps
COPY package.json turbo.json tsconfig.base.json .npmrc ./
COPY infrastructure/docker/npm-install.sh ./npm-install.sh
COPY apps/api/package.json ./apps/api/
COPY apps/worker/package.json ./apps/worker/
COPY apps/ai-engine/package.json ./apps/ai-engine/
COPY apps/mcp-server/package.json ./apps/mcp-server/
COPY packages/config/package.json ./packages/config/
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/kubernetes-sdk/package.json ./packages/kubernetes-sdk/
COPY packages/ai-sdk/package.json ./packages/ai-sdk/
COPY prisma ./prisma/
RUN chmod +x ./npm-install.sh
RUN --mount=type=cache,target=/root/.npm ./npm-install.sh

FROM deps AS build
COPY packages ./packages
COPY apps/api ./apps/api
COPY prisma ./prisma
RUN npm run db:generate
RUN npm run build -w @buildpipe/config
RUN npm run build -w @buildpipe/shared-types
RUN npm run build -w @buildpipe/kubernetes-sdk
RUN npm run build -w @buildpipe/ai-sdk
RUN npm run build -w @buildpipe/api

FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache openssl
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/
COPY --from=build /app/packages ./packages
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./
COPY infrastructure/docker/entrypoint-api.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh && mkdir -p /app/data
EXPOSE 3000
ENTRYPOINT ["/entrypoint.sh"]