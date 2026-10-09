## MODIFIED Requirements

### Requirement: Landing page states how to start
The `/` page MUST be server-rendered HTML. When a store profile is published, the first visible content MUST be that store, with the display name as the main heading, followed by its summary and any logo, area, address, and website. Published product banners MUST follow the store. Immediately after the product banner region, the page MUST provide a visible “查看更多” link to `/products`, followed by a platform usage section explaining the buyer and merchant workflows in ordered steps. MercLink and both skills MUST be allowed in that usage section. The slogan “在 AI 时代，让天下没有难做的生意” and the explanation “帮中小商家做自己的店，并让各种 Agent 直接找到商品、完成购买。” MUST remain visible after the products. The API root and discovery files MUST be provided in the footer. The page MUST NOT use “查询已上架商品并下单” as that explanation, and MUST NOT say that merchants cannot self-register. The visible order MUST NOT place platform promotion or project links before the store or products. It MUST NOT list multiple stores, link to `/merchants/{id}`, or say “进入这一家的店”. The main content and usage steps MUST be present without client-side script. When a store profile is published, the meta description MUST be the summary truncated to 150 characters, and JSON-LD MUST include an `OnlineStore` whose name, description, logo, sameAs, areaServed, and address match the visible profile. The canonical URL MUST remain this application's landing page. Title, description, canonical link, and JSON-LD MUST match the visible content.

#### Scenario: Client does not execute script
- **WHEN** a reader fetches `/` and does not run JavaScript
- **THEN** the HTML already contains the store name or product banners before the more-products link, ordered usage steps, slogan, and skill links

#### Scenario: Published store profile
- **WHEN** the public store seam returns a published profile
- **THEN** `/` shows that display name and summary above the product banners and does not show a login phone, a self-registration notice, or a link to another store

#### Scenario: Reader wants all products
- **WHEN** a reader activates “查看更多” below the banner region
- **THEN** the browser navigates to `/products` and the link does not depend on client-side script

### Requirement: Landing products use a store shelf
The published products on `/` MUST render as linked product banners in one horizontal shelf. Each banner MUST show the cover or a placeholder, the title, textual availability, and the price in major currency units derived from minor units. The whole banner MUST link to `/products/{id}`. The shelf MUST be movable sideways using user actions, MUST NOT autoplay, and MUST remain readable without client-side script. Desktop viewports MUST show approximately two landscape banners at once, and narrow viewports MUST show one banner with a partial next banner when another item exists. The banners MUST reuse the public query results in their existing order without introducing advertising slots, manual curation, or a second content store. The page MUST use a warm paper background, serif slogan and store name, and one green accent. It MUST NOT use a neon gradient, giant background wordmark, floating purchase chip, or autoplay media. A regular “查看更多” link to `/products` MUST follow the banner region even when the current results are empty. An empty shelf MUST state that no product is available and MUST NOT substitute sample products.

#### Scenario: Two published products
- **WHEN** the public-product seam returns two products priced at 159900 and 800 minor units
- **THEN** `/` shows two linked product banners with `¥1599.00` and `¥8.00`, followed by “查看更多” linking to `/products`

#### Scenario: Script is disabled
- **WHEN** a reader fetches `/` and does not run JavaScript
- **THEN** the product banners and their links are already present in the horizontally scrollable shelf

#### Scenario: User scrolls the banners
- **WHEN** a reader uses the shelf arrows or swipes the banner region
- **THEN** the shelf advances to other product banners without automatically advancing on a timer

### Requirement: Product pages use the public query seam
`/products` and `/products/{id}` MUST render only products returned by the public-product seam. They MUST NOT read a second product store or hand-picked content. A product page MUST show the public fields and sellable variants. JSON-LD MUST use `ItemList` for the list and `Product` plus `Offer` for a product, with the same price, currency, and availability as the seam. Visible prices MUST be formatted in major currency units for human readers while the seam and API MUST preserve their integer minor-unit values. JSON-LD MUST retain its existing schema.org-compatible price representation, derived from those same values. The list MUST show linked product covers or explicit placeholders, titles, prices, and textual availability. Pagination MUST use the existing cursor and MUST NOT invent a total count or client-side search result set.

#### Scenario: Seam returns one product
- **WHEN** the public-product seam returns one published product
- **THEN** `/products` and `/products/{id}` show that product and its offer price matches the seam

#### Scenario: Seam is unregistered
- **WHEN** the public-product seam has no implementation
- **THEN** the pages render successfully and show no products

#### Scenario: Human-readable price
- **WHEN** the seam returns a CNY offer with a price of 15900 minor units
- **THEN** the visible list and detail show `¥159.00`, and the underlying integer value remains 15900

#### Scenario: More items have a cursor
- **WHEN** the product list has a non-null next cursor
- **THEN** the page provides a regular link carrying that cursor and does not infer the full catalog size from the current page

## ADDED Requirements

### Requirement: Public visual language preserves store-first presentation
Public pages MUST use the warm paper base, serif store heading, green accent, and consistent typography and spacing. The landing page MUST place its store introduction before the manually scrollable product banners, followed by the more-products link and platform usage section. API and discovery links MUST remain in the footer. Missing optional store fields MUST be omitted. When no published profile exists, the page MUST omit the store introduction and MUST NOT replace it with fixture content.

