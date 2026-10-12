# Spec Delta

## MODIFIED Requirements

### Requirement: One process serves every slice
After merge, one process MUST serve the super-admin pages, authorization pages, public pages, both skills, `/api/v1`, and the payment notification route. Identity, catalog, and commerce registrations MUST be active together. Cross-slice foreign keys MUST be enforced for merchant to catalog, buyer to order, and order line to catalog, product, and variant. A process that starts with purchase mode disabled MUST do so without captcha, SMS, or payment-merchant credentials, and MUST still serve the health check, merchant skill, public landing page, and product discovery.

#### Scenario: Composed health and metadata
- **WHEN** the merged process starts with purchase mode enabled and the configuration that mode requires
- **THEN** the health check, protected-resource metadata, both skills, and the public landing page all respond from that process

#### Scenario: Discovery mode starts without vendor credentials
- **WHEN** the merged process starts with purchase mode disabled and without captcha, SMS, or payment-merchant credentials
- **THEN** the health check, merchant skill, and public landing page respond, and buyer order placement returns `purchase_disabled`

### Requirement: Merchant and buyer agents complete the PRD loop
A merchant agent that receives only the merchant skill URL MUST be able to create a second catalog, add a number field and a select field, create two variants, and publish. That published product MUST be publicly discoverable whether or not purchase mode is enabled. When purchase mode is enabled, a user agent that receives only `/skill.md` MUST be able to find that product, place an order for one variant, and observe `paid` only after a verified payment result. Buying one variant MUST decrement only that variant's stock. When purchase mode is disabled, that same user skill MUST NOT be sufficient to place an order, and order placement MUST return `purchase_disabled` without decrementing stock.

#### Scenario: Two catalogs and one paid line
- **WHEN** purchase mode is enabled and the merchant flow publishes a product with two variants and the user flow pays for one variant
- **THEN** the other catalog's required fields are unchanged, only the purchased variant stock decreases, and the order status becomes `paid` after verification

#### Scenario: Published product is discoverable without purchase
- **WHEN** purchase mode is disabled and the merchant flow publishes a product
- **THEN** the public product page shows that product and an order attempt does not decrement stock

### Requirement: Payment timeout and idempotency use the real transaction
When purchase mode is enabled, repeating `client_order_no` for the same buyer MUST return the original order without a second stock decrement. An unpaid order MUST close after expiry, restore finite stock once, and cancel the provider payment. An order with more than one item MUST be rejected. The caller MUST NOT be able to set the price. When purchase mode is disabled, the expiry scanner MUST NOT close that order or restore stock.

#### Scenario: Expiry in the composed database
- **WHEN** purchase mode is enabled and an unpaid order expires and the scanner runs against the composed database
- **THEN** the order is `closed`, stock is restored once, and the provider cancel is requested once

#### Scenario: Expiry scanner does not run the close path while disabled
- **WHEN** purchase mode is disabled and an already expired unpaid order is scanned
- **THEN** the order remains pending and stock is not restored
