# Design

## Context

见 `proposal.md`。`Dockerfile` 已经是生产镜像：Node 24.18.1、pnpm 12.9.1、Next standalone、`node server.js`，并复制 `src/db/migrations`。`ci.yml` 在任意 push 和 pull request 上跑 check、gitleaks 和 CodeQL，不构建镜像。tag 推送会同时触发 `ci.yml`，GitHub 不会让另一个工作流等待它结束。

`compose.yaml` 的 `app` 同时有 `build: .` 和 `image: ${MERCLINK_IMAGE:-merclink:local}`。只要 `build` 还在，部署机上的 `--build`，以及没有本地镜像时的 `up`，都会编译应用。OpenShip 跟踪 `build`，导入后也会在服务器上构建。

## Goals / Non-Goals

**Goals:**

- 正式版 tag 推版本号和 `latest`；预发布只推版本标签。
- 检查失败时不登录、不推送。
- 生产命令在设置了远程 `MERCLINK_IMAGE` 时只拉镜像。
- 本地仍能用明确的额外 Compose 文件构建，且该文件不会被正式命令自动加载。

**Non-Goals:**

- 不改支付、短信、路由、Skill 或业务规则。
- 不把 Postgres、Redis 或 MinIO 打进应用镜像，也不改它们的固定标签。
- 不改用 GHCR，不使用 Openship Cloud，不新增 npm 依赖，不另写打包脚本。
- 不把真实用户名、令牌、支付密钥或生产连接串写进仓库。
- 不把控制台改成必须有 `ops.example.com`。

## Decisions

### 发版工作流独立跑检查

新增 `.github/workflows/release-image.yml`。GitHub 的 tag 过滤是 glob，不是正则，所以触发器用 `v[0-9]*.[0-9]*.[0-9]*` 覆盖 `v1.2.3` 和 `v1.2.3-rc.1`。登录前的脚本再用正则拒绝不符合 `vMAJOR.MINOR.PATCH` 或预发布后缀的 ref。`publish` job 使用 `needs: check`。`check` 复制现有 CI 的 Node、pnpm 和 Postgres 服务，只跑 `pnpm run check`。检查失败时 `publish` 不会开始，因此不会执行 `docker/login-action`，也不会推送。

不使用 `workflow_run` 等待 `ci.yml`。那次运行是并行的，失败或跳过都不能当成门禁。gitleaks、CodeQL 和 `pnpm audit` 仍留在 `ci.yml`，不是这次发版门禁；门禁与 `pnpm run check` 等价。

备选是把发布步骤加进 `ci.yml` 并用 tag 条件跳过。tag 上的 check 和发布会绑在同一个会在每个分支运行的工作流里，更容易误推。独立工作流更窄。

### 标签规则在登录前算完

镜像仓库固定为 `docker.io/${DOCKERHUB_USERNAME}/merclink`。用户名只从 Actions variable 读取。空用户名、带 `/`、`:`、`@` 或空白的值在登录前失败。

正式 tag 必须整段匹配 `vMAJOR.MINOR.PATCH`。Docker 标签去掉 `v`：`v1.2.3` 推 `1.2.3` 和 `latest`。`v1.2.3-rc.1` 这类预发布只推去掉 `v` 的整段版本，不推 `1.2.3`，也不推 `latest`。不符合该形状的 ref 在登录前失败。

`latest` 只被新的正式版覆盖。文档要求生产 `MERCLINK_IMAGE` 使用版本号标签。回滚是把该变量改回旧版本号再 pull，不是把 `latest` 指回去。

### 只用现有 Dockerfile，且不传部署环境

构建使用 `docker/build-push-action`，`file` 指向仓库 `Dockerfile`，`platforms` 只有 `linux/amd64`。不设置 `build-args`，不挂载 secret，不把 `.env` 放进构建上下文。支付密钥、`MERCLINK_PURCHASE` 和 `APP_BASE_URL` 只属于部署机运行时。

关闭 provenance 和 SBOM，避免除请求的标签外再推清单，也避免构建去使用 GitHub token 做 attestation。登录 registry 明确写成 `docker.io`。

`.dockerignore` 排除 `.git`、`.env`、`.env.*`、`node_modules`、`.next`、测试输出、本地编辑器目录，以及私钥和 `secrets/`。不排除 `src/db/migrations`，因为 runner 阶段要复制这些 SQL。

### 正式 Compose 不再带 build

从 `compose.yaml` 的 `app` 去掉 `build:`。设置 `MERCLINK_IMAGE=docker.io/<DOCKERHUB_USERNAME>/merclink:1.2.3` 后，`docker compose pull && docker compose up -d` 只拉应用镜像和 Compose 里的 Postgres、Redis、MinIO。没有 `build` 时，缺镜像会 pull，不会在部署机编译。

不提交会自动合并的 `compose.override.yaml`。那会让克隆仓库的正式命令重新带上构建。本地构建放在必须显式 `-f` 的 `compose.build.yaml`。缺省镜像名仍是 `merclink:local`，这样本地命令不必先有远程仓库。未设置 `MERCLINK_IMAGE` 时，正式 `pull` 找不到 `merclink:local` 会失败，而不是退回编译。

OpenShip 说明改为：生产 `app` 使用已发布镜像；扫描如果带上 build 或 Dockerfile，导入后清掉；升级只改 `MERCLINK_IMAGE` 再 pull。控制台继续只走 SSH 隧道，不新增 `ops.example.com`。

## Risks / Trade-offs

- [tag 推送会让 `ci.yml` 和发版工作流各跑一遍 check] → 接受重复时间。不能依赖并行 CI 的结果。
- [`latest` 被下一个正式版覆盖] → 生产文档要求版本号标签。回滚不使用 `latest`。
- [OpenShip 仍可能因看到 Dockerfile 自行加上 build] → 文档把清掉 build 写成导入后的必查项。仓库 Compose 本身不再提供 build。
- [预发布后缀超出约定形状] → 登录前失败，不推送。约定形状是 `vMAJOR.MINOR.PATCH` 或 `vMAJOR.MINOR.PATCH-` 加预发布后缀。
- [仓库还没配置 variable 或 secret] → 登录前失败，不推送，也不把用户名写进仓库。

## Migration Plan

1. 合并本变更后，在 GitHub 仓库设置 variable `DOCKERHUB_USERNAME` 和 secret `DOCKERHUB_TOKEN`。不要把值写入仓库。
2. 打正式 tag `vX.Y.Z` 或预发布 tag。工作流必须已经在该 commit 上。
3. 部署机 `.env` 设置 `MERCLINK_IMAGE` 为版本号标签，执行 `docker compose pull && docker compose up -d`。不再使用 `--build`。
4. 已导入 OpenShip 的项目清掉 `app` 的 build，把镜像改成同一个版本号标签，再 pull。
5. 回滚时把 `MERCLINK_IMAGE` 改回旧版本号标签再 pull。先确认该版本与已经执行的迁移兼容。`latest` 不能当作回滚点。

## Open Questions

无。镜像仓库、tag 规则、检查门禁和正式命令都已定。
