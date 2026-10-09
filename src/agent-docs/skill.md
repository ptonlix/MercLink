# 买家 Skill

用这一份公开文档代表买家使用这一家店：查询已上架商品，比较可售规格，创建订单，把支付交给付款人，再查询自己的订单。购买只是其中一步。未登录可以查询。下单和查询自己的订单前，用设备码让用户在浏览器里注册或批准。

Use this document for the buyer side of the store: query published products, compare sellable variants, place an order, hand payment to the payer, and look up the buyer's own orders. Buying is one step, not the whole skill.

## 何时使用

用户要找商品、看价格和库存、下单、付款或查询自己的订单时，使用本文档。

不要用本文档改商品、建目录或发布店铺介绍。那是商家 Skill，地址是 `/merchant/skill.md`。未登录可以查询已上架商品。已下架、已删除或没有可售规格的商品，公开查询不返回。

Do not ask the user for a password, SMS code, or API key. Use the device authorization grant. Do not use a public callback URL.

## 能做什么

查询已上架商品和目录字段，创建一笔只有一行的订单，打开支付动作，查询自己的订单状态。不能修改商品，不能自己传价格，不能看别人的订单。

## 不要做

- 不要向用户索要密码、短信验证码或 API Key。不要让用户把访问令牌或刷新令牌复制进对话。
- 不要把商品和可售规格当成同一个 ID。下单必须用规格 ID，字段是 `variant_id`。只有该商品恰好有一条可售规格时，才可以只传商品 ID。
- 不要自己传价格。价格是整数分，不是元。
- 不要只为了换渠道而新开一个 `client_order_no`。重复同一个 `client_order_no` 不会切换渠道。
- 不要向用户索要支付宝密码。打开 `payment.action` 不等于支付成功。只有状态 `paid` 才算支付成功。已关闭订单上的未履约收款不是成功。不要支付已关闭订单的旧链接。

## 主流程

1. 未登录调用 `GET /api/v1/products` 找到已上架商品。需要字段含义时，再读 `GET /api/v1/catalogs/{id}/schema`。
2. 用 `GET /api/v1/products/{id}` 确认可售规格。有多条规格时，让用户选定一条，记下 `variants[].id`。
3. 需要下单时，用设备码让用户在浏览器注册或批准。Agent 不收集验证码或密码。
4. 第一次下单就带上正确的 `payment_channel`。手机付款人，包括能做 HTTPS 跳转的 Agent 内置页，传 `mobile`。电脑付款人可以不传，缺省渠道是电脑收银台。买家不选择支付实现。支付实现由服务端启动配置固定。`payment_channel` 只选择电脑或手机。
5. 用顶层导航打开完整的 `payment.action`。不要放进 iframe，也不要截断 URL。
6. 用保存的访问令牌调用 `GET /api/v1/orders/{id}` 查询状态。请求头是 `Authorization: Bearer` 加上这枚令牌。只有 `paid` 才告诉用户支付成功。

## 认证

未登录可以查询已上架商品。没有令牌就下单时，接口返回 401，并在 `WWW-Authenticate` 里指向 `/.well-known/oauth-protected-resource`。

默认使用设备码。Agent 向 `POST /oauth/device/auth` 申请短码。请求头是 `content-type: application/x-www-form-urlencoded`，不是 JSON。请求体包含 `client_id=merclink-agent` 和所需 scope。买家使用这一整串：

```text
scope=order:write order:read
```

不要申请 `field:write` 或 `product:write`。那会打开商家登录页，而不是买家注册页。

自己保存返回的 `device_code`，只把 `user_code` 和 `verification_uri` 或 `verification_uri_complete` 给用户。用户在自己的浏览器打开该地址，确认短码，没有账号就在随后的页面注册，已有账号则登录并批准。Agent 不收集验证码或密码。

用户完成后，Agent 轮询 `POST /oauth/token`，`grant_type` 为 `urn:ietf:params:oauth:grant-type:device_code`，并带 `client_id=merclink-agent` 和保存的 `device_code`。返回 `authorization_pending` 时继续等。响应若有 `interval`，两次轮询至少间隔这么多秒。短码几分钟后失效，失效后重新申请，不要重复提交已经确认过的短码。买家批准的权限是 `order:write` 和 `order:read`。

