# 前端接口对接指南

核对日期：2026-10-09。本文整理当前实现，供页面设计和联调使用，不新增接口或改变生效规格。业务路径以 [api-routes.ts](../src/shared/api-routes.ts) 为准，权限、字段和返回值已与路由及应用服务核对。

## 1. 先按页面看能力

当前前端和后端在同一个 Next.js 进程中，本地地址为 `http://127.0.0.1:3000`。业务路径注册表共 **28 个“方法 + 路径”**，此外还有 OAuth、登录表单、API Key、图片读取等辅助路由。

| 页面或操作             | 对接能力                                          | 当前条件                                 |
| ---------------------- | ------------------------------------------------- | ---------------------------------------- |
| 店铺首页               | 店铺介绍 + 已上架商品列表；商品封面可组成轮播展示 | 匿名可读；没有独立 Banner 配置接口       |
| 商品列表、搜索、筛选   | 商品列表 + 目录字段 Schema                        | 匿名可读；游标分页，没有总条数           |
| 商品详情               | 公开商品详情 + 目录字段 Schema + 图片读取         | 匿名可读；下架商品返回 404               |
| 店铺介绍编辑           | 店主资料读取、保存、发布/撤回                     | 商家 Bearer 令牌                         |
| 商品管理、商品编辑     | 目录、字段、商品、规格、图片上传、上下架、回收站  | API 能力已具备；当前没有人工商品管理页面 |
| 登录、注册、授权       | 已有服务端 HTML 页面和表单 + OAuth 设备码流程     | 登录 Cookie 与 API Bearer 令牌分别使用   |
| 下单、收银台、订单结果 | 创建订单、取得支付链接、查询本人订单              | 买家 OAuth 令牌；一笔订单只接受一行      |
| 店主订单列表           | 查询自己目录内的订单                              | 商家 OAuth 令牌；目前没有分页和状态筛选  |
| 买家“我的订单”列表     | 暂无列表接口                                      | 只能根据已知订单 ID 查询单笔订单         |

PRD 当前把日常商品管理定位为“商家 Agent 通过 API 完成”。`/admin` 是超级管理员登录和改密页。新增人工商品管理后台时，需要先明确产品范围并补 OpenSpec；本文列出后端能力，不表示这些页面已经实现。

现有公开页面由服务端直接读取应用服务/共享读取端口。继续开发本仓库的 Server Component 时可沿用该方式；浏览器组件或独立前端可以使用以下 HTTP API。

## 2. 所有页面共同遵守的约定

### JSON 包装与错误

大多数业务 JSON API 使用以下结构，创建成功通常是 HTTP 201，但包装中的 `code` 仍为 `200`：

```json
{
  "code": 200,
  "message": "成功",
  "data": { "items": [], "next_cursor": null },
  "timestamp": 1791504000000,
  "request_id": "req_example"
}
```

失败返回非 2xx HTTP 状态、数值业务码和 `data: null`。前端根据 HTTP 状态及 `code` 分支，`message` 用于展示；`request_id` 和响应头 `X-Request-Id` 用于排查。

| HTTP | 业务码                | 含义与页面处理                                                        |
| ---- | --------------------- | --------------------------------------------------------------------- |
| 400  | 40000                 | 参数或字段格式错误；保留输入并显示提示                                |
| 400  | 40001 / 40002         | 自定义字段不存在 / 已停用；重新读取 Schema                            |
| 400  | 40003 / 40004         | 订单超过一行 / 需要明确选择规格                                       |
| 400  | 40005 / 40006 / 40007 | 人机验证要求 / 支付签名错误 / 短信频率限制；短信限流目前不是 HTTP 429 |
| 401  | 40100                 | 未认证或令牌无效；进入对应授权流程                                    |
| 403  | 40300 / 40301         | 角色、权限不符 / 需要修改初始密码                                     |
| 404  | 40400                 | 无此资源或不可公开；商品展示缺失状态，店铺介绍未发布时隐藏该区块      |
| 409  | 40900 / 40901         | 数据冲突 / 库存不足；重新读取最新数据                                 |
| 429  | 42900                 | 请求限流，例如图片上传过频                                            |
| 503  | 50300                 | 支付创建可重试；订单可能已保存，必须用原 `client_order_no` 重试       |
| 503  | 50301                 | 外部依赖不可用；提示稍后重试                                          |

