# MercLink 开发规范

这份文件给人和 AI Coding 助手共用。改代码前先读它，再读对应实现，不要凭通用框架习惯重写本仓库。

事实来源按这个顺序：

1. `docs/PRD.md` 决定做什么、不做什么。
2. `docs/ARCHITECTURE.md` 决定怎么分层、用什么依赖。
3. `openspec/specs/` 是已经生效的行为规格。`openspec/changes/` 里未归档的变更只在被明确要求实现时才改代码。
4. `src/shared/api-routes.ts` 是接口路径的唯一注册表。

文档和代码冲突时，先停下来指出冲突。不要为了让测试通过去改规格，也不要为了迁就旧文档去发明第二种协议。

## 技术约束

- Node.js 24、pnpm 12.9.1、Next.js 16、TypeScript strict。只用 `pnpm install` 和 `pnpm run <script>`。不要生成 `package-lock.json` 或 `yarn.lock`。
- 一个进程包含页面、API、授权和支付通知。不要拆微服务，不要加队列、Kafka、独立 MCP 进程或第二套数据库。
- Redis 只做会过期的限流计数。Redis 不可用时拒绝该操作，不降级到 PostgreSQL 或本地磁盘。
- 商品图片只进已配置的 S3 或 MinIO。没有本地目录兜底。
- 不新增依赖，除非任务明确要求。厂商 SDK 只允许出现在 `src/adapters/`。

## 代码放哪里

```text
src/app/           页面和路由。认证、解析、返回。不写业务规则。
src/app-services/  一个用例一个文件。负责事务和编排。
src/domain/        纯规则。不 import app、db、adapters，也不 import 其他领域模块的内部函数。
src/ports/         端口类型。
src/adapters/      支付宝、阿里云、S3、Redis。负责签名和厂商错误转换。
src/db/            Drizzle schema 和 SQL 迁移。
src/agent-docs/    Skill 正文。路径必须和路由表一致。
```

依赖方向只有 `app` → `app-services` → `domain`。页面和路由不能直接 import `src/domain`。应用服务只能 import 自己上下文的领域模块。跨目录、交易、身份的协作放在应用层。

`pnpm run boundaries` 会检查这些方向。新增文件时沿用现有命名，不要为了“更清晰”再套一层 `services/`、`controllers/` 或 `utils/`。

## 改行为之前

影响对外行为、数据形状或 Skill 说明的改动，先写 OpenSpec 变更，再改代码：

```text
openspec/changes/<YYYY-MM-DD>-<短名>/
  proposal.md
  design.md
  tasks.md
  specs/<能力>/spec.md
```

规格增量用英文 Requirement 和 Scenario，和 `openspec/specs/` 里的现有规格保持同一写法。提案和设计用中文，写清为什么、不做什么、失败时如何表现。

没有被要求时，不要顺手重构、不要扩大到相邻功能、不要把未归档提案当成已经上线的规格。

## 不能破坏的规则

- 金额在进入领域层之前变成整数分。领域层不接受元或浮点。调用方不能传价格。
- 一笔订单一行、一条支付记录。库存扣减、订单写入和支付记录插入在同一个事务里。支付宝调用放在事务提交之后。创建支付失败时订单保持 `pending`，返回 `payment_retryable`。
- 只有订单状态 `paid` 表示支付成功。打开 `payment.action` 不是成功。通知先验签；验签失败不改状态。订单头的 `paid` 只是支付记录的副本。
- 支付渠道在第一次下单时写入支付记录。缺省 `desktop`，使用 `alipay.trade.page.pay`。`mobile` 使用 `alipay.trade.wap.pay`。不要用 User-Agent 猜测渠道，也不要在重复的 `client_order_no` 上改产品码。
- Agent 授权走设备码。不收集用户的密码、短信验证码或 API Key。不把授权码重定向到公网回调。商家授权页不能注册商家。
- 买家短信必须先过人机验证，再受 Redis 的 60 秒和 24 小时限制。验证码不入库。
- 公开 Skill、页面和 API 使用同一套事实。改路径时同时改 `src/shared/api-routes.ts` 和对应 Skill，并让 `src/agent-docs/skills.test.ts` 继续通过。
- 不把私钥、令牌、验证码或生产连接串写进代码、测试、Skill 或提交说明。

## 实现习惯

- 外部 JSON 先用 Zod 解析，再进入领域类型。领域规则不使用 `any`。`unknown` 停在适配器边界。
- 错误沿用现有 `{ error, message }` 和已有错误码。不要为了措辞新增错误码。
- 新迁移只追加 SQL 文件，不改已经应用过的迁移。表结构以 PRD 第 11 节和现有 migration 为准。
- 测试用 Vitest。领域规则直接测纯函数。外部支付宝、短信、验证码和对象存储用端口假实现，不在单元测试里打真实厂商。需要数据库的测试走现有 harness，不另起一套。
- 页面不要求单元测试。改了 Skill、下单、支付、授权或字段变更，要补或更新对应测试。
- 注释只解释非显而易见的约束。不要复述代码在做什么。

## 完成前检查

先跑受影响的测试，再按改动范围跑门禁：

```bash
pnpm run typecheck
pnpm exec vitest run <相关测试文件>
pnpm run boundaries
```

准备提交或声明完成时，运行：

```bash
pnpm run check
```

它包含格式、lint、类型、测试、依赖方向和 Knip。编辑器没有报错不能代替这条命令。

不要主动提交或推送。用户要求提交时，说明用一句祈使句，重点写为什么，而不是罗列文件。

## 不要做

- 不要把业务 if 堆进 `src/app/**/route.ts`。
- 不要让领域层为了省事直接查数据库或调用支付宝 SDK。
- 不要新增第二份路由表、第二份商品读取逻辑或第二套限流存储。
- 不要实现 PRD 明确不做的能力：购物车、优惠券、运费、推荐、退款、商家自助注册、其他电商平台。
- 不要在 Agent 内置页里收集支付宝密码，也不要把支付成功建立在同步回跳上。

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
