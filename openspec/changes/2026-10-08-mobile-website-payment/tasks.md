# Tasks

## 1. 渠道

- [x] 1.1 为 `payments` 增加只允许 `desktop` 或 `mobile` 的渠道列，已有行视为 `desktop`，并验证订单头没有渠道字段
- [x] 1.2 在领域层解析 `payment_channel`：缺省 `desktop`，未知值拒绝且不写订单，并验证下单不读取 User-Agent

## 2. 支付宝

- [x] 2.1 按已保存渠道创建支付：电脑用 `alipay.trade.page.pay` 和 `FAST_INSTANT_TRADE_PAY`，手机用 `alipay.trade.wap.pay` 和 `QUICK_WAP_WAY`，两者都返回完整 `https` URL
- [x] 2.2 同一 `client_order_no` 再次下单时忽略请求中的另一个渠道，只用原渠道重新生成 URL，并在响应中返回 `payment.channel`
- [x] 2.3 验证查询、关闭和现有通知路由不因渠道分叉；未签约或网关拒绝仍是 `payment_retryable`，订单保持 `pending`

## 3. 调用说明

- [x] 3.1 更新购买 Skill 和 PRD 7.2：手机第一次传 `mobile`，顶层打开完整 URL，不把打开当成成功，也不为换渠道另下一单
- [x] 3.2 运行下单、支付宝适配器和 Skill 一致性测试，并验证缺省请求仍生成电脑网站支付 URL
