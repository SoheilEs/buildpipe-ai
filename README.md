# Infralark

Infralark is a panel for requesting and executing standard DevOps procedures with evidence, access control, human approval and verified results. The MVP is one service: review and prepare a non-root runtime fix for one Kubernetes workload, test it in staging after approval, and produce a before/after report.

**Status: in development.** See [docs/progress.md](./docs/progress.md) for what exists and what is verified. The repository was built on BuildPipe AI; its incident, AI analysis and MCP features are retained as legacy and are described in the docs below. Product scope: [docs/product/infralark-mvp.md](./docs/product/infralark-mvp.md).

## Documentation

Full documentation is in the [docs/](./docs/) folder:

| Guide | Description |
|-------|-------------|
| [docs/README.md](./docs/README.md) | Documentation index |
| [Project Overview](./docs/project-overview.md) | Features, tech stack, repo layout |
| [Architecture](./docs/architecture.md) | Services, data flow, queues, security |
| [Use Cases](./docs/use-cases.md) | Workflows, personas, scenarios |
| [Deployment](./docs/deployment.md) | Docker Compose, production, troubleshooting |
| [Configuration](./docs/configuration.md) | Environment variables and secrets |
| [Development Guide](./docs/development.md) | Local setup and contributing |
| [API Reference](./docs/api-reference.md) | REST endpoints, WebSocket, MCP |

## Quick Start (Local)

```powershell
copy .env.example .env
npm install
npm run db:push
npm run db:seed
npm run dev:api
```

API: http://localhost:3000 | Swagger: http://localhost:3000/api/docs

## Quick Start (Docker)

```powershell
copy .env.example .env
.\infrastructure\scripts\docker-up.ps1
```

There is no default admin account: set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env` before the first start (see `.env.example`).

## Repository

https://github.com/SoheilEs/buildpipe-ai