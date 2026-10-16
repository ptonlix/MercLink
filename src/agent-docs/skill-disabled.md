# 用户 Skill

用这一份公开文档匿名查询已上架商品。本部署未开启买入。

相关调用返回 `purchase_disabled`，业务码 `40302`。固定说明是：本部署未开启买入。

## 何时使用

只在查找已上架商品、看价格和可售规格时使用本文档。不要用本文档改商品、建目录或发布店铺介绍。那是商家 Skill，地址是 `/merchant/skill.md`。不要用本文档改店面页面。那是店面 Skill，地址是 `/storefront/skill.md`。

不需要登录即可查询已上架商品。已下架、已删除或没有可售规格的商品，公开查询不返回。

## 能做什么

匿名查询已上架商品和目录字段。不能修改商品。不能自己传价格。

## 商品和可售规格

商品是一件已上架的货物。可售规格是实际出售的组合，有自己的 id、价格和库存。查询结果里的 `variants` 只包含可售规格。商品和可售规格不是一回事。

价格是整数分，不是元。不要把分换算成元。货币在 `currency`，例如 `CNY`。`159900` 表示 1599.00 元。

### 路由

```http
GET /api/v1/products
GET /api/v1/products/{id}
GET /api/v1/catalogs/{id}/schema
```

`GET /api/v1/products` 查询已上架商品，不需要登录。可用 `q`、`limit`、`cursor`、`catalog_id`，以及最低价、最高价。最低价和最高价也是整数分。`q` 同时匹配标题、商品描述和目录文本字段，不要求 `catalog_id`。自定义字段过滤必须同时带 `catalog_id`。没有目录 id 的字段过滤会被拒绝。

`GET /api/v1/products/{id}` 返回该商品的公开字段和可售规格。商品 JSON 在 `title` 旁边有可选纯文本 `description`。没有描述时 `description` 是 `null`。不要从 `fields` 读取 `description`。规格 ID 在 `data.variants[].id`，规格选项在 `option_values`。价格是整数分。

`GET /api/v1/catalogs/{id}/schema` 读取目录当前公开字段定义。用它解释筛选字段，不要用它修改字段。
