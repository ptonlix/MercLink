# Spec Delta

## ADDED Requirements

### Requirement: Merchant skill uploads covers before writing them
`/merchant/skill.md` MUST tell the agent to upload a product or variant cover with `POST /api/v1/catalogs/{id}/images` before writing `cover`, and to store only the returned `data.url`. It MUST say the agent does not write object storage itself. It MUST say that `dependency_unavailable` `50301` and `rate_limited` `42900` mean stop and leave `cover` unchanged. It MUST NOT present an external or generated image URL as the fallback for a failed upload. It MUST say an external http(s) URL MAY be written only when the user supplied it and an anonymous browser can fetch the image bytes without a login, signature, or cookie. It MUST say a private or access-denied URL MUST NOT be used as a cover.

#### Scenario: Upload failure is not an external cover
- **WHEN** a client fetches `/merchant/skill.md`
- **THEN** the body tells the agent not to replace a failed upload with an external or generated image URL, and names code `50301`

#### Scenario: Private URL is not a cover instruction
- **WHEN** a client fetches `/merchant/skill.md`
- **THEN** the body says a URL that an anonymous browser cannot open must not be written to `cover`