不要把以下响应直接交给上述 JSON 解析器：OAuth 协议 JSON、HTML 表单的 303 跳转、API Key 删除的 204 空响应、图片二进制、健康检查原始 JSON、支付宝通知的纯文本。

### 金额、状态与分页

- `price`、`amount`、`min_price`、`max_price` 均是**整数分**。`15000` 展示为 `¥150.00`；编辑表单以元输入时，提交前转换并校验为安全整数分。不能提交 `"￥150/person"` 或价格区间作为价格。
- 币种由目录决定，默认 `CNY`。商品价格和库存实际属于 `variants`；公开商品的 `offer.price` 是上架规格的最低价。
- `stock: null` 表示不限库存，`0` 表示无库存。商品与规格状态为 `on` / `off`，订单与支付状态为 `pending` / `paid` / `closed`。
- 商品列表返回 `next_cursor`，传给下一次请求；保持原筛选条件。搜索或筛选改变时清空游标和旧列表。不要自行解析游标，也不要假设存在 `page`、`page_size` 或 `total`。
- 受保护业务接口使用 `Authorization: Bearer <access_token>`。商家只可管理自己的目录；Cookie 登录成功不会自动授权这些接口。

## 3. 公开展示接口

| 方法 | 路径                           | 用途与返回 `data`                                                                                                 |
| ---- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| GET  | `/api/v1/store`                | 已发布店铺介绍：`display_name`、`summary`、`website_url`、`logo_url`、`area_served`、`address`；后四项可为 `null` |
| GET  | `/api/v1/products`             | 已上架商品列表：`{items: PublicProduct[], next_cursor}`                                                           |
| GET  | `/api/v1/products/{id}`        | 单个 `PublicProduct`；下架、删除或没有上架规格时返回 404                                                          |
| GET  | `/api/v1/catalogs/{id}/schema` | `{catalog_id, currency, schema_revision, system_fields, fields}`；用于字段标签和动态表单                          |
| GET  | `/media/{id}`                  | 图片二进制；可直接赋给 `img.src`                                                                                  |

这些展示读取可匿名访问。Schema 如果携带 Authorization，会验证令牌；无效令牌会失败，商家令牌的读取范围也受所属目录约束。

`/api/v1/store` 没有已发布介绍时返回 404，这是正常空状态。首页商品区仍可展示，不应让整个页面报错，也不要虚构店名或联系方式。

### 商品列表参数

| 参数                        | 规则                                                                 |
| --------------------------- | -------------------------------------------------------------------- |
| `q`                         | 最多 200 字符；当前代码匹配标题和有效的 text 自定义字段              |
| `limit`                     | 默认 20，范围 1–50                                                   |
| `cursor`                    | 上一页的 `next_cursor`；用 `URLSearchParams` 编码                    |
| `catalog_id`                | 限定一个目录；使用自定义字段筛选时必传                               |
| `min_price` / `max_price`   | 非负整数分；按每件商品的最低上架规格价格筛选                         |
| `field.<key>.eq`            | text、boolean、single-select 的等值筛选；boolean 用 `true` / `false` |
| `field.<key>.gt/lt/gte/lte` | number 字段的数值筛选；number 也支持 `eq`                            |

例如：`/api/v1/products?catalog_id=cat_example&limit=12&min_price=15000&field.duration_minutes.lte=180`。示例字段必须先存在于该目录，否则会报错。

### 公开商品与字段结构

以下 ID 和内容均为结构示例：

