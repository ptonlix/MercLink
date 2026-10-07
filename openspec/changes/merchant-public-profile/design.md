# Design

## Context

见 `proposal.md`。落地页由 `LandingView` 渲染固定说明和公开商品缝的结果。商家账号在 `merchants`，含登录手机号、密码哈希和超管填写的 `name`。商家 Agent 的权限是 `field:write`、`product:write`、`product:read`、`order:read`。公开页要求服务端 HTML，且不依赖脚本才出现正文。

## Goals / Non-Goals

**Goals:**

- 商家 Agent 只读 Skill 就能录入、发布和撤回自己的介绍。
- 落地页和商家页展示的内容与公开接口是同一查询结果。
- 停用商家或撤回发布后，公开入口立即看不到这份介绍。
- 登录手机号和账号邮箱不会因为展示介绍而泄露。

**Non-Goals:**

- 不做营销页、主题、富文本、Markdown 或自定义介绍字段。
- 不让商家自助注册，也不让超管代写公开介绍。
- 不公开登录手机号、密码、账号邮箱、订单或未上架商品。
- 不加 Logo、评分、排序推荐、广告位或网站装修。
- 不新增第五个业务模块，也不新增 OAuth scope。

## Decisions

### 资料属于商家账号，不属于目录

一个商家可以有多本目录，介绍只有一份。目录继续只描述商品字段。公开地址使用已有 `mch_` id，不再发第二套 id。

超管开通时的 `name` 只作为账号名。公开展示名由商家 Agent 另填。这样未发布时，落地页不会露出开通记录。

### 独立资料表，不扩展账号表

新增 `merchant_profiles`，一行对应一个商家。账号表继续只放凭证和开通状态。公开查询先要求商家 `status=active` 且未删除，再要求资料 `published=true`。停用商家时不必改资料行，公开缝自然排除。

### 固定三个字段

- `display_name`：发布时必填，trim 后 1 到 40 个字符。它同时是页面标题和 JSON-LD 的 `name`。
- `summary`：发布时必填，trim 后 1 到 300 个字符，纯文本。去掉控制字符，不解释 HTML 或 Markdown。页面展示全文。meta description 使用同一段文字的前 150 个字符，不再另存一份 SEO 描述。
- `website_url`：可空。非空时必须是绝对 `http` 或 `https` URL，最长 200 字符。它写入 `sameAs`，不替代本站 canonical。
- `logo_url`：可空，规则与 `website_url` 相同。有值时写入 JSON-LD 的 `logo`。
- `area_served`：可空，trim 后最多 40 个字符的纯文本，例如「杭州市」。有值时写入 `areaServed`。
- `address`：可空，trim 后最多 120 个字符的公开经营地址，例如「西湖区某某路 88 号」。有值时出现在落地页，并写入 JSON-LD 的 `PostalAddress.streetAddress`。这不是登录手机号，也不收集门牌以外的证件地址。

`PUT` 可以保存草稿。`published=false` 时展示名和简介可以空。`published=true` 时展示名和简介必须同时有效，否则 `validation_error`，且不改变已发布状态。不增加 `seo_title`、关键词或富文本；搜索和生成式引用使用店名、简介、服务区域、标识和已上架商品，而不是另一套文案。

### 复用 product:write

新增 `profile:write` 会让已批准的商家 Agent 无法调用，直到重新授权。介绍和商品一样是商家对外发布的内容，因此 `PUT` 要求商家令牌具备 `product:write`。`GET /api/v1/merchant/profile` 只要求有效商家令牌，便于 Agent 先看草稿。买家令牌、匿名请求和他人的令牌不能读写这份草稿。

不提供按商家 id 写入的管理路由。调用者只能改自己的资料，避免路径上出现别人的 id。

### 公开缝只有一份结果

公开站只有一家店，落地页就是这家店。不设商家列表，也不设 `/merchants/{id}`。`GET /api/v1/store` 和 `/` 使用同一个公开缝，最多返回一份已发布介绍：`display_name`、`summary`、`website_url`。未发布、已撤回或商家停用时，公开缝为空，不回显草稿。

`/` 开头不放项目介绍。已发布时，主标题是店名，下面依次是简介、有值才显示的标识、服务区域、地址和网站，然后是已上架商品。没有已发布介绍时，开头直接是商品，不改用 MercLink 口号填空。

页脚才放 MercLink、Slogan「在 AI 时代，让天下没有难做的生意」、解释「帮中小商家做自己的店，并让各种 Agent 直接找到商品、完成购买。」以及商品列表、两份 Skill、API 根地址和发现文件。页面不出现不能自助注册，也不提供「进入这一家的店」。

JSON-LD 的站点名称在介绍已发布时使用展示名，摘要与可见简介一致。不生成商家 `ItemList`。

### 视觉原型

