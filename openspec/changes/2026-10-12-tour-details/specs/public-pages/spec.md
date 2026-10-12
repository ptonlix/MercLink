## MODIFIED Requirements

### Requirement: Product detail prioritizes images and readable content
The product detail SHALL provide a single primary return link to `/`, without a product-list detour or repeated storefront navigation. Existing list and discovery URLs SHALL remain compatible. The product detail SHALL present an available cover or gallery alongside its purchase information on desktop and above it on phones. Missing images SHALL have a meaningful placeholder. Long public text fields SHALL preserve paragraphs in a readable full-width section rather than a narrow parameter cell. All public field values SHALL remain accessible, including unknown field keys. Existing price units SHALL be shown near the price when present, without inventing a unit. The gallery SHALL deduplicate URLs, show one active main image and show each other image once as a thumbnail below it. The active main image thumbnail SHALL be hidden to avoid simultaneous duplication. Thumbnail selection and previous/next controls SHALL switch the same active image, including without JavaScript. English description SHALL be selected initially, with a Chinese tab when a Chinese description exists. Unknown fields SHALL remain accessible. The buyer Skill SHALL be an accessible icon link beside a compact copy button. Homepage, list and detail SHALL share graphite, ice-white and pale-cyan colors. The purchase action SHALL describe copying a request to an Agent, not direct checkout.

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

## ADDED Requirements

### Requirement: Tour facts and participant selection
Tour meeting points and times SHALL come from optional public product fields and appear beside the image, with the existing external booking URL. Missing facts SHALL be omitted. Tour details SHALL provide a participant stepper defaulting to 1 and accepting positive integers, bounded by finite selected stock when present. The copied purchase request SHALL include the selected number of participants and require Agent confirmation of price, stock and quantity. Changing the count or variant SHALL reset copy feedback. Without JavaScript, the default count and instructions to give the count to an Agent SHALL remain available. The page SHALL NOT make a reservation or create an order from the stepper or booking link.

#### Scenario: Three supplied tours
- **WHEN** the supplied tours are opened
- **THEN** the night tour shows 19:00–21:30 and Jinshi Road Exit E2, food tour shows 16:45–19:15 and TCM hospital Exit J, history tour shows 16:00–18:15 without an invented meeting point, and each links to its own supplied GuruWalk URL

#### Scenario: Adjust participants
- **WHEN** the reader increases the count from 1 to 2 and copies the purchase request
- **THEN** the request includes 2 participants and cannot be reduced below 1 or raised above a finite selected stock
