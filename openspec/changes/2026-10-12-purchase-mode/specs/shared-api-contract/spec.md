# Spec Delta

## ADDED Requirements

### Requirement: Disabled purchase has one business code
`purchase_disabled` MUST be a shared error kind with business code `40302` and HTTP 403. An enveloped failure MUST use that numeric `code`, HTTP 403, `data` null, and the exact message `本部署未开启买入。` The message MUST NOT contain a secret, token, or verification code. The system MUST NOT represent this condition with `dependency_unavailable`, `payment_retryable`, or HTTP 503. Callers MUST NOT receive a different numeric code for the same condition.

#### Scenario: Order placement while purchase is disabled
- **WHEN** a client calls buyer order placement on a process that started with purchase disabled
- **THEN** the HTTP status is 403, `code` is `40302`, `message` is `本部署未开启买入。`, and `data` is null
