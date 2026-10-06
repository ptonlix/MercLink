# Spec Delta

## Purpose

按调用方身份返回商品，并约束跨目录过滤，避免把不同目录的自定义字段混在同一次查询里。

## ADDED Requirements

### Requirement: Public visibility is limited to sellable published products
Anonymous callers, buyer actors, and public pages MUST see only published products that have at least one sellable variant, across all merchants. Variant lists in that view MUST contain only sellable variants. Unpublished, soft-deleted, and products with no sellable variant MUST be absent.

#### Scenario: Unpublished product
- **WHEN** an anonymous client searches all products
- **THEN** an unpublished product is not in the result

### Requirement: Merchant visibility is own catalogs
A merchant actor MUST see only that merchant's catalogs and MAY filter products by on or off status. Another merchant's products MUST NOT appear.

#### Scenario: Merchant lists off products
- **WHEN** a merchant queries one of their catalogs with status off
- **THEN** only that merchant's unpublished, non-deleted products in that catalog are returned

### Requirement: Cross-catalog filters are limited
A query without a catalog id MUST match keyword against title and text fields and MAY filter by minimum or maximum sellable price. A custom field filter without a catalog id MUST be rejected. Inside a catalog, number fields MUST support greater-than, less-than, and equal, and select or boolean fields MUST support equal. An unknown field MUST return `unknown_field` and MUST NOT be ignored. Results MUST be paginated.

#### Scenario: Field filter without catalog
- **WHEN** a client filters `field.weight_g.lte` without a catalog id
- **THEN** the request is rejected and no partial result is returned

#### Scenario: Unknown field inside a catalog
- **WHEN** a client filters a catalog by a key that was never defined there
- **THEN** the error code is `unknown_field`

### Requirement: Public query is registered on the shared seam
The catalog slice MUST register its public list and public get operations on the shared public-product seam. Those operations MUST use the same visibility rules as the public HTTP query.

#### Scenario: Page seam sees a published product
- **WHEN** a product is published with a sellable variant and the public-product seam is queried
- **THEN** the seam returns that product and its sellable variants only
