# order-placement Specification

## Purpose

让买家 Agent 用一行规格创建不可由调用方改价的订单，并保证重复业务单号不会重复扣库存。

## Requirements

### Requirement: Only a buyer can place one line
Only a buyer actor with `order:write` MUST be able to create an order. The request MUST contain exactly one line, with a quantity and the caller's `client_order_no`. More than one line MUST be rejected and MUST NOT create an order. A merchant actor MUST be rejected with `forbidden`.

#### Scenario: Two lines
- **WHEN** a buyer submits two items
- **THEN** the error is `too_many_items` and no order or stock change is saved

### Requirement: Variant selection is explicit when ambiguous
The line MUST identify a sellable variant of a published product. If the product has exactly one sellable variant, the line MAY send the product id instead. If the product has more than one sellable variant and the line sends only the product id, the system MUST reject it with `variant_required`.

#### Scenario: Product id with two sellable variants
- **WHEN** a buyer places an order with only a product id and that product has two sellable variants
- **THEN** no order is created and the error is `variant_required`

### Requirement: Server prices and snapshots the line
The caller MUST NOT supply a price. The line amount MUST equal the locked variant price multiplied by quantity. The order amount MUST equal the sum of line amounts. The order header MUST store buyer, grant, currency, amount, status, and expiry. The line MUST snapshot catalog, product, variant, title, variant options, unit price, custom fields, and schema revision. Currency MUST come from the variant's catalog.

#### Scenario: Caller sends a price
- **WHEN** a buyer includes a price in the order request
- **THEN** that price is ignored or the request is rejected, and the stored line amount equals the variant price times quantity

### Requirement: Stock and idempotency share one transaction
When the variant has finite stock, the system MUST lock that variant and decrement stock in the same transaction that writes the order header, the one line, and one pending payment record. Unlimited stock MUST NOT be decremented. Repeating the same buyer and `client_order_no` MUST return the original order and MUST NOT add a line or decrement stock again. A different buyer using the same client order number MUST NOT receive the first buyer's order.

#### Scenario: Repeated client order number
- **WHEN** the same buyer repeats a successful `client_order_no`
- **THEN** the response is the original order and the variant stock is unchanged from the first request

#### Scenario: Insufficient stock
- **WHEN** the requested quantity exceeds finite stock
- **THEN** the error is `insufficient_stock` and no order is written

### Requirement: Order reads are scoped
A buyer MUST read only their own orders. A merchant with `order:read` MUST read only orders whose lines belong to that merchant's catalogs, and MUST NOT change payment status. There MUST be no merchant endpoint that marks an order paid.

#### Scenario: Buyer reads another buyer's order
- **WHEN** a buyer requests an order id owned by another buyer
- **THEN** the order is not returned
