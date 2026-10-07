# Spec Delta

## MODIFIED Requirements

### Requirement: Attributes match the active definition
Product fields MUST accept only active field keys, MUST match the field type, and MUST use a declared choice. Optional fields MAY be omitted. Price and stock MUST NOT be stored as catalog fields. The write MUST be rejected with `unknown_field` when the key is not an active field.

#### Scenario: Unknown attribute key
- **WHEN** a merchant writes a field key that is not an active field
- **THEN** the write is rejected with `unknown_field`

## ADDED Requirements

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
