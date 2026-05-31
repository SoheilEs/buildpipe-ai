# Docker Setup

## Fixed Issues
- **PROTOCOL_ERROR on build context**: caused by UTF-16 encoded `.dockerignore` (node_modules was not excluded). Now fixed.
- **Parallel build failures**: build services sequentially using the script below.

## Quick Start

```powershell
cd C:\Users\ICTSG2\buildpipe-ai
.\infrastructure\scripts\docker-up.ps1
```

Or manually:

```powershell
docker compose build api
docker compose build worker
docker compose build ai-engine
docker compose up -d
```

## If npm install fails inside Docker (network/proxy)

1. Configure Docker Desktop proxy settings (Settings > Resources > Proxies)
2. Retry the build — Dockerfiles use `infrastructure/docker/npm-install.sh` with up to 5 retries
3. npm fetch retries and reduced concurrency are configured in `.npmrc`
4. Enable BuildKit (default in Docker Desktop): `$env:DOCKER_BUILDKIT=1`

## Services

| Service | URL |
|---------|-----|
| API | http://localhost:3000 |
| Swagger | http://localhost:3000/api/docs |
| AI Engine | http://localhost:3001 |

Default admin: `admin@buildpipe.ai` / `Admin123!`