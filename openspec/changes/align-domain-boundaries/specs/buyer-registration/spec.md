# Spec Delta

## MODIFIED Requirements

### Requirement: SMS sending is rate limited locally
The same phone number MUST NOT receive more than one successful verification SMS in any rolling 60 seconds, and MUST NOT receive more than 10 in any rolling 24 hours. The numeric limits and the `sms_rate_limited` messages MUST be defined by the identity domain functions that registration tests lock. `requestBuyerSms` and the Redis policy map MUST use those functions. A second copy of the limits or messages MUST NOT exist. When either limit is exceeded, the system MUST reject the request without calling the SMS provider. Repeated wrong SMS checks MUST invalidate the current registration challenge and require a new captcha. The unused timestamp-list helper MUST NOT remain as the tested stand-in for the live limiter.

#### Scenario: Second send inside 60 seconds
- **WHEN** a buyer requests another SMS for the same phone number 30 seconds after a successful send
- **THEN** the request is rejected with the domain message and the SMS provider is not called

## ADDED Requirements

### Requirement: Registration challenge has its own id
A registration challenge id MUST use the `chg_` prefix. It MUST NOT be created with the grant id kind. Grant ids MUST remain `grn_` and MUST identify OAuth grants only.

#### Scenario: SMS request creates a challenge
- **WHEN** a buyer passes captcha and an SMS is sent
- **THEN** the new registration challenge id starts with `chg_` and is not a grant id
