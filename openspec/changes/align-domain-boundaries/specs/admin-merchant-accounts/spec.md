# Spec Delta

## MODIFIED Requirements

### Requirement: Disabled merchant loses access
The super-admin MUST be able to disable a merchant and reset that merchant's password. Disabling MUST immediately revoke every grant and API key issued to that merchant by calling the access-owned revocation seam, and MUST reject new agent approvals. Identity code MUST NOT update `oauth_grants`, `api_keys`, or `oidc_records` itself. Existing orders MUST remain. A disabled merchant MUST NOT log in or approve an agent. The production disable path MUST use the same domain effect that the identity tests lock.

#### Scenario: Merchant is disabled
- **WHEN** the super-admin disables a merchant that has an active agent grant
- **THEN** the access seam revokes that grant, the grant can no longer refresh a token, and the merchant authorization page rejects the merchant's login
