# Spec Delta

## MODIFIED Requirements

### Requirement: Landing products use a store shelf

The published products on `/` MUST render as linked product cards in one horizontal shelf. Each card MUST show the cover or a placeholder, the title, and the price in major currency units derived from minor units. The whole card MUST link to `/products/{id}`. The shelf MUST be movable sideways without autoplay and MUST remain readable without client-side script. The page MUST use a deep warm-ink background, ivory text, a serif store name and slogan, and one brass accent. It MUST NOT use a neon gradient, giant background wordmark, floating purchase chip, or autoplay media. When more products exist beyond the shelf, the page MUST link to `/products`. An empty shelf MUST state that no product is available.

#### Scenario: Two published products

- **WHEN** two products are published
- **THEN** `/` shows both titles and major-unit prices in one sideways shelf before the footer slogan

#### Scenario: Script is disabled

- **WHEN** a reader does not run JavaScript
- **THEN** the shelf text and prices are already present, and no media plays by itself
