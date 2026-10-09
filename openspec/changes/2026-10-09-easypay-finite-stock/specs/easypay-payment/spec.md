# Spec Delta

## Purpose

用易支付协议收取有限库存订单的款项，并在本地关闭后把仍到达的成功收款记成可由商家处理的未履约收款。

## ADDED Requirements

### Requirement: EasyPay action is an absolute https URL
After the order transaction commits, EasyPay creation MUST use the stored payment id as the merchant order number and the stored channel as the device. `desktop` MUST send a desktop device. `mobile` MUST send `mobile` and MUST prefer an absolute `https` `payurl2` when the provider returns one. The system MUST NOT choose the device from User-Agent or IP. `payment.action` MUST be an absolute `https` URL. A response that contains only a QR code, an image, or an `alipays://` link MUST be a create failure. The first successful URL MUST be stored and reused for the same pending payment. A repeated create MUST NOT submit that merchant order number again.

#### Scenario: QR-only response
- **WHEN** EasyPay creation returns a QR code or image and no absolute `https` pay URL
- **THEN** the order stays `pending` and the caller receives `payment_retryable`

#### Scenario: Repeated pending payment
- **WHEN** the same pending EasyPay payment is created again
- **THEN** the stored absolute `https` URL is returned and EasyPay is not given that merchant order number again

### Requirement: EasyPay notification is verified before use
The EasyPay notify route MUST accept the provider's GET or POST parameters, reject unknown parameter names, and verify the MD5 signature before changing state. A failed parse or signature MUST return `fail` and MUST NOT change the payment, order, or stock. Only `TRADE_SUCCESS` is paid. The amount MUST match the payment record's minor units exactly. An amount mismatch MUST return `fail` and MUST NOT change state. An unknown merchant order number MUST return `success` and MUST NOT create a payment or order.

#### Scenario: Invalid signature
- **WHEN** an EasyPay notification signature does not match
- **THEN** the response is `fail` and the payment and order remain unchanged

#### Scenario: Amount mismatch
- **WHEN** a signed EasyPay notification reports a different amount from the payment record
- **THEN** the response is `fail` and no unapplied receipt is created

#### Scenario: Unknown merchant order
- **WHEN** a verified EasyPay notification names a merchant order that is not stored
- **THEN** the response is `success` and no payment or order is created

#### Scenario: Known payment belongs to another provider
- **WHEN** a notification is verified by the EasyPay port for a stored payment whose provider is not `easypay`
- **THEN** the response is `fail` and the order, payment, stock, and receipts stay unchanged

### Requirement: Finite EasyPay stock waits through a grace period
A pending finite-stock EasyPay order MUST be queried before stock is restored. If the provider reports paid and the amount parses and matches, the payment and order MUST become `paid` and stock MUST NOT be restored. If the provider reports paid but the amount is null or does not match, the query MUST be treated as failed: the job MUST NOT close the order, MUST NOT mark it `paid`, and MUST NOT restore stock. Only an explicit unpaid status, or a failed response code whose message exactly says the order does not exist, is unpaid. A merchant-missing message, a signature-missing message, any other error, or an unknown payload MUST be `payment_retryable` and MUST NOT be treated as unpaid. If the provider reports unpaid at expiry, stock MUST remain decremented until five minutes after expiry. At that later time the system MUST query again. If still unpaid, it MUST close the payment and order and restore each finite line once. A provider query failure MUST NOT restore stock. A second scan MUST NOT restore stock again. EasyPay cancellation MUST NOT be called while closing, MUST be a no-op, and MUST NOT be treated as proof that the upstream order is closed. Unlimited stock that is still unpaid at expiry MUST be closed without the five-minute wait. Yuan amounts of `10`, `10.5`, and `10.50` MUST parse to integer fen; more than two decimal places and non-numeric text MUST NOT parse.

#### Scenario: Paid during grace
- **WHEN** a finite-stock EasyPay order is unpaid at expiry and a matching paid query arrives before the five-minute point
- **THEN** the order is `paid` and finite stock is not increased

#### Scenario: Unpaid after grace
- **WHEN** both the expiry query and the query five minutes later report unpaid
- **THEN** the order and payment are `closed`, finite stock is increased once, and a later scan does not increase it again

