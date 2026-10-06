# Design

## Context

仓库只有 `docs/PRD.md` 和 `docs/ARCHITECTURE.md`，没有应用代码。见 `proposal.md`。四个业务切片会并行修改仓库，因此根配置和跨切片合同必须先落地且之后只读。

## Goals / Non-Goals

**Goals:**

- 一个 Next.js 进程可以完成类型检查、lint、测试、边界检查和启动前迁移。
- 业务切片通过固定接缝注册实现，不互相 import 内部模块。
- 路由路径和错误码有一份代码内的唯一清单。

**Non-Goals:**

- 不建账号、目录、订单、页面正文或 Skill。
- 不引入 Redis、队列、独立 MCP 进程或第二套 ORM。

## Decisions

### 技术栈按架构文档锁定

- Node.js 24、Next.js 16 当前稳定版、TypeScript `strict`，并打开 `noUncheckedIndexedAccess`、`noImplicitOverride`、`noFallthroughCasesInSwitch`、`verbatimModuleSyntax`。不打开 `exactOptionalPropertyTypes`。
- 包管理只用 pnpm 12.9.1。`package.json` 的 `packageManager` 固定为 `pnpm@12.9.1`，由 Corepack 启用。锁文件只有 `pnpm-lock.yaml`。pnpm 12 不再读取 `package.json` 的 `pnpm` 字段；构建脚本批准和发布时间例外写在 `pnpm-workspace.yaml`，不写 `.npmrc`，也不靠一次性的 `--allow-build`。裸 `pnpm install` 必须成功。安装用 `pnpm install`，执行脚本用 `pnpm run <script>`，切片内的 Vitest 用 `pnpm exec vitest`。不运行 `npm install`、`npm run`、`npx` 或 `yarn`，不提交 `package-lock.json` 或 `yarn.lock`。Dockerfile 和 CI 同样只走 Corepack 启用的 pnpm。
- PostgreSQL 18、Drizzle、Zod、Vitest、ESLint 扁平配置加 `typescript-eslint` 的 `strictTypeChecked`、Prettier、dependency-cruiser、Knip。
- 领域层禁止 import `app`、`db`、`adapters`。本变更只创建空的 `src/domain` 边界和失败测试，不写业务规则。

备选是把脚手架分给每个切片各自生成。那样 `package.json` 无法合并，因此拒绝。

### 独占路径

本变更独占并创建：

