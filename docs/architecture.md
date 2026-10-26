# Architecture

> Describes the inherited BuildPipe AI base (incidents, AI analysis, MCP). Those features are legacy; the Infralark workflow is in [product/infralark-mvp.md](product/infralark-mvp.md).

This document describes how Infralark components fit together, how data flows through the system, and the design decisions behind each layer.

## High-Level Architecture

```
Clients (REST, Swagger, WebSocket, MCP, OAuth)
        |
        v
   API (NestJS, port 3000)
        |
   +----+----+----------+-----------+
   |    |    |          |           |
   v    v    v          v           v
Postgres Redis NATS Kubernetes OpenAI/Claude
        |
        v
     Worker (BullMQ consumers)

AI Engine (port 3001) - optional standalone service
MCP Server (stdio) - proxies to API /internal/mcp/*
```

## Applications

### API (`apps/api`)

Central NestJS application:

- REST API + Swagger at `/api/docs`
- JWT auth, RBAC, OTP guards
- Cluster management with encrypted kubeconfigs
- Kubernetes operations via `@buildpipe/kubernetes-sdk`
- Incident lifecycle and state machine
- AI context building and analysis (OpenAI/Claude)
- BullMQ job production
- NATS event publishing
- Socket.IO WebSocket gateway at `/ws`
- Prometheus metrics at `/metrics`
- MCP internal bridge at `/internal/mcp/*`

Modules: Auth, Users, Audit, Health, Metrics, Events, Queue, Clusters, Kubernetes, Incidents, Ai, Websocket, Mcp

### Worker (`apps/worker`)

Standalone Node process:

- Consumes BullMQ queues: incidents, logs, health
- Subscribes to NATS `incident.created.v1`
- Processes enrich/analyze incident jobs
- Periodic cluster health scan every 5 minutes
- Persists failed jobs to database

### AI Engine (`apps/ai-engine`)

Lightweight NestJS microservice on port 3001:

- `POST /analyze` - heuristic analysis from IncidentContext
- Primary AI analysis runs inside the API; AI Engine is optional/decoupled

### MCP Server (`apps/mcp-server`)

Stdio MCP server for AI agents. Not in Docker Compose. Proxies to API with JWT.

## Shared Packages

| Package | Purpose |
|---------|---------|
| `@buildpipe/shared-types` | Zod schemas, enums, NATS subjects |
| `@buildpipe/config` | Zod environment validation |
| `@buildpipe/kubernetes-sdk` | K8s client wrapper |
| `@buildpipe/ai-sdk` | AI provider interface |

## Incident State Machine

```
CREATED -> ENRICHING -> ANALYZING -> ANALYZED -> RESOLVED
```

| From | Allowed next |
|------|--------------|
| CREATED | ENRICHING, RESOLVED |
| ENRICHING | ANALYZING, RESOLVED |
| ANALYZING | ANALYZED, RESOLVED |
| ANALYZED | RESOLVED, ANALYZING |
| RESOLVED | (terminal) |

## AI Context Pipeline

1. ContextBuilderService gathers K8s data
2. ContextNormalizerService normalizes structure
3. EventScorerService ranks events (OOMKilled=0.95, CrashLoopBackOff=0.90)
4. LogReducerService truncates/deduplicates logs
5. PromptBuilderService builds LLM prompt
6. OpenAiProvider or ClaudeProvider returns analysis
7. Results stored in AiAnalysis table

## Queue Architecture (BullMQ + Redis)

| Queue | Jobs | Producer | Consumer |
|-------|------|----------|----------|
| incidents | enrich-incident, analyze-incident | API | Worker |
| logs | process-logs | API | Worker |
| metrics | sync-metrics | API | - |
| health | cluster-health-scan | Worker | Worker |

Job defaults: 3 attempts, exponential backoff 5s, keep 100 completed.

## NATS Events (JetStream enabled)

| Subject | When |
|---------|------|
| incident.created.v1 | Incident created |
| incident.analyzed.v1 | Analysis complete |
| incident.resolved.v1 | Incident resolved |
| pod.crashed.v1 | Pod crash |
| deployment.restarted.v1 | Deployment restarted |
| cluster.connected.v1 | Cluster test succeeded |

## WebSocket Events (Socket.IO /ws)

Authenticate with JWT. Events: incident.created, incident.updated, incident.analyzed, analysis.completed, deployment.restarted

Rooms: user:{userId}, incident:{incidentId}

## Security

- JWT access (15m default) + refresh token rotation (7d)
- OTP: 6-digit, 10-min expiry, purpose-scoped
- RBAC: viewer < operator < admin
- Kubeconfig: AES-256-GCM encryption
- Audit log for all sensitive actions

## Database Models

User, RefreshToken, OtpChallenge, Cluster, Incident, AiAnalysis, IncidentPattern, AuditLog, FailedJob

## Docker Build

Multi-stage: deps (npm-install.sh with retries) -> build (tsc + prisma) -> runner (Alpine)

API entrypoint: prisma db push -> seed -> node apps/api/dist/main.js