# Spec Delta

## MODIFIED Requirements

### Requirement: Missing configuration prevents startup
The process MUST refuse to listen when any always-required setting is missing or empty: database URL, initial super-admin phone, initial super-admin password, authorization signing secret, and public base URL. It MUST NOT fall back to a secret stored in source code. Captcha credentials, SMS credentials, and payment-merchant credentials MUST be required only when purchase mode is enabled. When purchase mode is enabled and the startup payment provider is Alipay, including when that provider is unset, Alipay application credentials, the Alipay public key, and the Alipay notification URL MUST be present. When purchase mode is enabled and the startup payment provider is EasyPay, Alipay credentials MUST NOT be required. Missing or incomplete EasyPay merchant id, key, API base, or notification URL MUST NOT prevent the process from listening. A new order in that state MUST return `dependency_unavailable` before a transaction. When purchase mode is disabled, captcha credentials, SMS credentials, Alipay credentials, and EasyPay credentials MUST NOT be required.

#### Scenario: A required secret is absent
- **WHEN** the process starts without the authorization signing secret
- **THEN** it exits before accepting requests and MUST NOT print that secret

#### Scenario: Discovery mode omits payment credentials
- **WHEN** purchase mode is disabled and the process starts without a payment private key
- **THEN** the process still listens and MUST NOT print a secret

#### Scenario: Enabled Alipay mode omits its private key
- **WHEN** purchase mode is enabled, the startup payment provider is Alipay, and the Alipay private key is absent
- **THEN** the process exits before accepting requests and MUST NOT print that secret

#### Scenario: Enabled EasyPay mode omits merchant credentials
- **WHEN** purchase mode is enabled, the startup payment provider is EasyPay, and the EasyPay key is absent
- **THEN** the process still listens, and a new order returns `dependency_unavailable` before a transaction
