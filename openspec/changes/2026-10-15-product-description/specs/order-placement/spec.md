# order-placement Specification

## MODIFIED Requirements

### Requirement: Server prices and snapshots the line
The caller MUST NOT supply a price. Detecting a caller price MUST be done by the domain function that the order tests lock, and the place-order use case MUST call that function with the request body. A request containing a price key MUST be rejected. The line amount MUST equal the locked variant price multiplied by quantity. The order amount MUST equal the sum of line amounts. The order header MUST store buyer, grant, currency, amount, status, and expiry. The line MUST snapshot catalog, product, variant, title, description, variant option values, unit price, fields, and schema revision. An empty description MUST be snapshotted as empty and MUST NOT be stored inside `fields_snapshot`. Currency MUST come from the variant's catalog. A later change to the product description MUST NOT change that line.

#### Scenario: Caller sends a price
- **WHEN** a buyer includes a price in the order request
- **THEN** the domain price check rejects the request and no order is stored

#### Scenario: Later description edit keeps the order line
- **WHEN** a buyer orders a product whose description is `海水珍珠` and the merchant later changes that description
- **THEN** the stored order line still snapshots `海水珍珠`
