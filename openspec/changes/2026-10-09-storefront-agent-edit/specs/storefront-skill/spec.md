# Spec Delta

## Purpose

用一份公开 Skill 告诉商家 Agent 如何改这一家店的店面，哪些协议不能动，以及激活前必须通过的验收。

## ADDED Requirements

### Requirement: Storefront skill is public and separate
`/storefront/skill.md` MUST be public and MUST be the only skill that teaches storefront download, preview, packaging, activation, and rollback. It MUST NOT contain a deployment secret, access token, refresh token, or API key. It MUST point at the current deployment's API origin and MUST tell the agent not to modify the server repository.

#### Scenario: Anonymous fetch
- **WHEN** a client fetches `/storefront/skill.md` without a token
- **THEN** the body describes storefront editing and does not contain a token or deployment secret

### Requirement: Skill states what the merchant must not change
The storefront skill MUST forbid the agent from replacing or shadowing protocol paths, collecting an Alipay password, putting `payment.action` in an iframe or truncating it, treating an opened payment link or a return page as success, creating a merchant account, sending SMS before captcha verification, and choosing a payment implementation. It MUST state that only order status `paid` means payment success. It MUST state that `order_id` is not a public query, and that the server fills `order.status` only for the same buyer Authorization as `GET /api/v1/orders/{id}` when that buyer owns the order. It MUST state that a return page is not payment success. It MUST state that registration, login, and approval screens may change appearance but MUST submit to the existing server authorization endpoints. It MUST state that the first order request chooses `desktop` or `mobile` with `payment_channel`, and that omitting it selects the desktop cashier.

#### Scenario: Forbidden payment behavior is explicit
- **WHEN** a client fetches `/storefront/skill.md`
- **THEN** the body says not to collect an Alipay password and that only status `paid` means success

#### Scenario: Authorization pages stay submissions
- **WHEN** a client fetches `/storefront/skill.md`
- **THEN** the body says styled registration and approval pages must submit to the existing server authorization endpoints and must not add merchant self-registration

### Requirement: Skill defines acceptance before activation
The storefront skill MUST require a local acceptance check before activation. That check MUST fail if the static set contains a reserved path, a secret file, asks for an Alipay password, displays payment success without an order status of `paid`, hardcodes a store, product, or order fact, or omits the required fact slots, including the product list `products.next` slot. The local secret-file check MUST reject the same names the server rejects. The skill MUST say the server renders store profile, product facts, and order status on each request, so those changes do not require another activation. It MUST say the server rejects activation when a document hardcodes those facts or omits the slots for facts it displays. It MUST say the server, not the storefront, decides sitemap entries and non-public product responses, and that a catch-all fallback MUST NOT be used for `/products` or `/products/{id}`. The skill MUST tell the agent to preview through a local proxy to this deployment, not by opening production cross-origin access. It MUST tell the agent not to activate when the check fails, and not to treat upload as activation. The downloaded source MUST include that acceptance check.

#### Scenario: Skill blocks activation after a failed check
- **WHEN** a client fetches `/storefront/skill.md`
- **THEN** the body says to run the acceptance check and not to confirm activation when it fails

#### Scenario: Shipped source contains the check
- **WHEN** the shipped storefront source is downloaded
- **THEN** it contains the acceptance check named by the storefront skill

#### Scenario: Product facts and discovery limits are stated
- **WHEN** a client fetches `/storefront/skill.md`
- **THEN** the body says store, product, and order facts must use server slots rather than baked-in values, and that sitemap and unpublished URLs are enforced by the server
