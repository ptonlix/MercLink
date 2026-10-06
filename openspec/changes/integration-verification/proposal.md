# Proposal

## Why

五个切片可以各自通过单元验收，但 PRD 第 12 节要求同一个部署里的商家 Agent 和买家 Agent 串起目录、授权、公开页面和支付。这个合并验证只能由主 Agent 在各切片合并后做，不能交给并行 Subagent。

## What Changes

- 把身份、目录、交易的注册函数接入同一个进程，并补上跨切片外键。
- 用真实数据库事务跑通跨模块验收，外部验证码、短信和支付宝仍使用可替换假实现。
- 核对 Skill 路径、路由表和实际路由文件三者一致。
- 不新增 PRD 之外的功能，也不重写各切片已经验收的领域规则。

## Capabilities

### New Capabilities

- `cross-slice-acceptance`: 合并后的进程必须满足 PRD 第 12 节的跨模块完成标准。

### Modified Capabilities

- 无。各切片需求保持原义；本变更只要求它们在同一个进程和同一套事务中同时成立。

## Impact

- 只在五个切片合并后由主 Agent 实施。
- 允许修改 `src/instrumentation.ts`、新增 `src/composition`、`050_foreign_keys.sql` 和 `tests/acceptance`。
- 并行 Subagent 不得领取本变更。
