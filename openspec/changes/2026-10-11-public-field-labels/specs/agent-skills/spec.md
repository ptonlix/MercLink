# agent-skills Specification

## MODIFIED Requirements

### Requirement: Buyer skill teaches query and purchase
`/skill.md` MUST be public and MUST explain: querying published products without login; opening the buyer authorization page to register or approve; not asking the user for a password, SMS code, or API key; the difference between a product and a sellable variant; ordering by variant id, or by product id only when one sellable variant exists; price in minor units; idempotent `client_order_no`; payment action usage; order status lookup; and that only status `paid` means success. It MUST include the error cases for missing product, unpublished product, insufficient stock, invalid key, unknown field, and forbidden. It MUST say that `/products/{id}.md` keeps public field keys, annotates a key's meaning only when a display label exists, and that filters and writes still use the key rather than the display label. It MUST NOT say that every key has a meaning line, or that a non-CNY major-unit price omits its currency code.

#### Scenario: Buyer skill fetched anonymously
- **WHEN** a client fetches `/skill.md` without a token
- **THEN** the body contains the buyer API paths from the shared route table and does not contain an access token, refresh token, or API key

#### Scenario: Buyer skill explains field key notes
- **WHEN** a client fetches `/skill.md`
- **THEN** the body says product Markdown keeps field keys, annotates meaning only when a label exists, and that the display label is not the field key
