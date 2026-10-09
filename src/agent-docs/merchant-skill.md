# 商家 Skill

用这一份公开文档配置这一家店：取得商家令牌，维护目录、字段、商品、规格、封面、上下架和店铺介绍。它只讲调用方法，不包含任何商家的商品数据，也不包含令牌。

Use this document to configure the one store: obtain a merchant token, then maintain catalogs, fields, products, variants, covers, shelf status, and the public profile. It teaches the HTTP API only. It contains no merchant data and no token.

## 何时使用

用户要把商品放进这家店、改字段、上下架、查自己的订单，或发布店铺介绍时，使用本文档。

不要用本文档给买家查商品、下单或查询订单。买家读 `/skill.md`。也不要调用 `/merchants`，没有开店接口。启动时已经创建店主账号和一本名为「默认目录」的目录。店主就是管理页的同一个手机号和密码。

Do not guide self-registration. Do not ask for a password, SMS code, or API key. The store owner account already exists and is the account created at startup. Log in with that phone and password on the merchant authorization page. Do not ask the user to open another merchant account.

API 源站就是本文档的源站。`robots.txt` 禁止 `/api` 或 `/oauth` 只约束爬虫，不禁止已批准的 Agent 调用这些地址。

## 能做什么

建目录，定义字段，做字段预览和确认，新建和编辑商品与规格，上架，下架，软删除，恢复，查看订单，以及读取、保存、发布或撤回这一家店的公开介绍。不能修改其他商家的数据。

## 不要做

- 不要引导用户自助注册。不要向用户索要密码、短信验证码或 API Key。不要让用户把访问令牌或刷新令牌复制进对话。
- 不要把颜色、尺码等可售差异建成目录字段。目录字段描述整件商品，规格轴只描述可售差异。
- 不要把价格换成元、小数或字符串。调用方传整数分。
- 不要把字段预览当成失败。`data.applied` 为 `false` 时还没有写库。
- 不要把下架、软删除和字段停用当成同一件事。
- 商家令牌不能把订单标成已支付，也不能下单。买家令牌不能调用商家写接口。只有状态 `paid` 才算支付成功。
- 不要直接写对象存储。不要在上传失败后用外部图片地址凑封面。不要把私有或需要签名的地址写入 `cover`。

## 主流程

1. 用设备码取得商家访问令牌。人在浏览器登录并批准。Agent 不收集密码。
2. `GET /api/v1/catalogs`。目录 ID 在 `data.items[].id`。商品属于同一类时用已有目录，通常就是「默认目录」。
3. 需要新属性时，先加目录字段。可选字段会立即生效。必填或其它破坏性变更要先做字段预览，再确认。
4. 没有尺码、颜色等可售差异时，创建商品时写入整数分价格。系统会建一条默认可售规格。
5. 有可售差异时，创建商品不要带 `price`。先声明全部规格轴，再只创建实际出售的组合。
6. 需要封面时先上传图片。成功后只把返回的 `data.url` 写入 `cover`。上传失败就停，不要改封面。
7. 调用 publish。上架失败时商品仍是下架。
8. 店铺介绍是可选的，而且是整店一份，不是每本目录一份。

## 认证

默认使用设备码。Agent 向 `POST /oauth/device/auth` 申请短码。请求头是 `content-type: application/x-www-form-urlencoded`，不是 JSON。请求体包含 `client_id=merclink-agent` 和 scope。scope 必须包含 `field:write` 或 `product:write`，否则打开的是买家注册页，不是商家登录页。使用这一整串：

```text
scope=field:write product:write product:read order:read
```

自己保存返回的 `device_code`。只把 `user_code` 和 `verification_uri_complete` 给用户；没有完整地址时再用 `verification_uri`。不要把 `device_code` 给用户。用户在浏览器确认短码后，用启动时创建的店主账号登录并批准。商家授权页没有注册。手机号不对时，页面写明请使用店主手机号登录。如果用户打开的是买家注册页，停止这次授权，用上面的商家 scope 重新申请。

密码只由用户自己在授权页输入，Agent 不读取、不转发、不保存。首次登录时，页面会要求先修改初始密码。看到「请先修改初始密码。」时，请用户在同一页面把密码改成至少 8 位，再点「批准」。改密完成前点批准不会结束授权。不要使用公网回调地址。Agent 在内网，没有独立的公网服务。不使用密码模式。