不要使用公网回调地址，也不要使用授权码重定向。Agent 在内网，没有独立的公网服务。不使用密码模式，不使用隐式模式。这里没有访问令牌、刷新令牌或 API Key 的示例值。

换到令牌后，Agent 自己保存 `access_token` 和 `refresh_token`。不要给用户，不要写进对话，也不要只留在当次命令的临时变量里。Save the access token and refresh token in the agent's own secret store. Do not ask the user to paste either token back.

`POST /api/v1/orders` 和之后的 `GET /api/v1/orders/{id}` 使用同一个访问令牌。Reuse the same access token for order placement and later order lookup.

访问令牌约 15 分钟。过期后用 `POST /oauth/token` 换新的，`grant_type=refresh_token`，并带原来的 `client_id` 和保存的刷新令牌。旧刷新令牌立即失效，保存新的一对令牌。刷新令牌也没有时，才重新申请设备码。

请求已登录接口时使用 `Authorization` 头，方案是 Bearer。不要把令牌写进本文档或对话。没有这个头时，接口返回 401，`code` 是 `40100`。这只表示这次请求没带令牌。手里还有访问令牌或刷新令牌时，不要重新申请设备码，也不要向用户要令牌。

## 商品和可售规格

商品是一件已上架的货物。可售规格是实际出售的组合，有自己的 id、价格、库存和选项。查询结果里的 `variants` 只包含可售规格。商品和可售规格不是一回事。

价格是整数分，不是元。不要把分换算成元。货币在 `currency`，例如 `CNY`。`159900` 表示 1599.00 元。

### 路由

```http
GET /api/v1/products
GET /api/v1/products/{id}
GET /api/v1/catalogs/{id}/schema
POST /api/v1/orders
GET /api/v1/orders/{id}
```

`GET /api/v1/products` 查询已上架商品，不需要登录。可用 `q`、`limit`、`cursor`、`catalog_id`，以及最低价、最高价。最低价和最高价也是整数分。自定义字段过滤必须同时带 `catalog_id`，例如 `field.weight_g.lte=500`。没有目录 id 的字段过滤会被拒绝。字段不存在时 `code` 是 `40001`（`unknown_field`）。已停用字段的 `code` 是 `40002`（`field_retired`），不是 `unknown_field`。

`GET /api/v1/products/{id}` 返回该商品的公开字段和可售规格。规格 ID 在 `data.variants[].id`，规格选项在 `option_values`。

`GET /api/v1/catalogs/{id}/schema` 读取目录当前公开字段定义。买家和商家都可以调用。用它解释筛选字段，不要用它修改字段。

## 下单

下单必须用规格 ID，字段是 `variant_id`。只有该商品恰好有一条可售规格时，才可以只传商品 ID。有多条可售规格却只传商品 ID 时，`code` 是 `40004`（`variant_required`），不会创建订单。

不要自己传价格。服务端按规格单价乘数量计算行金额，调用方改不了价。`items` 只能有一项。多于一项时 `code` 是 `40003`（`too_many_items`）。

`client_order_no` 是幂等业务单号。同一买家重复提交同一个 `client_order_no`，返回原订单，不会再次扣库存。

`POST /api/v1/orders`

```json
{
  "client_order_no": "agent-20260516-001",
  "items": [{ "variant_id": "var_example", "qty": 1 }]
}
```

手机付款人，包括能做 HTTPS 跳转的 Agent 内置页，必须在第一次下单请求里传 `payment_channel` 为 `mobile`。On a phone, including an agent built-in page that can navigate, send `payment_channel` `mobile` on the first order request.

```json
{
  "client_order_no": "agent-20260516-002",
  "payment_channel": "mobile",
  "items": [{ "variant_id": "var_example", "qty": 1 }]
}
```

电脑付款人可以不传 `payment_channel`。缺省渠道是电脑收银台。The default channel is the PC cashier.

返回的 `amount` 和行金额都是分。`payment.channel` 是已保存的渠道。`payment.action` 是完整的 `https` URL。用顶层导航打开整段 URL，不要放进 iframe，也不要截断或改写。Open the complete `payment.action` URL with top-level navigation rather than an iframe or a truncated URL. 打开 `payment.action` 不等于支付成功。不要向用户索要支付宝密码。Do not ask for an Alipay password.

