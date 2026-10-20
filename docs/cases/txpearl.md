# 案例：童心珠宝（txpearl.cn）在 MercLink 上的上线过程

<p align="center">
  <a href="https://txpearl.cn"><img src="../images/showcase-txpearl-desktop.webp" alt="童心珠宝首页" width="720" /></a>
</p>

[童心珠宝](https://txpearl.cn) 是一家北海珍珠首饰店。整家店由一个 AI Agent 在一套 MercLink 部署上完成：从商家授权、建字段、录商品、写店铺介绍，到改版店面、上线和搜索引擎收录。Agent 全程只读这家店自己提供的公开文档，**没有改服务端仓库**。

本文按实际顺序整理关键步骤和踩过的坑，可以当作「用 Agent 开一家 MercLink 店」的参考流程。文中所有令牌、验证码、联系方式和执照信息都用 `<占位符>` 表示。

## 0. Agent 读了哪些文档

每个 MercLink 站点都自带下面这些入口：

| 地址                                             | 作用                                                             |
| ------------------------------------------------ | ---------------------------------------------------------------- |
| `/llms.txt`                                      | 给 Agent 的总入口，列出下面所有文档和接口                        |
| `/skill.md`                                      | 用户 Skill：匿名查询已上架商品（这家店未开启买入）               |
| `/merchant/skill.md`                             | 商家 Skill：令牌、目录、字段、商品、规格、封面、上下架、店铺介绍 |
| `/storefront/skill.md`                           | 店面 Skill：下载源码 → 修改 → 验收 → 上传 → 确认激活             |
| `/interfaces`                                    | 给人看的接口文档                                                 |
| `/api/v1/store`                                  | 公开读取已发布的店铺介绍                                         |
| `/index.md`、`/products.md`、`/products/{id}.md` | 服务端生成的 Markdown 版页面                                     |

## 1. 商家授权（OAuth 设备码）

依据 `/merchant/skill.md` 的「认证」一节：

1. Agent 调用 `POST /oauth/device/auth`（`application/x-www-form-urlencoded`），`client_id=merclink-agent`，`scope=field:write product:write product:read order:read`。scope 里必须有 `field:write` 或 `product:write`，否则打开的是买家注册页。
2. Agent 只把 `user_code` / `verification_uri_complete` 发给店主，`device_code` 自己保存。
3. 店主在浏览器用部署时创建的店主账号登录并批准。首次登录会先要求修改初始密码。**Agent 从不接触密码。**
4. Agent 轮询 `POST /oauth/token`（`grant_type=urn:ietf:params:oauth:grant-type:device_code`），处理 `authorization_pending` / `slow_down`。
5. 访问令牌约 15 分钟，过期后用 `grant_type=refresh_token` 换新；旧刷新令牌立即失效，要把新的一对保存好。令牌只存放在 Agent 本地权限为 600 的文件里，不打印、不进对话。

后面改店面时又走了一次设备码，scope 额外加上 `storefront:write`。只有 `product:write` 不能下载、上传或激活店面。

## 2. 目录字段：珍珠专用属性

部署启动时已经有一本「默认目录」。Agent 用 `POST /api/v1/catalogs/{id}/fields` 为它加了一组珍珠专用字段，例如：

| key            | 名称       | 类型          | 必填 | 选项示例                                             |
| -------------- | ---------- | ------------- | ---- | ---------------------------------------------------- |
| `pearl_type`   | 珍珠类型   | single-select | 是   | 淡水珍珠、爱迪生珍珠、Akoya 海水珍珠、大溪地黑珍珠…… |
| `shape`        | 形状       | single-select | 是   | 正圆、近圆、椭圆、水滴、巴洛克……                     |
| `body_color`   | 体色       | single-select | 否   | 白粉光、白银光、天然金……                             |
| `luster`       | 光泽       | single-select | 否   | 极强光、强光、中光、弱光                             |
| `nacre`        | 珠层厚度   | single-select | 否   | 极厚、厚、中等、薄                                   |
| `surface`      | 表面瑕疵   | single-select | 否   | 无瑕、微瑕、小瑕、瑕疵较多                           |
| `jewelry_type` | 首饰类型   | single-select | 是   | 项链、手链、耳钉、吊坠、戒指……                       |
| `metal`        | 金属材质   | single-select | 否   | 18K 金、925 银、无（裸珠）……                         |
| `has_cert`     | 是否有证书 | boolean       | 否   | —                                                    |
| `cert_org`     | 鉴定机构   | single-select | 否   | 国检 NGTC、其他……                                    |
| `cert_no`      | 证书编号   | text          | 否   | —                                                    |

要点：

- **新增必填字段是破坏性变更**。第一次请求只返回预览（`data.applied=false`，HTTP 状态仍可能是 201），Agent 检查到后用同一请求体加 `"confirm": true` 再发一次。判断是否写入要看 `data.applied`，不要看 HTTP 状态。
- 「珠径」这类可售差异**不做成目录字段**，而是做成规格轴。

## 3. 商品录入：6 款，按珠径定价

每款商品的流程一致：

1. **先传封面**：`POST /api/v1/catalogs/{cid}/images`（multipart，字段名 `file`，JPEG / PNG / WebP，≤ 5 MiB），只把返回的 `data.url`（本站 `/media/...`）写进 `cover`。
2. **建商品**：`POST /api/v1/catalogs/{cid}/products`，带 `title`、`cover`、`fields`；有规格时不带 `price`。
3. **声明规格轴**：`POST .../products/{pid}/axes`，`{"key": "bead_size", "label": "珠径"}`。
4. **只建实际出售的组合**：`POST .../products/{pid}/variants`，例如 `{"option_values": {"bead_size": "11-12mm"}, "price": 15800, "stock": 100}`。价格是**整数分**。
5. **上架**：`POST .../products/{pid}/publish`，再用公开的 `GET /api/v1/products/{pid}` 核对。

| 商品               | 规格（珠径 → 价格）                                       |
| ------------------ | --------------------------------------------------------- |
| 爱迪生珍珠吊坠     | 11-12mm ¥158 / 12-13mm ¥258 / 13-14mm ¥299 / 14-15mm ¥399 |
| 强光珍珠项链       | 3-4mm ¥99 … 11-12mm ¥599（6 档）                          |
| Akoya 强光珍珠吊坠 | 7-8mm ¥599 / 8-9mm ¥799                                   |
| 澳白绸缎光珍珠吊坠 | 11-12mm ¥799 / 12-13mm ¥1699 / 13-14mm ¥2999              |
| 大溪地珍珠吊坠     | 11-12mm ¥399 / 12-13mm ¥899 / 13-14mm ¥1999               |
| 设计款珍珠手链     | 无规格轴，直接 `price: 3900`，系统自动建默认规格          |

## 4. 店铺介绍（整店一份）

`PUT /api/v1/merchant/profile` 是**整份替换**，9 个字段必须全部出现（没有的填 `null`）：`display_name`、`summary`、`website_url`、`logo_url`、`area_served`、`address`、`license`、`contact`、`published`。

稳妥做法：先 `GET` 当前介绍，只改目标字段，再整份 `PUT`，最后用公开的 `GET /api/v1/store` 核对。

- **展示名 / 简介 / 区域 / 地址**：展示名「童心珠宝」，简介为纯文本，区域「全国顺丰包邮」，`published: true`。
- **Logo**：经目录图片接口上传后，把 `/media/...` 地址写入 `logo_url`。
- **客服**：二维码用**资料图片接口** `POST /api/v1/merchant/profile/images`（`purpose=contact_qr`）上传，`contact` 写入 `{"phone": "<客服电话>", "label": "<说明>", "qr_url": "<上传返回的 url>"}`。
- **营业执照**：先把店主拍的执照照片做透视校正和裁边，再把企业名称、统一社会信用代码、法人、注册地址**读给店主确认**，同意后才以 `purpose=license` 上传并写入 `license`。

> [!NOTE]
> 执照和客服二维码不能用目录图片接口上传；登录手机号、密码、身份证号不能写进任何公开字段。

## 5. 店面改版

依据 `/storefront/skill.md`：

1. `GET /api/v1/storefront/source` 下载起始源码包（需要 `storefront:write`），解压得到 `README.md`、`accept.mjs`、`preview.mjs`、`render-slots.mjs` 和 `static/`。保留一份原样副本作对照。
2. **只改四个正文文件**：`static/index.html`、`static/products/index.html`、`static/products/item.html`、`static/styles.css`。授权页和支付结果页保持内置。
3. 保留原有 class 和 `/styles.css` 链接；所有会变的事实（店名、简介、地址、客服、执照、商品名 / 封面 / 价格 / 库存）都用 `<merclink-slot name="...">`。商品页要显示描述时，在 `static/products/item.html` 声明可选槽 `<merclink-slot name="product.description"></merclink-slot>`；不声明则正文不出现描述，发布仍然有效。商品列表保留 `<template data-merclink="product">` 和 `products.next`；**不写 JSON-LD**（由服务端注入）。
4. 新设计：深海蓝 + 金色的「BEIHAI · PEARL ATELIER」首屏，标语和「浏览全部珍珠」按钮，四张卖点卡片，下面是商品集合、客服和营业执照区。营业执照用 `<details>` / `<summary>` 做了无 JS 的点击放大。
5. 用 `node preview.mjs` 本地预览（代理到线上源站，按激活后同样的规则填槽位），把改版前后的电脑 / 手机截图发给店主确认。
6. 生成一套 favicon（SVG、PNG、ICO、apple-touch-icon），放在 `static/assets/`。
7. 在三个页面的 `<head>` 中加入 Bing、百度、Google 的站点验证 `<meta>`。

## 6. 发布与激活：上传 ≠ 上线

店主确认「上线」后：

1. 本地验收 `node accept.mjs`，必须通过。
2. 打包 `source.zip`（与下载的源码包同结构）和 `static.zip`（`static/` 的内容）。
3. 上传：

   ```bash
   curl -H "Authorization: Bearer <ACCESS_TOKEN>" \
        -F "source=@release/source.zip;type=application/zip" \
        -F "static=@release/static.zip;type=application/zip" \
        https://<店铺域名>/api/v1/storefront/releases
   ```

   没改授权页，所以不传 `fallback`、`authorize_buyer`、`authorize_merchant`。

4. 确认激活：`POST /api/v1/storefront/releases/{id}/activate`，正文 `{"confirm": true}`。
5. 线上核对：`/`、`/products`、`/products/{id}`、`/styles.css`、`/robots.txt`、`/sitemap.xml` 均返回 200，每页有服务端注入的 `ld+json`。
6. 回滚预案：`POST /api/v1/storefront/rollback` 可把指针指回上一份发布。

整个过程共发布 3 次：首次改版上线；修正 favicon 路径；替换百度验证码并修复执照放大层不居中。

## 7. 上线后踩过的坑

| 问题                           | 原因                                                           | 处理                                                                         |
| ------------------------------ | -------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 根路径 `/favicon.ico` 返回 404 | 静态包里根目录的 `favicon.ico` 不会被提供，`/assets/` 下的可以 | 图标统一放到 `/assets/`，页面 `<link rel="icon">` 指向 `/assets/favicon.ico` |
| `www` 子域在站长平台验证失败   | `http://www` 308 跳转百度不跟随；`https://www` 没有证书        | 站长平台改为验证不带 www 的 `https://txpearl.cn`                             |
| 百度换站点后仍验证失败         | 百度每添加一次站点都会生成新的验证码                           | 换上新验证码后重新发布并激活（也可以改用 DNS CNAME 验证）                    |
| 执照放大层不居中               | `<summary>` 继承了基础类的 `max-width` 和 `margin`             | 打开状态下改为 `position: fixed; inset: 0` 的全屏 flex 居中遮罩              |
| `sitemap.xml` 不含商品详情页   | 服务端 sitemap 只列首页、商品列表、Skill 和接口文档            | 新商品上架后，把 `/products/{id}` 手动提交到搜索引擎                         |

## 8. 可复用的经验

1. **只读 Skill 就够**：`/llms.txt` → 三份 skill.md，足以让 Agent 完成从开店到上线的全部操作。
2. **scope 决定授权页**：商家 scope 打开商家登录页；改店面要额外申请 `storefront:write`；刷新令牌是一次性的。
3. **字段 vs 规格**：描述整件商品的属性做目录字段；尺寸、珠径这类可售差异做规格轴。价格永远是整数分。
4. **破坏性字段变更先预览**：看 `data.applied`，不要看 HTTP 状态。
5. **店铺介绍是整份 PUT**：先 GET 再改，9 个字段一个不能少；执照信息先给店主确认。
6. **图片接口别用错**：商品封面和 Logo 走目录图片接口，执照和客服二维码走资料图片接口。
7. **店面**：在下载的起始源码上改，事实全用槽位，不写 JSON-LD；`node accept.mjs` → 上传 → `{"confirm": true}` 激活。上传本身不会改变线上页面。
8. **静态资源放 `/assets/`**：根目录 `/favicon.ico` 不会被提供。
9. **SEO**：没有 www 证书时用裸域验证；百度验证码随站点变化；商品页 URL 需要主动推送。
10. **秘密不进仓库、不进对话**：令牌只放在 Agent 本地的受限文件中。
