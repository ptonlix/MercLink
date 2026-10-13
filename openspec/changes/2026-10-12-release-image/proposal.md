# Proposal

## Why

版本 tag 打出去之后，没有工作流把生产镜像推到 Docker Hub。`compose.yaml` 仍带 `build:`，README 的正式命令是 `docker compose up -d --build`，所以即使镜像已经发布，部署机还是会拉源码编译应用。生产要改成拉已发布镜像；Postgres、Redis 和 MinIO 继续用 Compose 里的固定镜像。

## What Changes

- 新增只在版本 tag 上运行的发版工作流。镜像名是 `docker.io/${DOCKERHUB_USERNAME}/merclink`。用户名来自 GitHub Actions variable `DOCKERHUB_USERNAME`，令牌来自 secret `DOCKERHUB_TOKEN`。仓库不写真实用户名或令牌。
- 正式 tag `vX.Y.Z` 推 `X.Y.Z` 和 `latest`。预发布 tag 如 `v1.2.3-rc.1` 只推 `1.2.3-rc.1`，不移动 `latest`。
- 发版工作流自己跑与 `pnpm run check` 等价的检查。现有 `ci.yml` 在 tag 上会并行触发，不能当作发版门禁。检查失败不登录 Docker Hub，也不推送。
- 只用现有 `Dockerfile` 构建 `linux/amd64`。构建不传入支付密钥、`MERCLINK_PURCHASE`、`APP_BASE_URL` 或任何 `.env`。
- 增加 `.dockerignore`，排除 `.git`、`.env`、`.env.*`、`node_modules`、`.next`、测试输出和本地编辑器目录。不排除 `src/db/migrations`。
- 正式 `compose.yaml` 不再带 `build:`。设置了远程 `MERCLINK_IMAGE` 时，`docker compose pull && docker compose up -d` 只拉镜像。本地没有远程镜像时，用明确的 `compose.build.yaml` 构建，不把这条命令写成正式部署。
- README、架构文档和 OpenShip 说明改为拉已发布镜像。`latest` 会被新正式版覆盖；生产回滚使用版本号标签。OpenShip 导入后清掉 `app` 的 build，升级只改 `MERCLINK_IMAGE` 再 pull。控制台仍不配公网域名。

## Capabilities

### New Capabilities

- `release-image`: 版本 tag 发布应用镜像到 Docker Hub，并规定生产部署拉取该镜像，不在部署机编译应用。

### Modified Capabilities

- 无。不改支付、短信、路由或已生效的业务规格。

## Impact

- 新增 `.github/workflows/release-image.yml` 和 `.dockerignore`。`package.json` 的格式脚本纳入新工作流。
- `compose.yaml` 去掉应用 `build:`。新增 `compose.build.yaml`，只给本地构建使用。
- README、`docs/ARCHITECTURE.md` 和 `docs/openship-deploy.md` 的正式部署句子改为 pull。不改应用代码、依赖或 Skill。
- 已有部署若仍在部署机 `--build`，必须改为设置 `MERCLINK_IMAGE` 后 pull。Postgres、Redis、MinIO 的镜像标签不变。