重复同一个 `client_order_no` 不会切换渠道。Repeating `client_order_no` does not switch channel. 不要只为了换渠道而新开一个 `client_order_no`，那会再扣库存。A new `client_order_no` must not be used only to switch channel.

支付创建失败且可以重试时，`code` 是 `50300`（`payment_retryable`），订单保持 `pending`。用同一个 `client_order_no` 重试，不要新开一笔。

## 查询订单状态

`GET /api/v1/orders/{id}` 查询订单状态。请求带保存的访问令牌。买家只能看自己的订单。订单 ID 从下单响应的 `data.id` 读取。

订单状态只有 `pending`、`paid`、`closed`。只有状态 `paid` 才算支付成功。`pending` 是尚未支付。`closed` 是已关闭。不要把未支付当成成功。已关闭订单上的未履约收款不是成功。A closed order with an unapplied receipt is not success. 不要支付已关闭订单的旧链接。Do not pay a closed order's old link.

买家不选择支付实现。支付实现由服务端启动配置固定，请求里不要传 `payment_provider`。The buyer does not choose the payment provider. The provider is fixed by server startup configuration. `payment_channel` 只选择电脑或手机，不选择支付实现。`payment_channel` only chooses desktop or mobile.

## 限制

不能查询已下架商品。不能修改商品。不能自己传价格。不能把未支付当成成功。商家令牌调用下单时，`code` 是 `40300`（`forbidden`）。

## 怎么读响应

`/api/v1` 的 JSON 响应一律是 `{ "code", "message", "data", "timestamp", "request_id" }`。资源字段只从 `data` 读，不要读顶层 `error`，也不要把 `id` 或 `items` 和 `code` 并列。列表的 `data` 仍是 `{ "items", "next_cursor" }`，没有 `pageNum`。

比较数字 `code`，不要根据 `message` 分支。成功时 `code` 是 `200`，`message` 是 `成功`。创建资源时 HTTP 状态可以是 201，body 的 `code` 仍是 `200`。失败时 HTTP 状态不是 200，`data` 是 `null`。支付通知响应是纯文本 `success` 或 `fail`，不是这层 JSON 外壳。

## 常见错误用法

- 还没登录就下单，然后向用户要令牌。应走设备码，让用户在浏览器注册或批准。
- 申请了商家 scope，把用户送进商家登录页。买家只用 `order:write order:read`。
- 商品有多条可售规格，却只传商品 ID。先选定 `variant_id`。
- 把 `1599` 元传成价格，或在请求里自己加 `price`。服务端不接受调用方价格。
- 手机付款人第一次没传 `payment_channel`，之后用新的 `client_order_no` 再下一单。那会再扣库存，也不会切换原来的渠道。
- 把 `payment.action` 放进 iframe、截断 URL，或向用户要支付宝密码。
- 打开支付链接后告诉用户已经支付。必须查到状态 `paid`。
- 下单后丢掉访问令牌，查单时不带 `Authorization`，再把 `40100` 当成需要重新设备码授权。应保存令牌并在查单时带上。过期则刷新，不要向用户要令牌。

## 错误

常量名只是说明。线上比较的是数字 `code`。

- 商品不存在：`not_found` `40400`
- 已下架：`not_found` `40400`。已下架、已删除或没有可售规格的商品，公开查询不返回。
- 库存不足：`insufficient_stock` `40901`
- 未带令牌或凭证被拒绝：`unauthorized` `40100`。没有 `Authorization` 头时表示这次请求没带令牌。Key 无效：invalid key 指无效的 API Key 或被拒绝的凭证，不是字段 key。手里还有令牌时不要重新申请设备码。
- 字段不存在：`unknown_field` `40001`
- 已停用字段：`field_retired` `40002`
- 必须指定规格：`variant_required` `40004`
- 多于一项：`too_many_items` `40003`
- 支付可重试：`payment_retryable` `50300`
- 权限不足：`forbidden` `40300`
- 请求无效：`validation_error` `40000`
- 冲突：`conflict` `40900`
