# Spec Delta

## ADDED Requirements

### Requirement: New orders use the single startup provider
The process MUST be configured with exactly one payment provider, either `alipay` or `easypay`. A new order MUST store that provider on its one payment record and MUST NOT read a provider from the order request. The order request MUST NOT accept a payment provider field. Sending one MUST be `validation_error` and MUST NOT write an order or change stock. `payment_channel` MUST remain the desktop or mobile choice and MUST NOT select the provider. If the configured provider is missing its credentials, the response MUST be `dependency_unavailable` and MUST NOT change stock. Finite and unlimited stock MUST use this same provider. Later reads, notifications, and expiry MUST use the provider stored on the payment record, not the current startup setting. A repeated `client_order_no` MUST return the original order and MUST NOT change its provider.

#### Scenario: Startup provider is Alipay
- **WHEN** a buyer places an order while the startup provider is `alipay` and does not send a provider field
- **THEN** the payment record provider is `alipay`

#### Scenario: Caller sends a provider
- **WHEN** a buyer sends a payment provider field
- **THEN** the error is `validation_error` and stock is unchanged

#### Scenario: Finite stock uses the startup provider
- **WHEN** a buyer orders a finite-stock variant while the startup provider is `alipay`
- **THEN** the payment record provider is `alipay` and stock is decremented in the order transaction

#### Scenario: Repeated order keeps provider
- **WHEN** the same buyer repeats a `client_order_no` created under `alipay` after the startup provider has changed to `easypay`
- **THEN** the original order is returned and its payment provider remains `alipay`

## MODIFIED Requirements

### Requirement: Order reads are scoped
A buyer MUST read only their own orders. A merchant with `order:read` MUST read only orders whose lines belong to that merchant's catalogs, and MUST NOT change payment status. There MUST be no merchant endpoint that marks an order paid. A merchant MAY resolve an unapplied receipt for that merchant's own order. That resolution MUST NOT mark the order paid. An order read that includes an unapplied receipt MUST include `failure_reason`, and that field MUST be `null` when no failure reason is stored.

#### Scenario: Buyer reads another buyer's order
- **WHEN** a buyer requests an order id owned by another buyer
- **THEN** the order is not returned

#### Scenario: Merchant tries to mark paid
- **WHEN** a merchant calls any order endpoint to set the order status to `paid`
- **THEN** the order status is unchanged

#### Scenario: Refund failure remains visible
- **WHEN** a merchant reads an order whose unapplied receipt failed to refund
- **THEN** `unapplied_receipt.failure_reason` is the stored reason, or `null` when none was stored
