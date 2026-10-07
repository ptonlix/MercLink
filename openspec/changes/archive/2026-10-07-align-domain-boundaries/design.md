# Design

## Context

见 `proposal.md`。目录、身份、访问和交易已经分成四个领域目录，依赖检查只禁止领域层引用页面、数据库和适配器。审查确认规则大多不在路由里，但名字和跨表写入还没跟上。

## Goals / Non-Goals

**Goals:**

- 一个概念一个名字，API、领域、表和 Skill 一致。
- 跨上下文只调用对方拥有的函数。
- 测试锁住的函数就是生产调用的函数。

**Non-Goals:**

- 不重写订单、支付或目录变更流程。
- 不把 `script` actor 改名。API Key 仍是凭证，actor 仍是 `script`。
- 不归档尚未归档的图片和短信变更；本变更直接改已经落地的代码。

## Decisions

### 名字

自定义值统一为 `fields`。迁移把 `products.attrs` 和 `variants` 上若存在的 attrs 列改名为 `fields`。订单行已有 `fields_snapshot`，不改历史 JSON。

字段单选项从 `options` 改为 `choices`，含 `product_fields` 的选项列。规格轴 JSON 和路径用 `axes`，旧 `/options` 返回 404。规格组合请求和响应只用 `option_values`。

注册挑战 id 前缀加入 `src/shared/id.ts` 的 `chg_`。`buyers.ts` 不再调用 `createPublicId("grant")`。

### 接缝

访问上下文提供撤销某商家全部分授权和 API Key 的函数。`disableMerchant` 调用它，并调用已有的 `disableMerchantEffects`。目录上下文提供按商家列出目录 id 的函数，`registerSlices` 调用它。身份上下文提供买家和商家能否登录的函数，访问和装配层调用它。

`tokenHash` 移到 `src/shared`，身份不再 import `src/domain/access`。

页面通过应用服务读取授权页选择和未知商家文案。dependency-cruiser 增加 `app → domain` 和跨上下文领域引用的失败规则。

### 一条活规则

`rejectCallerPrice` 接收请求体并拒绝价格键。`place-order` 把原始对象传给它，删掉永远传入 `false` 的调用。

`maxImageBytes` 和上传限流数字放在 `src/domain/catalog/images.ts`。上传用例和 Redis 策略都引用它们。上传占用额度时传入注入的时钟。

删除 `smsSendAllowed`。`smsRateLimitPolicies` 和 `smsSendLimited` 是唯一限流定义。`requestBuyerSms` 和 runtime 都使用它们，测试锁这两份函数，而不是一份没人调用的时间列表判断。

## Risks / Trade-offs

- [商家 Skill 和已接入的 Agent 仍发送 `options`] → 这是明确的破坏性改名。Skill 与路由表同一变更更新，不保留旧键。
- [列重命名需要迁移] → 追加迁移，不改已发出的订单快照。
- [接缝变多] → 只加审查点名的三个接缝，不引入新的领域框架。

## Migration Plan

先改领域函数和测试，再改 JSON 与 Skill，最后跑列重命名迁移。回滚应用版本前，若列已改名，旧版本会读不到 `attrs`。回滚必须先恢复列名，或停在仍接受 `fields` 列的版本。

## Open Questions

无。
