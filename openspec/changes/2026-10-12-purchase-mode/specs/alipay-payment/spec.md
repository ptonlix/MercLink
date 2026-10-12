# Spec Delta

## MODIFIED Requirements

### Requirement: Expiry closes and restores stock
When the process started with purchase mode enabled, a pending order MUST expire 30 minutes after creation unless paid. The expiry job MUST lock the order, close its payment and order header, restore each line's finite stock once, and ask the payment port to cancel. A second scan MUST NOT restore stock again. Refunds MUST NOT be implemented. When the process started with purchase mode disabled, the expiry job MUST NOT close an order, MUST NOT restore stock, and MUST NOT call a payment provider.

#### Scenario: Timeout
- **WHEN** purchase mode is enabled and an unpaid order passes its expiry and the scanner runs
- **THEN** the order and payment are `closed`, finite stock is increased by the line quantity, and a later scan does not increase it again

#### Scenario: Scanner while purchase is disabled
- **WHEN** purchase mode is disabled and an unpaid order is already past its expiry
- **THEN** the scanner leaves the order and stock unchanged and does not call a payment provider

## ADDED Requirements

### Requirement: Disabled purchase does not create payments
When purchase mode is disabled, the system MUST NOT create a payment record or call a payment provider for a new order. A payment notification whose signature cannot be verified MUST NOT change payment or order state. Lack of payment-merchant credentials MUST NOT by itself mark an order `paid`.

#### Scenario: Notification without merchant credentials
- **WHEN** purchase mode is disabled, payment-merchant credentials are absent, and a client posts a payment notification
- **THEN** the order status does not become `paid`
