# Spec Delta

## Purpose

提供一个可启动、可迁移、可观测且不泄漏密钥的应用运行时，供各业务切片在不修改根配置的前提下共用。

## ADDED Requirements

### Requirement: Missing configuration prevents startup
The process MUST refuse to listen when any required setting is missing or empty: database URL, initial super-admin phone, initial super-admin password, authorization signing secret, captcha credentials, SMS credentials, Alipay application credentials, Alipay public key, payment notification URL, and public base URL. It MUST NOT fall back to a secret stored in source code.

#### Scenario: A required secret is absent
- **WHEN** the process starts without the payment private key
- **THEN** it exits before accepting requests and MUST NOT print that secret

### Requirement: Health check exposes no secrets
The system MUST expose an unauthenticated health check that reports only process liveness. The response MUST NOT include credentials, tokens, or connection strings.

#### Scenario: Anonymous health request
- **WHEN** a client calls the health check without a token
- **THEN** the response status is 200 and the body contains no secret material

### Requirement: Migrations run in filename order before serving
The system MUST apply pending SQL migrations in lexicographic filename order before serving traffic, and MUST abort startup if a migration fails. A migration that already completed MUST NOT run again.

#### Scenario: Two pending migrations
- **WHEN** `010_platform.sql` and `020_identity.sql` are both pending
- **THEN** `010_platform.sql` is applied before `020_identity.sql`, and a later restart does not apply either again

### Requirement: Logs redact credentials
Logs MUST NOT record passwords, SMS verification codes, access tokens, refresh tokens, API keys, or payment private keys.

#### Scenario: A request carries a bearer token
- **WHEN** an authenticated request is logged
- **THEN** the log line does not contain the bearer token or a refresh token
