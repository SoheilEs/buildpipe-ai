# Deployment Guide

This guide covers deploying BuildPipe AI with Docker Compose, production considerations, operations, and troubleshooting.

## Prerequisites

- Docker Desktop (Windows/macOS) or Docker Engine + Compose (Linux)
- 4 GB+ RAM recommended for full stack
- Ports available: 3000, 3001, 4222, 6379, 8222
- Git clone of the repository

## Quick Start (Docker Compose)

```powershell
cd buildpipe-ai
copy .env.example .env
# Edit .env with your secrets (JWT, ENCRYPTION_KEY, AI keys)
.\infrastructure\scripts\docker-up.ps1
```

The script builds services sequentially (api -> worker -> ai-engine) then runs `docker compose up -d`.

### Manual Build

```powershell
$env:DOCKER_BUILDKIT=1
docker compose build api
docker compose build worker
docker compose build ai-engine
docker compose up -d
```

Build sequentially to avoid BuildKit PROTOCOL_ERROR on large parallel contexts.

## Services

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| api | buildpipe-ai-api | 3000 | Main REST API |
| worker | buildpipe-ai-worker | - | Background jobs |
| ai-engine | buildpipe-ai-ai-engine | 3001 | Heuristic AI service |
| redis | redis:7-alpine | 6379 | BullMQ backend |
| nats | nats:2-alpine | 4222, 8222 | Event bus (JetStream) |

## Service URLs

| Endpoint | URL |
|----------|-----|
| API | http://localhost:3000 |
| Swagger | http://localhost:3000/api/docs |
| Health | http://localhost:3000/health |
| Readiness | http://localhost:3000/health/ready |
| Metrics | http://localhost:3000/metrics |
| AI Engine | http://localhost:3001 |
| NATS monitor | http://localhost:8222 |

## Environment Configuration

Copy `.env.example` to `.env` before starting. Docker Compose loads `.env` automatically.

Critical variables for production:

```env
NODE_ENV=production
JWT_SECRET=<min-32-chars-random>
JWT_REFRESH_SECRET=<min-32-chars-random>
ENCRYPTION_KEY=<min-32-chars-random>
OPENAI_API_KEY=sk-...
# or
ANTHROPIC_API_KEY=sk-ant-...
AI_DEFAULT_PROVIDER=openai
CORS_ORIGIN=https://your-frontend.example.com
```

See [Configuration](./configuration.md) for the full variable reference.

## Data Persistence

| Volume | Mount | Contents |
|--------|-------|----------|
| buildpipe_data | /app/data (api, worker) | SQLite database |
| redis_data | /data (redis) | Queue state |

Backup `buildpipe_data` volume regularly in production. The SQLite file is `buildpipe.db`.

## API Container Startup

`entrypoint-api.sh` runs on every API start:

1. `npx prisma db push` - apply schema
2. `npx tsx prisma/seed.ts` - seed admin (errors ignored if exists)
3. `node apps/api/dist/main.js` - start server

Default admin after seed: admin@buildpipe.ai / Admin123!

## Docker Build Details

### npm-install.sh

All Dockerfiles use `infrastructure/docker/npm-install.sh` which retries npm install up to 5 times with backoff. Handles flaky network (ECONNRESET).

### .npmrc tuning

```
fetch-retries=10
fetch-timeout=300000
maxsockets=3
legacy-peer-deps=true
```

### .dockerignore

Must be UTF-8 encoded. UTF-16 encoding causes BuildKit PROTOCOL_ERROR and sends node_modules in context.

Excluded: node_modules, dist, .env, data, *.db, .git

## Health Checks

Docker Compose health checks:

- Redis: `redis-cli ping` every 5s
- NATS: wget http://localhost:8222/healthz every 5s

API waits for redis + nats healthy before starting. Worker waits for api + redis + nats.

## Smoke Test

After deployment:

```bash
./infrastructure/scripts/smoke.sh
```

Tests health, register, login, profile, list incidents via curl.

## Production Checklist

- [ ] Change default admin password
- [ ] Set strong JWT_SECRET, JWT_REFRESH_SECRET, ENCRYPTION_KEY (32+ chars each)
- [ ] Restrict CORS_ORIGIN to your domain
- [ ] Add real OPENAI_API_KEY or ANTHROPIC_API_KEY
- [ ] Configure OAuth if using GitHub/Google login
- [ ] Set up volume backups for buildpipe_data
- [ ] Put reverse proxy (nginx/Traefik) with TLS in front of port 3000
- [ ] Do not expose Redis (6379) or NATS (4222) publicly
- [ ] Configure Docker Desktop proxy if behind corporate firewall
- [ ] Monitor /metrics with Prometheus (scrape config in infrastructure/prometheus/)

## Scaling Considerations

Current architecture is single-instance:

- SQLite does not support multi-writer API replicas
- For HA: migrate to PostgreSQL, external Redis, NATS cluster
- Worker can scale horizontally with shared Redis (multiple consumers per queue)
- AI Engine is stateless and can scale independently

## MCP Server Deployment

MCP server is NOT in docker-compose. Run locally:

```powershell
cd apps/mcp-server
$env:MCP_JWT_TOKEN="<valid-api-jwt>"
$env:API_INTERNAL_URL="http://localhost:3000"
npm run start
```

Configure your MCP client to launch this process.

## Troubleshooting

### npm install ECONNRESET in Docker

1. Retry the build (npm-install.sh handles retries)
2. Enable BuildKit: `$env:DOCKER_BUILDKIT=1`
3. Configure Docker Desktop proxy (Settings > Resources > Proxies)
4. Build sequentially via docker-up.ps1

### PROTOCOL_ERROR on build context

- Ensure `.dockerignore` is UTF-8 (not UTF-16)
- Build one service at a time
- Run `docker builder prune` if cache is corrupted

### API fails to start

```powershell
docker compose logs api
```

Common causes: missing JWT_SECRET, DATABASE_URL path not writable, Redis/NATS not healthy.

### Worker not processing jobs

```powershell
docker compose logs worker
docker compose exec redis redis-cli ping
```

Verify REDIS_HOST=redis in compose environment.

### NATS connection issues

```powershell
curl http://localhost:8222/healthz
```

API degrades gracefully if NATS unavailable (events logged locally).

### Reset everything

```powershell
docker compose down -v
docker compose up --build -d
```

Warning: `-v` deletes volumes including SQLite data.

## Updating

```powershell
git pull
.\infrastructure\scripts\docker-up.ps1
```

Schema changes apply automatically via `prisma db push` on API startup.

## Related

- [Configuration](./configuration.md)
- [Development Guide](./development.md)
- [Architecture](./architecture.md)