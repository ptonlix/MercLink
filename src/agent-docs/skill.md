# 购买 Skill

这份文档公开。未登录可以查询已上架商品。下单和查询自己的订单前，用设备码让用户在浏览器里注册或批准。

Do not ask the user for a password, SMS code, or API key. Use the device authorization grant. Do not use a public callback URL. Query published products without login. A product is not a sellable variant. Order by variant id, or by product id only when one sellable variant exists. Price is in minor units. `client_order_no` is idempotent. Use `payment.action` to pay, then look up order status. Only status `paid` means success.

## 不要索要凭证

不要向用户索要密码、短信验证码或 API Key。不要让用户把访问令牌或刷新令牌复制进对话。不要使用公网回调地址，也不要使用授权码重定向。Agent 在内网，没有独立的公网服务。不使用密码模式，不使用隐式模式。这里没有访问令牌、刷新令牌或 API Key 的示例值。

## 注册和批准

未登录可以查询已上架商品。没有令牌就下单时，接口返回 401，并在 `WWW-Authenticate` 里指向 `/.well-known/oauth-protected-resource`。

默认使用设备码。Agent 向 `POST /oauth/device/auth` 申请短码，请求体包含 `client_id=merclink-agent` 和所需 scope。自己保存返回的 `device_code`，只把 `user_code` 和 `verification_uri` 或 `verification_uri_complete` 给用户。用户在自己的浏览器打开该地址，确认短码，没有账号就在随后的页面注册，已有账号则登录并批准。Agent 不收集验证码或密码。

用户完成后，Agent 轮询 `POST /oauth/token`，`grant_type` 为 `urn:ietf:params:oauth:grant-type:device_code`。返回 `authorization_pending` 时继续等。短码几分钟后失效，失效后重新申请，不要重复提交已经确认过的短码。买家批准的权限是 `order:write` 和 `order:read`。

访问令牌约 15 分钟。过期后用刷新令牌换新的，旧刷新令牌立即失效。请求已登录接口时使用 `Authorization` 头，不要把令牌写进本文档或对话。

## 商品和可售规格

商品是一件已上架的货物。可售规格是实际出售的组合，有自己的 id、价格、库存和选项。查询结果里的 `variants` 只包含可售规格。商品和可售规格不是一回事。

价格是整数分，不是元。不要把分换算成元。货币在 `currency`，例如 `CNY`。

### 路由

```http
GET /api/v1/products
GET /api/v1/products/{id}
GET /api/v1/catalogs/{id}/schema
POST /api/v1/orders
GET /api/v1/orders/{id}
```

`GET /api/v1/products` 查询已上架商品，不需要登录。可用 `q`、`limit`、`cursor`、`catalog_id`，以及最低价、最高价。自定义字段过滤必须同时带 `catalog_id`，例如 `field.weight_g.lte=500`。没有目录 id 的字段过滤会被拒绝。字段不存在时错误码是 `unknown_field`。已停用字段的错误码是 `field_retired`，不是 `unknown_field`。

`GET /api/v1/products/{id}` 返回该商品的公开字段和可售规格。

`GET /api/v1/catalogs/{id}/schema` 读取目录当前公开字段定义。买家和商家都可以调用。

## 下单

下单必须用规格 ID，字段是 `variant_id`。只有该商品恰好有一条可售规格时，才可以只传商品 ID。有多条可售规格却只传商品 ID 时，错误码是 `variant_required`，不会创建订单。

不要自己传价格。服务端按规格单价乘数量计算行金额，调用方改不了价。`items` 只能有一项。多于一项时错误码是 `too_many_items`。

`client_order_no` 是幂等业务单号。同一买家重复提交同一个 `client_order_no`，返回原订单，不会再次扣库存。

`POST /api/v1/orders`

```json
{
  "client_order_no": "agent-20260516-001",
  "items": [{ "variant_id": "var_example", "qty": 1 }]
}
```

返回的 `amount` 和行金额都是分。`payment.action` 是交给付款人完成支付的链接或参数。打开 `payment.action` 不等于支付成功。支付创建失败且可以重试时，错误码是 `payment_retryable`，订单保持 `pending`。

## 查询订单状态

`GET /api/v1/orders/{id}` 查询订单状态。买家只能看自己的订单。

订单状态只有 `pending`、`paid`、`closed`。只有状态 `paid` 才算支付成功。`pending` 是尚未支付。`closed` 是已关闭。不要把未支付当成成功。

## 限制

不能查询已下架商品。不能修改商品。不能自己传价格。不能把未支付当成成功。商家令牌调用下单时，错误码是 `forbidden`。

## 错误

错误体是 `{ "error": "<code>", "message": "<可读说明>" }`。

- 商品不存在：`not_found`
- 已下架：`not_found`。已下架、已删除或没有可售规格的商品，公开查询不返回。
- 库存不足：`insufficient_stock`
- Key 无效：`unauthorized`。invalid key 指无效的 API Key 或被拒绝的凭证，不是字段 key。
- 字段不存在：`unknown_field`
- 权限不足：`forbidden`