```json
{
  "id": "prd_example",
  "catalog_id": "cat_example",
  "title": "Chengdu After Dark",
  "cover": "http://127.0.0.1:3000/media/img_example",
  "currency": "CNY",
  "offer": { "price": 15000, "currency": "CNY", "availability": "in_stock" },
  "fields": { "description": "Tour introduction", "schedule": "19:00–21:30" },
  "variants": [
    {
      "id": "var_example",
      "price": 15000,
      "currency": "CNY",
      "stock": 999,
      "availability": "in_stock",
      "option_values": {},
      "sku": null
    }
  ]
}
```

`cover` 可为 `null`；`fields` 是动态键值对象，值可能是字符串、数字、布尔或 `null`。`availability` 取 `in_stock` / `out_of_stock`。公开规格不返回 `cover` 或内部 `status`，公开商品不返回 `axes`、内部时间和 Schema 版本。

Schema 的 `fields` 项结构为 `{id, key, label, type, required, choices, status}`，其中 `type` 为 `text`、`number`、`boolean`、`single-select`，`status` 为 `active` / `retired`。页面用 `label` 展示名称，用 `key` 读写值，只给有效字段生成编辑输入。

商品描述不是固定顶层 `description` 字段。当前旅游商品的描述、行程、微信等都存放在 `fields` 中。三张图片对应一个封面和两个自定义文本字段 URL，后端尚未提供统一 `gallery` 数组。

### 页面调用顺序

1. 首页并行读取店铺介绍和商品列表，用商品封面、标题、价格生成轮播卡片；“查看更多”跳转商品列表页。平台使用步骤可作为页面静态文案。
2. 列表页读取商品列表；需要目录专属筛选时再取该目录 Schema。加载更多使用游标。
3. 详情页先读取商品，再根据 `catalog_id` 取 Schema；渲染封面、自定义内容和规格选择。选择规格后展示该规格价格及库存。

## 4. 商家目录、字段与商品管理

本节均需商家 Bearer 身份和表中权限。商家所有的脚本 API Key 可用于部分商品管理调用；Agent 和订单流程使用 OAuth。

### 目录与自定义字段

| 方法 | 路径                                   | 权限            | 请求 / 返回要点                                                             |
| ---- | -------------------------------------- | --------------- | --------------------------------------------------------------------------- |
| GET  | `/api/v1/catalogs`                     | `product:read`  | `{items: Catalog[]}`，当前没有分页                                          |
| POST | `/api/v1/catalogs`                     | `product:write` | `{name, currency?}`；名称 1–80 字符，默认 CNY；返回新目录                   |
| GET  | `/api/v1/catalogs/{id}/fields`         | `product:read`  | `{items: Field[]}`，包含字段定义与状态                                      |
| POST | `/api/v1/catalogs/{id}/fields`         | `field:write`   | `{key, label, type, required?, choices?, confirm?}`；返回应用结果或影响预览 |
| POST | `/api/v1/catalogs/{id}/fields/changes` | `field:write`   | `{op, key, ...操作参数, confirm?}`；变更定义                                |

目录返回 `{id, name, currency, schema_revision, created_at, updated_at}`。目前没有目录改名、删除、币种修改接口。

字段 key 必须匹配 `^[a-z][a-z0-9_]{0,63}$`，不能占用 `title/status/cover/price/stock/currency`。label 最多 80 字符。single-select 选项字段名是 **`choices`**。创建后 key 不能改名。

可用变更操作：`rename_label` + `label`，`add_choice` / `remove_choice` + `choice`，`change_type` + `type` 和必要的 `choices`，以及 `make_required`、`make_optional`、`retire`。也支持 `add_field`，新建字段通常用上面的 POST fields。

兼容变更直接返回 `{applied: true, revision, affected_count, field}`。破坏性变更首次返回 `{applied: false, breaking: true, affected_count, affected: [{product_id, reason}]}`，此时尚未应用。页面展示影响清单，确认后将原请求加 `confirm: true` 再提交。确认执行可能下架受影响商品；不能把 HTTP 成功等同于变更已经应用。没有独立 `/preview` 路由。

