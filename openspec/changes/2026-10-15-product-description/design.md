# Design

## Context

见 `proposal.md`。商品行现在是 `title`、`status`、`cover`、`fields`。文本目录字段最长 2000 个字符，关键词用 `p.title ILIKE` 或活动文本字段的 `fields->>key`。公开页 meta description 由 `productDescription()` 用标题、价格和库存拼成，并截到 150 个字符。订单行快照有 `title_snapshot` 和 `fields_snapshot`，没有描述列。店面槽位由已发布模板声明；服务端只填已声明的槽。

未归档的 `2026-10-11-public-field-labels` 也修改「Product pages use the public query seam」。本变更的规格增量已经带上字段显示名、机器标识和槽位仍返回键这些行为。`api-driven-page-plan` 把某个目录的 `fields.description` 当成介绍，它不是生效规格，实现时不要沿用。

## Goals / Non-Goals

**Goals:**

- 描述和标题一样是商品系统字段，读写、公开 JSON、页面、Markdown、搜索和订单快照使用同一份值。
- 旧商品和旧订单不用回填。已发布且没有新槽位的店面保持原样。

**Non-Goals:**

- 不渲染 Markdown 或 HTML，不加后台表单，不按规格写描述。
- 不把描述放进首页卡片、商品列表或店铺简介。
- 不自动把已有 `fields.description` 搬进新列。

## Decisions

1. 列放在 `products.description`，可空文本。空描述在 JSON、页面和快照里都是 `null`，不写进 `fields`。
   另建目录字段会让 key 不固定，而且 `PATCH` 的 `fields` 会整份替换。系统字段和 `title`、`cover` 的省略、清空语义一致。

2. 校验放在领域层，和 `parseTitle` 并列。先去掉首尾空白，内部换行保留；空字符串、非字符串和超过 2000 个字符都是 `validation_error`。长度用现有字符串 `length`，不另算字素。`description` 加入 `systemFieldKeys`，因此写入 `fields` 或新建同名目录字段都走现有系统字段拒绝，错误码仍是 `validation_error`。

3. `PATCH` 省略 `description` 不改列；`null` 置空。省略 `fields` 仍不改自定义属性。不要为了改描述而要求重传 `fields`。

4. 关键词在现有标题和文本字段条件上增加 `p.description ILIKE`。不要求 `catalog_id`。描述不参与数字、单选或是否过滤。

5. 详情页用纯文本展示，换行保留为换行，内容转义。meta description 和 JSON-LD `description` 先把连续空白收成一个空格，再截到 150 个字符。没有描述时继续用现在的标题、价格和库存句子。Markdown 单独成段，禁止用 `oneLine`。

6. 订单行新增可空 `description_snapshot`。下单时从锁定的商品行复制；当时为空就写 `null`。不放进 `fields_snapshot`。之后改商品不影响该行。订单读模型已经返回行快照时，一并返回这个字段。

7. 内置商品页和起始店面模板增加 `product.description`。已发布模板没有这个槽位时不改写发布物，页面也不要自动补一块描述。

## Risks / Trade-offs

- [生产库已有目录字段 key `description`] → 迁移发现 `product_fields.key = 'description'` 时直接失败，不复制、不停用。先由商家导出值，再用现有字段停用流程去掉该 key，然后重新迁移。停用是破坏性变更，可能让缺值商品下架。
- [后归档 `2026-10-11-public-field-labels`] → 那份增量里的商品页要求没有描述。归档任一份时，主规格必须同时保留字段显示名和描述，不能用旧正文覆盖。
- [自定义店面看不到描述] → 这是槽位合同的结果。商家要在模板里声明 `product.description` 后重新发布。
- [2000 字对长文不够] → 与目录文本字段相同，避免两套长度。更长正文不在本变更里。

## Migration Plan

追加 `src/db/migrations/017_product_description.sql`，不改已应用的迁移。

1. 若存在 `product_fields.key = 'description'`，抛出异常并停止。
2. `products` 增加可空 `description`。
3. 订单行增加可空 `description_snapshot`。不回填。

回滚时删除这两列即可。回滚前新写入的描述会丢失；订单金额、库存和支付状态不依赖这两列。

部署后旧商品描述为 `null`，页面和上架行为与现在一致，直到商家用创建或 `PATCH` 写入描述。

## Open Questions

无。生产库是否已有 `description` 字段 key 留到实施迁移前检查，不改变上述失败策略。
