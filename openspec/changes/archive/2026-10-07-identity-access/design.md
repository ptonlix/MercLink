# Design

## Context

见 `proposal.md`。平台变更提供 Actor、Scope、错误体和 `authenticate` 接缝。本变更实现这三套账号和 OAuth，不实现目录内部表。

## Goals / Non-Goals

**Goals:**

- 超管、商家、买家三条账号路径可以各自用假短信和假验证码验收。
- Agent 只能拿到 15 分钟访问令牌和可轮换刷新令牌。
- 商家授权页没有注册分支。

**Non-Goals:**

- 不建商品、订单、公开落地页。
- 不把用户复制进授权库。
- 不实现子账号或第三方登录。

## Decisions

### 独占路径

- `src/domain/identity/**`、`src/domain/access/**`
- `src/app-services/identity/**`、`src/app-services/access/**`
- `src/adapters/aliyun-captcha/**`、`src/adapters/aliyun-sms/**`
- `src/db/schema/identity.ts`、`src/db/migrations/020_identity.sql`
- `src/app/admin/**`、`src/app/authorize/**`、`src/app/oauth/[...oidc]/route.ts`
- `src/app/.well-known/oauth-protected-resource/route.ts`
- `src/app/api/v1/api-keys/**`
- `src/identity/slice-deps.json`，只记录官方 SDK 包名，不改 `package.json`

不得修改平台根配置、目录模块或交易模块。

### 账号与密码

表结构按 PRD 第 11 节的 `admins`、`merchants`、`buyers`、`oauth_grants`、`api_keys`。密码使用 Argon2id。手机号唯一索引带 `deleted_at is null`。邮箱可空且可重复。

首次启动由应用服务读取 `ADMIN_PHONE` 和 `ADMIN_PASSWORD` 创建超管，并立刻要求改密。改密前开通商家返回 403 `password_change_required`。

开通商家在同一事务写商家账号，并调用 `src/shared/seams/default-catalog.ts`。该接缝由平台提供注册点，目录切片注册实现。未注册时开通商家仍然成功，响应里带 `default_catalog: "pending"`，测试断言请求已被发出。集成变更要求该字段变为已创建。这样身份切片不必 import 目录模块。

### 授权

使用 `oidc-provider`，挂在 `/oauth`。账号校验适配到三张自己的表。访问令牌 15 分钟。刷新令牌只存哈希，轮换后旧值立即失效。设备码存在 PostgreSQL，有效期为分钟级，不引入 Redis。

Scope 决定页面：

- 含 `field:write` 或 `product:write`：商家登录页，无注册表单。
- 仅 `order:write` / `order:read`：买家登录或注册页。

商家批准的 scope 固定为 `field:write product:write product:read order:read`。买家固定为 `order:write order:read`。授权页不得出现 API Key。

`register.ts` 把 bearer 和 API Key 解析注册到 `authenticate`。撤销写 `revoked_at`。停用商家时撤销该商家全部分 grant 和 key。

### 买家注册

顺序固定为验证码参数、`VerifyIntelligentCaptcha`、`SendSmsVerifyCode`、`CheckSmsVerifyCode`、设置密码。验证码不入库。60 秒和 24 小时上限记在 PostgreSQL；超限不调用短信端口。验证参数使用后立即作废。错误次数用尽则作废本次注册挑战。

阿里云密钥只在适配器读取。测试使用端口假实现，不断言厂商报文。

### 页面

超管页只有改自己的密码、开通商家、停用商家、重置密码。不进入站点地图，不提供商品表。商家授权页对未知手机号显示「请联系管理员开通」。

### 验收命令

`pnpm exec vitest run src/domain/identity src/domain/access src/app-services/identity src/app-services/access`

领域覆盖率不低于 90%。不启动 Next.js 也能跑这些测试；路由测试用平台接缝的假 Actor。

## Risks / Trade-offs

- [默认目录接缝未注册] → 身份测试断言请求已发出；真实目录行由集成变更验收。
- [`oidc-provider` 与 Next.js 路由适配] → 只在一个 catch-all 路由挂载，交互页仍是自己的 React 页面。

## Migration Plan

追加 `020_identity.sql`。回滚时停用授权路由，不删除已有订单所引用的账号行。

## Open Questions

无。短信签名和模板使用控制台已赠送的配置，具体模板码来自环境变量。
