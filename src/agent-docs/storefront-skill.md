# 店面 Skill

用这一份公开文档修改这一家店给人看的页面。它只规定改页面的边界。商品、目录、字段和店铺资料仍由商家 Skill 经 API 修改。购买仍由买家 Skill 规定。

Use this document only to change the storefront a person sees. Catalog, product, and profile data still go through the merchant skill. Purchase still goes through the buyer skill.

## 何时使用

用户要改这一家店的公开页面、注册页、登录页、批准页或下单确认页的外观时，只读本文档。

不要用本文档建目录、改商品、改价格、发布店铺介绍或下单。那些仍分别读 `/merchant/skill.md` 和 `/skill.md`。不要修改服务端仓库。

API 源站就是本文档的源站。根路径是 `/api/v1`。不要为了预览去打开生产环境的跨域访问。用 `node preview.mjs` 把 `/api`、`/media`、`/authorize` 和 Skill 代理到这一部署。

Do not edit the server repository. Do not treat this document as permission to change APIs, payment notifications, or authorization completion.

## 能改什么

- 营销页的版式、文案和样式。
- 注册、登录、批准和下单确认页的外观，以便和店面同一风格。
- 商品列表、商品页和店铺介绍周围的版式。事实本身仍由服务端填入。

这些改动不能覆盖下面列出的保留路径，也不能另写一套注册或支付。

## 不能动

下列规则没有例外。本地预览看起来正常，也不能违反。

1. 不得替换、遮盖或把未知路径回退到这些地址：`/api`、`/authorize`、`/oauth`、`/admin`、`/media`、`/.well-known`、`/skill.md`、`/merchant/skill.md`、`/storefront/skill.md`、`/llms.txt`、`/sitemap.xml`、`/robots.txt`。也不得把 `/products` 或 `/products/{id}` 回退成首页。
2. 不得向用户索要支付宝密码。不得把 `payment.action` 放进 iframe，不得截断或改写它。必须用顶层导航打开完整 URL。Do not ask for an Alipay password. Open the complete `payment.action` URL with top-level navigation rather than an iframe or a truncated URL.
3. 打开 `payment.action`、从支付宝跳回、或页面自己写「支付成功」，都不是支付成功。只有订单状态 `paid` 才算成功。不得新增回跳即成功的接口，也不得把未履约收款或已关闭订单的旧链接当成成功。
4. 注册、登录和批准可以改外观，但必须提交到现有服务端授权地址。买家提交仍是 `/authorize/buyer/submit`。商家提交仍是 `/authorize/merchant/submit`。设备码确认仍由服务端的 `verification_uri` 完成。不得在购物授权里注册商家，也不得增加商家注册入口。
5. 未完成人机验证，不得请求发送短信。验证码不入库，Agent 不收集密码、短信验证码或 API Key。
6. 第一次下单就选定 `payment_channel`。手机付款人传 `mobile`。不传就是电脑收银台。不得改用 User-Agent 猜测渠道，不得让买家选择支付实现。支付实现由服务端固定。
7. 不得把部署密钥、支付私钥、数据库连接串、访问令牌或 API Key 写进页面源码。管理页改密不在可改源码里。
8. sitemap、下架地址和不可收录状态由服务端决定。店面不得把未知地址回退成首页来冒充商品页，也不得让下架商品继续可收录。

## 事实槽位

会随后端变化的事实必须用槽位。不得把当时的值写死在 HTML 里。服务端每次请求按当前公开缝或订单读取渲染店铺资料、商品事实和订单状态。改价或改店铺介绍后，下一次请求显示新事实，不必再次激活，也不得另存一份旧值。

槽位写成空元素，服务端只替换，不执行页面脚本：

