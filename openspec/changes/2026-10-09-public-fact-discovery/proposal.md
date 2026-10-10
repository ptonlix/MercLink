# Proposal

## Why

公开页已经由服务端输出 HTML、规范链接和发现文件，但结构化数据仍把整数分和内部状态码交给搜索引擎。Agent 也只有一份过粗的 `/llms.txt`，商品事实没有与 HTML 同源的 Markdown。店面激活后，含事实槽位的页面仍可能没有服务端 JSON-LD，或带上商家自己写的价格结构。

## What Changes

- 商品 JSON-LD 的价格改为主币单位小数，由公开查询的整数分导出；库存状态改为 schema.org 的完整 URL。API 和领域层继续使用整数分。可见价格、meta description 和 JSON-LD 使用同一次换算。
- **BREAKING**：只破坏把页面 JSON-LD 的 `price` 当成「分」、或把 `availability` 当成 `in_stock` 的读取方。`/api/v1` 的商品 JSON 不变。
- 每个可售规格各输出一个 `Offer`，带该规格自己的价格和已有 `sku`。不编造品牌、GTIN、评分、运费或退货政策。
- 商品页 meta description 改为标题、主币价格和「有货/缺货」，截断到 150 字。不另存 SEO 文案。
- `/products` 带 `cursor` 时，规范链接指向当前页，并用 `Link` 给出相邻页。第一页仍指向不带 cursor 的 `/products`。sitemap 不收录分页 URL。
- 为落地页、商品列表和商品页提供与 HTML 相同事实的 Markdown。HTML 用 `Link` 指向 Markdown 和 `/llms.txt`。Markdown 的规范链接指回 HTML，不进入 sitemap，也不复制目录。
- `/llms.txt` 改成 llms.txt 的 H1、摘要和 H2 链接表，并指向 Markdown。已发布店名和简介只允许出现在标题和摘要。不输出地址、区域、网站、标识，也不生成 `llms-full.txt`。
- 激活店面后，服务端剥掉商家上传的 `application/ld+json`。含店铺或商品槽位的响应注入与槽位相同的 JSON-LD。没有这些槽位的页面不注入商品或店铺结构。确认激活时，上传文档若自带 JSON-LD，返回 `validation_error`，指针不变。
- 公开店面 Skill 若已发布，必须写明结构化数据由服务端注入，上传不得自带 JSON-LD。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `public-pages`：修正 JSON-LD 的价格单位和库存 URL，增加分页规范链接、Markdown 副本、llms.txt 链接表，以及店面事实页的服务端结构化数据。

## Impact

- 改 `src/public-discovery/`、公开页 metadata、`/llms.txt`，以及店面渲染和激活校验。不新增依赖，不改支付、授权或商品 API 形状。
- 公开商品查询没有更新时间。本次不给 sitemap 增加 `lastmod`，也不为它扩大查询接缝。
- 与未归档的 `2026-10-09-storefront-agent-edit` 同时修改 `public-pages`。本变更只追加发现和结构化数据规则，不撤销该变更的槽位渲染、订单读取隔离或发现文件保留。归档时必须保留两边的场景。
- `docs/PRD.md` 第 9.2 节需写明：API 用分，页面 JSON-LD 用由分导出的主币单位。不把未归档文本抄进 `openspec/specs/`。
