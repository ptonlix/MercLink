## ADDED Requirements

### Requirement: Public browsing uses one data source and honest navigation

The frontend MUST render public browsing content from the existing public-product and public-store application capabilities. It MUST NOT maintain a second product list, use private merchant catalog APIs for anonymous navigation, invent catalog completeness, or present sample data as live products. The landing main content MUST show the store introduction followed by a product section whose visible heading contains the known product count and a prominent link labeled "查看全部商品" before the banners. The link MUST navigate to the product list and MUST be discoverable without scrolling past a full banner. Public navigation MUST preserve usable ordinary links without JavaScript.

#### Scenario: Store description is unpublished

- **WHEN** the public store capability reports no published description and public products exist
- **THEN** the page omits the description block and renders the actual products without a fictional store identity

#### Scenario: No public catalog listing exists

- **WHEN** an anonymous visitor opens the product list without a known catalog context
- **THEN** the page offers keyword browsing without claiming a complete catalog selector or calling merchant catalog endpoints

#### Scenario: Visitor wants to see all six known products

- **WHEN** the complete public product result or isolated preview snapshot contains six products
- **THEN** the homepage shows "共 6 件商品" next to "查看全部商品" above the banners and that link opens the list

### Requirement: Product listing preserves query context

The product list MUST submit keyword and supported context-specific filters through existing query capabilities, retain the chosen conditions in its URL, and preserve them on pagination. A changed condition MUST reset the cursor. A total count MUST come from an explicit authoritative count or a complete public result whose pagination has been exhausted. A partial page length MUST NOT be presented as the store total; when completeness is unknown the frontend MUST describe only the loaded count. Filtering MUST distinguish the matching count from the known store total. Monetary filters MUST display the known catalog currency and MUST NOT merge different currencies into a purported common price range. Custom filters MUST require an explicit catalog context and use the catalog Schema.

#### Scenario: Visitor requests the next page

- **WHEN** a filtered response contains next_cursor and the visitor requests more products
- **THEN** the next request carries that cursor and the same conditions, and the ordinary pagination link remains usable without JavaScript

#### Scenario: Filter yields no matches

- **WHEN** a successful filtered query returns no products
- **THEN** the page retains the conditions and offers a clear-filters action rather than representing an unavailable service as an empty catalog

### Requirement: Product imagery remains bounded and secondary photos are opt-in

Each product-list card MUST show only its cover asset in a bounded 4:3 image frame. HTML intrinsic width and height attributes MUST NOT force the rendered frame to the source image's pixel height. Cards at the same viewport breakpoint MUST have equal widths and heights, with prices aligned at the same position within the card. Card titles MUST reserve exactly two visual lines of height for both short and long names; overflow MUST be visually ellipsized while the complete title remains in accessible text and on the detail page. Detail covers MUST retain their proportions within a maximum height of 420 CSS pixels. Additional photos MUST remain hidden until the visitor expands their disclosure, MUST use bounded frames without distortion, and MUST return to the collapsed state when entering the detail page again.

#### Scenario: A large source image is used as a list cover

- **WHEN** a product cover has a source height of 1080 pixels and is displayed in a narrower card
- **THEN** the displayed height follows the card's 4:3 frame rather than remaining 1080 CSS pixels, and no additional-photo elements are rendered in the list card

#### Scenario: Visitor returns to a detail after expanding its photos

- **WHEN** the visitor expands additional photos, navigates to the list, and enters the detail again
- **THEN** the disclosure is collapsed and only the main cover is displayed until the visitor explicitly expands it again

#### Scenario: Product titles vary in length

- **WHEN** a one-line title and a title longer than two lines appear in the same product grid
- **THEN** both cards have the same dimensions, the long title is ellipsized at two lines, both price rows align, and the detail retains the complete name

### Requirement: Product content uses schema labels and safe fallback

A product detail MUST display public field values with active Schema labels when available. Text MUST be escaped and preserve meaningful line breaks. Unknown catalog content MUST use a general label-value layout instead of receiving tourism-specific assumptions. Failure to load Schema MUST NOT hide an otherwise available product. Technical IDs and structured data MUST remain accessible in a secondary expandable area.

#### Scenario: Tour description is a text field

- **WHEN** a product contains description and its Schema provides a readable label
- **THEN** the detail renders the label and the original description as readable plain-text content without injecting HTML

#### Scenario: Schema is temporarily unavailable

