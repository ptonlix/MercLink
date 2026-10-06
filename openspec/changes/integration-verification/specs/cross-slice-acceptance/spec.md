# Spec Delta

## Purpose

在五个切片合并进同一个进程后，验证 PRD 第 12 节的跨模块完成标准在真实事务中仍然成立。

## ADDED Requirements

### Requirement: One process serves every slice
After merge, one process MUST serve the super-admin pages, authorization pages, public pages, both skills, `/api/v1`, and the payment notification route. Identity, catalog, and commerce registrations MUST be active together. Cross-slice foreign keys MUST be enforced for merchant to catalog, buyer to order, and order line to catalog, product, and variant.

#### Scenario: Composed health and metadata
- **WHEN** the merged process starts with the required configuration
- **THEN** the health check, protected-resource metadata, both skills, and the public landing page all respond from that process

### Requirement: Merchant and buyer agents complete the PRD loop
A merchant agent that receives only the merchant skill URL MUST be able to create a second catalog, add a number field and a select field, create two variants, and publish. A buyer agent that receives only the buyer skill URL MUST be able to find that product, place an order for one variant, and observe `paid` only after a verified payment result. Buying one variant MUST decrement only that variant's stock.

#### Scenario: Two catalogs and one paid line
- **WHEN** the merchant flow publishes a product with two variants and the buyer flow pays for one variant
- **THEN** the other catalog's required fields are unchanged, only the purchased variant stock decreases, and the order status becomes `paid` after verification

### Requirement: Isolation and destructive changes hold after wiring
A merchant token MUST NOT read or modify another merchant's catalogs, products, or orders. A buyer token MUST NOT read another buyer's order or call publish. Revoking one grant MUST invalidate only that refresh token. A breaking field change without confirmation MUST NOT unpublish products; with confirmation, published products missing the new required value MUST be unpublished. A soft-deleted product MUST disappear from the buyer API and public page while its order snapshot remains, and restore MUST leave it unpublished.

#### Scenario: Cross-account access after wiring
- **WHEN** merchant A requests merchant B's catalog and buyer A requests buyer B's order
- **THEN** both requests are denied and no foreign data is returned

### Requirement: Payment timeout and idempotency use the real transaction
Repeating `client_order_no` for the same buyer MUST return the original order without a second stock decrement. An unpaid order MUST close after expiry, restore finite stock once, and cancel the provider payment. An order with more than one item MUST be rejected. The caller MUST NOT be able to set the price.

#### Scenario: Expiry in the composed database
- **WHEN** an unpaid order expires and the scanner runs against the composed database
- **THEN** the order is `closed`, stock is restored once, and the provider cancel is requested once
