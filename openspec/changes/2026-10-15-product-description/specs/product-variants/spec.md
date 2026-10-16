# product-variants Specification

## ADDED Requirements

### Requirement: Product description is optional plain text
A product description MUST belong to the product, not to a variant. Create and patch requests MUST accept `description` beside `title`. The stored value MUST be plain text with surrounding whitespace removed and internal line breaks preserved. It MUST be at least one character and no more than 2000 characters after that trim. An omitted description on create MUST be stored as empty. On patch, omitting `description` MUST leave the stored value unchanged, and `null` MUST clear it. An empty string, a non-string, or a value longer than 2000 characters MUST be rejected with `validation_error` and MUST NOT change the product. Putting `description` inside `fields` MUST be rejected with `validation_error`. Publishing MUST NOT require a description.

#### Scenario: Create without a description
- **WHEN** a merchant creates a product with a title, price, and stock and no description
- **THEN** the product is unpublished, has an empty description, and can later be published without adding one

#### Scenario: Patch clears only the description
- **WHEN** a merchant patches a product with `description` set to `null` and omits `fields`
- **THEN** the description becomes empty and the previously stored custom fields remain

#### Scenario: Description is not a custom field
- **WHEN** a merchant sends `fields` containing `description`
- **THEN** the write is rejected with `validation_error` and the product is unchanged
