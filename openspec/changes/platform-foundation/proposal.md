# Proposal

## Why

MercLink v1 还没有可运行的应用。后续四个业务切片要由不同 Subagent 并行实现，必须先有一份不会被各切片改写的运行时、错误合同和模块接缝，否则合并时会在脚手架和认证入口上冲突。

## What Changes

- 建立一个可部署的 Next.js 应用壳：类型检查、规范、测试、依赖边界和密钥扫描的本地门禁。
- 包管理锁定为 pnpm 12.9.1：`package.json` 的 `packageManager` 为 `pnpm@12.9.1`，用 Corepack 启用。锁文件只有 `pnpm-lock.yaml`。不运行 `npm install` 或 `yarn`，不提交 `package-lock.json` 或 `yarn.lock`。
- 提供 PostgreSQL 连接、按文件名顺序执行的 SQL 迁移运行器，以及启动前的环境变量校验。
- 冻结 API 错误体、公开 ID、金额单位、Actor/Scope 和三条跨切片接缝的行为合同。
- 提供结构化日志，禁止记录密码、短信验证码、令牌和支付私钥。
- 不实现账号、目录、订单、公开页面或 Skill 正文。

## Capabilities

### New Capabilities

- `app-runtime`: 应用启动、配置缺失拒绝启动、健康检查、日志脱敏和数据库迁移入口。
- `shared-api-contract`: 所有 `/api/v1` 调用方共享的错误体、认证失败响应、Actor 模型和跨切片接缝的失败关闭行为。

### Modified Capabilities

- 无。当前 `openspec/specs` 为空。

## Impact

- 新增根配置、`pnpm-lock.yaml`、`src/shared`、`src/ports`、`src/db` 客户端和 `010_platform.sql`。这些路径只由本变更写入。
- 业务切片只能追加自己的目录和 `src/db/migrations/0xx_*.sql`，不能修改本变更拥有的根配置，也不能改写锁文件或另生成 `package-lock.json`。
- 外部依赖按 `docs/ARCHITECTURE.md` 选定；不引入 Redis、队列或第二个进程。安装用 `pnpm install`，执行脚本用 `pnpm run <script>`。
