# Proposal

## Why

现在的支付宝创建只用电脑网站支付 `alipay.trade.page.pay`。`payment.action` 是一条收银台 URL，付款人在外部浏览器打开可以走完通知和查单。手机上的 Agent，包括内置页已经能做 HTTPS 跳转的 WorkBuddy，打开的仍是给另一台设备扫码的电脑收银台。同一台手机扫不了自己屏幕上的码，支付在用户侧断掉。异步通知本身不依赖浏览器，缺的是手机上能完成付款的官方收银台。

## What Changes

- 国内支付宝增加手机网站支付。手机渠道调用 `alipay.trade.wap.pay`，产品码 `QUICK_WAP_WAY`。电脑渠道保持 `alipay.trade.page.pay` 和 `FAST_INSTANT_TRADE_PAY`。
- 买家在第一次下单时用 `payment_channel` 选择 `desktop` 或 `mobile`。缺省是 `desktop`，现有 Agent 不用改请求。
- 不看下单请求的 User-Agent。下单调用来自 Agent 进程，不是付款人的浏览器。
- 渠道写在这一条支付记录上，不写进订单头。同一 `out_trade_no` 不能再向另一个产品码下单。重复的 `client_order_no` 仍返回原订单，并按已保存的渠道重新生成 URL。
- 两种渠道都用服务端 `pageExecute` 的 GET 结果作为 `payment.action`。它必须是完整的 `https` URL，不是 HTML 表单，也不是本系统自己拼的 `alipays://`。
- 查询、关闭和异步通知仍走现有的 `alipay.trade.query`、`alipay.trade.close` 和同一个通知路由。打开链接仍不等于已支付。
- 购买 Skill 告诉手机上的 Agent：第一次就传 `mobile`，用顶层导航打开完整 URL，不要放进 iframe，也不要为了换渠道再下一笔订单。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `alipay-payment`: 按支付记录上的渠道创建电脑或手机网站支付，重复下单不得换成另一个产品码。
- `order-placement`: 接受并校验 `payment_channel`，把选定渠道和订单、支付记录放在同一个事务里。
- `agent-skills`: 购买 Skill 说明手机渠道、顶层打开，以及不能靠再下一单切换渠道。

## Impact

- `payments` 增加渠道列。已有行视为 `desktop`。订单头不加字段。
- 支付宝适配器按渠道选择方法和产品码。查询、关闭、验签通知不新增路由。
- 国际 Alipay+ 端口保持关闭，手机渠道也不开放。
- 商户必须已签约手机网站支付。未签约时创建失败仍是 `payment_retryable`，订单保持 `pending`。不新增错误码。
- 不实现 App 支付、当面付、JSAPI、退款，也不新增支付完成回跳页。成功仍只看通知或查单。
- 更新 PRD 7.2 和购买 Skill，使文档和实际返回的 URL 一致。
