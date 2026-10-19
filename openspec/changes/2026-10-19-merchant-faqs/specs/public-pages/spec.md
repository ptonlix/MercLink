# public-pages Specification

## MODIFIED Requirements

### Requirement: Hidden products are not indexable
A request for an unpublished, deleted, or otherwise non-public product URL MUST return a non-indexable status and MUST NOT include that product's offer data or FAQ items.

#### Scenario: Direct request for unpublished id
- **WHEN** a client requests `/products/{id}` for a product the seam does not return
- **THEN** the response is not indexable and does not embed the product as available or include its FAQ text

## ADDED Requirements

### Requirement: Landing page shows the published store FAQ
When the store FAQ set is publicly visible and the storefront is not activated, `/` MUST render those items in their own section immediately after the product shelf and before any published contact or license facts and before the platform usage guide. The section heading MUST be 常见问题, once, as an `h2`. Each question MUST be one `h3` row in a disclosure group that shares one name. Every row MUST start closed. Opening one row MUST close the others, and opening or closing MUST NOT require client-side script. Each answer MUST be the following paragraph in the initial HTML. When the set is not publicly visible, the page MUST NOT render an FAQ block, that heading, or any default question. FAQ text MUST NOT replace the meta description. When items are present, JSON-LD MUST include an `FAQPage` whose questions and accepted answers equal the question and answer text in the HTML, and MUST keep `OnlineStore` when the profile is published. Withdrawing the profile MUST NOT remove a still-public store FAQ.

#### Scenario: Store FAQ follows the shelf
- **WHEN** `/` has a published profile, a product shelf, published contact or license facts, and one published store FAQ item, and the storefront is not activated
- **THEN** the heading 常见问题 appears once after the shelf and before the question, and the initial HTML contains the answer before those contact or license facts

#### Scenario: No FAQ section when nothing is published
- **WHEN** the store FAQ set is unpublished
- **THEN** `/` does not contain the heading 常见问题 and does not contain an `FAQPage`

### Requirement: Product page shows only that product's FAQ
When the public product seam returns a non-empty `faqs` array and the storefront is not activated, `/products/{id}` MUST render those items in their own full-width section after the product detail article. The user Skill link MUST stay inside that article, after the product facts. The FAQ section MUST NOT sit inside the description column. The product detail is the name, price, description, variants, and product facts. The section heading MUST be 常见问题, once, as an `h2`. Each question MUST be one `h3` row in a disclosure group that shares one name. Every row MUST start closed. Opening one row MUST close the others, and opening or closing MUST NOT require client-side script. Each answer MUST be the following paragraph in the initial HTML. The page MUST NOT render the store FAQ set. `/products` and the landing shelf MUST NOT render FAQ text. When `faqs` is empty, the product page MUST NOT render an FAQ block or that heading. When items are present, JSON-LD MUST include an `FAQPage` whose questions and accepted answers equal the question and answer text in the HTML, and MUST keep `Product` and `Offer` for that product.

#### Scenario: Product FAQ stays off the shelf
- **WHEN** a publicly visible product has one published FAQ item and the storefront is not activated
- **THEN** `/products/{id}` shows the heading 常见问题 once, then that question and answer, and `/` and `/products` do not show that question

### Requirement: Markdown repeats the visible FAQ
`/index.md` MUST include a `## 常见问题` section with the same store FAQ items as `/`, preserving order, and MUST omit that section when no store FAQ is publicly visible. `/products/{id}.md` MUST include a `## 常见问题` section with the same product FAQ items as the product page, and MUST omit that section when `faqs` is empty. The markdown heading matches the builtin HTML section heading. FAQ text MUST NOT be listed as a catalog field key. `/llms.txt` MUST NOT embed FAQ items. `/sitemap.xml` MUST NOT add a `/faq` URL.

#### Scenario: Index markdown follows the landing FAQ
- **WHEN** `/` shows one store FAQ item
- **THEN** `/index.md` contains that question and answer under 常见问题

#### Scenario: Product markdown omits an empty FAQ
- **WHEN** a client fetches `/products/{id}.md` for a public product whose `faqs` is empty
- **THEN** the body does not contain a 常见问题 section

### Requirement: Storefront templates can place FAQ items
The builtin landing page and the starter landing page MUST declare a repeated `store.faq` region whose item slots are `faq.question` and `faq.answer`. The builtin product page and the starter product page MUST declare a repeated `product.faq` region with those same slots. Filling a slot MUST insert the stored plain text as escaped text. Product tokens such as `{id}`, `{catalogId}`, `{priceMinor}`, `{availabilityRaw}`, and `{currency}` MUST be replaced on the template skeleton before FAQ expansion and MUST NOT rewrite an inserted question or answer. The starter template source MUST NOT contain a static 常见问题 heading. When an active template declares `store.faq` or `product.faq` and that set has one or more publicly visible items, expansion MUST emit exactly one `<h2>常见问题</h2>` immediately before that region's items and MUST NOT emit that heading once per item. When that set is empty, expansion MUST remove the region and MUST NOT leave the heading. A template that does not declare the region MUST remain valid and MUST NOT gain a heading or FAQ text. Already published HTML on disk MUST NOT be rewritten. Server-owned JSON-LD MUST stay a separate `FAQPage` script whose questions and accepted answers equal the visible question and answer strings. Uploaded HTML MUST still be forbidden from including `application/ld+json`.

#### Scenario: Starter landing page has the store region
- **WHEN** the starter landing page is rendered for a published store FAQ item
- **THEN** the question and answer are visible through `faq.question` and `faq.answer`, and the page contains exactly one `<h2>常见问题</h2>` before those items

#### Scenario: Empty region leaves no heading
- **WHEN** the starter landing page is expanded and no store FAQ item is publicly visible
- **THEN** the page does not contain 常见问题

#### Scenario: Published template without the region
- **WHEN** an active storefront product template does not declare `product.faq`
- **THEN** the page still renders and does not add that product's FAQ text or the heading 常见问题

#### Scenario: Product tokens do not rewrite FAQ text
- **WHEN** a published product FAQ answer contains `{id}` and the template also uses `{id}` outside that answer
- **THEN** the visible answer still contains `{id}` and the token outside the answer is replaced
