# Proposal

## Why

`/api/v1` 的失败体是 `{ error, message }`，成功体是各接口自己的资源 JSON。调用方要先看 HTTP 状态，再猜 body 是错误还是资源。错误码已经集中在 `src/shared/errors.ts`，但同一个码的 HTTP 状态仍由目录、交易和图片各自映射。

现有 Vitest 覆盖领域规则和部分用例，不能代替对正在运行的进程打一遍后台接口。

## What Changes

- **BREAKING**：适用范围内的 JSON 响应使用统一外壳 `code`、`message`、`data`、`timestamp`、`request_id`。不再返回顶层 `error`，也不再把资源字段放在顶层。
- `code` 是数字业务码。成功固定为 `200`。失败使用同一文件里的项目常量，不直接复用 HTTP 状态数字。字符串错误名只作为常量名保留，不出现在响应里。
- HTTP 状态继续表达传输结果。业务失败不得只用 HTTP 200 加 body 里的错误表示。创建资源仍是 HTTP 201，body 的 `code` 仍是 `200`。
- `message` 成功时固定为 `成功`。失败时沿用现有可读说明，不返回堆栈。
- `data` 是对象、数组或 `null`。列表继续使用现有的 `items` 和 `next_cursor`，不改成 `pageNum` 分页。
- `timestamp` 是响应生成时的 Unix 毫秒。`request_id` 使用 `req_` 前缀，并写入同一条请求日志。
- 支付宝通知、OAuth、受保护资源元数据、图片字节、健康检查、Skill、页面和 303 跳转不套这层外壳。
- 增加独立的 HTTP 冒烟套件。它不进入 `pnpm run check`。

## Capabilities

### New Capabilities

- `api-smoke`：对运行中的应用做分模块 HTTP 冒烟，并用清单卡住新增路由漏测。

### Modified Capabilities

- `shared-api-contract`：JSON 合同改为带追踪字段的数字业务码外壳。
- `agent-skills`：两份 Skill 教 Agent 比较数字 `code`，资源只从 `data` 读。
- `merchant-public-profile`：资料和店铺字段移到 `data`。
- `product-images`：上传成功字段移到 `data`。图片字节响应不变。

## Impact

- 所有消费 `/api/v1` JSON 的 Agent、页面和测试都要改。不提供旧字段兼容，也不新增 `/api/v2`。
- `POST /api/v1/payments/alipay/notify` 仍返回纯文本 `success` 或 `fail`。
- `GET /api/health` 仍是 `{ status: "ok" }`。
- 目录侧 `variant_required` 的 HTTP 状态从 409 改为 400。业务码不变。
- 未归档的手机网站支付变更如果先落地，`payment.channel` 位于 `data.payment`。
- 冒烟只写入名为 `merclink_smoke` 的数据库，不连接真实支付宝、短信或验证码。
- 更新 PRD 第 10 节、两份 Skill，以及断言旧错误体的测试。