### 商品和可售规格

| 方法   | 路径                                                    | 权限            | 用途 / 请求                                                |
| ------ | ------------------------------------------------------- | --------------- | ---------------------------------------------------------- |
| GET    | `/api/v1/catalogs/{id}/products`                        | `product:read`  | 商家列表，含草稿；参数见下文                               |
| POST   | `/api/v1/catalogs/{id}/products`                        | `product:write` | 新建草稿：`{title, cover?, fields?, price?, stock?, sku?}` |
| PATCH  | `/api/v1/catalogs/{id}/products/{product_id}`           | `product:write` | 只修改 `{title?, cover?, fields?}`                         |
| POST   | `/api/v1/catalogs/{id}/products/{product_id}/publish`   | `product:write` | 上架；无需业务请求字段                                     |
| POST   | `/api/v1/catalogs/{id}/products/{product_id}/unpublish` | `product:write` | 下架                                                       |
| DELETE | `/api/v1/catalogs/{id}/products/{product_id}`           | `product:write` | 软删除商品                                                 |
| POST   | `/api/v1/catalogs/{id}/products/{product_id}/restore`   | `product:write` | 恢复商品，保持下架                                         |
| POST   | `/api/v1/catalogs/{id}/products/{product_id}/axes`      | `product:write` | 声明规格轴：`{key, label}`，例如语言                       |
| POST   | `/api/v1/catalogs/{id}/products/{product_id}/variants`  | `product:write` | 新增组合：`{option_values, price, stock?, sku?, cover?}`   |
| PATCH  | `/api/v1/catalogs/{id}/variants/{variant_id}`           | `product:write` | `{price?, stock?, sku?, cover?, status?, restore?}`        |
| DELETE | `/api/v1/catalogs/{id}/variants/{variant_id}`           | `product:write` | 软删除规格                                                 |
| POST   | `/api/v1/catalogs/{id}/images`                          | `product:write` | 图片上传，multipart `file`                                 |

商品列表接受 `status=on|off`、`deleted=true|false`、`limit`、`cursor`；`deleted=true` 只查已删除商品，默认只查未删除商品。返回 `{items: MerchantProduct[], next_cursor}`。

`MerchantProduct` 包含 `id/catalog_id/title/status/cover/fields/schema_revision/created_at/updated_at/deleted_at/axes/variants`。`axes` 项为 `{id,key,label,position}`；内部规格项为 `{id,sku,option_values,price,stock,status,cover,deleted}`。商品和规格写接口一般返回整个最新商品，适合直接更新编辑页状态。未删除商品的常规响应会过滤已删除规格。

目前没有商家“单个商品详情 GET”接口。编辑草稿需要从商家列表获取记录，必要时继续分页；不能用公开详情代替，因为公开接口不返回草稿。

### 上架操作与编辑注意事项

单一价格商品的调用顺序：

1. 获取或创建目录，读取字段定义；缺少需要的自定义字段时先声明。
2. 上传封面，保存返回 URL。
3. 创建商品，例如下方请求。提供 `price` 时自动建立默认规格，商品仍为 `off`。
4. 调用 `publish`。必填字段齐全、至少有一个有效的上架规格才能成功；失败时商品保持下架。

```json
{
  "title": "Chengdu After Dark",
  "cover": "http://127.0.0.1:3000/media/img_example",
  "price": 15000,
  "stock": 999,
  "fields": { "description": "Tour introduction", "schedule": "19:00–21:30" }
}
```

多规格商品：创建不带 `price/stock/sku` 的草稿 → 声明全部 axes → 逐个创建具体 variants → 上架。后端不会自动生成笛卡尔积。已有带规格轴的组合后不能追加轴；有默认无轴规格时，切换到有轴组合需先处理默认规格的上架状态。

