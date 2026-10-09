# Spec Delta

## ADDED Requirements

### Requirement: Buyer skill retains tokens for later order lookup
`/skill.md` MUST tell the agent to save both `access_token` and `refresh_token` after the device-code token response, and not to give either token to the user or place either token in the conversation. It MUST say `POST /api/v1/orders` and a later `GET /api/v1/orders/{id}` use the same saved access token. It MUST say a `40100` response to a request that omitted `Authorization` means that request had no token. It MUST say the agent does not start a new device authorization while it still holds an access token or refresh token. It MUST say an expired access token is replaced with `grant_type=refresh_token`, and a new device authorization starts only when neither saved token remains.

#### Scenario: Missing header is not a new device grant
- **WHEN** a client fetches `/skill.md`
- **THEN** the body tells the agent to save the access token and refresh token, reuse the access token for order lookup, and not start a new device authorization while either token remains
