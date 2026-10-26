# Infralark Documentation

Infralark is in development; see [progress.md](./progress.md) and [product/infralark-mvp.md](./product/infralark-mvp.md). The guides below were written for the BuildPipe AI base platform (clusters, incidents, AI-assisted root-cause analysis, MCP). That functionality is retained as legacy, not as the Infralark product.

## Documentation Index

| Document | Description |
|----------|-------------|
| [Project Overview](./project-overview.md) | Features, tech stack, repository layout |
| [Architecture](./architecture.md) | Services, data flow, queues, events, security |
| [Use Cases](./use-cases.md) | Personas, workflows, and business scenarios |
| [Deployment](./deployment.md) | Docker Compose, production, troubleshooting |
| [Configuration](./configuration.md) | Environment variables and secrets |
| [Development Guide](./development.md) | Local setup, scripts, testing |
| [API Reference](./api-reference.md) | REST, WebSocket, MCP endpoints |

## Quick Links (Docker)

| Resource | URL |
|----------|-----|
| API | http://localhost:3000 |
| Swagger | http://localhost:3000/api/docs |
| Health | http://localhost:3000/health |
| Metrics | http://localhost:3000/metrics |
| AI Engine | http://localhost:3001 |

There is no default admin: set ADMIN_EMAIL and ADMIN_PASSWORD in .env (see .env.example).

Repository: https://github.com/SoheilEs/buildpipe-ai