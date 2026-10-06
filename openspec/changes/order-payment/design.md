# Design

## Context

见 `proposal.md`。可售规格和库存行属于目录切片。本变更通过 `sellableVariants` 接缝锁定和回补，因此可以在目录实现缺席时用假接缝验收订单规则。

## Goals / Non-Goals

**Goals:**

- 一行订单、服务端计价、业务单号幂等、支付记录与订单头分离。
- 通知验签失败不改状态；超时只回补一次库存。

**Non-Goals:**

- 不实现退款、多行购物车、改价接口。
- 不在订单头保存支付渠道字段。
- 不调用目录模块内部函数。

## Decisions

### 独占路径

- `src/domain/commerce/**`
- `src/app-services/commerce/**`
- `src/adapters/alipay/**`
- `src/db/schema/commerce.ts`、`src/db/migrations/040_commerce.sql`
- `src/app/api/v1/orders/route.ts`、`src/app/api/v1/orders/[id]/route.ts`
- `src/app/api/v1/manage/orders/route.ts`
- `src/app/api/v1/payments/alipay/notify/route.ts`
- `src/jobs/close-expired-orders.ts`
- `src/commerce/slice-deps.json`

不得修改平台根配置、身份模块、目录模块或 Skill。

### 下单事务

应用服务开启事务后调用 `sellableVariants.lock`。接缝实现负责 `SELECT FOR UPDATE`；假实现在测试里模拟库存。事务内写 `orders`、一条 `order_items`、一条 `payments`。状态初始为 `pending`，`expires_at` 为创建后 30 分钟。调用方传入的价格字段由 Zod 拒绝。

`unique(buyer_id, client_order_no)` 冲突时返回原订单，不再次锁定库存。另一个买家的相同业务单号是另一张订单。

支付宝创建支付发生在事务提交之后。失败返回 `payment_retryable`，订单保持 `pending`，不新开第二条支付记录。重复调用创建支付前先查已有 pending payment。

### 支付端口

`src/ports/payment.ts` 由平台拥有，本变更只实现 `src/adapters/alipay`。端口动作是创建支付、查询支付、取消支付、校验通知。领域层只看见已支付、待支付、已关闭或验签失败。

通知路由先验签。通过后按 `provider_trade_no` 找到 payment；该列非空唯一。事务内先写 payment `paid`，再写 order `paid` 和 `paid_at`。重复通知返回成功且不第二次改状态。

查询订单时若本地仍是 `pending`，先查端口，再按 payment 回写。商家列表只读，没有标记已支付的路由。

### 超时

`close-expired-orders.ts` 导出 `runOnce`。它锁定到期且仍为 `pending` 的订单，关闭 payment 和 order，对有限库存调用 `sellableVariants.restore`，再调用端口取消。同一订单用状态条件更新保证只处理一次。进程内调度由集成变更每分钟调用 `runOnce`；本切片的验收直接调用 `runOnce`。

### 权限

下单要求 buyer actor 且含 `order:write`。商家 actor 返回 403。买家只能读自己的订单。商家 `order:read` 只能读订单行目录属于自己的订单。Actor 来自 `authenticate` 测试替身。

### 验收命令

`npx vitest run src/domain/commerce src/app-services/commerce`

覆盖下单扣库存、重复业务单号、超时回补、验签失败、重复通知。外部支付宝使用端口假实现。领域覆盖率不低于 90%。

## Risks / Trade-offs

- [目录锁与订单事务不在一个数据库事务] → 接缝必须接受调用方事务对象。假接缝不证明行锁；集成变更用真实目录实现复测。
- [支付文档与示例不一致] → 适配器按官方文档改返回给调用方的 `payment.action` 形状，并让集成变更改 Skill，不发明协议。

## Migration Plan

追加 `040_commerce.sql`，包含 `orders`、`order_items`、`payments`。不建跨切片外键。不提供这些表的删除方法。

## Open Questions

无。国内支付宝 AI 支付与 Alipay+ Agent 支付的选择由商户环境变量区分，端口结果形状保持不变。
