# 店面 Skill

用这一份公开文档修改这一家店给人看的页面。它只规定改页面的边界。商品、目录、字段和店铺资料仍由商家 Skill 经 API 修改。购买仍由买家 Skill 规定。

Use this document only to change the storefront a person sees. Catalog, product, and profile data still go through the merchant skill. Purchase still goes through the buyer skill.

## 何时使用

用户要改这一家店的公开页面、注册页、登录页、批准页或下单确认页的外观时，只读本文档。

不要用本文档建目录、改商品、改价格、发布店铺介绍或下单。那些仍分别读 `/merchant/skill.md` 和 `/skill.md`。不要修改服务端仓库。

API 源站就是本文档的源站。根路径是 `/api/v1`。不要为了预览去打开生产环境的跨域访问。用 `node preview.mjs` 把 `/api`、`/media`、`/authorize` 和 Skill 代理到这一部署。

下载到的起始页面由当前默认公开页生成，不是另一份页面。在这份版式上改，不要换成只有一个按钮的空页。

## 改起始页

先下载源码包，再改包里的文件。不要根据公开接口的 JSON 另写页面。

店面正文只改这四份：`static/index.html`、`static/products/index.html`、`static/products/item.html`、`static/styles.css`。授权页和支付结果页可以改外观，仍提交到现有授权地址。

保留起始页已有的 class，样式表链接仍是 `/styles.css`。可以追加规则，不要换成一套对不上这些 class 的样式，也不要删掉 `.page`、`.cover`、`.placeholder`。`product.cover` 已经包含封面框、占位文字和图片。不要再包一层封面容器，也不要把图片地址写进文件。

首页和商品列表保留 `<template data-merclink="product">`。删掉它，页面就不会列出商品。列表必须声明名称、封面、价格、可售状态和 `products.next`。商品页还必须用 `<template data-merclink="product.field">` 和 `<template data-merclink="product.variant">` 自己排字段和规格；里面只用 `field.key`、`field.value`、`variant.id`、`variant.options`、`variant.price`、`variant.stock`、`variant.availability`、`variant.sku` 这些数据槽位。服务端只填值，不替页面写 `<dl>` 或 `<ul>`。旧页面如果只有 `product.fields` 或 `product.variants` 槽位，仍会收到原来的整段 HTML。不要把填好的字段表、规格 ID 或库存数字贴进文件。

上传的 HTML 必须仍是空槽位。预览只在响应里替换槽位，不会改你的文件。不要把预览页面另存为源码。

Do not edit the server repository. Do not treat this document as permission to change APIs, payment notifications, or authorization completion.

## 本地预览

`node preview.mjs` 返回静态版式，并把保留路径代理到源站。带事实槽位的页面会再向源站读取已发布店铺和已上架商品，按与激活后相同的规则替换事实槽位、展开商品 template。`/products/{id}` 读取该商品的公开接口。只有请求带着买家 Authorization 且有 `order_id` 时，才填 `order.status`。

这只是预览，不是激活。预览进程不是源站公开页。源站公开页在确认激活前仍是上一份发布或内置页。不要把预览地址当成源站地址。不要把店名、价格或库存写进 HTML。预览填入的值来自当前公开接口，不会写回文件。

源站公开接口不可用时，预览返回 502。不要把空白页面当成店里没有资料。预览按文件提供页面：`/` 是 `index.html`，`/products` 读取 `products/index.html`，`/products/{id}` 读取 `products/item.html`。不得把 `/products` 回退成首页。找不到文件返回 404，不得退出进程。不要修改服务端仓库来补预览。

Local preview fills fact slots from the source deployment before activation. It does not activate the release. Do not hardcode store, price, or stock.

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

## 结构化数据

结构化数据由服务端拥有。上传的 HTML 不得包含 `application/ld+json`。服务端在分发前去掉商家写的这段脚本，再按当前槽位事实注入 JSON-LD。价格是由整数分导出的主币单位，库存状态使用 schema.org 的完整 URL。没有店铺或商品槽位的页面不会注入商品或店铺结构。确认激活时如果静态文件仍带有该脚本，返回校验失败，线上页面不变。

不要自己编写价格、库存或店铺的 JSON-LD。

## 发布接口

令牌必须带 `storefront:write`。只申请目录权限时不会得到这项。只有 `product:write` 不能下载、上传或激活。设备码流程仍按商家 Skill，scope 里额外加上 `storefront:write`。

