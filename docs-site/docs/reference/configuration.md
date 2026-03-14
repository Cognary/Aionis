# Configuration Reference

This page summarizes key runtime configuration groups.

## How to use this page

1. Start here before any non-local deployment.
2. Keep one configuration set per environment.
3. Validate configuration with smoke tests before production cutover.

## Core runtime

1. `AIONIS_MODE`
2. `APP_ENV`
3. `PORT`
4. `DATABASE_URL`

## Auth and isolation

1. `MEMORY_AUTH_MODE`
2. `MEMORY_API_KEYS_JSON`
3. `MEMORY_JWT_HS256_SECRET`
4. `MEMORY_TENANT_ID`
5. `MEMORY_SCOPE`

## Embeddings

1. `EMBEDDING_PROVIDER`
2. `EMBEDDING_DIM`
3. `EMBEDDING_ENABLED_SURFACES_JSON`
4. Provider-specific key/model variables.

## Limits and quotas

1. `RATE_LIMIT_ENABLED`
2. `TENANT_QUOTA_ENABLED`
3. Endpoint-specific RPS/burst settings.

## Recommended workflow

1. Keep separate env values for dev/staging/prod.
2. Store secrets outside source control.
3. Validate config with staging smoke and production gate before rollout.

## Configuration workflow

1. Define the baseline runtime and database settings.
2. Enable auth and tenant isolation.
3. Add embedding provider configuration if semantic recall is required.
4. Explicitly enable only the embedding surfaces you want to run.
5. Turn on limits and quotas before exposure to shared traffic.
6. Promote the exact validated config set to the next environment.

## Baseline production settings

| Key | Typical production value | Why |
| --- | --- | --- |
| `AIONIS_MODE` | `service` | Enables service-oriented runtime profile |
| `APP_ENV` | `prod` | Activates production guard behavior |
| `MEMORY_AUTH_MODE` | `api_key` or `api_key_or_jwt` | Prevents unauthenticated writes/reads |
| `RATE_LIMIT_ENABLED` | `true` | Protects API under burst load |
| `TENANT_QUOTA_ENABLED` | `true` | Enforces tenant-level fairness and isolation |
| `TRUST_PROXY` | `true` (behind trusted proxy) | Correct client IP handling for limits/audit |
| `CORS_ALLOW_ORIGINS` | explicit allowlist | Reduces cross-origin abuse risk |

## Before shipping to production

1. Confirm `MEMORY_AUTH_MODE` is not `off`.
2. Confirm `DATABASE_URL` points to the intended environment.
3. Confirm embedding settings and enabled surfaces match the retrieval behavior you expect.
4. Confirm quotas and rate limits are enabled for shared use.
5. Confirm CORS and proxy settings match the real network path.
