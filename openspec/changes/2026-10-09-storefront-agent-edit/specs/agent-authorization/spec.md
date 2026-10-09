# Spec Delta

## MODIFIED Requirements

### Requirement: Scope selects the authorization page
A request containing a catalog-management scope or `storefront:write` MUST open the merchant login and approval page and MUST NOT offer buyer registration. A request containing only order scopes MUST open the buyer login or registration page and MUST NOT create a merchant. Approval of a catalog-management request that does not include `storefront:write` MUST grant only `field:write`, `product:write`, `product:read`, and `order:read`. Approval MUST grant `storefront:write` only when the authorization request included it, and MUST NOT grant buyer scopes from that request. Buyer approval MUST grant only `order:write` and `order:read`.

#### Scenario: Buyer scope cannot become merchant
- **WHEN** an agent requests only `order:write` and `order:read`
- **THEN** the person can register or log in only as a buyer and cannot provision a merchant from that page

#### Scenario: Product approval does not grant storefront replacement
- **WHEN** a merchant agent requests catalog-management scopes and does not request `storefront:write`
- **THEN** the granted token does not include `storefront:write`
