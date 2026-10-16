# product-query Specification

## MODIFIED Requirements

### Requirement: Cross-catalog filters are limited
A query without a catalog id MUST match keyword against title, product description, and text fields and MAY filter by minimum or maximum sellable price. A description match MUST NOT require a catalog id. A custom field filter without a catalog id MUST be rejected. Inside a catalog, number fields MUST support greater-than, less-than, and equal, and select or boolean fields MUST support equal. An unknown field MUST return `unknown_field` and MUST NOT be ignored. Results MUST be paginated.

#### Scenario: Field filter without catalog
- **WHEN** a client filters `field.weight_g.lte` without a catalog id
- **THEN** the request is rejected and no partial result is returned

#### Scenario: Unknown field inside a catalog
- **WHEN** a client filters a catalog by a key that was never defined there
- **THEN** the error code is `unknown_field`

#### Scenario: Keyword matches a description across catalogs
- **WHEN** a client searches without a catalog id for a word that appears only in a published product's description
- **THEN** that product is included and a product whose description does not contain the word is not included for that reason

### Requirement: Public and merchant product names match
Public product JSON and merchant product JSON MUST use `fields` for custom values, `axes` for declared axes, and `option_values` for variant combinations. They MUST NOT return `attrs` or an `options` key for any of those three concepts. Both JSON shapes MUST include `description` beside `title`. An empty description MUST be `null`. The description MUST NOT be copied into `fields`.

#### Scenario: Public product uses the shared names
- **WHEN** a published product is returned by the public query
- **THEN** its custom values are under `fields` and its sellable combinations are under `option_values`

#### Scenario: Empty description is null
- **WHEN** a product with no description is returned by either the public query or the merchant query
- **THEN** `description` is `null` and `fields` does not contain `description`
