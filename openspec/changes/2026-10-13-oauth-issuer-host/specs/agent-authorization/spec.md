# Spec Delta

## ADDED Requirements

### Requirement: Device and discovery URLs use the configured issuer
Device verification links, the device confirmation form action, and authorization discovery endpoint URLs MUST be absolute URLs on the configured issuer origin. The authorization server MUST NOT use the process bind address, or a forwarded host that differs from the issuer, when it builds those URLs.

#### Scenario: Bind address is not the public host
- **WHEN** a client requests device confirmation or authorization discovery through a request whose URL host is the process bind address
- **THEN** every absolute authorization URL uses the configured issuer origin and none use the bind address