- 改价和库存使用 **PATCH variant**，不能 PATCH product 的 `price`。
- PATCH product 的 `fields` **整体替换**字段值对象。编辑一个字段时，提交合并后的完整对象，避免删掉其他字段。
- 创建不带价格的草稿时，不要单独传 `stock` 或 `sku`。
- 恢复商品不自动恢复已删除规格。规格通过 PATCH `{restore: true}` 恢复后仍为 `off`，再单独开启规格并上架商品。
- 库存 999 是累计库存；行程文字“每晚 19:00–21:30”不意味着按日期预约或每晚自动补库存。

### 图片上传

上传只接受 JPEG、PNG、WebP，单张最多 5 MiB，同一商家每 60 秒最多 30 次。请求体为 `FormData` 的 `file` 字段；浏览器自行生成 multipart boundary，**不要手动指定 Content-Type**。

返回 `{id, url, content_type, byte_size}`，把 `url` 写入商品或规格的 `cover`。图片进入配置的 S3/MinIO，前端不直接访问存储凭据。封面会验证图片的目录归属。没有相册管理、图片列表、删除或排序接口。

## 5. 店铺介绍管理

| 方法 | 路径                       | 权限                              | 用途                                     |
| ---- | -------------------------- | --------------------------------- | ---------------------------------------- |
| GET  | `/api/v1/merchant/profile` | 商家身份；当前没有额外 scope 检查 | 读自己的完整介绍草稿，未设置时返回空草稿 |
| PUT  | `/api/v1/merchant/profile` | `product:write`                   | 整体保存；用 `published` 发布或撤回      |

PUT 必须提交下面全部七个字段，无值的可选字段用 `null`，不能省略，也不能增加字段：

```json
{
  "display_name": "Chengdu Night Tours",
  "summary": "Discover Chengdu after dark with a local guide.",
  "website_url": null,
  "logo_url": null,
  "area_served": "成都",
  "address": null,
  "published": true
}
```

发布时展示名和简介不能为空，分别最多 40 / 300 字符；服务区域最多 40，地址最多 120，URL 必须是最多 200 字符的 http(s) 地址。内容要求纯文本，不能带 HTML/Markdown 或泄露账号登录手机号、账号邮箱。返回七个字段加 `updated_at`。没有单独发布路由；撤回后公开 store 接口返回 404。

## 6. 登录与授权：两种凭据分别接入

### 已有浏览器页面和表单

| 路径                  | 现有页面                               |
| --------------------- | -------------------------------------- |
| `/authorize`          | 按授权上下文进入买家或商家流程         |
| `/authorize/device`   | 输入设备短码的入口                     |
| `/authorize/buyer`    | 买家短信/密码登录、注册和批准          |
| `/authorize/merchant` | 店主登录、初始改密和批准；没有商家注册 |
| `/authorize/account`  | 账号 API Key 管理页面                  |
| `/admin`              | 超级管理员登录、改密                   |

已有表单 POST 使用 `application/x-www-form-urlencoded`，返回跳转和页面提示；不是 JSON 登录接口。授权批准还依赖服务端保存的 OAuth 交互 Cookie，不能脱离完整交互仅调用 approve。

| POST 路径                    | `intent`             | 表单字段                                              |
| ---------------------------- | -------------------- | ----------------------------------------------------- |
| `/authorize/merchant/submit` | `login` 或缺省       | `phone`, `password`                                   |
| 同上                         | `change-password`    | `currentPassword`, `nextPassword`                     |
| 同上                         | `approve`            | 已登录且处于有效授权交互                              |
| `/authorize/buyer/submit`    | `sms`                | `phone`, `captchaVerifyParam`；先完成阿里云人机验证   |
| 同上                         | `check`              | `phone`, `code`                                       |
| 同上                         | `register`           | `phone`, `password`, 可选 `email`；依赖前面的短信验证 |
| 同上                         | `password`           | `phone`, `password`                                   |
| 同上                         | `approve` / `logout` | 依赖对应会话/交互                                     |
| `/admin/submit`              | `login`              | `phone`, `password`                                   |
| 同上                         | `password`           | `currentPassword`, `nextPassword`                     |

