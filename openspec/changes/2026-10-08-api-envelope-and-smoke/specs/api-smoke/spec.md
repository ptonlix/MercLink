# Spec Delta

## ADDED Requirements

### Requirement: Smoke coverage is declared once
The repository MUST keep one smoke manifest for backend HTTP routes. Every exported HTTP method in `src/app/**/route.ts` MUST appear in that manifest with its method, path, audience or public access, and body kind. A static test MUST fail when a route export is missing from the manifest. The manifest MUST NOT replace the shared API route table used by skills. `pnpm run test:smoke` MUST run this suite. `pnpm run check` MUST NOT run it.

#### Scenario: New route is not registered
- **WHEN** a route file exports an HTTP method that the smoke manifest does not list
- **THEN** the static smoke coverage test fails without calling the running server

### Requirement: Smoke runs against a disposable server
The HTTP smoke tests MUST send requests only to `SMOKE_BASE_URL`. They MUST fail, not skip, when that variable is missing or the database named by the smoke configuration is not `merclink_smoke`. They MUST NOT write to any other database. They MUST NOT call vendor payment, SMS, or captcha services. Payment success in the journey MUST use the development payment stub, and only when development stubs are enabled.

#### Scenario: Developer database is selected
- **WHEN** the smoke suite starts with a database name other than `merclink_smoke`
- **THEN** the suite fails before inserting fixture data

#### Scenario: Server is not configured
- **WHEN** `SMOKE_BASE_URL` is unset
- **THEN** the suite fails instead of reporting success

### Requirement: Smoke modules stay shallow
The suite MUST split discovery, authentication gate, catalog, storefront, payment, account keys, and one end-to-end journey into separate files. The authentication gate MUST be generated from the manifest and MUST expect HTTP 401 and body `code` `40100` for protected routes called without a bearer token. Account-key routes MUST be tested with the account cookie, not with a bearer token. A module MUST assert HTTP status, numeric `code`, `timestamp`, `request_id`, and the few stable `data` fields needed to prove the path works. It MUST NOT retest every domain validation branch.

#### Scenario: Protected catalog route without a token
- **WHEN** the authentication-gate module calls a merchant catalog route without `Authorization`
- **THEN** the HTTP status is 401 and body `code` is `40100`

#### Scenario: Retired options route
- **WHEN** the catalog module calls `POST /api/v1/catalogs/{id}/products/{product_id}/options`
- **THEN** the HTTP status is 404 and body `code` is `40400`

### Requirement: One journey replaces the manual path
The journey MUST create a merchant catalog, field, variant, and published product through HTTP, then place a buyer order and observe `paid` only after the development payment stub confirms payment. An invalid payment notification MUST leave that flow's unpaid order unconfirmed and MUST receive plain text `fail`. Opening a payment action MUST NOT be treated as success.

#### Scenario: Stub confirmation
- **WHEN** the journey confirms the development payment and reads the order
- **THEN** body `code` is `200` and `data.status` is `paid`

#### Scenario: Invalid notification
- **WHEN** the payment module posts an invalid notification for a pending order
- **THEN** the response is plain text `fail` and a later order read still shows `data.status` `pending`
