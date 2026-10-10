# Tasks

## 1. 输出边界的价格和库存

- [x] 1.1 在公开页输出层把整数分换成两位主币小数，并把 `in_stock` / `out_of_stock` 映射为 schema.org URL。验证 159900 变成 `1599.00`、800 变成 `8.00`，领域函数和 API 测试仍使用整数分。
- [x] 1.2 商品 JSON-LD 为每个可售规格输出一个 `Offer`，复制已有 `sku`，不添加品牌、GTIN、评分、运费或退货。验证两个规格的页面同时包含 `1599.00` 和 `8.00`。
- [x] 1.3 商品 meta description 使用标题、主币价格和「有货/缺货」，截断到 150 字。验证描述不再出现「分」或 `in_stock`，且没有单独的 SEO 文案字段。

## 2. 分页和 Markdown 副本

- [x] 2.1 `/products` 无 cursor 时规范链接为 `/products`；有 cursor 时规范链接包含该 cursor，并只在有相邻页时输出 `rel="next"` 或 `rel="prev"`。验证下一页商品不出现在当前 `ItemList`。
- [x] 2.2 提供 `/index.md`、`/products.md` 和 `/products/{id}.md`，并让同一 HTML URL 在 `Accept: text/markdown` 时返回相同正文。验证后缀在进入公开查询前被识别，不把 `.md` 当成商品 id。
- [x] 2.3 Markdown 只包含当前公开店铺和商品事实，价格与 HTML 相同，不含订单状态或令牌。未公开商品的 Markdown 不可收录且不含报价。验证 800 分显示为 `¥8.00`。
- [x] 2.4 HTML 响应带 Markdown alternate 和指向 `/llms.txt` 的 `describedby`。Markdown 的 canonical 指回 HTML。验证 sitemap 不含 `.md`、cursor 或 `lastmod`。

## 3. 发现文件

- [x] 3.1 把 `/llms.txt` 改成 H1、blockquote 和 H2 链接表，内容类型为 `text/markdown`，并指向页面、Markdown 和已发布的 Skill。验证已发布地址不出现，商品行不出现，且没有 `llms-full.txt`。
- [x] 3.2 更新 `docs/PRD.md` 第 9.2 节，写明 API 仍用整数分，页面 JSON-LD 用由分导出的主币单位。验证文档不再要求 JSON-LD 价格等于 API 的分。
- [x] 3.3 若 `/storefront/skill.md` 已存在，写明服务端拥有结构化数据，上传不得包含 `application/ld+json`。验证 Skill 路径测试仍通过，且不把上传步骤写入商家 Skill。

## 4. 店面事实页

- [x] 4.1 分发店面 HTML 前删除商家 `application/ld+json`。含店铺或商品槽位时注入与槽位相同的服务端 JSON-LD；无这些槽位时不注入 `Product`、`Offer`、`ItemList` 或 `OnlineStore`。验证响应不再包含商家脚本里的旧价格。
- [x] 4.2 确认激活时拒绝含 `application/ld+json` 的提交，返回 `validation_error` 且指针不变。验证无槽位营销页仍不套用内置文案，发现文件仍由服务端生成。
- [x] 4.3 对照未归档店面变更核对槽位渲染、下一页、订单读取隔离和保留路径没有回退。验证相关店面与公开页测试通过。

## 5. 门禁

- [x] 5.1 运行 `pnpm exec vitest run src/public-discovery src/agent-docs/skills.test.ts src/app-services/storefront`、`pnpm run typecheck` 和 `pnpm run boundaries`。验证没有新增依赖，也没有修改 `openspec/specs/`。
