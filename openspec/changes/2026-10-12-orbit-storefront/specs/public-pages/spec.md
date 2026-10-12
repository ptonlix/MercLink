## MODIFIED Requirements

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
The product detail SHALL provide a single primary return link to `/`, without a product-list detour or repeated storefront navigation. Existing list and discovery URLs SHALL remain compatible. The product detail SHALL present an available cover or gallery alongside its purchase information on desktop and above it on phones. Missing images SHALL have a meaningful placeholder. Long public text fields SHALL preserve paragraphs in a readable full-width section rather than a narrow parameter cell. All public field values SHALL remain accessible, including unknown field keys. Existing price units SHALL be shown near the price when present, without inventing a unit. The gallery SHALL show each distinct image once without thumbnail duplication, with previous and next controls when multiple images exist. English description SHALL be selected initially, with a Chinese tab when a Chinese description exists. Unknown fields SHALL remain accessible. The buyer Skill SHALL be an accessible icon link beside a compact copy button. Homepage, list and detail SHALL share graphite, ice-white and pale-cyan colors. The purchase action SHALL describe copying a request to an Agent, not direct checkout.

#### Scenario: Product contains long bilingual text and images
- **WHEN** a public product has a cover, gallery URLs and multiline fields
- **THEN** its images precede long descriptions, the paragraphs remain readable, and all public field values remain available

#### Scenario: Switch images and language
- **WHEN** a product has multiple images and bilingual descriptions
- **THEN** the reader can navigate images with left/right controls and select Chinese without losing the English text or other public fields

#### Scenario: Return from a card
- **WHEN** a reader opens a homepage card and activates the detail return link
- **THEN** the reader returns directly to `/` without visiting a list page