- `package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`tsconfig.json`、`next.config.ts`、`eslint.config.mjs`、`prettier.config.mjs`、`vitest.config.ts`、`knip.json`、`.dependency-cruiser.cjs`
- `drizzle.config.ts`、`src/db/client.ts`、`src/db/migrate.ts`、`src/db/migrations/010_platform.sql`
- `src/shared/**`、`src/ports/**`、`src/app/layout.tsx`、`src/app/globals.css`、`src/app/api/health/route.ts`、`src/instrumentation.ts`
- `Dockerfile`、`compose.yaml`、`.env.example`、`.github/workflows/ci.yml`

`drizzle.config.ts` 的 schema 使用 glob `src/db/schema/*.ts`。切片新增 schema 文件时不必改这个配置。`src/instrumentation.ts` 只启动迁移和日志，不静态 import 业务切片。主 Agent 的集成变更可以随后把组合根接进来。

其他变更不得修改上述文件。依赖已经由本变更声明：`next`、`react`、`drizzle-orm`、`postgres`、`zod`、`argon2`、`oidc-provider`、`vitest` 及开发工具。阿里云和支付宝 SDK 不放进领域层；适配器若需要官方包，把包名写进该切片的 `slice-deps.json`，由集成变更合并，避免并行改 `package.json`。

### 环境变量

| 变量 | 用途 |
| --- | --- |
| `DATABASE_URL` | PostgreSQL |
| `ADMIN_PHONE` / `ADMIN_PASSWORD` | 初始超管，只在首次创建时使用 |
| `OAUTH_SIGNING_SECRET` | 授权服务签名 |
| `ALIYUN_CAPTCHA_ACCESS_KEY_ID` / `ALIYUN_CAPTCHA_ACCESS_KEY_SECRET` / `ALIYUN_CAPTCHA_SCENE_ID` | 验证码 2.0 |
| `ALIYUN_SMS_ACCESS_KEY_ID` / `ALIYUN_SMS_ACCESS_KEY_SECRET` / `ALIYUN_SMS_SIGN_NAME` / `ALIYUN_SMS_TEMPLATE_CODE` | 号码认证短信 |
| `ALIPAY_APP_ID` / `ALIPAY_PRIVATE_KEY` / `ALIPAY_PUBLIC_KEY` / `ALIPAY_NOTIFY_URL` | 支付宝 |
| `APP_BASE_URL` | 公开绝对地址 |

缺任一变量时进程以非零退出，且不监听端口。`.env.example` 只列名称，不写真实密钥。

### 共享合同

`src/shared/api-routes.ts` 是路径唯一清单。购买侧：`GET /api/v1/products`、`GET /api/v1/products/{id}`、`GET /api/v1/catalogs/{id}/schema`、`POST /api/v1/orders`、`GET /api/v1/orders/{id}`。商家侧按 PRD 第 10 节列出，另加 `POST /api/v1/payments/alipay/notify` 和 `GET /.well-known/oauth-protected-resource`。Skill 测试只读这份清单。

错误码最少包括：`unauthorized`、`forbidden`、`not_found`、`validation_error`、`unknown_field`、`field_retired`、`too_many_items`、`variant_required`、`insufficient_stock`、`conflict`、`captcha_required`、`sms_rate_limited`、`payment_retryable`、`invalid_signature`、`dependency_unavailable`。

公开 ID 前缀：`adm_`、`mch_`、`byr_`、`cat_`、`fld_`、`rev_`、`prd_`、`opt_`、`var_`、`ord_`、`oli_`、`pay_`、`key_`、`grn_`。由 `src/shared/id.ts` 生成。金额在进入领域前变为整数分。

接缝放在 `src/shared/seams/`，默认失败关闭：

- `authenticate`：无 token 返回 401 和 `WWW-Authenticate`；有 token 但未注册实现时返回 401 `unauthorized`。
- `sellableVariants.lock`：未注册返回 `dependency_unavailable`，不得造出可售行。
- `publicProducts.list`：未注册返回空页；`get` 返回 not found。
- `defaultCatalog.create`：未注册时不写目录行，并向调用方返回 `pending`。目录切片注册后才插入「默认目录」。

`next.config.ts` 固定重写 `/skill.md` 到 `/agent-docs/buyer-skill`，`/merchant/skill.md` 到 `/agent-docs/merchant-skill`。公开页面变更不得再改这份配置。

注册函数由各切片在自己的 `register.ts` 导出。测试直接调用注册函数。生产进程的统一调用留给集成变更。

### 迁移

`010_platform.sql` 只创建迁移记录表。业务表由 `020_identity.sql`、`030_catalog.sql`、`040_commerce.sql` 独占。运行器按文件名顺序执行，失败则中止启动。

### 质量命令

`pnpm run check` 依次执行 `format:check`、`lint`、`typecheck`、`test`、`boundaries`、`knip`。审计命令是 `pnpm audit --audit-level=high`，和 CodeQL 一起放在 CI，不放进 `check`。命令与 `docs/ARCHITECTURE.md` 第 10.5 节一致。领域覆盖率门禁由各切片对自己的 `src/domain/<name>` 设置；本变更不把空领域算进 90% 分母。

## Risks / Trade-offs

- [切片在基础合并前开工] → 任务要求以包含本变更的基线开分支。没有 `package.json` 时不得自建第二份，也不得生成 `package-lock.json` 或 `yarn.lock`。
- [接缝未接入进程] → 切片单测自己注册替身；集成变更负责生产注册。这是有意的合并边界。
- [官方 SDK 包名变化] → 适配器切片记录包名，不在本变更猜包名。
- [GHSA-vfj7-8cjw-p6xm] → `braces` <=3.0.3 的 ReDoS 没有修复版本。路径是 `eslint-config-next` > `@next/eslint-plugin-next` > `fast-glob` > `micromatch` > `braces`，只存在于开发依赖。`pnpm-workspace.yaml` 的 `auditConfig.ignoreGhsas` 记录这一条例外，到期日 2027-01-05。有修复版本或到了该日期，以先到者为准，删除例外。不忽略 moderate 的 esbuild 发现，也不改 `pnpm audit --audit-level=high`。

## Migration Plan

本变更是绿字段基线。回滚即不部署该容器。后续切片只追加文件和 `0xx` 迁移，不改本变更文件。

## Open Questions

无。官方支付和短信的具体请求字段在对应适配器切片按当时文档实现，不改变本变更的合同。
