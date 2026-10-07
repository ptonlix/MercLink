# Spec Delta

## MODIFIED Requirements

### Requirement: Merchant skill teaches catalog operations
`/merchant/skill.md` MUST be public and MUST explain catalog creation, field preview and confirmation, product and variant creation, publish, unpublish, soft delete, and restore. It MUST create axes through the `/axes` path and variant combinations with `option_values`. It MUST call single-select values `choices` and custom product values `fields`. It MUST NOT teach `options` as the name for axes, variant values, or field choices. It MUST say that unpublish, soft delete, and field retirement are different. It MUST tell the agent not to guide self-registration and not to request a password or API key. It MUST state that a merchant token cannot mark an order paid or place an order, and a buyer token cannot call merchant mutations. The document MUST NOT include any merchant's product data.

#### Scenario: Merchant skill has no private catalog
- **WHEN** a client fetches `/merchant/skill.md`
- **THEN** the body contains the merchant API paths from the shared route table, including the axes path, and does not contain a specific merchant's products or a token
