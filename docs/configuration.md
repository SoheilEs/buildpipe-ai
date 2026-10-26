# Configuration Reference

All configuration is via environment variables. Copy `.env.example` to `.env` for local or Docker use.

Validated at runtime by `@buildpipe/config` (Zod schema in `packages/config/src/env.schema.ts`).

## Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| DATABASE_URL | PostgreSQL connection URL | postgresql://infralark:<password>@localhost:5432/infralark?schema=public |
| JWT_SECRET | Access token signing key (min 32 chars) | output of `openssl rand -base64 48` |
| JWT_REFRESH_SECRET | Optional, currently unused (refresh tokens are random). Validated if set | output of `openssl rand -base64 48` |
| ENCRYPTION_KEY | AES-256-GCM key for kubeconfigs (min 32 chars) | output of `openssl rand -base64 48` |

## Server

| Variable | Default | Description |
|----------|---------|-------------|
| NODE_ENV | development | development, production, or test |
| PORT | 3000 | API listen port |
| AI_ENGINE_PORT | 3001 | AI Engine service port |
| MCP_SERVER_PORT | 3002 | MCP server port (config only) |
| API_INTERNAL_URL | http://localhost:3000 | Internal API URL for MCP/worker |
| CORS_ORIGIN | (empty) | Allowed browser origins, comma separated. Empty disables cross-origin access. `*` is rejected when NODE_ENV=production. Also applies to the WebSocket gateway |
| ADMIN_EMAIL / ADMIN_PASSWORD | (empty) | Used only by the seed script to create the first admin (password 12+ chars). Nothing is seeded when empty |
| LOG_LEVEL | info | API log level (pino): trace, debug, info, warn, error, fatal, silent |

## Database

| Variable | Default | Description |
|----------|---------|-------------|
| DATABASE_URL | (required) | Prisma connection URL |

Docker Compose builds `DATABASE_URL` itself from `POSTGRES_USER`, `POSTGRES_DB` and `POSTGRES_PASSWORD` in `.env`. `POSTGRES_PASSWORD` has no default; compose refuses to start without it, and the API refuses to boot while the URL still contains `CHANGE_ME`. A `file:` (SQLite) URL is rejected at startup. Use `openssl rand -hex 24` for the password so the URL needs no escaping.

Local example (API run outside Compose): `postgresql://infralark:<password>@localhost:5432/infralark?schema=public`

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
| OTP_EMAIL_FROM | noreply@buildpipe.ai | Sender address (reserved; no email delivery exists yet) |
| OTP_DEV_MODE | false | Only the exact value `true` makes `POST /auth/otp/request` return the code (`devCode`) and log it. Anything else keeps the code secret. Local development only |

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
  DATABASE_URL: postgresql://<POSTGRES_USER>:<POSTGRES_PASSWORD>@postgres:5432/<POSTGRES_DB>?schema=public
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
- DATABASE_URL, if set, is a `postgresql://` URL without the `CHANGE_ME` placeholder
- API_INTERNAL_URL is a valid URL if set