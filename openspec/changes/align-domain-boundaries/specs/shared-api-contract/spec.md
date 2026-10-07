# Spec Delta

## MODIFIED Requirements

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
