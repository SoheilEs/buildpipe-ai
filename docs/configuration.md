# Configuration Reference

All configuration is via environment variables. Copy `.env.example` to `.env` for local or Docker use.

Validated at runtime by `@buildpipe/config` (Zod schema in `packages/config/src/env.schema.ts`).

## Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| DATABASE_URL | SQLite connection string | file:./data/buildpipe.db |
| JWT_SECRET | Access token signing key (min 32 chars) | random-string-32-chars-minimum |
| JWT_REFRESH_SECRET | Refresh token signing key (min 32 chars) | another-random-32-char-string |
| ENCRYPTION_KEY | AES-256-GCM key for kubeconfigs (min 32 chars) | 32-byte-base64-or-string |

## Server

| Variable | Default | Description |
|----------|---------|-------------|
| NODE_ENV | development | development, production, or test |
| PORT | 3000 | API listen port |
| AI_ENGINE_PORT | 3001 | AI Engine service port |
| MCP_SERVER_PORT | 3002 | MCP server port (config only) |
| API_INTERNAL_URL | http://localhost:3000 | Internal API URL for MCP/worker |
| CORS_ORIGIN | * | Allowed CORS origins |
| LOG_LEVEL | info | API log level (pino): trace, debug, info, warn, error, fatal, silent |

## Database

| Variable | Default | Description |
|----------|---------|-------------|
| DATABASE_URL | (required) | Prisma connection URL |

Docker example: `file:/app/data/buildpipe.db`
Local example: `file:./data/buildpipe.db`

## Redis (BullMQ)

| Variable | Default | Description |
|----------|---------|-------------|
| REDIS_HOST | localhost | Redis hostname |
| REDIS_PORT | 6379 | Redis port |

Docker Compose sets REDIS_HOST=redis automatically.

## NATS

| Variable | Default | Description |
|----------|---------|-------------|
| NATS_URL | nats://localhost:4222 | NATS server URL |

Docker Compose sets NATS_URL=nats://nats:4222.

## JWT / Auth

| Variable | Default | Description |
|----------|---------|-------------|
| JWT_ACCESS_EXPIRES_IN | 15m | Access token TTL |
| JWT_REFRESH_EXPIRES_IN | 7d | Refresh token TTL |

## AI Providers

| Variable | Default | Description |
|----------|---------|-------------|
| OPENAI_API_KEY | (optional) | OpenAI API key |
| ANTHROPIC_API_KEY | (optional) | Anthropic API key |
| AI_DEFAULT_PROVIDER | openai | openai or claude |

Without API keys, analysis returns fallback/heuristic responses.

Models used:
- OpenAI: gpt-4o-mini
- Claude: claude-3-5-haiku-20241022

## OAuth (Optional)

| Variable | Description |
|----------|-------------|
| GITHUB_CLIENT_ID | GitHub OAuth app client ID |
| GITHUB_CLIENT_SECRET | GitHub OAuth secret |
| GITHUB_CALLBACK_URL | Callback URL (default: /auth/github/callback) |
| GOOGLE_CLIENT_ID | Google OAuth client ID |
| GOOGLE_CLIENT_SECRET | Google OAuth secret |
| GOOGLE_CALLBACK_URL | Default: http://localhost:3000/auth/google/callback |

## OTP

| Variable | Default | Description |
|----------|---------|-------------|
| OTP_EMAIL_FROM | noreply@buildpipe.ai | Sender address (email delivery stubbed; OTP logged in dev) |

In non-production, OTP code is returned in API response as `devCode`.

## MCP Server Only

| Variable | Default | Description |
|----------|---------|-------------|
| MCP_JWT_TOKEN | (empty) | Bearer token for API calls |
| API_INTERNAL_URL | http://localhost:3000 | API base URL |

## OTP Purposes

Used in `POST /auth/otp/request`:

| Purpose | Required for |
|---------|--------------|
| cluster_register | POST /clusters |
| cluster_update | PATCH /clusters/:id |
| deployment_restart | POST .../deployments/restart |
| mcp_sensitive | Sensitive MCP tools |
| login_verification | Optional login step |

## Docker Compose Overrides

docker-compose.yml sets these for containers:

```yaml
api:
  DATABASE_URL: file:/app/data/buildpipe.db
  REDIS_HOST: redis
  NATS_URL: nats://nats:4222
  NODE_ENV: production

worker:
  API_INTERNAL_URL: http://api:3000
  # same DATABASE_URL, REDIS, NATS
```

## Security Best Practices

1. Generate secrets with: `openssl rand -base64 32`
2. Never commit `.env` to git (excluded in .gitignore)
3. Rotate JWT secrets periodically (invalidates all sessions)
4. Use separate ENCRYPTION_KEY per environment
5. Restrict CORS in production
6. Store AI API keys in secret manager, not plain text files

## Validation Errors

If the API fails at startup with "Invalid environment configuration", check:

- JWT_SECRET and JWT_REFRESH_SECRET are at least 32 characters
- ENCRYPTION_KEY is at least 32 characters
- DATABASE_URL is set and non-empty
- API_INTERNAL_URL is a valid URL if set