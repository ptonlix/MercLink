# buyer-registration Specification

## Purpose

让买家在授权页用手机号完成人机验证和短信核验后注册，同时防止短信接口在未通过验证时被调用。

## Requirements

### Requirement: Registration follows captcha then SMS
Buyer registration MUST require, in order: a completed human-verification captcha, server-side captcha verification, an SMS verification code, server-side SMS verification, and a newly chosen password. A captcha parameter MUST be accepted only once. SMS MUST NOT be sent when captcha verification fails. The system MUST NOT store or compare the SMS code locally.

#### Scenario: Captcha fails
- **WHEN** a buyer requests an SMS code without a successful captcha verification
- **THEN** no SMS is sent and no buyer account is created

#### Scenario: SMS is verified
- **WHEN** captcha verification succeeds, the SMS check succeeds, and the buyer sets a password
- **THEN** one buyer account is created for that phone number and the buyer remains on the authorization page to approve the agent

### Requirement: Existing phone becomes login
When the submitted phone number already belongs to an active buyer, the system MUST NOT create a second account. The page MUST continue as login. Login MUST accept either the password or a fresh captcha-plus-SMS check. Both login methods that send SMS MUST pass captcha first.

#### Scenario: Registered phone attempts registration
- **WHEN** a person submits a phone number that already has an active buyer
- **THEN** no new buyer is created and the flow becomes login

### Requirement: SMS sending is rate limited locally
The same phone number MUST NOT receive more than one SMS in 60 seconds. A 24-hour send cap MUST be enforced. When either limit is exceeded, the system MUST reject the request without calling the SMS provider. Repeated wrong SMS checks MUST invalidate the current registration attempt and require a new captcha.

#### Scenario: Second send inside 60 seconds
- **WHEN** a buyer requests another SMS for the same phone number 30 seconds after a successful send
- **THEN** the request is rejected and the SMS provider is not called

### Requirement: Buyer phone is the login identifier
Buyer phone number MUST be required and unique among active buyers. Email MUST be optional, MUST NOT be a login identifier, and MUST NOT require verification.

#### Scenario: Buyer registers without email
- **WHEN** a buyer completes registration with a phone number and password and no email
- **THEN** the account is created and cannot be looked up by email
