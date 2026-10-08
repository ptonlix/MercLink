# Spec Delta

## MODIFIED Requirements

### Requirement: Buyer skill teaches query and purchase
`/skill.md` MUST be public and MUST explain: querying published products without login; opening the buyer authorization page to register or approve; not asking the user for a password, SMS code, or API key; the difference between a product and a sellable variant; ordering by variant id, or by product id only when one sellable variant exists; price in minor units; idempotent `client_order_no`; payment action usage; order status lookup; and that only status `paid` means success. It MUST tell a phone payer, including an agent built-in page that can navigate, to send `payment_channel` `mobile` on the first order request, and to open the complete `payment.action` URL with top-level navigation rather than an iframe or a truncated URL. It MUST tell desktop payers that the default channel is the PC cashier. It MUST say that repeating `client_order_no` does not switch channel, and that a new `client_order_no` MUST NOT be used only to switch channel. It MUST say not to ask for an Alipay password. It MUST include the error cases for missing product, unpublished product, insufficient stock, invalid key, unknown field, and forbidden.

#### Scenario: Buyer skill fetched anonymously
- **WHEN** a client fetches `/skill.md` without a token
- **THEN** the body contains the buyer API paths from the shared route table, `payment_channel`, and top-level opening instructions, and does not contain an access token, refresh token, or API key
