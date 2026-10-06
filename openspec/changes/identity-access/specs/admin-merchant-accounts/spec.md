# Spec Delta

## Purpose

让唯一超级管理员开通、停用和重置商家，并阻止商家在授权页把自己注册成商家。

## ADDED Requirements

### Requirement: Initial super-admin must change password
On first startup the system MUST create exactly one super-admin from configuration. The initial password MUST be stored only as a hash. Until that super-admin changes the password, merchant provisioning MUST be rejected.

#### Scenario: First login has not changed password
- **WHEN** the super-admin authenticates with the initial password and tries to provision a merchant
- **THEN** the system rejects the action and requires a password change first

### Requirement: Super-admin provisions a merchant
A super-admin who has changed the initial password MUST be able to provision a merchant with a name, phone number, and initial password. Provisioning MUST create an active merchant that must change password on first login, and MUST request creation of one default catalog named `默认目录` with currency `CNY`. A phone number that already belongs to an active merchant MUST be rejected.

#### Scenario: Successful provisioning
- **WHEN** the super-admin submits a new merchant name, phone number, and initial password
- **THEN** the merchant is active, must change password, and a default-catalog creation request is issued for that merchant

#### Scenario: Duplicate active phone
- **WHEN** the super-admin provisions a phone number that an active merchant already uses
- **THEN** no second merchant is created

### Requirement: Disabled merchant loses access
The super-admin MUST be able to disable a merchant and reset that merchant's password. Disabling MUST immediately revoke every grant and API key issued to that merchant and MUST reject new agent approvals. Existing orders MUST remain. A disabled merchant MUST NOT log in or approve an agent.

#### Scenario: Merchant is disabled
- **WHEN** the super-admin disables a merchant that has an active agent grant
- **THEN** that grant can no longer refresh a token and the merchant authorization page rejects the merchant's login

### Requirement: Merchant authorization has no registration
The merchant authorization page MUST offer login and approval only. It MUST tell an unknown phone number to contact an administrator. It MUST NOT present a registration control or create a merchant account.

#### Scenario: Unknown phone opens merchant authorization
- **WHEN** a person opens the merchant authorization page and submits a phone number that is not an active merchant
- **THEN** the page does not create an account and states that an administrator must provision the merchant
