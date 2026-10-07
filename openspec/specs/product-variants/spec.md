# product-variants Specification

## Purpose

让商家 Agent 创建商品和实际可售规格，并把上架、下架、软删除和恢复明确区分开。

## Requirements

### Requirement: Default variant for a simple product
Creating a product with a price and stock and no option axes MUST create one sellable default variant. Price MUST be an integer in minor units. Empty stock MUST mean unlimited. A new product MUST start unpublished.

#### Scenario: Simple product creation
- **WHEN** a merchant creates a product with title, price, and stock in a catalog
- **THEN** the product is unpublished and has one sellable variant carrying that price and stock

### Requirement: Option axes describe only created combinations
A merchant MUST be able to declare option axes and then create only the combinations offered for sale. All sellable variants of a product MUST use the same axes. Once an axis-backed variant exists, an axis-free default variant MUST NOT remain sellable, and publishing MUST fail while it does. The system MUST NOT generate every possible combination automatically.

#### Scenario: Two sizes
- **WHEN** a merchant declares a size axis and creates variants for 40 and 42
- **THEN** only those two combinations exist and each has its own price and stock

#### Scenario: Mixed axes
- **WHEN** a product already has a size variant and the merchant adds a variant with only color
- **THEN** the new variant is rejected

### Requirement: Publishing checks current definition
Publishing MUST require every currently required catalog field and at least one sellable variant with a price. A soft-deleted product MUST NOT be publishable. Unpublishing a product MUST make every variant unbuyable while keeping the product in the merchant's normal list. A single variant MAY be made unsellable without unpublishing the product.

#### Scenario: Missing required field
- **WHEN** a merchant publishes a product that lacks a required catalog field
- **THEN** publishing is rejected and the product stays unpublished

#### Scenario: Product unpublished
- **WHEN** a merchant unpublishes a product
- **THEN** the public query does not return it and the merchant can still list it as off

### Requirement: Soft delete is not unpublish
Soft-deleting a product MUST hide it from public pages, buyer query, and ordering even if it has orders. Restoring it MUST clear only the deletion mark and leave it unpublished. Restoring a variant MUST leave it unsellable. The system MUST NOT offer physical deletion. Merchant management lists MUST exclude deleted products unless deletion is explicitly requested.

#### Scenario: Delete and restore
- **WHEN** a merchant soft-deletes a product that was published and then restores it
- **THEN** buyers cannot see it after deletion, and after restore it is visible to the merchant as unpublished

### Requirement: Attributes match the active definition
Product fields MUST accept only active field keys, MUST match the field type, and MUST use a declared choice. Optional fields MAY be omitted. Price and stock MUST NOT be stored as catalog fields. The write MUST be rejected with `unknown_field` when the key is not an active field.

#### Scenario: Unknown attribute key
- **WHEN** a merchant writes a field key that is not an active field
- **THEN** the write is rejected with `unknown_field`

### Requirement: Axes and variant values have distinct names
A product's declared axes MUST be named `axes` in merchant and public JSON. Creating an axis MUST use `POST /api/v1/catalogs/{id}/products/{product_id}/axes`. A variant's combination MUST be named `option_values` in requests and responses. The key `options` MUST NOT mean axes, variant values, or field choices. The old `/options` path and `options` request key MUST be rejected.

#### Scenario: Create an axis
- **WHEN** a merchant declares a size axis
- **THEN** the axis is created through the `/axes` path and later product reads include it under `axes`

#### Scenario: Create a variant
- **WHEN** a merchant creates a variant for size 42
- **THEN** the request and response use `option_values`, not `options`

### Requirement: Image rules have one definition
The maximum image size and the upload rate-limit numbers MUST be defined beside the catalog image domain rules. The upload use case MUST reject oversized files with that size constant. The Redis upload policy MUST be built from that same definition. Upload rate limiting MUST use the injected clock, not a direct system clock call in the use case.

#### Scenario: Oversized upload
- **WHEN** a merchant uploads a file larger than the domain maximum
- **THEN** the rejection uses that domain maximum and no object is stored
