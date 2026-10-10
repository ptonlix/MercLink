# Design

## Context

见 `proposal.md`。公开页已经在 `src/public-discovery` 取同一条商品和店铺接缝后输出 HTML。JSON-LD 现在直接写入 `offer.price` 的整数分和 `in_stock`。可见价格则由 `displayPrice` 把分换成主币单位。`/llms.txt` 已引用已发布店名和简介，但已生效规格禁止嵌入店铺资料；本次把引用收紧到标题和摘要。

未归档的 `2026-10-09-storefront-agent-edit` 已让事实槽位在每次请求时渲染，并规定无槽位页面不再套用内置 JSON-LD。本设计在那条行为之上追加发现规则，不重做店面发布。

## Goals / Non-Goals

**Goals:**

- 搜索摘要、JSON-LD 和可见价格来自同一次整数分换算。
- Agent 从 `/llms.txt` 进入小份 Markdown，而不是从 HTML 里猜价格。
- 商家上传的结构化数据不能覆盖服务端事实。

**Non-Goals:**

- 不新增依赖，不引入 SEO 或 GEO 监测进程。
- 不生成 `llms-full.txt`，不把目录写进发现文件。
- 不增加品牌、GTIN、评分、运费、退货或本地地图字段。
- 不给 sitemap 编 `lastmod`。公开商品接缝没有更新时间，本次不扩大接缝。
- 不把 Markdown 或分页 URL 收进 sitemap。

## Decisions

### 价格只在输出边界换算

领域层和 `/api/v1` 继续使用整数分。JSON-LD 和 Markdown 调用与页面相同的换算：分除以 100，固定两位小数。不用浮点输入，也不把 `1599.00` 再解析回领域层。

备选是继续让 JSON-LD 等于 API 的分。这会让搜索引擎把 1599 元显示成 159900，因此不采用。

### 一个可售规格一个 Offer

商品页 JSON-LD 遍历接缝返回的可售规格，而不是只写汇总 `offer`。规格已有 `sku` 就复制。没有的标识不补。列表页的 `ItemList` 只含本次响应的商品名称和规范 URL，不含下一页。

### Markdown 用稳定后缀，不占用商品 id

商品 id 以 `prd_` 开头。落地页用 `/index.md`，列表用 `/products.md`，商品用 `/products/{id}.md`。路由在查询前去掉已知后缀；后缀本身不是商品 id。同一 URL 带 `Accept: text/markdown` 返回同一正文。Markdown 的 canonical 指回 HTML，sitemap 不收录它，这样不会制造第二套可索引商品页。

不采用只靠 Accept 协商。只读链接的 Agent 不会稳定发送该头。

### llms.txt 只做目录

正文按 H1、blockquote、H2 链接表组织，内容类型为 `text/markdown`。已发布店名和简介可以作标题和摘要；地址、区域、网站、标识和商品行不进入该文件。商品明细留在 `/products.md` 和单个商品 Markdown，由 Agent 按需获取。

### 店面结构化数据只由服务端写

分发前删除上传 HTML 中的 `application/ld+json`。文档含店铺或商品槽位时，再注入与这些槽位相同的 JSON-LD。无这些槽位的营销页不注入 `Product`、`Offer`、`ItemList` 或 `OnlineStore`。激活校验拒绝自带 JSON-LD 的提交，已激活的旧文档仍在分发时剥离，避免指针已切走后继续露出旧价格。

订单状态槽位不进入 Markdown，也不因此生成商品 Offer。订单读取规则保持不变。

### 与店面变更的归档顺序

本变更的 delta 按当前 `openspec/specs/public-pages` 写成完整要求，并写入店面条件句，避免实现时退回内置页替换事实页。若店面变更先归档，应用本变更时必须把本 delta 重贴到归档后的要求上，保留槽位、下一页、订单隔离和发现文件保留这些场景。不要用本文件覆盖掉那些句子。

## Risks / Trade-offs

- [旧的页面 JSON-LD 读取方把 price 当成分] → 只改变 HTML 内的 JSON-LD。API 响应不改，并在 PRD 写明两种单位的关系。
- [Markdown 与 HTML 再次分叉] → 两边都调用同一输出模型，测试锁定 159900 与 800 两个价格。
- [`/products.md` 被动态路由当成商品 id] → 在进入公开查询前识别保留后缀，未公开 id 的 Markdown 同样不可收录。
- [剥离 JSON-LD 仍放过内联脚本拼出的价格] → 这是店面变更已接受的脚本残余。激活拒绝和分发剥离只覆盖声明式 JSON-LD，不声称能挡住脚本。

## Migration Plan

先改内置页的 JSON-LD、描述和 Markdown，再改 `/llms.txt` 与 Link 头，最后接店面剥离和激活拒绝。不需要数据迁移。回滚时恢复旧的页面 JSON-LD；API 无兼容包袱。已激活且含 JSON-LD 的店面不需要重新上传即可在分发时被剥离，但新的确认激活会被拒绝，直到商家去掉该脚本。
