# storefront-release Specification

## ADDED Requirements

### Requirement: Source download contains the current default page
`GET /api/v1/storefront/source` MUST include the current default public page as slot HTML for `static/index.html`, `static/products/index.html`, and `static/products/item.html`, plus the stylesheet those pages use. It MUST NOT ship a separately maintained home page.

#### Scenario: Download matches the default page components
- **WHEN** a merchant downloads the storefront source
- **THEN** the static home page contains the default page's usage guide and store slots, and does not contain a hardcoded store name
