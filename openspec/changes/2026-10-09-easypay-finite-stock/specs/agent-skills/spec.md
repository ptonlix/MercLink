# Spec Delta

## MODIFIED Requirements

### Requirement: Buyer skill teaches query and purchase
`/skill.md` MUST be public and MUST explain: querying published products without login; opening the buyer authorization page to register or approve; not asking the user for a password, SMS code, or API key; the difference between a product and a sellable variant; ordering by variant id, or by product id only when one sellable variant exists; price in minor units; idempotent `client_order_no`; payment action usage; order status lookup; and that only status `paid` means success. It MUST state that the buyer does not choose the payment provider, that the provider is fixed by server startup configuration, and that `payment_channel` only chooses desktop or mobile. It MUST state that a closed order with an unapplied receipt is not success. It MUST tell the payer to open the complete `payment.action` URL with top-level navigation and not to pay a closed order's old link. It MUST include the error cases for missing product, unpublished product, insufficient stock, invalid key, unknown field, and forbidden.

#### Scenario: Buyer skill fetched anonymously
- **WHEN** a client fetches `/skill.md` without a token
- **THEN** the body contains the buyer API paths from the shared route table and does not contain an access token, refresh token, or API key

#### Scenario: Closed receipt is not success
- **WHEN** a client reads the buyer skill
- **THEN** the body says that only status `paid` means success and that an unapplied receipt on a closed order is not success

### Requirement: Merchant skill teaches catalog operations
`/merchant/skill.md` MUST be public and MUST explain catalog creation, field preview and confirmation, product and variant creation, publish, unpublish, soft delete, and restore. It MUST also explain `GET /api/v1/merchant/profile` and `PUT /api/v1/merchant/profile`, including the exact request fields `display_name`, `summary`, `website_url`, `logo_url`, `area_served`, `address`, and `published`, a generic JSON example, that a profile is public only after `published` is true, and that setting `published` to false removes it immediately. It MUST tell the agent not to submit the login phone, password, SMS code, or API key as public profile data. It MUST say that unpublish, soft delete, and field retirement are different. It MUST tell the agent not to guide self-registration and not to request a password or API key. It MUST state that a merchant token cannot mark an order paid or place an order, and a buyer token cannot call merchant mutations. It MUST explain the unapplied-receipt resolution path, that the merchant may choose manual fulfillment or a full EasyPay refund, and that neither action marks the order paid. It MUST say that an order read's unapplied receipt includes `failure_reason`, which is `null` when there is no failure reason. The document MUST NOT include any merchant's product data or profile text.

#### Scenario: Merchant skill has no private catalog
- **WHEN** a client fetches `/merchant/skill.md`
- **THEN** the body contains the merchant API paths from the shared route table, including the profile paths and the unapplied-receipt resolution path, and does not contain a specific merchant's products, profile summary, or a token

#### Scenario: Refund failure reason is described
- **WHEN** a client reads the merchant skill
- **THEN** the body says that an order read's unapplied receipt includes `failure_reason`
