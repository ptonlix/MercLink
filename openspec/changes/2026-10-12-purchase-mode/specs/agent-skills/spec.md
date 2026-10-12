# Spec Delta

## MODIFIED Requirements

### Requirement: Buyer skill teaches query and purchase
`/skill.md` MUST be public and MUST be titled 用户 Skill. It MUST NOT be titled 买家 Skill, and its body MUST NOT call itself 买家 Skill. When purchase mode is disabled, it MUST explain only anonymous querying of published products, the difference between a product and a sellable variant, and that price is in minor units. It MUST NOT teach buyer registration, device authorization, order placement, `payment.action`, or payment success. When purchase mode is enabled, the same path MUST still be titled 用户 Skill and MUST also explain: not asking the user for a password, SMS code, or API key; ordering by variant id, or by product id only when one sellable variant exists; idempotent `client_order_no`; payment action usage; order status lookup; and that only status `paid` means success. The enabled document MUST include the error cases for missing product, unpublished product, insufficient stock, invalid key, unknown field, and forbidden. The disabled document MUST include `purchase_disabled` and MUST NOT include those purchase error cases as ordering instructions.

#### Scenario: Buyer skill fetched anonymously
- **WHEN** purchase mode is enabled and a client fetches `/skill.md` without a token
- **THEN** the body is titled 用户 Skill, contains the buyer API paths from the shared route table, and does not contain an access token, refresh token, or API key

#### Scenario: Query-only skill while purchase is disabled
- **WHEN** purchase mode is disabled and a client fetches `/skill.md`
- **THEN** the body is titled 用户 Skill, explains public product query, and does not teach `POST /api/v1/orders` or buyer registration

### Requirement: Skill paths match the route table
When purchase mode is enabled, a test MUST fail when either skill omits a path assigned to it in the shared route table, or documents a buyer or merchant path that the table does not list. When purchase mode is disabled, the user skill MUST omit order-placement and buyer-order-read paths, and a test MUST fail if that disabled body documents them. The merchant skill MUST still match its assigned paths in both modes. If the live API disagrees with a skill, the API contract wins and the skill MUST be updated in the same change.

#### Scenario: Route added without skill update
- **WHEN** purchase mode is enabled and the shared route table lists a buyer path that `/skill.md` does not mention
- **THEN** the skill consistency check fails

#### Scenario: Disabled skill teaches an order path
- **WHEN** purchase mode is disabled and `/skill.md` documents `POST /api/v1/orders`
- **THEN** the skill consistency check fails

## ADDED Requirements

### Requirement: Cross links use the user skill name
A public skill, discovery file, or landing guide that links to `/skill.md` MUST call that document 用户 Skill and MUST NOT call it 买家 Skill. The URL MUST remain `/skill.md`.

#### Scenario: Another skill links to the user skill
- **WHEN** a client fetches `/storefront/skill.md` or `/llms.txt`
- **THEN** a link to `/skill.md` is labeled 用户 Skill and the text 买家 Skill is absent