用户操作期间，Agent 轮询 `POST /oauth/token`。同样使用 `application/x-www-form-urlencoded`。字段是 `grant_type=urn:ietf:params:oauth:grant-type:device_code`、`client_id=merclink-agent` 和保存的 `device_code`。返回 `authorization_pending` 时继续等。响应若有 `interval`，两次轮询至少间隔这么多秒。返回 `slow_down` 时再拉长间隔。短码 10 分钟后失效，失效后重新申请，不要重复提交已经确认过的短码。

商家批准的权限是 `field:write`、`product:write`、`product:read`、`order:read`。批准结果固定是这四项。这里没有访问令牌、刷新令牌或 API Key 的示例值。

访问令牌约 15 分钟。过期后用 `POST /oauth/token` 换新的，`grant_type=refresh_token`，并带原来的 `client_id` 和刷新令牌。旧刷新令牌立即失效，保存新的刷新令牌。请求已登录接口时使用 `Authorization` 头，方案是 Bearer。不要把令牌写进本文档或对话。

没有令牌时，接口返回 401，`code` 是 `40100`，并在 `WWW-Authenticate` 里指向 `/.well-known/oauth-protected-resource`。这时重新走设备码，不要向用户要令牌。

## 路由

```http
GET /api/v1/merchant/profile
PUT /api/v1/merchant/profile
GET /api/v1/store
GET /api/v1/catalogs
POST /api/v1/catalogs
GET /api/v1/catalogs/{id}/schema
GET /api/v1/catalogs/{id}/fields
POST /api/v1/catalogs/{id}/fields
POST /api/v1/catalogs/{id}/fields/changes
GET /api/v1/catalogs/{id}/products
POST /api/v1/catalogs/{id}/products
POST /api/v1/catalogs/{id}/images
PATCH /api/v1/catalogs/{id}/products/{product_id}
POST /api/v1/catalogs/{id}/products/{product_id}/publish
POST /api/v1/catalogs/{id}/products/{product_id}/unpublish
DELETE /api/v1/catalogs/{id}/products/{product_id}
POST /api/v1/catalogs/{id}/products/{product_id}/restore
POST /api/v1/catalogs/{id}/products/{product_id}/axes
POST /api/v1/catalogs/{id}/products/{product_id}/variants
PATCH /api/v1/catalogs/{id}/variants/{variant_id}
DELETE /api/v1/catalogs/{id}/variants/{variant_id}
GET /api/v1/manage/orders
```

目录接口都要带目录 ID。令牌只能访问自己的目录和自己的店铺介绍。另一个商家的目录返回 `not_found` `40400` 或 `forbidden` `40300`，并且不返回字段或商品数据。

除上传图片外，请求体是 JSON，请求头带 `content-type: application/json`。资源 ID 从 `data` 读取：目录是 `cat_`，商品是 `prd_`，规格是 `var_`，图片是 `img_`。不要猜 ID，也不要把名称当成 ID。

## 怎么读响应

`/api/v1` 的 JSON 响应一律是 `{ "code", "message", "data", "timestamp", "request_id" }`。目录、商品、规格、订单和店铺字段都在 `data` 里。比较数字 `code`，不要根据 `message` 分支，也不要读顶层 `error`。成功时 `code` 是 `200`，`message` 是 `成功`。创建资源时 HTTP 状态可以是 201，body 的 `code` 仍是 `200`。失败时 `data` 是 `null`，HTTP 状态不是 200。

字段预览是例外：破坏性变更未确认时，HTTP 状态仍可能是 200 或 201，`code` 仍是 `200`，但 `data.applied` 是 `false`。这不是失败，也还没有写库。先读 `data.breaking`、`data.affected_count` 和 `data.affected`。

商品列表的 `data` 是 `{ "items", "next_cursor" }`。目录列表、字段列表和订单列表的 `data` 只有 `items`，不要等 `next_cursor`。支付通知响应是纯文本 `success` 或 `fail`，不是这层 JSON 外壳。

## 店铺介绍

这一家店只有一份公开介绍，不是每本目录一份。用已有的商家访问令牌调用下面两个方法。不要在示例或请求里填写真实令牌。

`GET /api/v1/merchant/profile` 读取自己的介绍，没有请求体。还没有保存时返回空草稿，不是 404。空草稿的 `published` 是 `false`。

