# agent-skills Specification

## ADDED Requirements

### Requirement: Storefront skill explains the product description slot
`/storefront/skill.md` MUST list `product.description` as an optional product fact slot. It MUST say the server fills that slot with the current product's own plain-text description, that line breaks in that description are preserved, and that an empty description leaves the slot empty. It MUST say a template that does not declare the slot can still be activated, and that an already published template is not rewritten to insert the description. It MUST say the page MUST NOT hard-code one product's description and MUST NOT invent another slot name for it. It MUST NOT make `product.description` required for the product list or the product page.

#### Scenario: Storefront skill names the description slot
- **WHEN** a client fetches `/storefront/skill.md`
- **THEN** the body contains `product.description` and says a release without that slot can still be activated
