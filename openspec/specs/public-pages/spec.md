# public-pages Specification

## Purpose

给人、搜索引擎和 Agent 同一份服务端渲染的公开商品入口，且不另建一套商品内容数据。首页动效、列表、图集和语言切换均围绕同一公共事实，保持无脚本阅读与原生导航。

## Requirements

### Requirement: Landing page states how to start
The `/` page MUST be server-rendered HTML. When a store profile is published, the first visible content MUST be that store, with the display name as the main heading, followed by its summary and any logo, area, address, and website. Published products MUST follow the store. The compact footer MUST provide a “如何使用” disclosure containing buyer and merchant guidance, both skills, interface documentation and discovery links. It MUST NOT show the platform slogan or explanation outside this disclosure. It MUST NOT use “查询已上架商品并下单” as that description, and it MUST NOT say that merchants cannot self-register. The visible order MUST NOT place the slogan or project links before the store or products. It MUST NOT list multiple stores, link to `/merchants/{id}`, or say “进入这一家的店”. The main content MUST be present without client-side script. When a store profile is published, the meta description MUST be the summary truncated to 150 characters, and JSON-LD MUST include an `OnlineStore` whose name, description, logo, sameAs, areaServed, and address match the visible profile. The canonical URL MUST remain this application's landing page. Title, description, canonical link, and JSON-LD MUST match the visible content.

#### Scenario: Client does not execute script
- **WHEN** a reader fetches `/` and does not run JavaScript
- **THEN** the HTML already contains the store name or product cards before the footer guidance and skill links

#### Scenario: Published store profile
- **WHEN** the public store seam returns a published profile
- **THEN** `/` shows that display name and summary above the product summary and does not show a login phone, a self-registration notice, or a link to another store

### Requirement: Product pages use the public query seam
`/products` and `/products/{id}` MUST render only products returned by the public-product seam. They MUST NOT read a second product store or hand-picked content. A product page MUST show the public fields and sellable variants. JSON-LD MUST use `ItemList` for the list and `Product` plus `Offer` for a product, with the same price, currency, and availability as the seam.

#### Scenario: Seam returns one product
- **WHEN** the public-product seam returns one published product
- **THEN** `/products` and `/products/{id}` show that product and its offer price matches the seam

#### Scenario: Seam is unregistered
- **WHEN** the public-product seam has no implementation
- **THEN** the pages render successfully and show no products

### Requirement: Discovery files stay small and current
`/llms.txt` MUST point to the landing page, product list, both skills, and the API, and MUST NOT embed the full catalog or the store profile. `/sitemap.xml` MUST include the landing page, product list, currently public products, and both skills. It MUST NOT add per-merchant store URLs. `/robots.txt` MUST allow those public pages and MUST disallow authorization pages, the super-admin page, and `/api`.

#### Scenario: Product becomes unpublished
- **WHEN** a product is no longer returned by the public-product seam
- **THEN** it is absent from the sitemap and its public URL is not indexable

#### Scenario: Profile is withdrawn
- **WHEN** the store profile is no longer published
- **THEN** `/` no longer shows that display name or summary

### Requirement: Hidden products are not indexable
A request for an unpublished, deleted, or otherwise non-public product URL MUST return a non-indexable status and MUST NOT include that product's offer data.

#### Scenario: Direct request for unpublished id
- **WHEN** a client requests `/products/{id}` for a product the seam does not return
- **THEN** the response is not indexable and does not embed the product as available

### Requirement: Landing products use a store shelf
Published products on `/` MUST appear once each as native detail links with a cover or placeholder, title, major-unit price and lower-left detail icon, without stock badges, sequence numbers or hover instructions. With multiple products and motion enabled, cards MUST automatically revolve along an elliptical path with changing horizontal, vertical and depth positions, perspective, tilt and floating shadows. The shelf MUST NOT use a translated or duplicated strip. Hover MUST pause rotation and lift the hovered card; keyboard focus MUST bring that product to the foreground and pause. Previous/next controls MUST bring each product forward. Touch readers MUST open a card directly. A pause control MUST stop continuous motion. Reduced motion or unavailable script MUST expose every product in a readable static layout; empty collections MUST show the existing empty state. Built-in homepage pagination MUST stay on `/` and use the same public seam and matching Markdown facts.

#### Scenario: Spatial rotation
- **WHEN** multiple products are present and motion is enabled
- **THEN** each card changes its x, y and z positions along an ellipse and can be opened directly, with no duplicate links

#### Scenario: Accessible browsing
- **WHEN** the reader hovers, focuses, uses previous/next controls or requests reduced motion
- **THEN** the relevant card is stationary and reachable, or all cards use the readable static layout

#### Scenario: More products exist
- **WHEN** the public seam returns a next cursor
- **THEN** the homepage links to the next homepage batch and its Markdown retains matching facts and cursor navigation