`PUT /api/v1/merchant/profile` 整份替换，正文必须是 `application/json`，并且令牌要有 `product:write`。七个字段必须全部出现，不能多也不能少：`display_name`、`summary`、`website_url`、`logo_url`、`area_served`、`address`、`published`。空值用 `null`，不要省略。介绍必须是纯文本，不能包含 HTML 或 Markdown。

```json
{
  "display_name": "示例商店",
  "summary": "一段虚构简介，说明这家店卖什么。不是任何已保存的商家介绍。",
  "website_url": "https://example.com",
  "logo_url": null,
  "area_served": "示例城市",
  "address": null,
  "published": false
}
```

这只是请求形状，不是任何商家已保存的介绍。展示名不超过 40 个字符，简介不超过 300 个字符。发布时展示名和简介都不能为空。网站和标识必须是不超过 200 个字符的 http 或 https 地址，或者 `null`。标识不是上传接口的返回值专用字段；上传接口只用于商品和规格封面。

只有 `published` 为 `true` 时，落地页和公开接口才会显示这份介绍。把 `published` 改为 `false` 后，落地页立即不再显示。

不要把登录手机号、密码、短信验证码或 API Key 提交为公开资料。不要把登录手机号写进 `website_url`、`summary` 或其他字段。

公开读取是 `GET /api/v1/store`，不需要令牌。未发布、已撤回或商家停用时，它返回 `not_found`，不回显草稿。

## 目录

先列目录：`GET /api/v1/catalogs`。从 `data.items` 里选择 `id`。不是同一类商品时新建目录，不要把另一类的必填字段加进当前目录。两本目录的字段互不影响。

`POST /api/v1/catalogs`

```json
{ "name": "示例目录", "currency": "CNY" }
```

货币默认 `CNY`，必须是三位字母代码。名称不能为空，且不超过 80 个字符。创建成功后从 `data.id` 读取新目录 ID。

`GET /api/v1/catalogs/{id}/schema` 读取当前字段定义，买家和商家都可以调用。商家管理时也可以用 `GET /api/v1/catalogs/{id}/fields`。字段在 `data.items` 或 schema 的 `data.fields`，包含 `key`、`label`、`type`、`required`、`choices` 和 `status`。

## 字段预览和确认

目录字段描述整件商品。自定义商品值叫 `fields`。规格轴只描述可售差异，创建路径是 `/axes`。字段 key 不可改。类型是 text、number、boolean 或 single-select。单选允许值叫 `choices`，不是规格轴，也不是规格组合。不要使用另一个常见名字来表示选项或规格组合。

key 以小写英文字母开头，后面只能是小写英文、数字和下划线，总长度不超过 64。不能使用系统字段 `title`、`status`、`cover`、`price`、`stock`、`currency`。停用过的 key 不能再用。名称不超过 80 个字符。单选至少要有一个选项，其它类型不要带 `choices`。

`GET /api/v1/catalogs/{id}/fields` 列出字段。`POST /api/v1/catalogs/{id}/fields` 新增字段。

```json
{ "key": "weight_g", "label": "重量", "type": "number", "required": false }
```

```json
{
  "key": "color",
  "label": "颜色",
  "type": "single-select",
  "required": false,
  "choices": ["黑", "白"]
}
```

增加可选字段、改标签、增加单选项、把必填改为可选，会立即生效，已上架商品保持上架。

增加必填字段、把字段改成必填、删除单选项、改变类型、停用字段，都是破坏性变更。先调用 `POST /api/v1/catalogs/{id}/fields/changes` 做字段预览，不写库。新增必填字段时，`POST /api/v1/catalogs/{id}/fields` 不带确认也同样只返回预览。HTTP 201 不能当成已经创建。确认时用同一次操作加上 `"confirm": true`。

```json
{ "op": "make_required", "key": "weight_g" }
```

确认时：

```json
{ "op": "make_required", "key": "weight_g", "confirm": true }
```

预览返回是否破坏兼容、将下架的商品数和原因，此时不改数据。`data.applied` 为 `false` 时，把 `data.affected` 里的 `product_id` 和 `reason` 告诉用户。用户同意后才发送 `confirm: true`。确认后，缺值、转换失败或仍使用已删除选项的已上架商品变为下架。`data.applied` 为 `true` 才表示已经写入。

已有字段的变更使用 `POST /api/v1/catalogs/{id}/fields/changes`，一次只做一种 `op`：

