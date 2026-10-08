# Design

## Context

见 `proposal.md`。国内创建支付固定调用 `alipay.trade.page.pay`，产品码 `FAST_INSTANT_TRADE_PAY`，并用 `pageExecute(..., "GET")` 把网关 URL 放进 `payment.action`。`out_trade_no` 是支付记录 id。订单事务提交后才向支付宝创建支付。同一买家重复 `client_order_no` 时，若订单和支付仍是 `pending`，会用同一支付 id 再创建一次。通知入口是 `POST /api/v1/payments/alipay/notify`。查询和关闭分别是 `alipay.trade.query` 与 `alipay.trade.close`。

电脑网站支付的官方收银台面向电脑浏览器，页面上是付款码。手机网站支付的官方接口是 `alipay.trade.wap.pay`，产品码 `QUICK_WAP_WAY`。它同样是页面跳转：服务端生成 URL，浏览器顶层打开。支付宝先尝试唤起 App；唤起失败时，由其页面进入 H5 收银台。本系统不实现唤起，也不解析这个回退。

## Goals / Non-Goals

**Goals:**

- 手机 Agent 能拿到一条可在内置页顶层打开的手机网站支付 URL。
- 电脑 Agent 的缺省行为保持电脑网站支付。
- 一条支付记录只对应一个支付宝产品码。
- 支付是否成功仍只由验签通知或查单决定。

**Non-Goals:**

- 不实现 `alipay.trade.app.pay`、当面付或 JSAPI。内置页能跳转，不构成接入原生 SDK 的理由。
- 不根据 User-Agent、`Sec-CH-UA` 或 IP 猜测渠道。
- 不在一次创建中同时返回电脑和手机两条可支付 URL。支付宝以 `out_trade_no` 对应一笔单据，第二个产品码不能安全地并存在同一支付 id 上。
- 不新增 `return_url` 或 `quit_url` 页面。同步回跳不可靠，也不能把订单标成已支付。
- 不实现退款，不打开国际 Alipay+，不新增通知路由或错误码。
- 不把渠道写进订单头，也不为换渠道新增第二条支付记录。v1 仍是一笔订单一条支付记录。

## Decisions

### 第一次下单选定渠道

请求字段是 `payment_channel`，只允许 `desktop` 和 `mobile`。缺省 `desktop`。其他值是 `validation_error`，不写订单、不扣库存。

渠道在订单事务内写入 `payments.channel`。已有行迁移为 `desktop`。创建支付宝单据时只读这一列：

- `desktop`：`alipay.trade.page.pay`，`FAST_INSTANT_TRADE_PAY`。
- `mobile`：`alipay.trade.wap.pay`，`QUICK_WAP_WAY`。

两种都用 GET 的 `pageExecute`。`payment.action` 必须是以 `https://` 开头的完整 URL。私钥不得出现在 URL 或日志之外的响应里。响应增加 `payment.channel`，取值与支付记录一致。

开发桩按渠道返回不同的 HTTPS URL，测试不连接支付宝。

### 重复下单不能换产品码

同一买家再次提交同一个 `client_order_no` 时，库存和支付记录都不变。若原支付仍是 `pending`，只用已保存的渠道重新生成 URL。请求里另一个 `payment_channel` 被忽略，不调用另一个支付宝方法，也不返回错误。响应里的 `payment.channel` 让 Agent 看到实际渠道。

因此手机 Agent 必须在第一笔请求带上 `mobile`。已经落成 `desktop` 的订单，不能靠重试变成手机收银台，也不能靠新的 `client_order_no` 换渠道，因为那会再扣库存。Skill 必须写明这一点。

### 通知和查单不分支

手机网站支付的异步通知仍是支付宝 POST 到现有 `notify_url`。验签、`app_id`、交易状态和 `out_trade_no` 的处理保持一条路径。查询和关闭也继续按支付 id 调用现有方法。渠道不参与“是否已支付”的判断。

未签约手机网站支付时，支付宝拒绝创建。这仍映射为 `payment_retryable`，订单保持 `pending`。同一 `client_order_no` 可以在签约完成后重试，因为渠道已经是 `mobile`，不会改去创建电脑单据。

### 顶层打开是调用方责任

服务端只保证 URL 完整且属于所选官方接口。购买 Skill 要求：手机付款人，包括能做 HTTPS 跳转的 Agent 内置页，使用顶层导航打开整段 URL；不要放进 iframe，不要截断或改写 query。电脑付款人继续打开电脑渠道 URL，用支付宝 App 扫页面上的付款码。两种打开都不等于成功。

## Risks / Trade-offs

- [商户只签了电脑网站支付] → 手机创建返回 `payment_retryable`。发布说明要求同时签约手机网站支付。不在运行时静默降级成电脑 URL，否则手机用户又回到扫码页。
- [内置页只放行 HTTPS，拦下 `alipays://`] → 接受。官方手机网站支付会在唤起失败后进入 H5 收银台。本系统不另做 scheme 跳转。
- [Agent 漏传 `mobile`，第一笔已是电脑渠道] → 该订单在超时前不能换成手机收银台。Skill 把这写成调用规则，而不是服务端猜设备。
- [GET URL 很长，聊天或内置页截断后验签失败] → Skill 要求原样打开。不改成 POST HTML 表单，因为当前调用方消费的是 URL，不是一段要写进响应的 HTML。
- [用户付完停在支付宝页] → 不增加回跳页。Agent 继续查订单，直到 `paid` 或 `closed`。

## Migration Plan

先确认商户已签约手机网站支付，再发布带 `payments.channel` 的迁移和应用。旧行默认为 `desktop`，旧 Agent 不传字段时行为不变。回滚应用前保留该列；旧版本忽略未知列即可。不要在回滚后把已创建的 `mobile` 单据改用 `page.pay` 再请求一次。

## Open Questions

无。
