## MODIFIED Requirements

### Requirement: Initial super-admin must change password
On first startup the system MUST create exactly one super-admin from configuration. The initial password MUST be stored only as a hash. The same startup MUST create one store merchant with that phone number and password hash, and MUST request one default catalog named `默认目录` with currency `CNY`. Until the password changes, that merchant MUST NOT approve an agent.

#### Scenario: First login has not changed password
- **WHEN** the store owner authenticates with the initial password and tries to approve an agent
- **THEN** the system rejects the approval and requires a password change first

### Requirement: Super-admin provisions a merchant
Startup MUST ensure one store merchant named `本店` for the super-admin. A later startup MUST NOT insert another merchant and MUST NOT copy the admin password onto the existing merchant. The admin page MUST NOT offer provisioning, disabling, or resetting a merchant. The merchant authorization page MUST accept the same phone and password.

#### Scenario: Startup creates the only store
- **WHEN** the super-admin exists and no merchant exists
- **THEN** one active store merchant exists with the super-admin phone number, and a default-catalog creation request is issued

#### Scenario: Existing store is left unchanged
- **WHEN** startup runs again after the store owner has changed the password
- **THEN** no additional merchant is created and the stored merchant password hash is not replaced from an older admin snapshot

### Requirement: Merchant authorization has no registration
The merchant authorization page MUST offer login and approval only. It MUST tell an unknown phone number to use the store owner phone. It MUST NOT present a registration control or create a merchant account.

#### Scenario: Unknown phone opens merchant authorization
- **WHEN** a person opens the merchant authorization page and submits a phone number that is not the store owner
- **THEN** the page does not create an account and states that the store owner phone must be used

## REMOVED Requirements

### Requirement: Disabled merchant loses access
**Reason**: This deployment has one store. There is no production path that disables or resets that store.
**Migration**: Redeploy a fresh database. Do not keep previously provisioned merchant rows.