- `GET /api/v1/storefront/source` 下载当前源码包。还没有接受过发布时，这是部署自带的起始源码。接受发布后，下载的是该发布的源码，不是最初那份。
- `POST /api/v1/storefront/releases` 上传一份源码包和一份静态包。`multipart/form-data` 字段是 `source` 和 `static`。可选 `fallback` 只能是 `index.html`。可选 `authorize_buyer` 和 `authorize_merchant` 指向已上传的授权外观。上传成功不会切换线上页面。
- `POST /api/v1/storefront/releases/{id}/activate` 确认激活。正文必须是 `{"confirm": true}`。未确认不会改指针。
- `POST /api/v1/storefront/rollback` 只把指针指回上一份发布。没有上一份时回到内置页。不重启进程，也不改变支付通知。
- `POST /api/v1/storefront/reset` 只创建一条待批准的重置请求，不删除发布。响应里的 `approval_url` 必须交给人，在浏览器登录管理页后批准。Agent 令牌不能自己执行重置。
- `GET /api/v1/storefront/reset/{id}` 查询该请求是否已执行。`executed` 为 `false` 时线上页面不变。

静态包里有文件，不等于已经声明怎么用。服务端不会因为包里有 `account/buyer.html` 或 `account/merchant.html` 就启用它们。没有对应表单字段时，这两列为空，授权页仍是内置页。已上传的发布不能后补这两列；要改声明，必须再上传一份并确认激活。

改了买家授权外观，上传表单必须有 `authorize_buyer=account/buyer.html`。改了商家授权外观，必须有 `authorize_merchant=account/merchant.html`。路径不要加前导斜杠，并且必须是这次静态包里已有的文件。没改授权页就不要传这两个字段，继续用内置授权页。上传响应或下一次下载到的发布里这两列仍是空，而授权页又改过，不要确认激活。

声明授权外观是替换对应步骤的外观，不是替换整条授权流程。`/authorize/buyer` 和 `/authorize/merchant` 仍由服务端决定当前步骤，不会整页跳到 `account/buyer.html` 或 `account/merchant.html`。这两份文件仍可单独打开，但不再代替授权流程。缺步骤用内置页。

步骤模板名固定为 `authorize.phone`、`authorize.code`、`authorize.password`、`authorize.approve`、`authorize.merchant.login`、`authorize.merchant.change-password`、`authorize.merchant.approve`，写在 `<template data-merclink="authorize.phone">` 这样的 template 里。买家 phone 步必须留空槽位 `<merclink-slot name="authorize.captcha"></merclink-slot>`，服务端注入人机验证。没有这个槽位就用内置页。notice 和手机号用 `authorize.notice`、`authorize.phone` 槽位，商家账号用 `authorize.account.name` 和 `authorize.account.phone`。不要在模板里写死验证码或成功文案。表单仍提交到现有地址。服务端不执行模板里的脚本。含有脚本、事件、危险地址，或无法按允许的标签解析时，该步使用内置页，不会删掉这些内容后继续套用模板。

密码步可以用 `<merclink-mode name="login">` 和 `<merclink-mode name="register">` 区分两种外观，服务端只放入当前这一种。批准步可以用 `<merclink-pending>` 和 `<merclink-idle>` 区分有没有待批准请求。没有这些标记时，该步模板整段使用。

未知路径只有明确要回退到首页时，才传 `fallback=index.html`。不要为了把表单填满而传它。回退不能用于保留路径，也不能用于 `/products` 或 `/products/{id}`。授权入口没有声明或文件不存在时，人留在内置授权页。

## 验收

发布前必须运行本地验收命令 `node accept.mjs`，并逐条核对本文件的「不能动」和「事实槽位」。验收失败就不要确认激活。任一条不满足，不得把该页面当作可发布，也不得把上传当成已经上线。

服务端每次请求渲染，不信任本地检查，也不执行上传的脚本。写死事实、缺少商品槽位、覆盖保留路径或把商品地址回退成首页时，确认激活返回校验失败，发布不得生效。sitemap 与下架地址由服务端执行，不靠店面自觉。Skill 里的句子不能代替这次服务端检查。

## 常见错误用法

- 把商品价格、库存或店名直接写进 HTML，指望以后手动再改。
- 不下载起始源码，按接口 JSON 重写首页和商品页。
- 换掉 `styles.css`，使 `.cover` 和 `.placeholder` 失效。
- 给 `product.cover` 再包一层封面，或把图片地址写进文件。
- 把预览里已经填好的 HTML 存回源码。
- 把本地预览看到的店名和商品说成已经激活上线。
- 支付宝跳回后立刻显示支付成功。
- 用整站回退让 `/products/{id}` 打开首页。
- 在注册页加「注册商家」。
- 改了授权页却没传 `authorize_buyer` 或 `authorize_merchant`，以为文件在包里就会生效。
- 把授权外观当成整页替换，或在 phone 步删掉人机验证槽位，指望页面脚本自己发短信。
- 为了表单看起来完整，没改授权页也传授权字段，或没有要求回退却传 `fallback=index.html`。
- 自己实现支付通知或验签。
- 修改 `/api`、`/oauth`、`/admin` 或两份购买和管理 Skill。