账号页面使用 HttpOnly `ml_account` Cookie，当前 Path 为 `/authorize`；超级管理员使用 `ml_admin`，Path 为 `/admin`。**这些 Cookie 不能代替业务 API 的 Bearer 令牌。** 当前没有 `/api/v1/login`、`/api/v1/register`、`/api/v1/sms` 或 `/api/v1/me` 这类 JSON 接口。初期可继续使用已有页面；设计全新的 SPA 登录界面需要额外接口或明确的会话对接方案。

### OAuth 设备码授权

| 方法 | 路径                                      | 内容                                                       |
| ---- | ----------------------------------------- | ---------------------------------------------------------- |
| GET  | `/.well-known/oauth-protected-resource`   | 原始 OAuth 资源元数据 JSON；不使用业务包装                 |
| GET  | `/oauth/.well-known/openid-configuration` | 发现授权服务器及协议端点                                   |
| POST | `/oauth/device/auth`                      | 表单：`client_id=merclink-agent` 和 `scope`                |
| GET  | `/oauth/device`                           | 授权服务器提供的短码确认页，通常使用返回的完整验证链接进入 |
| POST | `/oauth/token`                            | 表单：设备码换令牌或 refresh_token 刷新                    |
| GET  | `/oauth/jwks`                             | 公钥信息，一般无需页面直接调用                             |

1. 申请设备码，返回 `device_code`、`user_code`、`verification_uri` / `verification_uri_complete`、`expires_in` 等。当前设备码有效期 600 秒。
2. 展示短码并让用户打开返回的确认地址；用户登录，必要时修改初始密码，最后点击“批准”。**只登录还没有授予 API 权限。**
3. 按协议轮询 `/oauth/token`，提交 `grant_type=urn:ietf:params:oauth:grant-type:device_code`、`client_id`、`device_code`。遵守返回的轮询间隔及 `slow_down`。
4. 成功后把 `access_token` 用于 Bearer 请求；当前访问令牌有效期 15 分钟。刷新使用 `grant_type=refresh_token`，刷新令牌会轮换。

商家申请 `field:write product:write product:read order:read`；买家申请 `order:write order:read`，按实际功能收缩权限。OAuth 返回标准协议 JSON，错误是 `authorization_pending`、`slow_down`、`expired_token`、`invalid_grant` 等字符串，不能按业务数值码解析。

当前只注册 `merclink-agent` 的设备码与刷新流程，没有为独立 SPA 注册普通授权码回调。发现文档出现某个通用 OAuth 端点，不代表已有适合新前端客户端的完整登录协议。也没有已接入的 OAuth 授权列表/撤销业务接口。

### 服务器脚本 API Key 辅助接口

| 方法   | 路径                    | 认证 / 返回                                                        |
| ------ | ----------------------- | ------------------------------------------------------------------ |
| GET    | `/api/v1/api-keys`      | `ml_account` Cookie；`{items: [{id,prefix,revoked}]}`              |
| POST   | `/api/v1/api-keys`      | 同一 Cookie；JSON 模式返回 `{id,secret,prefix}`，secret 只展示一次 |
| DELETE | `/api/v1/api-keys/{id}` | 同一 Cookie、归属校验；成功 204 空响应                             |
| POST   | `/api/v1/api-keys/{id}` | 表单撤销入口，成功 303 到账号页                                    |

创建 Key 的 HTML 请求会跳转账号页而非返回 JSON。Key 面向服务器脚本，不作为 Agent 授权或前端登录替代品；当前交易接口要求 buyer/merchant OAuth 身份，不接受 script 身份。

**已确认接入问题：** 登录设置的 `ml_account` Path 为 `/authorize`，而这些 Key 接口位于 `/api/v1`，浏览器不会自动携带该 Cookie，`credentials: include` 也不能突破 Cookie Path。账号页面能够读取会话不等于 Key 操作已可在浏览器正常完成。开发相关按钮前需修正会话路径或对接方式；本次只记录现状。

