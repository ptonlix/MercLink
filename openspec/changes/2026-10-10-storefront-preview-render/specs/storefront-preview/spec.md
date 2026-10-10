# storefront-preview Specification

## Purpose

本地预览在激活前用源站当前公开事实填入店面槽位，让商家先确认版式，再决定是否激活。

## ADDED Requirements

### Requirement: Local preview renders current public facts
Before activation, `preview.mjs` MUST fill store and product slots in local HTML by reading the configured origin's published store and published products. `/` and `/products` MUST use the public store and the public product list. `/products/{id}` MUST use that public product, and MUST return 404 when the origin does not publish it. It MUST NOT fall those paths back to `index.html`. It MUST expand the product template and format prices the same way the server slot renderer does. It MUST fill `order.status` and the paid template only when the preview request includes the buyer's Authorization and an `order_id`, and the origin returns that order. It MUST NOT write those facts back into the static files. When the origin cannot supply a required public fact, the preview MUST return 502 instead of an empty slotted page. Rendering a preview MUST NOT activate a release.

#### Scenario: Home and product list show current facts
- **WHEN** the origin publishes a store named 北海南珠 and a product priced at 168000 minor units
- **THEN** the local preview home page shows that store name and the product list shows `¥1680.00` without activating a release

#### Scenario: Origin is down
- **WHEN** the static page contains fact slots and the origin cannot be reached
- **THEN** the preview returns 502 and does not present an empty slot as a successful render
