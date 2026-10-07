# catalog-schema Specification

## Purpose

让一个商家维护多本互不影响的目录，并安全地变更每本目录当前唯一的字段定义。

## Requirements

### Requirement: Catalogs are independent books
A merchant MUST be able to create more than one catalog. Each catalog MUST have a name and one currency, defaulting to `CNY`. Fields, field revisions, and products MUST belong to a catalog, not to the merchant account as a whole. A merchant token MUST NOT read or change another merchant's catalog.

#### Scenario: Two catalogs for one merchant
- **WHEN** a merchant creates a second catalog after the default catalog exists
- **THEN** both catalogs are listed for that merchant and a field added to one does not appear on the other

#### Scenario: Cross-merchant read
- **WHEN** a merchant token requests another merchant's catalog
- **THEN** the response is not found or forbidden and no field or product data is returned

### Requirement: Current field definition is singular
A catalog MUST have one current field definition. System fields `title`, `status`, and `cover` on products, `price` and `stock` on variants, and `currency` on the catalog MUST NOT be deletable by a merchant. Merchant fields MUST have an immutable key, a label, a type of text, number, boolean, or single-select, and a required flag. A single-select field's allowed values MUST be named `choices` in the API, domain, and database. The name `options` MUST NOT be used for those values. A retired key MUST NOT be reused.

#### Scenario: Key rename is rejected
- **WHEN** a merchant tries to change an existing field key
- **THEN** the key remains unchanged

#### Scenario: Select values are choices
- **WHEN** a merchant reads a single-select field
- **THEN** the response names the allowed values `choices` and does not include `options`

### Requirement: Safe field changes apply immediately
Adding an optional field, renaming a label, adding a choice, or changing required to optional MUST apply immediately, increment `schema_revision`, and append an immutable revision record. Existing published products MUST remain published.

#### Scenario: Optional field is added
- **WHEN** a merchant adds an optional number field to a catalog that already has a published product
- **THEN** the revision increases by one and that product stays published without a value for the new field

### Requirement: Breaking field changes require confirmation
Adding a required field, making a field required, removing a choice, changing a type, or retiring a field MUST first return a preview and MUST NOT change data. The same operation with confirmation MUST then apply in one transaction. Values that convert safely MUST be kept. Published products that lack a new required value, fail conversion, or still use a removed choice MUST be unpublished. Retiring a field MUST remove that key from current product fields and MUST NOT change historical order snapshots.

#### Scenario: Make required without confirmation
- **WHEN** a merchant submits make-required without confirmation
- **THEN** the response describes the incompatible published products and their fields are unchanged

#### Scenario: Confirmed make required
- **WHEN** the merchant repeats that operation with confirmation
- **THEN** published products missing the value become unpublished and a revision record stores the affected count

### Requirement: Retired field is distinguishable
A purchase filter that uses a retired field key MUST return error `field_retired`, not `unknown_field`.

#### Scenario: Filter on a retired key
- **WHEN** a public query filters on a key that was retired in the specified catalog
- **THEN** the error code is `field_retired`

### Requirement: Custom product values are named fields
Custom product values MUST be named `fields` in the API, domain types, database column, and new order snapshots. The name `attrs` MUST NOT remain as a column, type, or JSON key. Existing order snapshots that already used `fields_snapshot` MUST stay readable.

#### Scenario: Product write stores fields
- **WHEN** a merchant creates a product with custom values
- **THEN** those values are stored in `fields` and returned as `fields`
