# public-pages Specification

## MODIFIED Requirements

### Requirement: Default public pages use the storefront starter
When no storefront release is active, `/`, `/products`, and `/products/{id}` MUST be rendered from the same slot HTML the storefront source download ships. That HTML MUST be produced from the default public page components. Editing those components MUST change both the unreleased public page and the next source download. The page MUST NOT keep a second hand-written home or product template.

#### Scenario: Unreleased home uses the starter
- **WHEN** no storefront release is active and the public store seam returns a published profile
- **THEN** `/` shows that profile through the starter slots, and the downloadable starter contains the same unfilled slot markup