- **WHEN** a product loads successfully but its Schema cannot be read
- **THEN** the product title, cover, price and variants remain visible and fields use a conservative readable fallback

### Requirement: Variant selection creates purchase assistance only

The detail MUST display existing sellable combinations, update the displayed price and stock from the selected variant, and validate assistance quantity as a positive integer within finite available stock. It MUST provide an Agent purchase-assistance instruction containing the product URL, selected variant ID, quantity and buyer Skill address. That action MUST NOT create an order, request API keys, or imply a reservation or successful purchase. All-out-of-stock products MUST disable the purchase-assistance action with a visible reason.

#### Scenario: Visitor chooses a different combination

- **WHEN** a visitor selects an available variant
- **THEN** its actual price and stock are shown and the assistance instruction uses that variant ID rather than the minimum offer price as an order price

#### Scenario: Every variant is out of stock

- **WHEN** all visible variants have out_of_stock availability
- **THEN** the detail remains readable and the assistance action is disabled with an out-of-stock explanation

#### Scenario: Clipboard access fails

- **WHEN** the purchase-assistance copy action cannot access the clipboard
- **THEN** the page exposes selectable instruction text and does not report a completed purchase

### Requirement: Tour presentation does not invent booking capabilities

The frontend MUST treat schedule, pricing explanation and additional image URLs as catalog-specific content. It MUST NOT infer date reservations, daily inventory resets, tip settlement, a general gallery contract, or per-person units for unrelated products. Any tourism-specific organization MUST use an explicit known-catalog mapping. Image addresses MUST be validated before presentation and missing images MUST preserve readable product information.

#### Scenario: Tour stock is 999 with a nightly time description

- **WHEN** a tour has stock 999 and a schedule text of 19:00–21:30
- **THEN** the detail presents the time as descriptive content and does not show 999 reservations for each calendar date

### Requirement: Help dialog retains Agent management boundaries

The public browsing pages MUST offer a question-mark control with an accessible name that opens a labeled help dialog. The dialog MUST remain closed by default and contain buyer and merchant guidance selected through accessible role tabs. It MUST support keyboard navigation, Escape, a close button and backdrop dismissal, and restore focus to its trigger after closing. Merchant guidance MUST explain preparing product data, sharing the merchant Skill, initiating device authorization through the Agent, logging in and approving in the user's browser, and checking the published product URL. It MUST describe the current single-store deployment without offering unsupported merchant registration. Safe copyable templates MUST NOT collect credentials or private merchant data. Product, inventory, store and order management MUST remain Agent operations in this change. The existing admin page MUST retain only login and password maintenance. This change MUST NOT add a separate merchant-start page.

#### Scenario: Merchant wants to list a product

- **WHEN** a merchant opens the question-mark help and selects merchant guidance
- **THEN** the dialog presents the ordered listing steps and a product-data template, and no browser product CRUD, merchant registration or order-management controls are introduced

#### Scenario: Visitor dismisses help

- **WHEN** a visitor closes help by Escape, the close button or its backdrop
- **THEN** the dialog is hidden, focus returns to the question-mark trigger, and the original page remains unchanged

### Requirement: Authorization outcomes follow server confirmation

Authorization presentation MUST retain existing form targets, fields, roles and server-selected stages. It MUST distinguish logged-in from approved, prioritize required initial password change, and show approval success only after the existing server outcome confirms it. No merchant registration, client-invented Agent metadata, or script-key flow MUST appear in Agent authorization.

#### Scenario: Merchant has logged in without approving

- **WHEN** the current interaction still requires approval
- **THEN** the UI explains the remaining approval step and does not show the Agent as already authorized

### Requirement: Page layouts and planning preview remain accessible

Public and help-dialog layouts MUST remain readable at 390 CSS pixels without horizontal document overflow. Primary controls MUST have visible labels, keyboard focus and usable touch targets. The standalone design preview MUST be clearly labeled as a demonstration, use isolated assets, and MUST NOT call business APIs, submit credentials, upload images, send SMS, create orders or initiate payment. It MUST omit the prior multi-page review toolbar and use the home, view-more, product and back links as its visible navigation. A sample store introduction MUST be labeled as a sample and MUST NOT be persisted to the backend.

#### Scenario: Visitor opens the design preview

- **WHEN** the attached HTML is opened and the visitor switches example pages
- **THEN** the demonstration layouts can be inspected and no real identity or commerce operation occurs
