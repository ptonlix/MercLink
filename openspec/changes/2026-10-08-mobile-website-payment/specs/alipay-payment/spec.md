# Spec Delta

## MODIFIED Requirements

### Requirement: Payment is created after the order transaction
After the order transaction commits, the system MUST ask the payment port to create a payment and return its action to the caller. The action MUST be whatever the provider returns for the payer to complete payment. If payment creation fails, the order MUST stay `pending` and the response MUST be a retryable error. One order MUST have one payment record in v1. Payment status MUST NOT be stored only on the order header. Domestic Alipay creation MUST use the channel stored on that payment record: `desktop` calls `alipay.trade.page.pay` with product code `FAST_INSTANT_TRADE_PAY`, and `mobile` calls `alipay.trade.wap.pay` with product code `QUICK_WAP_WAY`. Both MUST return the provider's GET page URL as `payment.action`, and that value MUST be an absolute `https` URL. The system MUST NOT choose the method from the order request's User-Agent. A repeated create for the same payment record MUST use the stored channel and MUST NOT call the other method.

#### Scenario: Provider create fails
- **WHEN** the order transaction commits and the payment port then fails
- **THEN** the order remains `pending` and the caller receives a retryable error

#### Scenario: Mobile channel
- **WHEN** a pending payment whose stored channel is `mobile` is sent to domestic Alipay
- **THEN** the create method is `alipay.trade.wap.pay`, the product code is `QUICK_WAP_WAY`, and `payment.action` is an absolute `https` URL

#### Scenario: Repeated create keeps the stored method
- **WHEN** a pending desktop payment is submitted again with a requested mobile channel
- **THEN** Alipay is called with `alipay.trade.page.pay` only, and the response `payment.channel` is `desktop`
