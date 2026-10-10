# storefront-release Specification

## ADDED Requirements

### Requirement: Storefront reset executes only after a committed admin mark
Creating a storefront reset request MUST NOT delete releases, files, or objects, and MUST NOT change the active pointer. Only an admin session MAY execute a `pending` request. An agent token MUST NOT execute a reset, and the server MUST NOT add an agent execute route.

Object deletes run before any database change. If any object delete fails, the server MUST return an error and MUST NOT clear the pointer, delete release rows, or mark the request executed. The request MUST remain `pending`.

After every object delete succeeds, the server MUST clear the pointer, delete the release rows, and mark that pending request `executed` in one SQL transaction. If the status update affects 0 rows, that transaction MUST roll back and the server MUST NOT return success. A success response MUST mean the request status is `executed` and the pointer no longer references the deleted release. The server MUST NOT claim `executed` when the mark did not happen.

#### Scenario: Create does not delete
- **WHEN** a merchant with `storefront:write` creates a storefront reset request
- **THEN** the request is `pending`, existing releases remain, and the active pointer is unchanged

#### Scenario: Only an admin session executes a pending request
- **WHEN** an agent token attempts to execute a pending reset request
- **THEN** the request stays `pending` and no release is deleted

#### Scenario: Delete failure does not change the database
- **WHEN** an admin executes a pending reset and an object delete fails
- **THEN** the response is an error, the request remains `pending`, and the pointer still references the existing release

#### Scenario: Executed is returned only after the same transaction
- **WHEN** an admin executes a pending reset and every object delete succeeds
- **THEN** success is returned only after the same transaction clears the pointer and marks that row `executed`
- **AND** a status update that affects 0 rows rolls back and is not returned as success