#### Scenario: Published store introduction
- **WHEN** the landing model contains a published store and products
- **THEN** the store display name and summary appear before the banners, and the platform usage and skill links appear below the more-products entry

#### Scenario: Store profile is absent
- **WHEN** the landing model contains no published store
- **THEN** the page begins with public products or their empty state and shows no fabricated store introduction

### Requirement: Landing usage guidance is ordered and role-specific
The platform usage section MUST explain buyer and merchant workflows as two ordered four-step guides. Buyer guidance MUST cover providing the buyer skill to an agent, describing a purchase request, authorizing in the person's own browser when ordering is needed, and confirming the product and variant before completing payment through Alipay and asking the agent to check the order result. Merchant guidance MUST cover providing the merchant skill, owner login and approval with initial password change when required, supplying product facts and images, and completing required fields and sellable variants before publishing. Guidance MUST NOT ask users to share passwords, SMS codes, API keys, or tokens with an agent. It MUST NOT imply that clicking a payment URL proves payment success. Role-switching controls MUST support keyboard navigation when enhanced with script; without script both guides MUST remain readable. The usage section MUST remain visible when no products are available.

#### Scenario: Buyer reads the guide
- **WHEN** a reader selects the buyer guide
- **THEN** the page shows the four purchase steps and the buyer skill link without exposing the merchant flow as buyer registration

#### Scenario: Owner reads the guide
- **WHEN** a reader selects the merchant guide
- **THEN** the page shows how an owner authorizes an agent, supplies product information, and has the agent publish after validation

#### Scenario: No products are available
- **WHEN** the shelf has no available products
- **THEN** the platform usage section still explains both role workflows and does not insert fabricated banner products

#### Scenario: Usage guide scripts are disabled
- **WHEN** a reader views the page without scripts
- **THEN** both ordered guides and their skill links are visible in the HTML

### Requirement: Product detail separates facts from purchase assistance
Product detail MUST display every public field and every sellable variant returned by the seam. A variant MUST show its actual option values, price, stock or unlimited-stock label, availability, SKU when present, and id. The UI MUST NOT create variant combinations, translate field keys through a fabricated schema, or hide an out-of-stock sellable variant. Boolean values MUST be rendered as readable affirmative or negative text, and null fields MUST be identified as unfilled. Selecting a variant MUST be a local display action only. Optional purchase-assistance copy MUST identify the product and selected variant and ask the agent to query current price and stock before confirming a purchase. It MUST NOT create an order, submit a display price as order input, start a payment, or claim payment success.

#### Scenario: Variant has unlimited stock
- **WHEN** a returned variant has `stock` null
- **THEN** the detail shows an unlimited-stock label and does not render zero stock

#### Scenario: Sellable variant has no stock
- **WHEN** a returned sellable variant has zero stock and out-of-stock availability
- **THEN** its facts remain visible, it is labeled out of stock, and it cannot be selected for purchase-assistance copy

#### Scenario: Reader selects a variant
- **WHEN** a reader selects an available variant in a detail page
- **THEN** the visual selection and optional copy text identify that variant without creating an order or locking inventory

### Requirement: Public content supports progressive enhancement
Store facts, product facts, links, and structured data MUST be present in server-rendered HTML before client scripts execute. Copy controls and variant highlighting MUST be optional enhancements. Copying a skill MUST use that site's public absolute URL and MUST report success only after an actual successful clipboard operation. Clipboard failures MUST offer selectable text. Product covers MUST have descriptive alternate text; missing or failed images MUST retain their dimensions and show a readable placeholder.

#### Scenario: JavaScript is disabled
- **WHEN** a reader loads a public page without running scripts
- **THEN** store and product content, all variant facts, product navigation, skill links, and pagination remain readable and usable

#### Scenario: Clipboard is unavailable
- **WHEN** a copy action is blocked by the browser
- **THEN** the UI provides the exact selectable text with a manual-copy instruction and does not claim it was copied

#### Scenario: Image cannot be displayed
- **WHEN** a product has no cover or its cover fails to load
- **THEN** the layout retains an equal-ratio placeholder and the reader can still read the title, price, and availability

### Requirement: Public pages are usable across viewport sizes
Public pages MUST support 320px mobile widths without whole-page horizontal overflow. The landing shelf MAY scroll horizontally within its own bounded region and MUST NOT autoplay. List grids and detail columns MUST reflow for small viewports. Keyboard focus MUST remain visible, actionable targets MUST be at least 44px high, and status MUST have text in addition to color. Nonessential transitions MUST honor reduced-motion preferences. Empty query results MUST be distinguished from failed queries, and neither MUST show sample products.

#### Scenario: Narrow viewport
- **WHEN** a reader views the list or detail at a 320px viewport width
- **THEN** the layout reflows and the document does not overflow horizontally

#### Scenario: Query fails
- **WHEN** a public-product query fails rather than returning an empty successful page
- **THEN** the page shows failure and recovery guidance instead of pretending that the catalog is empty

#### Scenario: Query is empty
- **WHEN** a public-product query successfully returns no products
- **THEN** the page states that no products are available and does not insert recommendations or fixtures
