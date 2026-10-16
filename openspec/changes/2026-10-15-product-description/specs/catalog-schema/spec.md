# catalog-schema Specification

## MODIFIED Requirements

### Requirement: Current field definition is singular
A catalog MUST have one current field definition. System fields `title`, `status`, `cover`, and `description` on products, `price` and `stock` on variants, and `currency` on the catalog MUST NOT be deletable by a merchant. `description` MUST be reserved even when a product has no description. Merchant fields MUST have an immutable key, a label, a type of text, number, boolean, or single-select, and a required flag. A merchant MUST NOT create a field whose key is `description`. A single-select field's allowed values MUST be named `choices` in the API, domain, and database. The name `options` MUST NOT be used for those values. A retired key MUST NOT be reused.

#### Scenario: Key rename is rejected
- **WHEN** a merchant tries to change an existing field key
- **THEN** the key remains unchanged

#### Scenario: Select values are choices
- **WHEN** a merchant reads a single-select field
- **THEN** the response names the allowed values `choices` and does not include `options`

#### Scenario: Description cannot be a catalog field
- **WHEN** a merchant adds a catalog field with key `description`
- **THEN** the field is not created and the error is `validation_error`
