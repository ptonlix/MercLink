# Spec Delta

## MODIFIED Requirements

### Requirement: Only a buyer can place one line
When purchase mode is enabled, only a buyer actor with `order:write` MUST be able to create an order. The request MUST contain exactly one line, with a quantity and the caller's `client_order_no`. More than one line MUST be rejected and MUST NOT create an order. A merchant actor MUST be rejected with `forbidden`. When purchase mode is disabled, every caller MUST be rejected with `purchase_disabled` before a database transaction. That rejection MUST NOT create an order, decrement stock, create a payment record, or call a payment provider. A repeated `client_order_no` MUST NOT return an existing order while purchase is disabled.

#### Scenario: Two lines
- **WHEN** purchase mode is enabled and a buyer submits two items
- **THEN** the error is `too_many_items` and no order or stock change is saved

#### Scenario: Purchase is disabled
- **WHEN** purchase mode is disabled and a buyer with `order:write` submits one valid line
- **THEN** the error is `purchase_disabled` and stock is unchanged

### Requirement: Order reads are scoped
When purchase mode is enabled, a buyer MUST read only their own orders. When purchase mode is disabled, a buyer order read MUST be rejected with `purchase_disabled` and MUST NOT query a payment provider. A merchant with `order:read` MUST read only orders whose lines belong to that merchant's catalogs, whether or not purchase mode is enabled, and MUST NOT change payment status. There MUST be no merchant endpoint that marks an order paid.

#### Scenario: Buyer reads another buyer's order
- **WHEN** purchase mode is enabled and a buyer requests an order id owned by another buyer
- **THEN** the order is not returned

#### Scenario: Buyer reads while purchase is disabled
- **WHEN** purchase mode is disabled and a buyer requests their own order
- **THEN** the error is `purchase_disabled` and no payment provider is queried

#### Scenario: Merchant reads a historical order
- **WHEN** purchase mode is disabled and a merchant with `order:read` requests an order whose line belongs to that merchant's catalog
- **THEN** the order is returned and its payment status is not changed by that read