## 7. 下单、支付与订单查询

| 方法 | 路径                             | 权限               | 用途                                                       |
| ---- | -------------------------------- | ------------------ | ---------------------------------------------------------- |
| POST | `/api/v1/orders`                 | 买家 `order:write` | 创建订单、生成支付链接；用相同业务号重试                   |
| GET  | `/api/v1/orders/{id}`            | 买家 `order:read`  | 查询本人订单，可能同步服务商最新支付状态                   |
| GET  | `/api/v1/manage/orders`          | 商家 `order:read`  | 本商家订单列表，可传 `catalog_id`；返回 `{items: Order[]}` |
| POST | `/api/v1/payments/alipay/notify` | 支付宝签名验证     | 服务商通知；前端不调用；返回纯文本 success/fail            |

### 创建订单

```json
{
  "client_order_no": "checkout-example-001",
  "payment_channel": "desktop",
  "items": [{ "variant_id": "var_example", "qty": 1 }]
}
```

- `client_order_no` 必填，1–128 字符。一次结算生成一次，重试保留原值，同一买家不会重复扣库存。
- `items` 必须恰好一行，`qty` 为正整数；优先传所选 `variant_id`。仅有一个上架规格时允许用 `product_id`，多个规格时必须明确选择。
- **不能传价格或金额。** 服务端依据规格计算总额。
- `payment_channel` 可为 `desktop` / `mobile`，缺省 desktop。第一次提交时确定渠道，重试不能用原业务号切换渠道；后端不根据 User-Agent 推断。

订单返回结构示例：

```json
{
  "id": "ord_example",
  "status": "pending",
  "amount": 15000,
  "currency": "CNY",
  "updated_at": "2026-10-09T10:00:00.000Z",
  "items": [{ "id": "item_example", "variant_id": "var_example", "qty": 1, "amount": 15000 }],
  "payment": {
    "id": "pay_example",
    "provider": "alipay",
    "channel": "desktop",
    "status": "pending",
    "action": "https://payment-provider.example/checkout"
  }
}
```

`payment` 可能为 `null`，`action` 为完整支付 URL 或 `null`。`GET orders/{id}` 和商家列表不会重新返回支付 URL，`payment.action` 为 `null`；继续支付通过原下单请求和相同业务号取得链接。

### 收银台状态和异常流程

1. 买家授权后创建订单。正常返回 pending 和支付链接；将完整链接用于顶层导航，不放入 iframe。
2. 回到页面后查询该订单。只有 **`order.status === "paid"`** 才展示支付成功；打开链接和同步回跳均不是支付凭证。
3. 如果创建支付返回 HTTP 503 / `50300`，订单和库存变更可能已保存，错误包装不含订单对象。保留原 `client_order_no`、规格、数量和渠道，再次 POST，而非新建业务号。
4. 订单为 closed 时展示关闭状态。订单有 30 分钟过期规则，实际关闭由服务端扫描及支付状态同步处理；前端不自行写支付状态。

当前订单响应只提供行 ID、规格 ID、数量、行金额等，**没有商品标题、商品 ID、规格展示描述、created_at、expires_at 或买家联系信息**。完整订单卡片、历史快照展示、精确倒计时需要补充接口字段。商家列表没有 cursor、limit、状态筛选或单笔商家订单详情接口；买家没有订单列表接口。

## 8. 辅助路由与当前能力边界

| 路径                                                            | 用途                                           |
| --------------------------------------------------------------- | ---------------------------------------------- |
| `GET /api/health`                                               | 原始 `{status: "ok"}`；不是完整依赖状态检查    |
| `GET /skill.md`                                                 | 买家 Skill                                     |
| `GET /merchant/skill.md`                                        | 商家 Skill                                     |
| `GET /llms.txt`、`/robots.txt`、`/sitemap.xml`                  | 发现与搜索引擎资料                             |
| `GET /dev/pay/{paymentId}`、`POST /dev/pay/{paymentId}/confirm` | 仅本地开发模拟支付；生产不提供                 |
| `POST /api/v1/catalogs/{id}/products/{product_id}/options`      | 保留的旧路由，当前返回 404；规格轴使用 `/axes` |

