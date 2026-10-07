# sms-send-limit Specification

## Purpose
用 Redis 执行买家短信发送次数限制，避免把会过期的计数留在 PostgreSQL，并在并发下只放行一次。

## Requirements

### Requirement: SMS sends keep the existing limits
A phone number MUST NOT receive more than one successful verification SMS in any rolling 60 seconds, and MUST NOT receive more than 10 successful verification SMS messages in any rolling 24 hours. A limited request MUST return `sms_rate_limited` and MUST NOT call the SMS provider. A provider failure MUST NOT consume either limit. Two overlapping requests for the same phone MUST NOT both pass the 60-second limit.

#### Scenario: Second send inside 60 seconds
- **WHEN** a phone has a successful verification SMS less than 60 seconds ago and requests another
- **THEN** the response is `sms_rate_limited` and the provider is not called

#### Scenario: Daily cap
- **WHEN** a phone already has 10 successful verification SMS messages in the last 24 hours
- **THEN** the next send is `sms_rate_limited` and the provider is not called

#### Scenario: Provider failure does not count
- **WHEN** the SMS provider rejects a send that was otherwise allowed
- **THEN** that attempt does not count toward the 60-second or 24-hour limit

### Requirement: Redis failure does not fall back
If Redis is unavailable, the send MUST be rejected with `dependency_unavailable` and MUST NOT call the SMS provider. The system MUST NOT consult `sms_sends` or any other PostgreSQL send log to allow the message.

#### Scenario: Redis unavailable
- **WHEN** a buyer requests a verification SMS while Redis cannot be reached
- **THEN** the response is `dependency_unavailable` and the provider is not called

### Requirement: Registration state stays in PostgreSQL
Wrong SMS check counts, registration challenge validity, one-time captcha parameter consumption, and device-code records MUST remain in PostgreSQL. This change MUST NOT move those records to Redis or delete them.

#### Scenario: Repeated wrong code
- **WHEN** a buyer submits five wrong SMS codes for the current challenge
- **THEN** the challenge is invalidated in PostgreSQL and the next check requires a new captcha
