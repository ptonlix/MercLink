# Spec Delta

## Purpose

让 Agent 通过浏览器授权码或设备码获得短期令牌，并保证商家权限与买家权限不能混用。

## ADDED Requirements

### Requirement: OAuth 2.1 with PKCE or device code
Agent authorization MUST use OAuth 2.1 authorization code with PKCE, or the device authorization flow. The system MUST NOT support the resource-owner password grant or the implicit grant. Access tokens MUST expire in 15 minutes. Refresh tokens MUST be stored only as hashes, MUST rotate on use, and the previous refresh token MUST stop working immediately.

#### Scenario: Authorization code without PKCE
- **WHEN** a client starts authorization-code login without PKCE
- **THEN** the authorization server rejects the request

#### Scenario: Refresh rotation
- **WHEN** a client exchanges a refresh token
- **THEN** it receives a new refresh token and the presented refresh token can no longer be used

### Requirement: Scope selects the authorization page
A request containing a catalog-management scope MUST open the merchant login and approval page and MUST NOT offer buyer registration. A request containing only order scopes MUST open the buyer login or registration page and MUST NOT create a merchant. Merchant approval MUST grant only `field:write`, `product:write`, `product:read`, and `order:read`. Buyer approval MUST grant only `order:write` and `order:read`.

#### Scenario: Buyer scope cannot become merchant
- **WHEN** an agent requests only `order:write` and `order:read`
- **THEN** the person can register or log in only as a buyer and cannot provision a merchant from that page

### Requirement: Revocation is per agent
A user MUST be able to revoke one agent grant without revoking other grants. A revoked grant's refresh token MUST fail immediately. Protected-resource metadata MUST be published at `/.well-known/oauth-protected-resource`.

#### Scenario: One of two agents is revoked
- **WHEN** a buyer revokes one agent and leaves another grant active
- **THEN** the revoked grant cannot refresh, and the other grant still can

### Requirement: API keys are for scripts only
An API key MUST be creatable only from a logged-in account page, MUST be stored only as a hash, and MUST NOT be offered in the agent authorization flow. A revoked key MUST stop authenticating immediately. The system MUST NOT offer sub-accounts or third-party login.

#### Scenario: Agent flow asks for a key
- **WHEN** an agent follows the authorization page
- **THEN** the page does not create or display an API key

### Requirement: Wrong role is forbidden
A merchant actor that calls order placement MUST receive HTTP 403 with error `forbidden`. A buyer actor that calls catalog or product mutation MUST receive the same error. Anonymous product search MUST remain allowed.

#### Scenario: Merchant token places an order
- **WHEN** a merchant access token calls the order placement route
- **THEN** the status is 403 and no order is created