参照 [SceneAI](https://sceneai.art/) 目录里「Soguipsum Hero Section」这类浅色商品陈列，不参照「The Still Signal」这类霓虹和动效英雄区。公开预览见 `https://cdn.sceneai.art/landing-pages/9c37773b-af62-4bb8-89f7-d388122b357a.png`。该资源受 SceneAI 许可约束，方案只记录我们自己的规则，不保存对方图片、提示词或标识。

采用的部分：暖纸色底、大号衬线 Slogan、商品照片是视觉中心、留白多、颜色少。不采用的部分：巨型背景字、悬浮购买按钮、多层营销导航、自动播放和滚动提示。

落地页令牌：

- 纸色 `#f6f4ee`，墨色 `#1d1c19`，卡片白 `#ffffff`。
- 唯一强调色 `#6e8b32`，只用在 Slogan 或价格，不使用渐变。
- 店名用衬线并作为主标题。页脚 Slogan 用较小的衬线，解释、商品标题和价格用无衬线。
- 卡片圆角 12px，封面 1:1，标题最多两行。

### 商品货架

落地页的已上架商品参照电商店铺首页的一排货架，不参照后台表格。每件商品是一张固定比例的卡片：上方 1:1 封面，没有封面时用浅色占位，不写「无」；下方最多两行标题；价格显示为元，由分换算，例如 `¥159.00`；可售状态只用「有货」或「缺货」。整张卡片链到 `/products/{id}`。不在卡片上放加入购物车，本店没有购物车。

卡片放在一条横向货架里。桌面大约露出四张，并让下一张露出一角，表示还能继续看。窄屏露出一张多一点。左右按钮每次移动一张卡片。没有脚本时，货架仍可横向滑动，商品已经在 HTML 里。不自动轮播，不循环跳回第一张，避免人和 Agent 看错当前商品。超过一页时，货架下给出「查看全部商品」，指向 `/products`。没有商品时仍显示「没有可展示的商品。」

### 商家资料接口

两个管理接口都要求 `Authorization: Bearer <商家访问令牌>`，正文只接受 `application/json`。字段用蛇形命名，和现有目录接口一致。错误体仍是 `{ "error": "<code>", "message": "<可读说明>" }`。不新增错误码。

`GET /api/v1/merchant/profile` 没有请求体。有效商家令牌返回 `200`。还没有资料行时返回空草稿，不返回 `404`。

```json
{
  "display_name": "",
  "summary": "",
  "website_url": null,
  "logo_url": null,
  "area_served": null,
  "address": null,
  "published": false,
  "updated_at": null
}
```

已保存后，`updated_at` 是 UTC 的 ISO-8601 时间。`website_url` 没有值时是 `null`，不是空字符串。响应不包含手机号、邮箱、密码或商家 id。

`PUT /api/v1/merchant/profile` 是整份替换，不是局部更新。四个字段都必须出现。`product:write` 不足时返回 `403` 和 `forbidden`，不写库。

```json
{
  "display_name": "南风商店",
  "summary": "一家店，商品可以直接交给 Agent 购买。",
  "website_url": "https://example.com",
  "logo_url": "https://example.com/logo.png",
  "area_served": "杭州市",
  "address": "西湖区某某路 88 号",
  "published": true
}
```

成功返回 `200`，响应体与读取接口相同，并带上新的 `updated_at`。再次提交同一份正文得到同一结果。

校验在写入前完成：

- `display_name` 和 `summary` 必须是字符串。`area_served` 和 `address` 必须是字符串或 `null`。服务端先 trim。`published` 为 `true` 时，展示名和简介长度分别是 1 到 40、1 到 300。`area_served` 非空时不超过 40 个字符，`address` 非空时不超过 120 个字符。`published` 为 `false` 时展示名和简介可以是空字符串。
- `website_url` 和 `logo_url` 必须是字符串或 `null`。trim 后空字符串视为 `null`。非空时必须是不超过 200 字符的绝对 `http` 或 `https` URL。
- `published` 必须是布尔值。
- 出现未声明字段，包括 `phone`、`password`、`email`，返回 `400` 和 `validation_error`，不保存任何字段。
- 发布校验失败时，已发布的旧资料保持不变。

无令牌或令牌无效返回 `401` 和 `unauthorized`。买家令牌读取或写入都返回 `403` 和 `forbidden`。正文不是 JSON 时返回 `400` 和 `validation_error`。

公开 `GET /api/v1/store` 不需要令牌。已发布且商家仍有效时返回 `200`：

```json
{
  "display_name": "南风商店",
  "summary": "一家店，商品可以直接交给 Agent 购买。",
  "website_url": "https://example.com",
  "logo_url": "https://example.com/logo.png",
  "area_served": "杭州市",
  "address": "西湖区某某路 88 号"
}
```

已发布时，落地页 JSON-LD 使用 `OnlineStore`：`name`、`description`、本站 `url`，以及有值才写的 `logo`、`sameAs`、`areaServed` 和 `address`。`address` 写成 `PostalAddress`，完整文本放在 `streetAddress`。商品仍用现有 `ItemList`。`/llms.txt` 在已发布时引用店名和简介，不内嵌全部商品。

未发布、已撤回或商家停用时返回 `404` 和 `not_found`，响应不包含草稿字段。

商家 Skill 必须写出这两个方法、上面的七个请求字段，以及一份虚构示例。示例不得复制任何已保存的商家介绍，也不得包含令牌。正文说明只有 `published` 为 `true` 才公开，改为 `false` 后落地页立即不再显示。

## Risks / Trade-offs

- [复用 product:write 使权限略宽] → 不让已授权 Agent 重新同意。介绍不能改商品、订单或别人的资料。
- [后台仍可能有商家账号] → 公开页不列举账号。访客只看到这一家店的介绍和商品。
- [没有 Logo] → 先避免和图片所有权缠在一起。以后可以加可选的本商家媒体 URL。

## Migration Plan

新增迁移创建 `merchant_profiles`。已有商家没有资料行，公开页显示空状态。不回填超管填写的账号名。撤回或停用只影响读取，不删除历史行。

## Open Questions

- 无。展示名长度、发布门槛和权限复用按上面的决定实施。
