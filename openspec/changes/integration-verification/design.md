# Design

## Context

见 `proposal.md`。五个切片各自用接缝替身通过验收。本变更只在它们已经合并到同一工作树后，由主 Agent 实施。

## Goals / Non-Goals

**Goals:**

- 一个进程同时注册身份、目录和交易。
- 跨切片外键生效。
- PRD 第 12 节的跨模块场景有自动化验收。

**Non-Goals:**

- 不重写领域规则，不新增 PRD 之外的功能。
- 不把本变更交给并行 Subagent。

## Decisions

### 允许修改的路径

并行切片禁止修改的文件，本变更在合并后可以改：

- `src/instrumentation.ts`：启动时调用 `src/composition/register-all.ts`，并每分钟调用 `runOnce`。
- `package.json`：只合并各 `slice-deps.json` 中的官方 SDK，并加入 `test:acceptance`。
- `050_foreign_keys.sql`：补 `catalogs.merchant_id`、`orders.buyer_id`、`order_items` 到目录、商品、规格的外键。
- `tests/acceptance/**`

不得为了让验收通过而放宽切片 spec 中的错误码或权限。

### 组合根

`register-all.ts` 依次调用身份、目录、交易的 `register`。任一注册失败则进程拒绝就绪。默认目录接缝因此在开通商家时真正写入 `catalogs`。订单锁定因此进入目录切片的 `SELECT FOR UPDATE`。

### 验收

验收使用可回滚的测试数据库和端口假实现，不模拟掉库存锁。场景覆盖提案所引的 PRD 第 12 节：两本目录、两规格只扣一条、下架后公开页和购买 API 都不可见、软删除与恢复、破坏性字段确认、角色拒绝、Skill 路径下单、多行拒绝、支付通知、超时回补、租户隔离、撤销刷新令牌、商家页无注册、短信前必须过人机验证、业务单号幂等。

另外核对三件事：共享路由表中的每个路径都有对应路由文件；两份 Skill 包含分配给它们的路径；`payment.action` 的形状与支付宝适配器实际返回一致，不一致时改 Skill 和文档，不改支付协议。

### 执行者

只有主 Agent 领取。若工作树缺少任一前置切片的独占目录，停止，不自行实现缺失业务。

## Risks / Trade-offs

- [并行切片偏离接缝字段] → 验收先编译 `register-all.ts`。字段不一致就修调用点，不在接缝上加兼容分叉。
- [外键补加时已有脏数据] → 补加前运行孤立行检查，有孤立行则失败并列出 id，不自动删除。

## Migration Plan

在五个切片的迁移都已执行后追加 `050_foreign_keys.sql`。回滚该文件只删除外键，不删除业务行。

## Open Questions

无。
