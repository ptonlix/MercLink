# Spec Delta

## ADDED Requirements

### Requirement: Public HTTPS is an optional pinned Caddy service
The production Compose file MUST be able to start a pinned `caddy` image as the public TLS proxy. The image tag MUST be an explicit version and MUST NOT be `latest`. The proxy MUST NOT start unless the operator enables the `caddy` profile. A deployment that does not enable that profile MUST still be able to start the application and its existing dependencies without a public domain.

#### Scenario: Profile is disabled
- **WHEN** an operator starts the production Compose stack without the `caddy` profile
- **THEN** Caddy is not started and the application stack does not require a public domain or ACME email

#### Scenario: Profile is enabled
- **WHEN** an operator enables the `caddy` profile and sets a hostname plus an ACME email
- **THEN** Caddy starts from the pinned image and publishes TCP ports 80 and 443

### Requirement: The proxy reaches the app inside the Compose network
The proxy MUST forward public traffic to the application on the Compose network. It MUST overwrite `X-Real-IP` with the address of the current connection and MUST NOT pass through a caller-supplied value for that header. The repository MUST NOT contain the deployment domain, ACME email, or certificate.

#### Scenario: A client connects through the proxy
- **WHEN** a request arrives at the public proxy
- **THEN** the application receives it from the Compose network and sees the current connection address in `X-Real-IP`

#### Scenario: Domain is not in source
- **WHEN** the production Compose file is read from the repository
- **THEN** it contains neither a real domain nor a certificate

### Requirement: Certificates persist and renew without a new image
Certificate and ACME account data MUST be stored on named volumes. Recreating the proxy container without deleting those volumes MUST keep that data. Renewal MUST be performed by Caddy and MUST NOT require rebuilding the application image.

#### Scenario: Proxy container is recreated
- **WHEN** the operator recreates the Caddy container and keeps its named volumes
- **THEN** the previously stored certificate data remains available to the new container

### Requirement: An optional apex name redirects to the public host
When `APEX_DOMAIN` is set, the proxy MUST obtain a certificate for that hostname and MUST permanently redirect it to `https://` plus `APP_DOMAIN`, preserving the path and query. It MUST NOT treat the apex name as a second public application address. When `APEX_DOMAIN` is empty, the proxy MUST serve only `APP_DOMAIN`. `APEX_DOMAIN` MUST be a hostname and MUST NOT equal `APP_DOMAIN`.

#### Scenario: Apex request is canonicalized
- **WHEN** a client requests the configured apex hostname
- **THEN** the proxy responds with a permanent redirect to the same path and query on `https://` plus `APP_DOMAIN`

#### Scenario: Apex is not configured
- **WHEN** the operator enables the proxy without `APEX_DOMAIN`
- **THEN** the proxy serves only `APP_DOMAIN`
