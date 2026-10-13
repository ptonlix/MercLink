# Proposal

## Why

正式部署现在要手写 `.env`、准备镜像名，再执行 Compose。新机器需要一条固定入口，直接安装当前最新正式版，不用填写版本号。域名、密码和 Docker Hub 用户名仍不能写进仓库。

## What Changes

- 增加 `scripts/install.sh`。正式版 GitHub Release 附上盖过版本的这份脚本，永久入口是 `https://github.com/ptonlix/MercLink/releases/latest/download/install.sh`。
- 脚本在部署机创建 `/opt/merclink`，下载同一 tag 的 `compose.yaml`，生成 `.env`，然后执行已有的 `docker compose pull && docker compose up -d`。
- 正式版安装把镜像写成 `docker.io/<用户名>/merclink:latest`。用户名只在发布时盖进 Release 资源，不进 git。
- 已有 `.env` 时拒绝覆盖。`upgrade` 只更换镜像版本并重新拉取，保留已有密钥和后来手工打开的买入配置。
- 不安装系统包，不打开买入，不使用 `curl -k`。

## Capabilities

### New Capabilities

- `production-install`: 正式版安装脚本可以在部署机拉起现有 Compose，并安装 `merclink:latest`，不用填写版本号。

### Modified Capabilities

- 无。

## Impact

- `scripts/install.sh`、`scripts/stamp-install.sh`、`.github/workflows/release-image.yml`、README、`docs/ARCHITECTURE.md`。
- 不新增 npm 依赖，不改应用、支付或授权规则。
