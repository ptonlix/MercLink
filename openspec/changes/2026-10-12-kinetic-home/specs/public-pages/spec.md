## MODIFIED Requirements

### Requirement: Landing products use a store shelf
The published products on `/` MUST render once each as linked photographic panels. Each panel MUST show its cover or a meaningful placeholder, its title and the price in major currency units derived from minor units. The whole panel MUST link to `/products/{id}`. On a desktop with a fine pointer, hovering or keyboard-focusing a panel MUST expand its visual area and reveal the detail entry while adjacent panels yield space. Expansion MUST remain available without client-side script. Pointer-driven image motion MAY enhance the built-in page, but MUST be disabled for coarse pointers and reduced-motion preference. Narrow screens MUST show readable panels whose first tap directly opens the detail. Reduced-motion readers MUST receive a static complete composition. Products MUST NOT automatically cycle or be duplicated. The homepage MAY use a scoped graphite palette, ice-white sans-serif display typography and one pale-cyan accent while other pages retain the shared theme. It MUST NOT autoplay audio or video, obscure purchase facts with decoration, or show a floating purchase chip. The page MUST link to `/products` for the full list. An empty shelf MUST state that no product is available.

#### Scenario: Two published products
- **WHEN** the public-product seam returns two products priced at 159900 and 800 minor units
- **THEN** `/` shows one linked panel for each product with `¥1599.00` and `¥8.00`, and hovering either panel expands it on desktop

#### Scenario: Script is disabled
- **WHEN** a reader fetches `/` and does not run JavaScript
- **THEN** product names, prices, images or placeholders and detail links remain available, including CSS hover and keyboard focus feedback

#### Scenario: Touch or reduced-motion reader
- **WHEN** a reader uses a coarse pointer, narrow viewport or reduced-motion preference
- **THEN** complete product panels remain readable and directly navigable without pointer-driven motion or automatic translation

#### Scenario: Keyboard reader
- **WHEN** a reader tabs to a product panel and presses Enter
- **THEN** focus is visible, the panel reveals its full title and entry, and Enter navigates directly to its detail

#### Scenario: Larger product collection
- **WHEN** more than three products are returned for the homepage
- **THEN** every returned product appears once across additional panel rows and the full product list remains linked
