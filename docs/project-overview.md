# Project Overview

## What Is Infralark?

Infralark is a backend platform. Its base, inherited from BuildPipe AI, provides Kubernetes incident intelligence; the Infralark workflow itself is described in [product/infralark-mvp.md](product/infralark-mvp.md) and is not implemented yet. It connects to clusters, captures incident context (pods, events, logs), runs AI analysis for root-cause hypotheses, and maintains audit trails with role-based access control.

There is no frontend in this repository. Clients use REST, Swagger, WebSocket, or MCP.

## Core Features

### Cluster Management
- Register clusters with AES-256-GCM encrypted kubeconfig storage
- Test connectivity, list/update clusters
- OTP required for register and update

### Incident Management
- Create incidents tied to clusters and resources
- State machine: CREATED -> ENRICHING -> ANALYZING -> ANALYZED -> RESOLVED
- Signature-based pattern detection on resolve

### Kubernetes Operations
- Read: namespaces, deployments, pods, logs, events, health
- Write: deployment restart (operator + OTP)

### AI Analysis
- Context from K8s events, logs, historical patterns
- OpenAI (gpt-4o-mini) or Claude (claude-3-5-haiku) providers
- Stores confidence, evidence, recommendations, risk level

### Security
- JWT + refresh token rotation
- RBAC: viewer, operator, admin
- OTP for sensitive operations
- OAuth: GitHub, Google
- Full audit log

### Async & Real-Time
- BullMQ + Redis job queues
- NATS domain events (JetStream)
- Socket.IO WebSocket updates
- Background worker for enrichment and health scans

### MCP Integration
- Standalone MCP server for AI agent tools
- Proxies to API internal bridge

## Tech Stack

Node.js 20+, TypeScript 5.7, NestJS 10, Prisma 6, PostgreSQL, BullMQ, Redis 7, NATS 2, Socket.IO, @kubernetes/client-node, OpenAI/Anthropic APIs, Docker Compose.

## Repository Structure

```
apps/api          - Main NestJS REST API
apps/worker       - BullMQ consumers
apps/ai-engine    - Standalone heuristic AI service
apps/mcp-server   - MCP stdio server
packages/         - shared-types, config, kubernetes-sdk, ai-sdk
prisma/           - Schema and seed
infrastructure/   - Docker, scripts, Prometheus config
docs/             - Documentation
```

## Services

| Service | Port | Role |
|---------|------|------|
| api | 3000 | REST, Swagger, WebSocket, AI |
| worker | - | Background jobs |
| ai-engine | 3001 | Optional analysis service |
| redis | 6379 | BullMQ |
| nats | 4222 | Events |

## Default Admin

No default admin: the first admin comes from ADMIN_EMAIL / ADMIN_PASSWORD at seed time

## Related Docs

- [Architecture](./architecture.md)
- [Use Cases](./use-cases.md)
- [Deployment](./deployment.md)