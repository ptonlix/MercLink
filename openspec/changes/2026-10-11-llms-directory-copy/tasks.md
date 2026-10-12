# Tasks

## 1. 目录文案

- [x] 1.1 改 `llmsText()` 为「先读」「页面」「接口」三段，链接用 `absoluteUrl`，说明使用给定全文。验证生成结果包含九个绝对链接和通知句，且不含商品行或 `llms-full.txt`。
- [x] 1.2 已发布店名和简介仍只出现在 H1 和 blockquote；没有已发布介绍时 H1 为 MercLink，摘要为 `storeExplanation`。验证撤下后不再保留店名。

## 2. 测试

- [x] 2.1 更新 `discovery.test.ts`：已发布执照时允许通知句，仍断言信用代码、电话、地址值、区域值、网站、标识、法人和商品标题不出现。验证该测试通过。
- [x] 2.2 若 `skills.test.ts` 写死旧目录文案，一并改掉。验证 `pnpm exec vitest run src/public-discovery/discovery.test.ts src/agent-docs/skills.test.ts` 通过。

## 3. 检查

- [x] 3.1 跑 `pnpm run typecheck` 和 `pnpm run boundaries`。不把未跑的冒烟说成通过。
