# Spec Delta

## MODIFIED Requirements

### Requirement: Notification updates payment before order
The notification endpoint MUST verify the Alipay provider signature before changing state. A failed signature MUST be rejected and MUST NOT change the order. A verified paid notification for a `pending` payment MUST mark the payment `paid` and then mark the order header `paid` in one transaction, and that transition MUST re-read the order under its row lock. Only when both the order and the payment are still `pending` MAY they become `paid`, and the update MUST be conditional on `status=pending`. If the re-read finds the order or payment already `closed`, a matching paid observation MUST NOT mark either `paid` and MUST NOT change stock. Official Alipay MUST NOT be treated as payable after a successful upstream close, and a closed official Alipay payment MUST NOT create an unapplied receipt. A notification verified by the Alipay port for a payment whose stored provider is not `alipay` MUST fail and MUST NOT change the order, payment, stock, or receipts. A repeated paid notification MUST NOT apply a second state change. The payer identity MUST remain the provider's; the system MUST NOT create a payer account.

#### Scenario: Invalid signature
- **WHEN** a notification fails signature verification
- **THEN** the payment and order remain unchanged

#### Scenario: Verified payment
- **WHEN** a verified notification says a pending payment is paid
- **THEN** the payment status is `paid` and the order status becomes `paid`

#### Scenario: Close already succeeded
- **WHEN** official Alipay has successfully closed the trade
- **THEN** a later payment attempt is not a paid order and no unapplied receipt is created

#### Scenario: Late paid observation after close
- **WHEN** a matching paid observation is applied after the order and payment are already `closed` and finite stock has been restored
- **THEN** the order and payment stay `closed`, stock is unchanged, and no unapplied receipt is created

#### Scenario: Notification belongs to another provider
- **WHEN** the Alipay notify route verifies a notification for a payment whose stored provider is not `alipay`
- **THEN** the response is `fail` and the order, payment, stock, and receipts stay unchanged

### Requirement: Expiry closes and restores stock
A pending order MUST expire 30 minutes after creation unless paid. Before closing, the expiry job MUST query the payment port. If the provider reports paid and the amount parses and matches, the payment and order MUST become `paid` and stock MUST NOT be restored. If the provider reports paid but the amount is null or does not match, the job MUST treat the query as failed: it MUST NOT close the order, MUST NOT mark it `paid`, and MUST NOT restore stock. If the provider reports unpaid, the job MUST ask the payment port to cancel and MUST close the payment and order and restore each finite line only after cancellation outcome is `closed`. A query or cancellation failure, including `already_paid` whose amount cannot be compared, MUST NOT restore stock and MUST leave the order `pending` unless the amount matches an already-paid cancellation. A second scan MUST NOT restore stock again. A general refund MUST NOT be implemented.

#### Scenario: Timeout
- **WHEN** an unpaid official Alipay order passes its expiry, the provider query reports unpaid, and cancellation succeeds
- **THEN** the order and payment are `closed`, finite stock is increased by the line quantity, and a later scan does not increase it again

#### Scenario: Paid before close completes
- **WHEN** cancellation fails because the trade is already paid
- **THEN** the order becomes `paid` and finite stock is not increased

#### Scenario: Cancellation fails
- **WHEN** cancellation fails for a reason other than the trade already being paid
- **THEN** the order stays `pending` and finite stock is not increased

#### Scenario: Paid amount cannot be compared
- **WHEN** the provider query reports paid but the amount is missing or does not match the payment record
- **THEN** the order stays `pending` and finite stock is not increased
