# alipay-payment Specification

## Purpose

用支付宝官方支付能力完成收款确认，并在超时后关闭未支付订单、取消支付并按行回补库存。

## Requirements

### Requirement: Payment is created after the order transaction
After the order transaction commits, the system MUST ask the payment port to create a payment and return its action to the caller. The action MUST be whatever the provider returns for the payer to complete payment. If payment creation fails, the order MUST stay `pending` and the response MUST be a retryable error. One order MUST have one payment record in v1. Payment status MUST NOT be stored only on the order header.

#### Scenario: Provider create fails
- **WHEN** the order transaction commits and the payment port then fails
- **THEN** the order remains `pending` and the caller receives a retryable error

### Requirement: Notification updates payment before order
The notification endpoint MUST verify the provider signature before changing state. A failed signature MUST be rejected and MUST NOT change the order. A verified paid notification MUST mark the payment `paid` and then mark the order header `paid` in one transaction. A repeated paid notification MUST NOT apply a second state change. The payer identity MUST remain the provider's; the system MUST NOT create a payer account.

#### Scenario: Invalid signature
- **WHEN** a notification fails signature verification
- **THEN** the payment and order remain unchanged

#### Scenario: Verified payment
- **WHEN** a verified notification says the payment is paid
- **THEN** the payment status is `paid` and the order status becomes `paid`

### Requirement: Pending order query reconciles with the provider
When a caller reads an order that is still `pending`, the system MUST query the payment port once and apply the payment record back to the order header. The order header `paid` state MUST be a copy of the payment record, not an independently writable status.

#### Scenario: Provider already paid
- **WHEN** a buyer reads a pending order and the provider reports that payment as paid
- **THEN** the returned order status is `paid`

### Requirement: Expiry closes and restores stock
A pending order MUST expire 30 minutes after creation unless paid. The expiry job MUST lock the order, close its payment and order header, restore each line's finite stock once, and ask the payment port to cancel. A second scan MUST NOT restore stock again. Refunds MUST NOT be implemented.

#### Scenario: Timeout
- **WHEN** an unpaid order passes its expiry and the scanner runs
- **THEN** the order and payment are `closed`, finite stock is increased by the line quantity, and a later scan does not increase it again

### Requirement: Opening the payment action is not success
The system MUST NOT treat creation of a payment action, or the payer opening that action, as a paid order. Only an order status of `paid` means payment succeeded.

#### Scenario: Action returned
- **WHEN** order creation returns a payment action and no paid notification or paid query has occurred
- **THEN** the order status remains `pending`
