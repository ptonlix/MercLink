# 商家 Skill

这份文档公开，只讲调用方法。它不包含任何商家的商品数据，也不包含令牌。

Do not guide self-registration. Do not ask for a password, SMS code, or API key. Field changes that break compatibility need a field preview and confirmation. Unpublish, soft delete, and field retirement are different. A merchant token cannot mark an order paid or place an order. A buyer token cannot call merchant mutations. Only status `paid` means success.

## 认证

打开商家授权页 `/authorize`。只允许已开通的商家登录并批准。商家授权页没有注册。没有账号时，页面写明请联系管理员开通。

不要引导用户自助注册。不要向用户索要密码、短信验证码或 API Key。不要让用户把访问令牌或刷新令牌复制进对话。授权使用 OAuth 2.1 授权码加 PKCE，或设备码。不使用密码模式。

商家批准的权限是 `field:write`、`product:write`、`product:read`、`order:read`。这里没有访问令牌、刷新令牌或 API Key 的示例值。

## 能做什么

建目录，定义字段，做字段预览和确认，新建和编辑商品与规格，上架，下架，软删除，恢复，以及查看订单。不能修改其他商家的数据。

## 路由

```http
GET /api/v1/catalogs
POST /api/v1/catalogs
GET /api/v1/catalogs/{id}/schema
GET /api/v1/catalogs/{id}/fields
POST /api/v1/catalogs/{id}/fields
POST /api/v1/catalogs/{id}/fields/changes
GET /api/v1/catalogs/{id}/products
POST /api/v1/catalogs/{id}/products
PATCH /api/v1/catalogs/{id}/products/{product_id}
POST /api/v1/catalogs/{id}/products/{product_id}/publish
POST /api/v1/catalogs/{id}/products/{product_id}/unpublish
DELETE /api/v1/catalogs/{id}/products/{product_id}
POST /api/v1/catalogs/{id}/products/{product_id}/restore
POST /api/v1/catalogs/{id}/products/{product_id}/options
POST /api/v1/catalogs/{id}/products/{product_id}/variants
PATCH /api/v1/catalogs/{id}/variants/{variant_id}
DELETE /api/v1/catalogs/{id}/variants/{variant_id}
GET /api/v1/manage/orders
```

商家接口都要带目录 ID。令牌只能访问自己的目录。另一个商家的目录返回 not found 或 `forbidden`，并且不返回字段或商品数据。

## 目录

先列目录：`GET /api/v1/catalogs`。不是同一类商品时新建目录，不要把另一类的必填字段加进当前目录。两本目录的字段互不影响。

`POST /api/v1/catalogs`

```json
{ "name": "示例目录", "currency": "CNY" }
```

货币默认 `CNY`。`GET /api/v1/catalogs/{id}/schema` 读取当前字段定义。

## 字段预览和确认

目录字段描述整件商品。规格轴只描述可售差异。字段 key 不可改。类型是 text、number、boolean 或 single-select。

`GET /api/v1/catalogs/{id}/fields` 列出字段。`POST /api/v1/catalogs/{id}/fields` 新增字段。

```json
{ "key": "weight_g", "label": "重量", "type": "number", "required": false }
```

增加可选字段、改标签、增加单选项、把必填改为可选，会立即生效，已上架商品保持上架。

增加必填字段、把字段改成必填、删除单选项、改变类型、停用字段，都是破坏性变更。先调用 `POST /api/v1/catalogs/{id}/fields/changes` 做字段预览，不写库。确认时用同一次操作加上 `"confirm": true`。

```json
{ "op": "make_required", "key": "weight_g" }
```

预览返回是否破坏兼容、将下架的商品数和原因，此时不改数据。确认后，缺值、转换失败或仍使用已删除选项的已上架商品变为下架。

## 商品和规格

价格单位是分，必须是整数。不要换算成元。空库存表示不限。新建商品默认下架。规格默认可售。确认后再调用 publish。

没有规格差异时，价格和库存写在商品上，系统创建一条默认可售规格：

`POST /api/v1/catalogs/{id}/products`

```json
{ "title": "示例商品", "price": 159900, "stock": 10, "fields": { "weight_g": 480 } }
```

这只是请求形状，不是任何商家的商品数据。

有规格差异时，先声明规格轴，再只创建实际出售的组合。系统不会自动生成全部组合。同一商品的可售规格必须使用相同的轴。

`POST /api/v1/catalogs/{id}/products/{product_id}/options`

```json
{ "key": "size", "label": "尺码" }
```

`POST /api/v1/catalogs/{id}/products/{product_id}/variants`

```json
{ "options": { "size": "42" }, "price": 159900, "stock": 4 }
```

`PATCH /api/v1/catalogs/{id}/products/{product_id}` 编辑商品。`PATCH /api/v1/catalogs/{id}/variants/{variant_id}` 编辑规格。`DELETE /api/v1/catalogs/{id}/variants/{variant_id}` 软删除规格。恢复规格后它仍然不可售。

未知字段 key 写入时，错误码是 `unknown_field`。

## 上架、下架、软删除、字段停用

这三件事不是一回事。

- 下架 unpublish：`POST /api/v1/catalogs/{id}/products/{product_id}/unpublish`。商品留在商家正常列表，状态为 off。公开查询不再返回，规格不可购买。
- 软删除 soft delete：`DELETE /api/v1/catalogs/{id}/products/{product_id}`。正常列表看不到。公开页、购买查询和下单都视为不存在。有订单也可以软删除，订单快照还在。恢复 `POST /api/v1/catalogs/{id}/products/{product_id}/restore` 只清掉删除标记，商品仍是下架，规格不自动可售。没有物理删除。
- 字段停用 field retirement：停用的是字段，不是商品。停用后的 key 不能复用，当前商品属性去掉该 key，历史订单快照不变。购买过滤用这个 key 时错误码是 `field_retired`。

上架：`POST /api/v1/catalogs/{id}/products/{product_id}/publish`。缺少当前必填字段，或没有可售规格时，上架失败，商品保持下架。读错误体里的 `error` 和 `message`。破坏性变更确认后导致下架时，同样读这个错误体，再补齐字段后重新上架。

`GET /api/v1/catalogs/{id}/products` 可按 `status=on` 或 `status=off` 过滤。默认不返回已软删除的商品。

## 订单

`GET /api/v1/manage/orders` 只读，可按 `catalog_id` 过滤。只能看订单行属于自己目录的订单。

没有把订单标成已支付的接口。商家令牌不能把订单标成已支付，也不能下单。买家令牌不能调用商家写接口，错误码是 `forbidden`。商家令牌调用 `POST /api/v1/orders` 同样是 `forbidden`。

只有状态 `paid` 才算支付成功。打开支付链接不等于成功。
