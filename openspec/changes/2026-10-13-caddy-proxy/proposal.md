# Proposal

## Why

正式部署需要公网 HTTPS，并且证书要自动续期。应用本身不终止 TLS。域名和证书不能写进镜像或仓库。

## What Changes

- `compose.yaml` 增加可选的 Caddy 服务，镜像钉为 `caddy:2.11.7-alpine`。
- 只有部署机 `.env` 设置 `COMPOSE_PROFILES=caddy` 时才启动。未设置时，现有 `docker compose up -d` 不拉起 Caddy，也不要求域名。
- Caddy 发布 80 和 443，向 `app:3000` 反代，并覆盖 `X-Real-IP`。证书放在命名卷，由 Caddy 向 Let's Encrypt 申请和续期。
- 不把域名、邮箱或证书写进仓库。不改应用的支付、授权或下单规则。

## Capabilities

### New Capabilities

- `public-tls`: 正式 Compose 可以在部署机提供自动续期的公网 HTTPS，且不在仓库中保存域名或证书。

### Modified Capabilities

- 无。

## Impact

- `compose.yaml`、`.env.example`、README 和 `docs/ARCHITECTURE.md`。
- 不新增 npm 依赖，不把 Caddy 打进应用镜像。
