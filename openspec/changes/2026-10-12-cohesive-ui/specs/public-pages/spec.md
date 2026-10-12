## MODIFIED Requirements

### Requirement: Landing products use a store shelf
The published products on `/` MUST render as linked product cards in one horizontal film strip. Each card MUST show the cover or a placeholder, the title, and the price in major currency units derived from minor units. The whole card MUST link to `/products/{id}`. On a desktop with a fine pointer, a multi-product built-in strip MUST translate sideways on its own, pause while hovered or focused, and provide a persistent native pause control. On narrow screens, coarse pointers or reduced-motion preference, the strip MUST stop translating, omit duplicate cards from layout, and remain manually scrollable. A single product or a static template without a loop copy MUST remain readable without automatic motion. The strip MUST remain readable without client-side script. The page MUST use a deep warm-ink background, ivory text, a serif store name and slogan, and one brass accent. It MUST NOT autoplay video or audio, use a neon gradient, show a giant background wordmark, or show a floating purchase chip. When more products exist beyond the strip, the page MUST link to `/products`. An empty shelf MUST state that no product is available.

#### Scenario: Two published products
- **WHEN** the public-product seam returns two products priced at 159900 and 800 minor units
- **THEN** `/` shows cards with `¥1599.00` and `¥8.00`, each linking to its product, and the desktop strip can be paused without script

#### Scenario: Script is disabled
- **WHEN** a reader fetches `/` and does not run JavaScript
- **THEN** product cards, links and native pause controls are available

#### Scenario: Touch or reduced-motion reader
- **WHEN** a reader uses a coarse pointer, a narrow viewport or reduced-motion preference
- **THEN** the strip is manually scrollable and does not automatically translate or expose duplicate cards

## ADDED Requirements

### Requirement: Product detail prioritizes images and readable content
The product detail SHALL present an available cover or gallery alongside its purchase information on desktop and above it on phones. Missing images SHALL have a meaningful placeholder. Long public text fields SHALL preserve paragraphs in a readable full-width section rather than a narrow parameter cell. All public field values SHALL remain accessible, including unknown field keys. Existing price units SHALL be shown near the price when present, without inventing a unit. The purchase action SHALL describe copying a request to an Agent, not direct checkout.

#### Scenario: Product contains long bilingual text and images
- **WHEN** a public product has a cover, gallery URLs and multiline fields
- **THEN** its images precede long descriptions, the paragraphs remain readable, and all public field values remain available

### Requirement: Public text is escaped once
Product and store text SHALL display its original characters while remaining escaped for HTML. Visible titles, metadata and structured facts SHALL describe the same underlying text.

#### Scenario: Title includes HTML-significant characters
- **WHEN** a public title contains ampersands, quotes or angle brackets
- **THEN** the page displays those characters as text without extra visible entity encoding or executable injected markup
