# agent-skills Specification

## ADDED Requirements

### Requirement: Merchant skill explains FAQ sets
`/merchant/skill.md` MUST explain `GET /api/v1/merchant/faqs`, `PUT /api/v1/merchant/faqs`, `GET /api/v1/catalogs/{id}/products/{product_id}/faqs`, and `PUT` on that product path. It MUST include a generic JSON body with exactly `published` and `items`, state the 12-item store limit, the 8-item product limit, the 80-character question limit, and the 400-character answer limit, and state that text is one line of plain text. It MUST say that an unsaved read returns `published` `false` and `items` `[]`, that `published` `true` with an empty list is rejected, and that `published` `false` keeps the draft off the public page. It MUST say that profile save and product publish or unpublish do not change a FAQ set, and that `faqs` is not a profile field, a product field, or a catalog field. It MUST tell the agent to save only questions and answers the merchant explicitly supplied, and not to submit the login phone, password, SMS code, or API key. The example MUST NOT contain a real merchant's FAQ text or a token.

#### Scenario: Merchant skill documents the FAQ paths
- **WHEN** a client fetches `/merchant/skill.md`
- **THEN** the body contains both FAQ paths, the generic `published` and `items` body, and no access token

### Requirement: Storefront skill explains FAQ regions
`/storefront/skill.md` MUST explain the repeated `store.faq` and `product.faq` regions and the slots `faq.question` and `faq.answer`. It MUST say that those slots are filled from the published FAQ sets, that a template without the region does not show the items or a heading, and that the page MUST NOT hard-code the current question, answer, or the heading 常见问题. It MUST say that a region with one or more visible items is expanded with exactly one `<h2>常见问题</h2>` immediately before those items, and that an empty region is removed and leaves no heading.

#### Scenario: Storefront skill names the FAQ slots
- **WHEN** a client fetches `/storefront/skill.md`
- **THEN** the body contains `store.faq`, `product.faq`, `faq.question`, `faq.answer`, and `<h2>常见问题</h2>`
