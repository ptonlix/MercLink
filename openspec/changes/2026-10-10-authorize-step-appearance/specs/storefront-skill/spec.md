# storefront-skill Specification

## ADDED Requirements

### Requirement: Skill describes authorization step appearance
The storefront skill MUST say that declaring an authorization appearance replaces the appearance of the corresponding step, not the whole authorization flow. It MUST say a missing step uses the built-in page. It MUST say a template that cannot be strictly parsed, including scripts, event handlers, or dangerous URLs, uses the built-in page instead of a stripped document. It MUST say the buyer phone step must leave an empty `authorize.captcha` slot. It MUST keep the sentences `authorize_buyer=account/buyer.html` and `authorize_merchant=account/merchant.html`. It MUST NOT hardcode port 3000 or 4173.

#### Scenario: Skill explains step appearance
- **WHEN** a client fetches `/storefront/skill.md`
- **THEN** the body says a declared authorization appearance replaces a step rather than the whole flow, that a missing step uses the built-in page, that an unparseable or unsafe template uses the built-in page instead of a stripped document, and that the phone step must leave the captcha slot
