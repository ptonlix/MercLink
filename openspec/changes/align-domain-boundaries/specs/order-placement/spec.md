# Spec Delta

## MODIFIED Requirements

### Requirement: Server prices and snapshots the line
The caller MUST NOT supply a price. Detecting a caller price MUST be done by the domain function that the order tests lock, and the place-order use case MUST call that function with the request body. A request containing a price key MUST be rejected. The line amount MUST equal the locked variant price multiplied by quantity. The order amount MUST equal the sum of line amounts. The order header MUST store buyer, grant, currency, amount, status, and expiry. The line MUST snapshot catalog, product, variant, title, variant option values, unit price, fields, and schema revision. Currency MUST come from the variant's catalog.

#### Scenario: Caller sends a price
- **WHEN** a buyer includes a price in the order request
- **THEN** the domain price check rejects the request and no order is stored
