# Proposal

## Why

商品只有标题、状态和封面。公开页上的说明是用标题、价格和库存拼出来的，商家不能写一段给买家看的商品描述。目录文本字段可以凑合存放，但要每本目录单独定义，页面也只把它当成一行属性，不能当固定的商品正文。

## What Changes

- 商品增加可选系统字段 `description`。纯文本，去掉首尾空白，保留内部换行，1 到 2000 个字符。空着仍可上架。
- 创建和 `PATCH` 商品都可以写它。省略表示不改；`null` 表示清空。不能放进 `fields`。
- `description` 成为保留系统字段名。商家不能新建、停用或复用这个 key。**BREAKING**：已经把 `description` 用作目录字段 key 的目录，不能在未处理该 key 时直接套用本变更。
- 公开详情页在标题和价格下单独展示这段文字。没有描述就不留空块。首页卡片和商品列表仍只显示封面、标题和价格。
- 有描述时，商品页 meta description 和 JSON-LD `description` 用它截到 150 个字符。没有描述时仍用标题、价格和库存状态。不另存 SEO 文案。
- 商品 Markdown 保留换行。关键词搜索同时匹配标题、这段描述和目录文本字段。
- 新订单行保存 `description_snapshot`。旧订单行保持为空，不回填。之后修改描述不改历史订单。
- 商家 Skill 和买家 Skill 说明这个字段的读写和展示。店面增加槽位 `product.description`；已发布且未使用该槽位的自定义店面不会自动出现这段文字。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `catalog-schema`：`description` 是不可删除的商品系统字段，不能当作目录字段 key。
- `product-variants`：创建和编辑商品可以读写描述；上架不要求填写描述。
- `product-query`：公开和商家商品 JSON 返回 `description`；无目录关键词同时匹配描述。
- `public-pages`：详情页、Markdown、meta description 和 JSON-LD 使用这段描述；列表和首页卡片不使用。
- `order-placement`：订单行快照增加下单时的描述。
- `agent-skills`：两份 Skill 说明描述的请求字段、清空方式和页面事实。

## Impact

- 商品表新增可空列，订单行新增可空快照列。只追加迁移。
- 商品创建、商品编辑、公开查询、商家查询、下单、内置商品页、商品 Markdown 和店面槽位。
- `/skill.md`、`/merchant/skill.md` 和对应测试。不新增路由、错误码或依赖。
- 未归档的 `2026-10-11-public-field-labels` 也改「商品页使用公开查询缝」这一条。本变更的规格增量必须保留字段显示名行为，避免归档时互相覆盖。
