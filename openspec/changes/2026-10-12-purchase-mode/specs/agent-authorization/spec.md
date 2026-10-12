# Spec Delta

## MODIFIED Requirements

### Requirement: Scope selects the authorization page
A request containing a catalog-management scope MUST open the merchant login and approval page and MUST NOT offer buyer registration. When purchase mode is enabled, a request containing only order scopes MUST open the buyer login or registration page and MUST NOT create a merchant. When purchase mode is disabled, a request containing only order scopes MUST be rejected with the OAuth error `invalid_scope`, MUST NOT issue a device code, and MUST NOT open buyer registration or login. Merchant approval MUST grant only `field:write`, `product:write`, `product:read`, and `order:read`. Buyer approval, available only when purchase mode is enabled, MUST grant only `order:write` and `order:read`.

#### Scenario: Buyer scope cannot become merchant
- **WHEN** purchase mode is enabled and an agent requests only `order:write` and `order:read`
- **THEN** the person can register or log in only as a buyer and cannot provision a merchant from that page

#### Scenario: Order scope while purchase is disabled
- **WHEN** purchase mode is disabled and an agent requests only `order:write` and `order:read` at the device authorization endpoint
- **THEN** the response is `invalid_scope`, no device code is issued, and no SMS is sent
