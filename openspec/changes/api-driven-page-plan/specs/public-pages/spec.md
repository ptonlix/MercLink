## MODIFIED Requirements

### Requirement: Landing page states how to start

The `/` page MUST be server-rendered HTML. When a store profile is published, the first visible content MUST be that store, with the display name as the main heading, followed by its summary and any logo, area, address and website. The main content MUST contain only the store introduction and the published-products section. A products heading above the banners MUST show an honestly known count and a prominent "查看全部商品" link to `/products` so visitors do not need to scroll past a banner to find the list. A total MUST come from an authoritative total or an exhausted public result; partial results MUST be described as a loaded count. Selecting a product banner MUST navigate to `/products/{id}`. The page MUST NOT embed expanded platform usage steps, role guides, authorization forms or design-preview toolbars in its main flow. A question-mark help control MUST open usage guidance in a labeled dialog that is closed by default. Merchant onboarding limitations MUST be explained only within help rather than as store-facing promotional content. The slogan “在 AI 时代，让天下没有难做的生意”, the explanation “帮中小商家做自己的店，并让各种 Agent 直接找到商品、完成购买。”, MercLink, both skills, the API root and discovery files MUST remain available in the footer or its native disclosure, with relevant Skill links also available inside help. The explanation MUST NOT use “查询已上架商品并下单”. The visible order MUST NOT place the slogan or project links before the store or products. The page MUST NOT list multiple stores, link to `/merchants/{id}`, or say “进入这一家的店”. Main product content and links MUST be present without client-side script, and no-script readers MUST retain footer Skill links. When a store profile is published, the meta description MUST be its summary truncated to 150 characters, and JSON-LD MUST include an `OnlineStore` whose name, description, logo, sameAs, areaServed and address match the visible profile. The canonical URL MUST remain this application's landing page. Title, description, canonical link and JSON-LD MUST match the visible content.

#### Scenario: Client does not execute script

- **WHEN** a reader fetches `/` and does not run JavaScript
- **THEN** the HTML already contains the real store introduction when published, product links and the "查看全部商品" link above the banners, and footer Skill links remain readable

#### Scenario: Published store profile

- **WHEN** the public store seam returns a published profile
- **THEN** the store name and summary appear above product banners without inline usage steps, a login phone or a link to another store

#### Scenario: Browsing from home

- **WHEN** a visitor selects "查看全部商品" or a product banner
- **THEN** the all-products link leads to `/products` and the product leads to `/products/{id}`

#### Scenario: Help is initially closed

- **WHEN** the landing page first renders
- **THEN** platform usage steps are hidden until the question-mark control opens the help dialog