- `rename_label`：`{ "op": "rename_label", "key": "weight_g", "label": "克重" }`
- `add_choice`：`{ "op": "add_choice", "key": "color", "choice": "灰" }`
- `remove_choice`：`{ "op": "remove_choice", "key": "color", "choice": "白" }`。这是破坏性变更。
- `change_type`：`{ "op": "change_type", "key": "weight_g", "type": "text", "choices": [] }`。这是破坏性变更。改成 single-select 时必须带 `choices`。
- `make_optional`：`{ "op": "make_optional", "key": "weight_g" }`
- `retire`：`{ "op": "retire", "key": "weight_g" }`。这是字段停用，也是破坏性变更。

没有 `rename_key`。创建后不能修改字段 key。

## 商品和规格

价格单位是分，必须是非负整数。不要换算后再传元，也不要传小数或字符串。`159900` 表示 1599.00 元，`1990` 表示 19.90 元。空库存表示不限，用 `null`。新建商品默认下架。规格默认可售。确认后再调用 publish。

商品自定义值放在 `fields`。数字字段传 JSON 数字，是否字段传布尔值，单选值必须是已声明的选项字符串。`price` 和 `stock` 不能放进 `fields`。`PATCH` 商品时，`fields` 会替换整份已保存的属性；省略的 key 会被去掉。只改一个属性时，也要带上仍需保留的全部 key。

封面先上传图片，再改商品。Agent 不直接写对象存储。`POST /api/v1/catalogs/{id}/images` 使用 `multipart/form-data`，文件字段名是 `file`。不要用 JSON 或 base64。只接受 JPEG、PNG 或 WebP，最大 5 MiB。同一商家 60 秒内最多 30 次。成功时 HTTP 201，绝对地址在 `data.url`，路径是本站 `/media/{id}`。只把这个 `data.url` 写入商品或规格的 `cover`。

上传返回 `dependency_unavailable` `50301` 时停止。不要把外部地址、生成图地址或本地文件写进 `cover`，也不要改这一次的商品封面。上传过于频繁时 `code` 是 `42900`（`rate_limited`），同样不要改封面。

只有用户明确给出一个匿名浏览器不带登录、签名或 Cookie 就能打开的 http(s) 图片地址时，才可以把该地址写入 `cover`。返回 403、需要签名或位于私有桶的地址不能当封面。上传失败不是改用外部地址的理由。

没有规格差异时，价格和库存写在商品上，系统创建一条默认可售规格：

`POST /api/v1/catalogs/{id}/products`

```json
{ "title": "示例商品", "price": 159900, "stock": 10, "fields": { "weight_g": 480 } }
```

这只是请求形状，不是任何商家的商品数据。商品 ID 在 `data.id`，默认可售规格 ID 在 `data.variants[].id`。之后不要再给这个商品声明规格轴，除非先把这条无轴规格改成不可售。

有规格差异时，创建商品不要带 `price`、`stock` 或 `sku`。先声明全部规格轴，再只创建实际出售的组合。系统不会自动生成全部组合。已经创建带轴的规格组合后，不能再增加规格轴，所以要先声明全部轴。同一商品的可售规格必须使用相同的轴。

`POST /api/v1/catalogs/{id}/products`

```json
{ "title": "示例商品", "fields": { "weight_g": 480 } }
```

`POST /api/v1/catalogs/{id}/products/{product_id}/axes`

```json
{ "key": "size", "label": "尺码" }
```

规格轴 key 的规则和目录字段 key 相同，也不能使用系统字段名。一次声明一条轴。全部轴都声明后，再创建组合。

`POST /api/v1/catalogs/{id}/products/{product_id}/variants`

```json
{ "option_values": { "size": "42" }, "price": 159900, "stock": 4 }
```

规格 ID 在 `data.variants` 里对应组合的 `id`。不要传另一组常见的组合字段名。

`PATCH /api/v1/catalogs/{id}/products/{product_id}` 只能编辑商品名、封面和 `fields`，不能改价格。`PATCH /api/v1/catalogs/{id}/variants/{variant_id}` 编辑规格价格、库存、SKU、封面和状态。状态只能是 `on` 或 `off`。`DELETE /api/v1/catalogs/{id}/variants/{variant_id}` 软删除规格。恢复规格使用：

```json
{ "restore": true }
```

恢复规格后它仍然不可售。需要出售时再发送 `{ "status": "on" }`。不要在同一次恢复请求里期待它变成可售。

未知字段 key 写入时，`code` 是 `40001`（`unknown_field`）。

## 上架、下架、软删除、字段停用

这三件事不是一回事。

