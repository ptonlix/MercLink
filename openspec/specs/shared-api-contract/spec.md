# shared-api-contract Specification

## Purpose

冻结各切片共用的 API 错误、调用方身份、金额单位和跨模块接缝，使并行实现不会各自发明一套协议。

## Requirements

### Requirement: API errors use one body
Every `/api/v1` error response MUST use the JSON object `error` and `message`. `error` MUST be a stable machine code. `message` MUST be human-readable and MUST NOT contain secrets.

#### Scenario: Validation failure
- **WHEN** a client sends an invalid JSON body to an `/api/v1` route
- **THEN** the response body contains `error` and `message`, and does not contain a stack trace or secret

### Requirement: Missing bearer token is a challenge
A route that requires an actor MUST respond with HTTP 401 and a `WWW-Authenticate` header when no bearer token is present. The header MUST identify the protected-resource metadata URL.

#### Scenario: Order request without a token
- **WHEN** a client calls a token-protected route without `Authorization`
- **THEN** the status is 401, the body error is `unauthorized`, and `WWW-Authenticate` points to `/.well-known/oauth-protected-resource`

### Requirement: Actor and scope vocabulary is shared
The system MUST represent an API caller as anonymous, a merchant actor, a buyer actor, or a script actor. An API key credential MUST authenticate as a script actor. The system MUST NOT add a second actor type for the same credential. Merchant and buyer actors MUST carry an owner id, a grant id, and scopes. The only scopes are `field:write`, `product:write`, `product:read`, `order:read`, and `order:write`. A caller MUST NOT receive permissions outside the scopes granted to that actor.

#### Scenario: Buyer actor is distinct from merchant actor
- **WHEN** an authenticator resolves a buyer access token
- **THEN** the actor type is buyer, the buyer id is present, and the scopes contain only scopes granted to that buyer

#### Scenario: API key is a script actor
- **WHEN** an authenticator resolves a valid API key
- **THEN** the actor type is script and no separate API-key actor type is created

### Requirement: Money and public identifiers are unambiguous
Monetary amounts that cross a slice boundary MUST be integers in minor currency units. Public identifiers MUST be opaque strings and MUST include a stable type prefix so a product id cannot be mistaken for an order id. Registration challenge ids MUST use `chg_` and MUST NOT use the grant prefix.

#### Scenario: A price crosses a seam
- **WHEN** a sellable line is returned to the order slice
- **THEN** its price is an integer number of minor units and its ids use the agreed prefixes

### Requirement: Cross-slice seams fail closed
The authentication seam, sellable-variant seam, public-product seam, and default-catalog seam MUST be replaceable by the slice that owns the behavior. Until the owning slice registers an implementation, authentication of a presented token MUST fail, locking a sellable variant MUST fail, public product listing MUST return no products rather than data from another source, and default-catalog creation MUST report pending without writing a catalog row.

#### Scenario: Order placement before catalog registration
- **WHEN** the order slice asks the sellable-variant seam to lock a variant and no implementation is registered
- **THEN** the call fails and no order is created

#### Scenario: Public list before catalog registration
- **WHEN** the public-product seam is queried and no implementation is registered
- **THEN** the list is empty and a single-product lookup is not found

#### Scenario: Default catalog before catalog registration
- **WHEN** merchant provisioning requests a default catalog and no implementation is registered
- **THEN** the result is pending and no catalog row is written
