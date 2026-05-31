# BuildPipe AI

AI-powered Kubernetes Incident Intelligence Platform.

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

Default admin: `admin@buildpipe.ai` / `Admin123!`

## Repository

https://github.com/SoheilEs/buildpipe-ai