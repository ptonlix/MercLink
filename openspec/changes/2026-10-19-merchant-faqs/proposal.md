# Proposal

## Why

公开页没有店家可维护的问答。把问答塞进店铺介绍或商品描述，会让改店名、改简介或上下架商品顺带发布或清掉问答。平台也不预置固定问题。

## What Changes

- 新增两套独立的问答资源，由商家 Agent 用 `product:write` 整份替换。全店一份，显示在首页；每件商品一份，只显示在该商品详情。平台不预置问题。
- 每份资源自带 `published`。保存或发布店铺介绍、上架或下架商品，都不改变问答。`published: false` 保留草稿并不公开。空列表不能公开。
- 全店问答只看自己的 `published`。介绍未发布时，首页仍可只显示已公开的全店问答。商品问答要同时已公开，且该商品仍在公开查询结果里。商品下架或软删除后，公开页不再显示该商品问答，商家侧的内容和 `published` 保留；重新上架后，仍公开的问答回到详情页。
- 公开读取不新增 FAQ 专用接口。已发布介绍的 `GET /api/v1/store` 附加 `faqs`。介绍未发布但全店问答已公开时，该接口返回只有 `faqs` 的 `200`，不带回介绍草稿。两者都没有时仍是 `404`。**BREAKING**：调用方不能再把 `GET /api/v1/store` 的 `200` 单独理解成「介绍已发布」。公开商品详情附加 `faqs`；商品列表和首页卡片不带问答正文。
- 内置首页在商品货架正下方渲染全店问答，再往下才是联系方式、执照和平台使用指南。内置商品详情在商品详情正文之后、用户 Skill 链接之前渲染该商品问答。正文包括名称、价格、描述、规格和商品信息。有可见条目时，内置页用一个「常见问题」标题把问答收成独立区域。没有可见条目时不渲染问答块。同一段纯文本进入 `/index.md` 或 `/products/{id}.md`，这两份 Markdown 在有条目时保留该节标题。服务端按可见条目附加 `FAQPage`，不替换现有 `OnlineStore` 或 `Product`。
- 店面用重复槽位 `store.faq` 和 `product.faq` 排版。有可见条目时，展开在该区域条目前插入恰好一个「常见问题」标题；没有条目则去掉区域。已发布且未声明这些槽位的自定义店面保持有效，不自动插入问答或标题。
- 商家 Skill 说明这两个接口、限制，以及它们与介绍和上下架无关。店面 Skill 说明两个槽位。

## Capabilities

### New Capabilities

- `merchant-faqs`：全店和商品问答的读写、校验、独立发布，以及公开可见条件。

### Modified Capabilities

- `merchant-public-profile`：公开店铺响应在已发布介绍上附加 `faqs`；仅有已公开全店问答时返回只有 `faqs` 的 `200`。
- `product-query`：公开商品详情返回已公开的商品问答；列表不返回问答正文。
- `public-pages`：首页、商品详情、Markdown 和 JSON-LD 展示同一份已公开问答；列表、货架和 `/llms.txt` 不展开问答正文。
- `agent-skills`：商家 Skill 和店面 Skill 说明问答接口与槽位。

## Impact

- 新表保存全店和商品问答。只追加迁移。
- 新路由 `GET`/`PUT /api/v1/merchant/faqs` 和 `GET`/`PUT /api/v1/catalogs/{id}/products/{product_id}/faqs`，登记到 `src/shared/api-routes.ts` 和冒烟清单。不新增错误码、scope 或依赖。
- 公开店铺响应、公开商品详情、内置首页和商品页、两份 Markdown、JSON-LD、起始店面模板和槽位校验。
- `/merchant/skill.md`、`/storefront/skill.md` 和对应测试。买家 Skill 不新增管理路径。
- 店铺介绍的九个字段和商品创建、`PATCH` 都不接受 `faqs`。问答不能写入目录 `fields`。
- 未归档且已实现的 `2026-10-15-product-description` 与 `2026-10-11-public-field-labels` 也修改「Product pages use the public query seam」。本变更的增量只在当前主规格正文上增加问答。归档时对同一条 Requirement 的修改必须合并，不能用一份旧正文覆盖另一份。