### Requirement: Product detail prioritizes images and readable content
The product detail SHALL provide a single primary return link to `/`, without a product-list detour or repeated storefront navigation. Existing list and discovery URLs SHALL remain compatible. The product detail SHALL present an available cover or gallery alongside its purchase information on desktop and above it on phones. Missing images SHALL have a meaningful placeholder. Long public text fields SHALL preserve paragraphs in a readable full-width section rather than a narrow parameter cell. All public field values SHALL remain accessible, including unknown field keys. Existing price units SHALL be shown near the price when present, without inventing a unit. The gallery SHALL deduplicate URLs, show one active main image and show each other image once as a thumbnail below it. The active main image thumbnail SHALL be hidden to avoid simultaneous duplication. Thumbnail selection and previous/next controls SHALL switch the same active image, including without JavaScript. English description SHALL be selected initially, with a Chinese tab when a Chinese description exists. Unknown fields SHALL remain accessible. The user Skill SHALL be an accessible icon link beside a compact copy button when purchase is enabled. When purchase is disabled, the Skill icon SHALL remain available while the copy purchase action and purchasing instructions SHALL be omitted. Homepage, list and detail SHALL share graphite, ice-white and pale-cyan colors. The purchase action SHALL describe copying a request to an Agent, not direct checkout.

#### Scenario: Product contains long bilingual text and images
- **WHEN** a public product has a cover, gallery URLs and multiline fields
- **THEN** its images precede long descriptions, the paragraphs remain readable, and all public field values remain available

#### Scenario: Switch images and language
- **WHEN** a product has multiple images and bilingual descriptions
- **THEN** the reader can navigate images with left/right controls and select Chinese without losing the English text or other public fields

#### Scenario: Return from a card
- **WHEN** a reader opens a homepage card and activates the detail return link
- **THEN** the reader returns directly to `/` without visiting a list page

#### Scenario: Thumbnail selection
- **WHEN** a reader selects a thumbnail or uses an image arrow
- **THEN** that image becomes the sole main image, its thumbnail disappears and the former main image becomes a thumbnail

### Requirement: Public text is escaped once
Product and store text SHALL display its original characters while remaining escaped for HTML. Visible titles, metadata and structured facts SHALL describe the same underlying text.

#### Scenario: Title includes HTML-significant characters
- **WHEN** a public title contains ampersands, quotes or angle brackets
- **THEN** the page displays those characters as text without extra visible entity encoding or executable injected markup

### Requirement: Store heading has contextual motion
The store heading SHALL have a Chengdu landmark mark before it and a decorative panda moving between letters. The real summary SHALL appear below with a one-time typewriter enhancement. The complete heading and summary SHALL remain accessible without script and under reduced-motion preference. A pause control SHALL stop continuous decorative movement.

#### Scenario: Motion preference
- **WHEN** the reader requests reduced motion or pauses animations
- **THEN** the panda remains still and the complete summary is readable

### Requirement: Tour facts and participant selection
Tour meeting points and times SHALL come from optional public product fields and appear beside the image, with the existing external booking URL. Missing facts SHALL be omitted. Tour details SHALL provide a participant stepper defaulting to 1 and accepting positive integers, bounded by finite selected stock when present. When purchase is enabled, the copied purchase request SHALL include the selected number of participants and require Agent confirmation of price, stock and quantity. Changing the count or variant SHALL reset copy feedback. Without JavaScript, the default count and instructions to give the count to an Agent SHALL remain available. The page SHALL NOT make a reservation or create an order from the stepper or booking link.

#### Scenario: Three supplied tours
- **WHEN** the supplied tours are opened
- **THEN** the night tour shows 19:00–21:30 and Jinshi Road Exit E2, food tour shows 16:45–19:15 and TCM hospital Exit J, history tour shows 16:00–18:15 without an invented meeting point, and each links to its own supplied GuruWalk URL

#### Scenario: Adjust participants
- **WHEN** the reader increases the count from 1 to 2 and copies the purchase request
- **THEN** the request includes 2 participants and cannot be reduced below 1 or raised above a finite selected stock

### Requirement: Browser page icon
Pages using the root application layout SHALL declare a shared Chengdu panda browser icon in pale cyan, ice white and graphite. The logo before the homepage name SHALL use the same panda artwork and colors. An SVG icon and a multi-size ICO fallback SHALL be available as static application assets without client JavaScript or database access.

#### Scenario: Identify a browser tab
- **WHEN** a reader opens the homepage or a product detail
- **THEN** its HTML declares the shared panda icon and the browser can retrieve both icon formats

#### Scenario: Consistent storefront identity
- **WHEN** the homepage displays the name and logo
- **THEN** its logo matches the browser icon while the existing animated panda above the letters remains available
