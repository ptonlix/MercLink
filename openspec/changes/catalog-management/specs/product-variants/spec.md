# Spec Delta

## Purpose

让商家 Agent 创建商品和实际可售规格，并把上架、下架、软删除和恢复明确区分开。

## ADDED Requirements

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
Product attributes MUST accept only active field keys, MUST match the field type, and MUST use a declared select option. Optional fields MAY be omitted. Price and stock MUST NOT be stored as catalog attributes.

#### Scenario: Unknown attribute key
- **WHEN** a merchant writes an attribute key that is not an active field
- **THEN** the write is rejected with `unknown_field`
