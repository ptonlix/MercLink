# agent-skills Specification

## Purpose

发布两份只描述 HTTP API 和标准 OAuth 的 Skill，并保证其中的路径和错误码与当前路由合同一致。

## Requirements

### Requirement: Buyer skill teaches query and purchase
`/skill.md` MUST be public and MUST explain: querying published products without login; opening the buyer authorization page to register or approve; not asking the user for a password, SMS code, or API key; the difference between a product and a sellable variant; ordering by variant id, or by product id only when one sellable variant exists; price in minor units; idempotent `client_order_no`; payment action usage; order status lookup; and that only status `paid` means success. It MUST include the error cases for missing product, unpublished product, insufficient stock, invalid key, unknown field, and forbidden.

#### Scenario: Buyer skill fetched anonymously
- **WHEN** a client fetches `/skill.md` without a token
- **THEN** the body contains the buyer API paths from the shared route table and does not contain an access token, refresh token, or API key

### Requirement: Merchant skill teaches catalog operations
`/merchant/skill.md` MUST be public and MUST explain catalog creation, field preview and confirmation, product and variant creation, publish, unpublish, soft delete, and restore. It MUST also explain `GET /api/v1/merchant/profile` and `PUT /api/v1/merchant/profile`, including the exact request fields `display_name`, `summary`, `website_url`, `logo_url`, `area_served`, `address`, and `published`, a generic JSON example, that a profile is public only after `published` is true, and that setting `published` to false removes it immediately. It MUST tell the agent not to submit the login phone, password, SMS code, or API key as public profile data. It MUST say that unpublish, soft delete, and field retirement are different. It MUST tell the agent not to guide self-registration and not to request a password or API key. It MUST state that a merchant token cannot mark an order paid or place an order, and a buyer token cannot call merchant mutations. The document MUST NOT include any merchant's product data or profile text.

#### Scenario: Merchant skill has no private catalog
- **WHEN** a client fetches `/merchant/skill.md`
- **THEN** the body contains the merchant API paths from the shared route table, including the profile paths, and does not contain a specific merchant's products, profile summary, or a token

### Requirement: Skill paths match the route table
A test MUST fail when either skill omits a path assigned to it in the shared route table, or documents a buyer or merchant path that the table does not list. If the live API disagrees with a skill, the API contract wins and the skill MUST be updated in the same change.

#### Scenario: Route added without skill update
- **WHEN** the shared route table lists a buyer path that `/skill.md` does not mention
- **THEN** the skill consistency check fails
