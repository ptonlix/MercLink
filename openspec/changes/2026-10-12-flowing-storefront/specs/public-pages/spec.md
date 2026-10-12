## MODIFIED Requirements

### Requirement: Landing page states how to start
The `/` page MUST be server-rendered HTML. When a store profile is published, the first visible content MUST be that store, with the display name as the main heading, followed by its summary and any logo, area, address, and website. Published products MUST follow the store. The compact footer MUST provide a “如何使用” disclosure containing buyer and merchant guidance, both skills, interface documentation and discovery links. It MUST NOT show the platform slogan or explanation outside this disclosure. It MUST NOT use “查询已上架商品并下单” as that description, and it MUST NOT say that merchants cannot self-register. The visible order MUST NOT place the slogan or project links before the store or products. It MUST NOT list multiple stores, link to `/merchants/{id}`, or say “进入这一家的店”. The main content MUST be present without client-side script. When a store profile is published, the meta description MUST be the summary truncated to 150 characters, and JSON-LD MUST include an `OnlineStore` whose name, description, logo, sameAs, areaServed, and address match the visible profile. The canonical URL MUST remain this application's landing page. Title, description, canonical link, and JSON-LD MUST match the visible content.

#### Scenario: Client does not execute script
- **WHEN** a reader fetches `/` and does not run JavaScript
- **THEN** the HTML already contains the store name or product cards before the footer guidance and skill links

#### Scenario: Published store profile
- **WHEN** the public store seam returns a published profile
- **THEN** `/` shows that display name and summary above the product summary and does not show a login phone, a self-registration notice, or a link to another store

### Requirement: Landing products use a store shelf
Published products on `/` MUST appear as linked photographic cards showing the title and major-unit price, without visible stock badges, sequence numbers or hover instructions. A detail icon MUST appear at the lower left. With multiple products, the built-in shelf MUST automatically flow in a seamless loop, pause on hover or focus and offer a pause control. Hover or focus MUST expand the active card on desktop. Visual duplicates MUST be excluded from reading and tab order. Touch readers MUST be able to open cards directly. Reduced-motion readers MUST receive a static complete collection. Static source templates MUST retain native product links and manual scrolling without requiring React. The full list MUST remain linked; empty collections MUST show the existing empty state.

#### Scenario: Automatic flow
- **WHEN** multiple published products are present and motion is enabled
- **THEN** cards move automatically and repeat seamlessly, and hovering pauses the movement while expanding the card

#### Scenario: Reduced motion or keyboard
- **WHEN** reduced motion is requested or a card receives keyboard focus
- **THEN** automatic movement stops and every original product remains directly reachable

#### Scenario: No script or empty collection
- **WHEN** scripts are unavailable or there are no products
- **THEN** native links and existing public facts remain readable, or the empty state is displayed

### Requirement: Product detail prioritizes images and readable content
The product detail SHALL present an available cover or gallery alongside its purchase information on desktop and above it on phones. Missing images SHALL have a meaningful placeholder. Long public text fields SHALL preserve paragraphs in a readable full-width section rather than a narrow parameter cell. All public field values SHALL remain accessible, including unknown field keys. Existing price units SHALL be shown near the price when present, without inventing a unit. The gallery SHALL show each distinct image once without thumbnail duplication, with previous and next controls when multiple images exist. English description SHALL be selected initially, with a Chinese tab when a Chinese description exists. Unknown fields SHALL remain accessible. The buyer Skill SHALL be an accessible icon link beside a compact copy button. Homepage, list and detail SHALL share graphite, ice-white and pale-cyan colors. The purchase action SHALL describe copying a request to an Agent, not direct checkout.

#### Scenario: Product contains long bilingual text and images
- **WHEN** a public product has a cover, gallery URLs and multiline fields
- **THEN** its images precede long descriptions, the paragraphs remain readable, and all public field values remain available

#### Scenario: Switch images and language
- **WHEN** a product has multiple images and bilingual descriptions
- **THEN** the reader can navigate images with left/right controls and select Chinese without losing the English text or other public fields

## ADDED Requirements

### Requirement: Store heading has contextual motion
The store heading SHALL have a Chengdu landmark mark before it and a decorative panda moving between letters. The real summary SHALL appear below with a one-time typewriter enhancement. The complete heading and summary SHALL remain accessible without script and under reduced-motion preference. A pause control SHALL stop continuous decorative movement.

#### Scenario: Motion preference
- **WHEN** the reader requests reduced motion or pauses animations
- **THEN** the panda remains still and the complete summary is readable
