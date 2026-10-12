## MODIFIED Requirements

### Requirement: Consistent presentation across surfaces
The built-in storefront, authorization, account, documentation and recovery pages SHALL share semantic color roles, control sizes and focus treatment. The homepage, product list and detail SHALL use the same graphite, ice-white and pale-cyan palette; authorization, account and documentation SHALL retain their established base palette. Storefront display typography SHALL be distinct from form and documentation typography. Content SHALL remain usable at widths from 320 CSS pixels with no document-level horizontal overflow, and controls SHALL have at least 44 CSS pixels of target height.

#### Scenario: Reader opens a phone-sized page
- **WHEN** a reader opens the product, authorization or documentation page at 390 CSS pixels
- **THEN** content reflows, the primary action remains reachable, and navigation does not cover content
