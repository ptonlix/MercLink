# product-query Specification

## ADDED Requirements

### Requirement: Public product detail includes published product FAQs
`GET /api/v1/products/{id}` MUST include `faqs` for a product the public query returns. `faqs` MUST be the published product FAQ items in stored order. When that set is missing, unpublished, or empty, `faqs` MUST be `[]`. The public product list MUST NOT include `faqs` on each item. Merchant product JSON MUST NOT include `faqs`. FAQ text MUST NOT be matched by keyword search and MUST NOT be accepted as a field filter.

#### Scenario: Published product FAQ appears on the detail only
- **WHEN** a publicly visible product has one published FAQ item
- **THEN** `GET /api/v1/products/{id}` returns that item under `faqs`, and the public product list does not include the question

#### Scenario: Unpublished FAQ is an empty list
- **WHEN** a publicly visible product has an unpublished FAQ set
- **THEN** `GET /api/v1/products/{id}` returns `faqs` `[]` and does not return the draft question
