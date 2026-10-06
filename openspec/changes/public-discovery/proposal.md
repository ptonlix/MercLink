# Proposal

## Why

人和 Agent 需要同一份公开入口、两份 Skill 和可收录的商品页。页面如果另写商品读取逻辑，会和购买 API 的价格、库存状态不一致。

## What Changes

- 服务端渲染总落地页、已上架商品列表和商品详情，并输出与正文一致的标题、描述和 JSON-LD。
- 生成 `robots.txt`、`sitemap.xml` 和 `llms.txt`。下架、删除和不可售商品不进入站点地图。
- 发布 `/skill.md` 和 `/merchant/skill.md`。文档只教 HTTP API 和标准 OAuth，不包含令牌或商家私有数据。
- 商品摘要只来自公开商品查询接缝。接缝未注册时页面仍可渲染，并明确没有可展示商品。
- 不实现后台商品表格、营销页、推荐或支付协议。

## Capabilities

### New Capabilities

- `public-pages`: 总落地页、商品页、发现文件和不可收录状态。
- `agent-skills`: 购买 Skill 与商家 Skill 的内容合同，以及与路由表一致的检查。

### Modified Capabilities

- 无。

## Impact

- 独占公开页面、发现文件路由和 `src/agent-docs`。
- 不修改 `/api/v1` 的业务实现；Skill 中的路径和错误码以平台路由表为准。
- 授权页、超管页和 API 不进入站点地图，也不由本变更实现。
