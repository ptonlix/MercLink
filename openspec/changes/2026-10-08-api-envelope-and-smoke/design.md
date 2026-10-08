# Design

## Context

见 `proposal.md`。当前失败响应是 `{ error, message }`，成功响应是裸资源。状态表分散在交易、目录和图片三处。公开列表使用游标 `next_cursor`，不是页码。JSON 字段是 snake_case。公开标识使用 `ord_`、`prd_` 这类前缀。日志会脱敏令牌，但没有请求关联号。

通用模板里的 `code: 200`、`timestamp`、`requestId` 和「HTTP 与业务码分工」可以参考。不能把模板里的驼峰字段和 `pageNum` 分页原样搬进来。

## Goals / Non-Goals

**Goals:**

- 业务 JSON 始终能用同一规则解析。
- 业务码和 HTTP 状态只在一个文件里成对定义。
- 失败响应能靠 `request_id` 找到日志，且不泄漏堆栈。
- 一条命令跑完后台接口冒烟。

**Non-Goals:**

- 不把所有 HTTP 响应当成 200。
- 不把多种 400 业务原因折叠成同一个 body `code`。
- 不把游标列表改成 `list`、`total`、`pageNum`、`pageSize`、`pages`。
- 不给支付宝通知、OAuth、健康检查或图片字节加外壳。
- 不把冒烟放进 `pnpm run check`，不新增依赖。

## Decisions

### 五个字段，名称跟现有 JSON

适用响应永远是：

```json
{
  "code": 200,
  "message": "成功",
  "data": {},
  "timestamp": 1710000000000,
  "request_id": "req_example"
}
```

失败：

```json
{
  "code": 40001,
  "message": "字段不存在。",
  "data": null,
  "timestamp": 1710000000000,
  "request_id": "req_example"
}
```

- 字段名使用 `request_id`，不用 `requestId`。同一份 JSON 不能一半驼峰、一半 `next_cursor`。
- `timestamp` 是 Unix 毫秒，取自现有时钟端口。领域对象里的 `updated_at` 仍是 ISO 字符串，不改成毫秒。
- `data` 允许对象、数组或 `null`。失败时必须是 `null`，不塞调试对象。
- 成功 `message` 固定为 `成功`。失败 `message` 沿用现有中文说明，只保留第一行。不得含令牌、验证码、私钥或堆栈。
- 顶层不得再出现 `error`，也不得把 `id` 或 `items` 与 `code` 并列。

适用 `/api/v1` 的 JSON 路由，包括现在返回空 body 的 `POST .../options`。该路由仍是 HTTP 404，body 使用 `not_found` 的业务码。

不适用通知纯文本、OAuth、受保护资源元数据、`GET /api/health`、`GET /media/{id}`、Skill、HTML 和 303。401 仍另带 `WWW-Authenticate`。

### 业务码是数字，但不能等于 HTTP 状态

`code` 使用数字，是因为调用方要求成功为 `200`、失败为非 `200`。成功包含 HTTP 200 和 HTTP 201，body `code` 都是 `200`。调用方不能把 body `code` 当成 HTTP 状态。

失败码不使用 400、401、403、404、409、429、503 这些 HTTP 状态本身。否则 `unknown_field`、`field_retired` 和 `validation_error` 会变成同一个码，Agent 无法按 Skill 区分。现有字符串名保留为常量名；线上 body 只放数字。

唯一定义在 `src/shared/errors.ts`：

| 常量名 | code | HTTP |
| --- | --- | --- |
| 成功 | 200 | 200 或 201 |
| `validation_error` | 40000 | 400 |
| `unknown_field` | 40001 | 400 |
| `field_retired` | 40002 | 400 |
| `too_many_items` | 40003 | 400 |
| `variant_required` | 40004 | 400 |
| `captcha_required` | 40005 | 400 |
| `invalid_signature` | 40006 | 400 |
| `sms_rate_limited` | 40007 | 400 |
| `unauthorized` | 40100 | 401 |
| `forbidden` | 40300 | 403 |
| `password_change_required` | 40301 | 403 |
| `not_found` | 40400 | 404 |
| `conflict` | 40900 | 409 |
| `insufficient_stock` | 40901 | 409 |
| `rate_limited` | 42900 | 429 |
| `payment_retryable` | 50300 | 503 |
| `dependency_unavailable` | 50301 | 503 |

不新增、不改名、不删除现有错误种类。数字只是这些种类的线上标识。目录侧 `variant_required` 的 HTTP 状态从 409 改为 400，业务码仍是 40004。`sms_rate_limited` 保持 HTTP 400，不因为名字像限流改成 429。

`apiFailure` 只接受常量名，状态和数字都从表里取。调用方不能自行传入另一个 HTTP 状态。领域层内部仍可使用字符串错误名；它不是 HTTP body。

### 请求号只用于关联日志

没有合法入站请求号时，边缘生成 `req_` 加不可猜测后缀，规则与现有公开标识相同。客户端若发送 `X-Request-Id`，只有符合同一前缀和长度时才沿用，否则忽略并生成新的。响应头回写同一个 `X-Request-Id`。

请求日志带上这个值。现有脱敏规则不变，不把令牌写进 `request_id`。领域层不生成、不保存请求号。

### 分页不改协议

列表的 `data` 继续是 `{ items, next_cursor }`。不返回 `total`、`pageNum`、`pageSize` 或 `pages`。现有查询是游标，计算总页数会引入另一种分页，也会在大表上增加计数。冒烟只断言 `items` 和 `next_cursor` 这两个现有字段。

### 冒烟

套件、命令、数据库名和模块划分保持上一版设计。断言改为数字 `code`、固定成功文案、`timestamp` 和 `request_id`。冒烟不断言失败 `message` 的全文，不断言每个领域校验分支。

## Risks / Trade-offs

- [Agent 原来比较字符串 `unknown_field`] → Skill 必须写出数字，并写明常量名只是说明。同一变更改完仓库内测试。
- [body `code` 200 与 HTTP 201 同时出现] → 发布说明写明成功业务码不区分创建和读取。HTTP 状态仍区分。
- [入站请求号被伪造] → 只接受 `req_` 前缀和固定长度。不能用它授权，也不能把它当资源 id。
- [开发库被冒烟写入] → 数据库名不是 `merclink_smoke` 时失败，不写入。

## Migration Plan

外壳、常量、Skill、PRD 和仓库内测试同一次发布。没有双 body 窗口。回滚按整次发布回滚。

## Open Questions

无。
