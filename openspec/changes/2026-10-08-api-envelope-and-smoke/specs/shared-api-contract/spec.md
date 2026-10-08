# Spec Delta

## MODIFIED Requirements

### Requirement: API errors use one body
Every JSON response from `/api/v1` MUST use exactly `code`, `message`, `data`, `timestamp`, and `request_id`. `code` MUST be the number `200` on success. On failure it MUST be the numeric business code defined for that existing error in the shared module. The system MUST NOT use the HTTP status number itself as a failure `code`, add a top-level `error` field, or return a stack trace. `message` MUST be exactly `成功` on success and a human-readable failure reason otherwise. It MUST NOT contain a secret, token, or verification code. Success `data` MUST contain the resource, list, or array. Failure `data` MUST be `null`. `timestamp` MUST be a Unix timestamp in milliseconds. `request_id` MUST be the request correlation id. HTTP status MUST still describe the transport result, and a business failure MUST NOT be returned with HTTP 200. A created resource MUST still return HTTP 201 while its body `code` remains `200`. `variant_required` MUST use business code `40004` and HTTP 400 everywhere. `POST /api/v1/payments/alipay/notify` MUST remain `text/plain` and MUST NOT use this envelope. OAuth responses, protected-resource metadata, `GET /api/health`, media bytes, skills, HTML, and redirects MUST NOT use this envelope.

#### Scenario: Validation failure
- **WHEN** a client sends an invalid JSON body to an `/api/v1` route
- **THEN** the HTTP status is 400, `code` is `40000`, `data` is `null`, and the body contains no `error` field and no stack trace

#### Scenario: Successful resource read
- **WHEN** a client successfully reads an `/api/v1` resource
- **THEN** `code` is `200`, `message` is `成功`, and the resource fields are inside `data`

#### Scenario: Created resource
- **WHEN** a client successfully creates an `/api/v1` resource
- **THEN** the HTTP status is 201 and the body `code` is still `200`

#### Scenario: Variant is required
- **WHEN** either catalog publication or order placement fails because a variant is required
- **THEN** both responses use `code` `40004` and HTTP 400

#### Scenario: Payment notification
- **WHEN** the Alipay notification route handles a request
- **THEN** the response is `text/plain` `success` or `fail` and does not contain `code`, `message`, or `data`

### Requirement: Missing bearer token is a challenge
A route that requires an actor MUST respond with HTTP 401 and a `WWW-Authenticate` header when no bearer token is present. The header MUST identify the protected-resource metadata URL. The JSON body MUST use `code` `40100`.

#### Scenario: Order request without a token
- **WHEN** a client calls a token-protected route without `Authorization`
- **THEN** the status is 401, `code` is `40100`, `data` is `null`, and `WWW-Authenticate` points to `/.well-known/oauth-protected-resource`

## ADDED Requirements

### Requirement: Error constants have one definition
The success code `200`, every existing error's numeric business code, and the HTTP status for each error MUST be defined in one shared module. A route or application service MUST NOT select a different number or HTTP status for the same error. The change MUST NOT add, rename, or remove an existing error kind. Domain results MAY keep an internal string error name. An HTTP response MUST be created only through the shared envelope helpers.

#### Scenario: Two modules return the same failure
- **WHEN** catalog and commerce both reject a request with `conflict`
- **THEN** both responses use business code `40900` and the same HTTP status from the shared module

### Requirement: Request ids correlate logs without authorizing
Every enveloped response MUST carry the same `request_id` in the body and in the `X-Request-Id` response header. The id MUST use the `req_` prefix and MUST NOT be derived from a token or resource id. An inbound `X-Request-Id` MUST be reused only when it already has that prefix and length; otherwise the server MUST generate a new id. The request log MUST include that id. The id MUST NOT grant access or be stored as a domain identifier.

#### Scenario: Missing request id
- **WHEN** a client calls an enveloped route without `X-Request-Id`
- **THEN** the response body and `X-Request-Id` header contain the same generated `req_` id

#### Scenario: Malformed request id
- **WHEN** a client sends an `X-Request-Id` that does not use the `req_` prefix
- **THEN** the server generates a new id and does not echo the malformed value

### Requirement: Lists keep cursor pagination
An enveloped list MUST place the existing `items` and `next_cursor` fields inside `data`. It MUST NOT replace them with `list`, `total`, `pageNum`, `pageSize`, or `pages`.

#### Scenario: Public product list
- **WHEN** a client lists published products
- **THEN** `data.items` and `data.next_cursor` are present and `data` does not contain `pageNum`
