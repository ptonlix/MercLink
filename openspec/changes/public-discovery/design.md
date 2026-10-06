# Design

## Context

见 `proposal.md`。商品事实来自平台的 `publicProducts` 接缝。路径和错误码来自 `src/shared/api-routes.ts`。本变更不实现这些 API。

## Goals / Non-Goals

**Goals:**

- 不执行脚本也能读到落地页和商品页正文。
- 两份 Skill 覆盖路由表中分配给它们的路径，且不含令牌和商家私有数据。
- 接缝未注册时页面仍返回可渲染的空状态。

**Non-Goals:**

- 不建 CMS、营销页、商品后台表格。
- 不复制一套商品查询。
- 不把全部商品写进 `llms.txt`。

## Decisions

### 独占路径

- `src/app/page.tsx`、`src/app/products/page.tsx`、`src/app/products/[id]/page.tsx`
- `src/app/robots.ts`、`src/app/sitemap.ts`
- `src/app/llms.txt/route.ts`
- `src/app/agent-docs/buyer-skill/route.ts`、`src/app/agent-docs/merchant-skill/route.ts`
- `src/agent-docs/skill.md`、`src/agent-docs/merchant-skill.md`
- `src/public-discovery/**` 仅放页面视图模型，不放第二套商品库

平台 `next.config.ts` 已有重写：`/skill.md` 到买家 Skill 路由，`/merchant/skill.md` 到商家 Skill 路由。本变更不得改 `next.config.ts`。若重写尚未存在，停止并报告，不要另建一份配置。

### 页面数据

页面调用 `publicProducts`，把结果渲染为 HTML。落地页 JSON-LD 使用 `Organization` 和当前摘要的 `ItemList`。商品页使用 `Product` 和 `Offer`。价格、货币、可售状态与接缝字段相同，不换算成元。

不可见商品返回 404，并带 `noindex`。站点地图只收录接缝当前返回的商品，加上 `/`、`/products` 和两份 Skill。`robots.txt` 禁止 `/authorize`、`/admin`、`/oauth` 和 `/api`。

### Skill

正文放在仓库，路由只读取文件。购买 Skill 必须写入路由表中标记为 buyer 的路径；商家 Skill 必须写入标记为 merchant 的路径。两者都写明不要索要密码、短信验证码或 API Key，以及只有 `paid` 才算支付成功。

一致性测试读取 `src/shared/api-routes.ts` 和两份 Markdown。缺路径或出现清单外的 `/api/v1` 路径则失败。测试不要求商品 API 已实现。

### 验收命令

`npx vitest run src/public-discovery src/agent-docs`

页面测试用注册进接缝的固定商品，不断言目录模块存在。

## Risks / Trade-offs

- [Skill 先于真实路由合并] → 路径以共享清单为准；实际文件是否存在由集成变更核对。
- [Next 特殊文件与业务路由冲突] → `robots.ts` 和 `sitemap.ts` 只由本变更创建。

## Migration Plan

无数据库迁移。回滚时移除公开页面路由，不影响 API。

## Open Questions

无。
