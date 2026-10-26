# Development Guide

Guide for setting up a local development environment, running services, and working with the monorepo.

## Prerequisites

- Node.js 20+
- npm 10+
- Docker (optional, for Redis/NATS or full stack)
- Git

## Initial Setup

```powershell
git clone https://github.com/SoheilEs/buildpipe-ai.git
cd buildpipe-ai
copy .env.example .env
```

Edit `.env` for local development:

```env
NODE_ENV=development
DATABASE_URL=postgresql://infralark:<password>@localhost:5432/infralark?schema=public
REDIS_HOST=localhost
REDIS_PORT=6379
NATS_URL=nats://localhost:4222
JWT_SECRET=<openssl rand -base64 48>
JWT_REFRESH_SECRET=<openssl rand -base64 48>
ENCRYPTION_KEY=<openssl rand -base64 48>
```

Create data directory:

```powershell
mkdir data
```

## Install Dependencies

```powershell
npm install
```

If npm fails with ECONNRESET, retry or check network/proxy settings. See `.npmrc` for retry configuration.

## Database Setup

```powershell
npm run db:deploy    # Apply migrations (needs a running PostgreSQL, e.g. `docker compose up -d postgres`)
npm run db:seed      # Create admin user
npm run db:generate  # Regenerate Prisma client
```

Set ADMIN_EMAIL and ADMIN_PASSWORD (12+ characters) in .env before seeding; there is no default admin.

## Running Infrastructure (Redis + NATS)

Option A - Docker for infra only:

```powershell
docker compose up redis nats -d
```

Option B - Full Docker stack: see [Deployment](./deployment.md)

## Running Services

### API only (minimal)

```powershell
npm run dev:api
```

API available at http://localhost:3000

### All apps in parallel

```powershell
npm run dev
```

Runs api, worker, ai-engine via Turborepo.

### Individual services

```powershell
npm run dev:api
npm run dev:worker
npm run dev:ai-engine
```

### MCP Server

```powershell
cd apps/mcp-server
npm run dev
```

Requires MCP_JWT_TOKEN (get from POST /auth/login) and API running.

## npm Scripts

| Script | Description |
|--------|-------------|
| npm run build | Build all packages/apps (Turbo) |
| npm run dev | Dev mode all services |
| npm run dev:api | Dev mode API only |
| npm run dev:worker | Dev mode worker |
| npm run dev:ai-engine | Dev mode AI engine |
| npm run lint | Lint all workspaces |
| npm run test | Run tests |
| npm run db:generate | prisma generate |
| npm run db:deploy | prisma migrate deploy |
| npm run test:db -w @buildpipe/api | Database tests; needs a throwaway PostgreSQL on localhost with migrations applied, leaves rows behind |
| npm run db:migrate | prisma migrate dev |
| npm run db:seed | Seed admin user |

## Monorepo Structure

Workspaces defined in root package.json:

```json
"workspaces": ["apps/*", "packages/*"]
```

Build order handled by Turborepo (`turbo.json`):

- build depends on ^build (dependencies first)
- dev is persistent, no cache
- test depends on ^build

### Adding a dependency to an app

```powershell
npm install some-package -w @buildpipe/api
```

## Project Layout for Contributors

| Path | What to edit |
|------|--------------|
| apps/api/src | REST controllers, services, guards |
| apps/worker/src | BullMQ job handlers |
| apps/ai-engine/src | Standalone AI service |
| packages/shared-types | Shared enums and Zod schemas |
| packages/kubernetes-sdk | K8s API wrapper |
| prisma/schema.prisma | Database schema |
| infrastructure/docker | Dockerfiles and scripts |

## Testing

```powershell
npm run test
```

Existing tests:

- apps/api: incident state machine, event scorer, log reducer
- packages: unit tests in spec files

Run API tests only:

```powershell
npm run test -w @buildpipe/api
```

## API Exploration

1. Start API: npm run dev:api
2. Open Swagger: http://localhost:3000/api/docs
3. Login via POST /auth/login
4. Click Authorize, enter Bearer token

## Common Development Tasks

### Add a new API endpoint

1. Create/update controller in apps/api/src
2. Add service logic
3. Register module in app.module.ts if new module
4. Add DTO with class-validator decorators
5. Document with @ApiTags, @ApiOperation in Swagger

### Change database schema

1. Edit prisma/schema.prisma
2. `npm run db:migrate -- --name <what_changed>` (creates and applies a migration; commit the new folder in `prisma/migrations/`)
3. npm run db:generate
4. Update affected services

### Add a BullMQ job

1. Add job name to QueueJobName enum in shared-types
2. Enqueue in QueueService (API)
3. Handle in apps/worker/src/main.ts

### Add NATS event

1. Add subject to EVENT_SUBJECTS in shared-types
2. Publish in EventsService
3. Subscribe in worker if needed

## Code Style

- TypeScript strict mode
- NestJS conventions for API (modules, controllers, services)
- Prettier for formatting
- ESLint in API app

## Debugging

### API logs

Structured JSON logs via Pino. In development, pretty-printed.

Redacted fields: authorization, password, kubeconfig, otp

### Worker logs

Console output with job name and id.

### Database inspection

```powershell
npx prisma studio
```

Opens a database GUI at localhost:5555

## File Encoding Note

On Windows, ensure config files (.dockerignore, .gitignore, .npmrc) are saved as UTF-8. UTF-16 causes Docker BuildKit PROTOCOL_ERROR.

## Related

- [Configuration](./configuration.md)
- [API Reference](./api-reference.md)
- [Architecture](./architecture.md)