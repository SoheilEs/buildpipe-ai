# API Reference

REST API base URL: http://localhost:3000

Interactive docs: http://localhost:3000/api/docs (Swagger UI)

## Authentication

Most endpoints require JWT Bearer token:

```
Authorization: Bearer <accessToken>
```

Obtain tokens via login or register. Refresh via POST /auth/refresh.

Public endpoints marked @Public(): health, auth login/register/refresh, OAuth redirects.

## Roles

| Role | Level | Access |
|------|-------|--------|
| viewer | 1 | Read-only |
| operator | 2 | Create incidents, analyze, restart deployments |
| admin | 3 | User management, audit logs |

## OTP-Protected Endpoints

Send OTP via POST /auth/otp/request, then include code in:

- Header: x-otp-code: 123456
- Or body field: otp: "123456"

## Auth Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /auth/register | Public | Register local account |
| POST | /auth/login | Public | Login (5 req/min throttle) |
| POST | /auth/refresh | Public | Rotate refresh token |
| POST | /auth/logout | JWT | Revoke refresh token |
| POST | /auth/otp/request | JWT | Request OTP code |
| POST | /auth/otp/verify | JWT | Verify OTP code |
| GET | /auth/github | Public | GitHub OAuth redirect |
| GET | /auth/github/callback | Public | GitHub OAuth callback |
| GET | /auth/google | Public | Google OAuth redirect |
| GET | /auth/google/callback | Public | Google OAuth callback |

### Login Example

```json
POST /auth/login
{
  "email": "admin@buildpipe.ai",
  "password": "Admin123!"
}

Response:
{
  "accessToken": "...",
  "refreshToken": "...",
  "user": { "id", "email", "role" }
}
```

## Users

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | /users/me | Any | Current user profile |
| GET | /users | admin | List users |
| GET | /users/:id | admin | Get user |
| PATCH | /users/:id | admin | Update user |
| DELETE | /users/:id | admin | Soft delete user |

## Clusters

| Method | Path | Role | OTP | Description |
|--------|------|------|-----|-------------|
| POST | /clusters | operator | register | Register cluster |
| GET | /clusters | viewer | | List clusters |
| GET | /clusters/:id | viewer | | Get cluster |
| PATCH | /clusters/:id | operator | update | Update cluster |
| POST | /clusters/:id/test | viewer | | Test connectivity |

### Register Cluster Example

```json
POST /clusters
{
  "name": "production",
  "kubeconfig": "<kubeconfig content>",
  "context": "my-context",
  "otp": "123456"
}
```

## Kubernetes (under /clusters/:clusterId/kubernetes)

| Method | Path | Role | OTP | Description |
|--------|------|------|-----|-------------|
| GET | /namespaces | viewer | | List namespaces |
| GET | /deployments?namespace= | viewer | | List deployments |
| GET | /pods?namespace= | viewer | | List pods |
| GET | /pods/:ns/:name | viewer | | Pod details |
| GET | /pods/:ns/:name/logs | viewer | | Pod logs |
| GET | /events?namespace= | viewer | | List events |
| POST | /deployments/restart | operator | restart | Restart deployment |
| GET | /health | viewer | | Cluster health summary |

## Incidents

| Method | Path | Role | Description |
|--------|------|------|-------------|
| POST | /incidents | operator | Create incident |
| GET | /incidents?status= | viewer | List incidents |
| GET | /incidents/:id | viewer | Get incident + analyses |
| POST | /incidents/:id/analyze | operator | Run AI analysis (10/min throttle) |
| POST | /incidents/:id/resolve | operator | Resolve incident |

### Create Incident Example

```json
POST /incidents
{
  "clusterId": "uuid",
  "title": "payment-service CrashLoopBackOff",
  "description": "Started after deploy v2.3.1",
  "namespace": "production",
  "resourceType": "Pod",
  "resourceName": "payment-service-abc123"
}
```

### Analyze Response

Returns AiAnalysis with:

- rootCause (string)
- confidence (0-1)
- evidence (string[])
- recommendations (string[])
- riskLevel (low | medium | high)
- provider, model

## Audit

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | /audit/logs?page=1&limit=50 | admin | Paginated audit log |

## Health & Metrics

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /health | Public | Basic health |
| GET | /health/ready | Public | DB + Redis + NATS check |
| GET | /metrics | Public | Prometheus metrics |

## MCP Internal Bridge (/internal/mcp)

Used by MCP server. Same auth as regular API.

| Method | Path | Role | OTP | Description |
|--------|------|------|-----|-------------|
| POST | /internal/mcp/get_pods | viewer | | List pods |
| POST | /internal/mcp/get_logs | viewer | | Get pod logs |
| POST | /internal/mcp/get_events | viewer | | Get events |
| POST | /internal/mcp/analyze_incident | operator | | Analyze incident |
| POST | /internal/mcp/cluster_health | viewer | | Cluster health |
| POST | /internal/mcp/restart_deployment | operator | restart | Restart deployment |

## AI Engine (port 3001)

Separate service, not behind main API auth.

| Method | Path | Description |
|--------|------|-------------|
| POST | /analyze | Heuristic analysis from IncidentContext |
| POST | /health | Service health |

## WebSocket

Connect to ws://localhost:3000/ws

Auth: pass JWT as auth.token or Authorization header on connect.

### Events (server -> client)

| Event | Payload |
|-------|---------|
| incident.created | { incidentId, ... } |
| incident.updated | { incidentId, status, ... } |
| incident.analyzed | { incidentId, analysisId, ... } |
| analysis.completed | { incidentId, ... } |
| deployment.restarted | { clusterId, namespace, name } |

### Rooms

- user:{userId} - user-specific notifications
- incident:{incidentId} - incident updates

## Error Responses

Standard NestJS error format:

```json
{
  "statusCode": 400,
  "message": "Validation failed",
  "error": "Bad Request"
}
```

Common codes:

- 401 Unauthorized - missing/invalid JWT
- 403 Forbidden - insufficient role or missing OTP
- 404 Not Found - resource not found
- 429 Too Many Requests - rate limit exceeded

## Rate Limits

Default: 100 requests/minute (ThrottlerGuard)

Specific limits:

- POST /auth/login: 5/min
- POST /incidents/:id/analyze: 10/min

## Related

- [Use Cases](./use-cases.md) - workflow examples
- [Configuration](./configuration.md) - environment setup
- Swagger UI for live schema: http://localhost:3000/api/docs