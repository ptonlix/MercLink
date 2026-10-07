# Proposal

## Why

商家 Agent 要能分开建目录、定义字段、创建规格并上架。这是购买查询和公开页面的数据来源，必须在不依赖订单和授权服务器实现的前提下独立验收。

## What Changes

- 提供多目录、当前字段定义、字段变更预览和确认、商品、规格轴和可售规格。
- 实现上架、下架、软删除和恢复，以及公开与商家两种可见范围。
- 公开查询只返回已上架且至少有一个可售规格的商品；自定义字段过滤必须指定目录。
- 向平台接缝注册可售规格锁定和公开商品查询，供订单和页面切片调用。
- 不实现支付、买家注册、落地页文案或 Skill 正文。

## Capabilities

### New Capabilities

- `catalog-schema`: 目录、字段、变更记录和破坏性变更。
- `product-variants`: 商品、规格轴、规格、上下架、软删除和恢复。
- `product-query`: 公开查询、商家查询和字段过滤错误。

### Modified Capabilities

- 无。

## Impact

- 独占 `src/domain/catalog`、目录应用服务、`030_catalog.sql`、`/api/v1/catalogs` 和 `/api/v1/products`。
- 认证结果来自平台 Actor 接缝的测试替身或已注册实现，不直接依赖 OAuth 库。
- 订单切片通过可售规格接缝扣库存；本切片不写入 `orders` 或 `payments`。