- 下架 unpublish：`POST /api/v1/catalogs/{id}/products/{product_id}/unpublish`。商品留在商家正常列表，状态为 off。公开查询不再返回，规格不可购买。
- 软删除 soft delete：`DELETE /api/v1/catalogs/{id}/products/{product_id}`。正常列表看不到。公开页、购买查询和下单都视为不存在。有订单也可以软删除，订单快照还在。恢复 `POST /api/v1/catalogs/{id}/products/{product_id}/restore` 只清掉删除标记，商品仍是下架，规格不自动可售。没有物理删除。要再次出售，先让至少一条规格变为 `on`，再 publish。
- 字段停用 field retirement：停用的是字段，不是商品。停用后的 key 不能复用，当前商品属性去掉该 key，历史订单快照不变。购买过滤用这个 key 时 `code` 是 `40002`（`field_retired`）。

上架：`POST /api/v1/catalogs/{id}/products/{product_id}/publish`。缺少当前必填字段，或没有可售规格时，上架失败，商品保持下架。已有规格轴时，无轴默认规格如果仍可售，上架也会失败；先把它 `PATCH` 为 `{ "status": "off" }`。上架失败时从响应外壳读 `code` 和 `message`，资源不在顶层。破坏性变更确认后导致下架时，同样读这个外壳，再补齐字段后重新上架。

`GET /api/v1/catalogs/{id}/products` 可按 `status=on` 或 `status=off` 过滤。默认不返回已软删除的商品。要看已删除商品，加 `deleted=true`。继续翻页时使用返回的 `next_cursor`。

## 订单

`GET /api/v1/manage/orders` 只读，可按 `catalog_id` 过滤。只能看订单行属于自己目录的订单。结果在 `data.items`。订单状态只有 `pending`、`paid`、`closed`。金额是整数分。

没有把订单标成已支付的接口。商家令牌不能把订单标成已支付，也不能下单。买家令牌不能调用商家写接口，`code` 是 `40300`（`forbidden`）。商家令牌调用 `POST /api/v1/orders` 同样是 `40300`。

只有状态 `paid` 才算支付成功。打开支付链接不等于成功。已关闭订单上的未履约收款不是成功。

未履约收款用 `POST /api/v1/manage/payments/{paymentId}/unapplied-receipt` 处理。只能处理订单行属于自己目录、状态为 `open` 或 `refund_failed` 的收款。正文只接受 `action`，取值为 `fulfill_manually` 或 `refund`。手工补发和易支付原额退款都不会把订单标成已支付，也不改库存。The merchant may choose manual fulfillment or a full EasyPay refund. Neither action marks the order paid.

```json
{ "action": "fulfill_manually" }
```

```json
{ "action": "refund" }
```

`refund` 只对易支付、只退收款原金额。退款失败时收款变为 `refund_failed`，`code` 是 `50300`（`payment_retryable`）。已补发或已退款再处理时 `code` 是 `40900`（`conflict`）。订单读取里的 `unapplied_receipt` 带 `failure_reason`，没有失败原因时为 `null`。

## 常见错误用法

- 只申请 `order:read` 或 `order:write`，会打开买家注册页。停下来，用商家 scope 重新申请。
- 把「请先修改初始密码。」理解成向用户索要密码。密码只在授权页由人自己输入。
- 用商品名、目录名或自己编的 ID 调用后续接口。只使用响应 `data` 里的 ID。
- 把 `1599.00` 或 `1599` 元传成价格。`159900` 才表示 1599.00 元。
- 把颜色放进 `fields`，或把规格组合写成 `options`。可售差异用 `/axes` 和 `option_values`。
- 看到 HTTP 200 或 201 就继续下一步。字段预览要先看 `data.applied`。
- 恢复商品后立刻认为可以购买。恢复后仍是下架，规格也不可售，需要再打开规格并 publish。
- 用商家令牌调用 `POST /api/v1/orders`，或把打开支付链接当成已支付。
- 上传失败后把别的 HTTPS 地址写进 `cover`。`50301` 时停下来，封面保持原样。

## 错误

常量名只是说明。比较数字 `code`。

- `validation_error` `40000`
- `unknown_field` `40001`
- `field_retired` `40002`
- `variant_required` `40004`
- `unauthorized` `40100`
- `forbidden` `40300`
- `not_found` `40400`
- `conflict` `40900`
- `insufficient_stock` `40901`
- `rate_limited` `42900`
- `dependency_unavailable` `50301`
