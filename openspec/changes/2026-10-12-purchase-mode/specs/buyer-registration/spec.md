# Spec Delta

## ADDED Requirements

### Requirement: Registration is absent when purchase is disabled
When purchase mode is disabled, the buyer authorization page MUST NOT present a phone form, a password form, or a human-verification widget, and MUST NOT load a captcha script. It MUST be non-indexable. A direct registration or SMS request MUST be rejected with `purchase_disabled` where the response is an enveloped API response, MUST NOT create a registration challenge, and MUST NOT call the captcha provider or the SMS provider. When purchase mode is enabled, the existing captcha-then-SMS registration order MUST remain in force.

#### Scenario: Buyer page while purchase is disabled
- **WHEN** a person opens the buyer authorization page on a process that started with purchase disabled
- **THEN** the page contains no phone input and no captcha widget, and no SMS is sent

#### Scenario: SMS request while purchase is disabled
- **WHEN** a client requests a buyer verification SMS while purchase is disabled
- **THEN** the SMS provider is not called and no buyer account is created
