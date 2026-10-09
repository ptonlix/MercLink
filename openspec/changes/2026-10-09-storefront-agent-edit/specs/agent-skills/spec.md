# Spec Delta

## ADDED Requirements

### Requirement: Merchant skill points page edits to the storefront skill
`/merchant/skill.md` MUST tell the agent that storefront edits are described only by `/storefront/skill.md`. It MUST NOT teach storefront upload, activation, or rollback itself. It MUST state that approval grants `field:write`, `product:write`, `product:read`, and `order:read`, and grants `storefront:write` only in addition to those four when that scope was requested. Existing buyer and merchant purchase and catalog instructions MUST remain in their current skills.

#### Scenario: Merchant skill does not become the page editor
- **WHEN** a client fetches `/merchant/skill.md`
- **THEN** the body points to `/storefront/skill.md` for page edits and does not document storefront activation

### Requirement: Storefront routes belong to the storefront skill
The shared route table MUST assign storefront download, release, activation, and rollback paths to a storefront audience. The storefront skill MUST mention each of those paths. The buyer and merchant skills MUST NOT be required to mention them. A test MUST fail when the storefront skill omits an assigned storefront path or documents an `/api/v1` path that the table does not list.

#### Scenario: Storefront path missing from its skill
- **WHEN** the shared route table lists a storefront path that `/storefront/skill.md` does not mention
- **THEN** the skill consistency check fails