#### Scenario: Query error is not unpaid
- **WHEN** EasyPay query returns a failed code whose message says the merchant or signature does not exist
- **THEN** the query is `payment_retryable`, the order stays `pending`, and finite stock is not increased

#### Scenario: Paid amount cannot be compared
- **WHEN** EasyPay query reports paid but the amount is missing or does not match
- **THEN** the order stays `pending` and finite stock is not increased

### Requirement: Late payment after close is an unapplied receipt
A verified paid notification or paid query for a `closed` payment MUST NOT mark the payment or order `paid`, MUST NOT change stock, and MUST NOT call the provider refund by itself. When the amount matches, the system MUST store one unapplied receipt with the provider trade number and amount, then return `success`. If a paid observation was computed from a stale pending graph, the status transition MUST re-read under the order row lock. When that re-read finds the order or payment already `closed` and the amount matches, it MUST NOT mark either `paid` and MUST NOT change stock; the unapplied receipt MUST be inserted in that same transaction. A repeated notification for the same payment MUST NOT create a second receipt. Order reads MUST include `unapplied_receipt.failure_reason`, or `null` when there is no failure reason.

#### Scenario: Paid after stock release
- **WHEN** a signed EasyPay success arrives after the payment is `closed` and the amount matches
- **THEN** the order stays `closed`, stock is unchanged, one open unapplied receipt is stored, and the notify response is `success`

#### Scenario: Close wins the race
- **WHEN** a matching paid observation is applied with a stale pending graph after close has already restored finite stock
- **THEN** the order stays `closed`, stock is unchanged, and one unapplied receipt is stored in that transition

### Requirement: Merchant resolves an unapplied receipt without marking paid
A merchant MUST resolve only an open or refund-failed receipt for a payment whose order line belongs to that merchant. The only actions are manual fulfillment and a full refund of the receipt amount. A request MUST claim the receipt with a conditional update before calling the refund port or marking it fulfilled: the status MUST still be `open` or `refund_failed`, and `updated_at` MUST equal the value just read. Only the claimer MAY call `refundPayment` or set `fulfilled_manually`. A request that does not claim MUST return `conflict` and MUST NOT call the upstream refund. After a claim, upstream failure MUST mark the receipt `refund_failed` and keep the failure reason. Manual fulfillment MUST mark the receipt fulfilled, MUST NOT change stock, and MUST NOT mark the order `paid`. Refund MUST be sent to EasyPay for the original amount only. Success MUST mark the receipt refunded. Failure MUST mark it refund failed, keep the order `closed`, and return `payment_retryable`. A receipt that is already fulfilled or refunded MUST return `conflict`. Refund MUST NOT be offered for an official Alipay receipt. There MUST be no endpoint that marks the order paid.

#### Scenario: Manual fulfillment
- **WHEN** the owning merchant resolves an open receipt by manual fulfillment
- **THEN** the receipt is fulfilled, the order remains `closed`, and stock is unchanged

#### Scenario: Refund fails
- **WHEN** the owning merchant requests a refund and EasyPay rejects it
- **THEN** the receipt is refund failed, the order remains `closed`, and the response is `payment_retryable`

#### Scenario: Other merchant
- **WHEN** a merchant resolves a receipt whose order line belongs to another merchant
- **THEN** the receipt is not changed

#### Scenario: Second request after claim
- **WHEN** a second refund starts after the first request has claimed the receipt and before that claim is finished
- **THEN** the second response is `conflict` and the refund port is not called again

### Requirement: EasyPay needs a trusted connection address before stock changes
A new order whose startup provider is EasyPay MUST have a usable connection address before the order transaction. The address MUST prefer `x-real-ip`, otherwise the last hop of `x-forwarded-for`, MUST be at most 64 characters, and MUST look like an IP. An empty or unusable value is no address. The application MUST NOT trust a caller-supplied first hop and MUST NOT use the address to choose `payment_channel`. Without a usable address the response MUST be `payment_retryable` and MUST NOT write an order or change stock. A repeated pending EasyPay payment with no stored address and no new address MUST NOT create another upstream order.

#### Scenario: Missing address before the order transaction
- **WHEN** a buyer places a new EasyPay order without a trusted connection address
- **THEN** the error is `payment_retryable` and stock is unchanged

#### Scenario: Retry without an address
- **WHEN** a pending EasyPay payment has no stored address and the retry also has none
- **THEN** EasyPay is not asked to create that merchant order again