- `<merclink-slot name="store.display_name"></merclink-slot>`
- `<merclink-slot name="store.summary"></merclink-slot>`
- `<merclink-slot name="store.logo"></merclink-slot>`
- `<merclink-slot name="store.website"></merclink-slot>`
- `<merclink-slot name="store.area"></merclink-slot>`
- `<merclink-slot name="store.address"></merclink-slot>`
- `<merclink-slot name="product.name"></merclink-slot>`
- `<merclink-slot name="product.cover"></merclink-slot>`
- `<merclink-slot name="product.fields"></merclink-slot>`
- `<merclink-slot name="product.variants"></merclink-slot>`
- `<merclink-slot name="product.stock"></merclink-slot>`
- `<merclink-slot name="product.availability"></merclink-slot>`
- `<merclink-slot name="product.price"></merclink-slot>`
- `<merclink-slot name="order.status"></merclink-slot>`
- `<merclink-slot name="products.next"></merclink-slot>`

商品列表放在 `<template data-merclink="product">` 里，链接使用 `/products/{id}`。商品页是 `products/item.html`。商品列表必须声明 `products.next`。还有下一页时，服务端把该槽位渲染成指向 `/products?cursor=` 的链接；没有下一页时槽位为空。不要把后续页一次写进同一份页面。

支付成功文案只能放在 `<template data-merclink="order.paid">` 里，并且页面必须有订单状态槽位。服务端只有读到状态 `paid` 才放入这段文案。

店铺槽位来自已发布的店铺资料：展示名、简介、标识、网站、区域、地址。商品槽位来自当前已上架商品：名称、封面、公开字段、规格值、库存、可售状态、主币单位价格。商品列表和 `/products/{id}` 必须使用这些商品槽位。`order_id` 不是公开查询。只有与 `GET /api/v1/orders/{id}` 相同的买家 Authorization，且订单属于该买家时，服务端才填 `order.status`。匿名、其他买家或没有 `order:read` 时槽位为空，也不展开支付成功文案。不得把支付成功建立在回跳上。只有槽位值为 `paid` 时，页面才能显示支付成功。

没有这些事实的营销页可以是静态版式。一旦展示上述任一事实，就必须用对应槽位。写死价格、库存、店铺资料或「支付成功」，该页面不得发布。

## 发布接口

令牌必须带 `storefront:write`。只申请目录权限时不会得到这项。只有 `product:write` 不能下载、上传或激活。设备码流程仍按商家 Skill，scope 里额外加上 `storefront:write`。

- `GET /api/v1/storefront/source` 下载当前源码包。还没有接受过发布时，这是部署自带的起始源码。接受发布后，下载的是该发布的源码，不是最初那份。
- `POST /api/v1/storefront/releases` 上传一份源码包和一份静态包。`multipart/form-data` 字段是 `source` 和 `static`。可选 `fallback` 只能是 `index.html`。可选 `authorize_buyer` 和 `authorize_merchant` 指向已上传的授权外观。上传成功不会切换线上页面。
- `POST /api/v1/storefront/releases/{id}/activate` 确认激活。正文必须是 `{"confirm": true}`。未确认不会改指针。
- `POST /api/v1/storefront/rollback` 只把指针指回上一份发布。没有上一份时回到内置页。不重启进程，也不改变支付通知。

未知路径可以声明回退到 `index.html`，但回退不能用于保留路径，也不能用于 `/products` 或 `/products/{id}`。授权入口没有声明或文件不存在时，人留在内置授权页。

## 验收

发布前必须运行本地验收命令 `node accept.mjs`，并逐条核对本文件的「不能动」和「事实槽位」。验收失败就不要确认激活。任一条不满足，不得把该页面当作可发布，也不得把上传当成已经上线。

服务端每次请求渲染，不信任本地检查，也不执行上传的脚本。写死事实、缺少商品槽位、覆盖保留路径或把商品地址回退成首页时，确认激活返回校验失败，发布不得生效。sitemap 与下架地址由服务端执行，不靠店面自觉。Skill 里的句子不能代替这次服务端检查。

## 常见错误用法

- 把商品价格、库存或店名直接写进 HTML，指望以后手动再改。
- 支付宝跳回后立刻显示支付成功。
- 用整站回退让 `/products/{id}` 打开首页。
- 在注册页加「注册商家」。
- 自己实现支付通知或验签。
- 修改 `/api`、`/oauth`、`/admin` 或两份购买和管理 Skill。