以下能力当前没有相应业务接口，设计页面时应明确补接口还是使用现有展示方式：

| 希望做的功能                                   | 现状 / 对页面的影响                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------- |
| 独立 Banner 配置、轮播排序、推荐位             | 首页可用已上架商品展示；没有独立配置接口                            |
| 多图相册、富文本详情、价格单位                 | 目前为封面 + 自定义字段；没有统一 gallery、富文本和 price_unit 合同 |
| 小费制、价格区间                               | 只能使用整数分固定价格；说明文案不能替代结算价格                    |
| 旅游日期预约、日历、每晚名额                   | schedule 是文本，stock 是普通累计库存；无按日库存接口               |
| 买家订单历史页、商家订单统计                   | 缺买家列表、商家分页/筛选及统计接口                                 |
| 购物车、优惠券、退款、运费                     | PRD 不做；没有对应接口                                              |
| 全新 JSON 登录页、当前用户信息、OAuth 授权管理 | 现有 HTML 表单与设备码授权不足以直接替代完整 SPA 账号 API           |
| 跨域独立前端                                   | 当前未配置通用 CORS；优先同源接入，独立域名需要明确 CORS/会话方案   |

本地 OAuth 另有需要统一的地址问题：资源元数据中的服务器地址使用 `127.0.0.1`，运行时发现信息和设备码验证链接部分使用 `localhost`。两者是不同 Origin，Cookie 不互通；页面应一致使用实际返回的授权链接，开发完整浏览器 OAuth 对接前应统一公开基地址。

**文档与规格冲突：** PRD 第 3 节限定跨目录查询“只能按标题和价格过滤”，但生效的 [product-query 规格](../openspec/specs/product-query/spec.md) 和当前查询代码允许关键词匹配标题及 text 自定义字段。上面的 `q` 说明记录运行现状；修改搜索行为或对外文案前，需要先统一事实来源，本次不调整代码或规格。

建议前端实施顺序：**首页/列表/详情 → 店铺资料 → 明确商品管理页面范围与授权方案 → 商品编辑/上下架 → 下单与支付结果 → 补齐订单列表和展示字段。**

## 9. 联调依据与本次验证

- 路径与权限：[业务路由注册表](../src/shared/api-routes.ts)、[商品 HTTP 映射](../src/app-services/catalog/http.ts)、[店铺 HTTP 服务](../src/app-services/identity/profile-http.ts)。
- 数据与规则：[商品查询](../src/app-services/catalog/query.ts)、[查询参数规则](../src/domain/catalog/query.ts)、[字段变更规则](../src/domain/catalog/fields.ts)、[错误码](../src/shared/errors.ts)、[订单输出](../src/app-services/commerce/view.ts)。
- 授权与表单：[OAuth provider](../src/app-services/access/provider.ts)、[商家提交路由](../src/app/authorize/merchant/submit/route.ts)、[买家提交路由](../src/app/authorize/buyer/submit/route.ts)、[API Key 路由](../src/app/api/v1/api-keys/route.ts)。
- 产品边界：[PRD](./PRD.md)、[架构](./ARCHITECTURE.md)、[生效规格](../openspec/specs/)、[买家 Skill](../src/agent-docs/skill.md)、[商家 Skill](../src/agent-docs/merchant-skill.md)。

本次对本地服务做了只读核验：商品列表与目录 Schema 正常返回 200，未发布店铺介绍返回 404，匿名商家目录及 API Key 返回 401，OAuth 元数据和健康检查可读。现有成都夜游商品返回 `price: 15000`、`stock: 999`，可作为页面联调数据。
