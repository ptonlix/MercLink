# Spec Delta

## MODIFIED Requirements

### Requirement: Merchant skill teaches catalog operations
`/merchant/skill.md` MUST be public and MUST explain catalog creation, field preview and confirmation, product and variant creation, publish, unpublish, soft delete, and restore. It MUST also explain `GET /api/v1/merchant/profile` and `PUT /api/v1/merchant/profile`, including the exact request fields `display_name`, `summary`, `website_url`, `logo_url`, `area_served`, `address`, and `published`, a generic JSON example, that a profile is public only after `published` is true, and that setting `published` to false removes it immediately. It MUST tell the agent not to submit the login phone, password, SMS code, or API key as public profile data. It MUST say that unpublish, soft delete, and field retirement are different. It MUST tell the agent not to guide self-registration and not to request a password or API key. It MUST state that a merchant token cannot mark an order paid or place an order, and a buyer token cannot call merchant mutations. The document MUST NOT include any merchant's product data or profile text.

#### Scenario: Merchant skill has no private catalog
- **WHEN** a client fetches `/merchant/skill.md`
- **THEN** the body contains the merchant API paths from the shared route table, including the profile paths, and does not contain a specific merchant's products, profile summary, or a token
