# context-seams Specification

## Purpose
让每个上下文只通过对方公开的接缝协作，避免应用层直接改另一上下文的表或让页面跳过应用层。

## Requirements

### Requirement: Pages do not import domain modules
Route handlers and pages under `src/app` MUST call application services. They MUST NOT import `src/domain`. Authorization page selection and unknown-merchant copy MUST be reached through an application service that delegates to the domain rule.

#### Scenario: Authorization page selects a flow
- **WHEN** the authorization page decides between merchant and buyer
- **THEN** the decision still uses the domain rule, and the page file does not import `src/domain`

### Requirement: Contexts do not import each other's domain
An identity application service MUST NOT import `src/domain/access`, `src/domain/catalog`, or `src/domain/commerce`. Access, catalog, and commerce application services MUST follow the same rule for the other contexts. Shared helpers such as token hashing MUST live outside any one context's domain module.

#### Scenario: Buyer registration hashes a captcha
- **WHEN** registration stores a used captcha parameter
- **THEN** the hash function is not imported from `src/domain/access`

### Requirement: Cross-context reads and writes use owned seams
Composition MUST obtain a merchant's catalog ids from a catalog-owned seam. Access and composition MUST ask an identity-owned function whether a buyer or merchant can authenticate. Identity MUST NOT update `oauth_grants`, `api_keys`, or `oidc_records` directly.

#### Scenario: Composition lists catalogs
- **WHEN** the process registers catalog ownership for a merchant
- **THEN** the catalog id query is implemented in the catalog application service, not as SQL in `register-all.ts`

### Requirement: Dependency checks enforce the boundaries
The architecture check MUST fail when `src/app` imports `src/domain`, and when an application service imports another context's domain module. The existing ban on domain importing app, database, or adapters MUST remain.

#### Scenario: Page imports a domain function
- **WHEN** a file under `src/app` imports a module under `src/domain`
- **THEN** the dependency check fails
