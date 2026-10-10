# agent-authorization Specification

## ADDED Requirements

### Requirement: Authorization pages keep the server steps
`/authorize/buyer` and `/authorize/merchant` MUST keep choosing the current step on the server. A storefront appearance declaration MUST NOT replace those pages with a static document. Authorization submit handlers MUST continue to send the browser back to those authorization paths. Device-code completion, payment, and granted scopes MUST NOT change because an appearance was declared.

#### Scenario: Submit returns to the authorization path
- **WHEN** a buyer or merchant submits an authorization form
- **THEN** the browser is sent back to `/authorize/buyer` or `/authorize/merchant`, not to `account/buyer.html` or `account/merchant.html`
