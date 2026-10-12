# Tasks

## 1. 规格

- [x] 1.1 写本变更的提案、设计和 `release-image` 规格增量。验证未把未归档变更写入 `openspec/specs/`。

## 2. 发版工作流

- [x] 2.1 新增版本 tag 发版工作流。触发器使用 GitHub glob `v[0-9]*.[0-9]*.[0-9]*`，因为 `+` 在 tag 过滤里是字面量，写不中 `v1.2.3`。登录前脚本拒绝不符合 `vMAJOR.MINOR.PATCH` 或预发布后缀的 ref。正式 tag 推版本号和 `latest`，预发布不移动 `latest`。验证标签脚本对 `v1.2.3` 和 `v1.2.3-rc.1` 的结果。
- [x] 2.2 在同一工作流先跑 `pnpm run check`。检查失败不登录 Docker Hub，也不推送。不依赖并行的 `ci.yml`。
- [x] 2.3 只用现有 `Dockerfile` 构建 `linux/amd64`，不传支付密钥、`MERCLINK_PURCHASE`、`APP_BASE_URL` 或 `.env`。镜像名使用 `DOCKERHUB_USERNAME`，不写真实用户名。
- [x] 2.4 添加 `.dockerignore`，排除 `.git`、`.env`、`.env.*`、`node_modules`、`.next`、测试输出和编辑器目录，且不排除 `src/db/migrations`。
- [x] 2.5 把新工作流加入 `package.json` 的 format 脚本。验证 Prettier 能检查该工作流。

## 3. 部署合同

- [x] 3.1 从正式 `compose.yaml` 去掉 `app` 的 `build:`。正式命令改为 `docker compose pull && docker compose up -d`。验证设置远程 `MERCLINK_IMAGE` 后的渲染结果没有 build。
- [x] 3.2 增加必须显式加载的 `compose.build.yaml`，供本地没有远程镜像时构建。验证正式 Compose 文件不会自动带上它。
- [x] 3.3 更新 README、`docs/ARCHITECTURE.md` 和 `docs/openship-deploy.md`。写明 `latest` 不可当作回滚点，OpenShip 导入后清掉 build，升级只改 `MERCLINK_IMAGE` 再 pull。不把控制台改成必须有 `ops.example.com`。
