# Spec Delta

## MODIFIED Requirements

### Requirement: Landing products use a store shelf

The published products on `/` MUST render as linked product cards in one horizontal film strip. Each card MUST show the cover or a placeholder, the title, and the price in major currency units derived from minor units. The whole card MUST link to `/products/{id}`. The strip MUST translate sideways on its own, pause while hovered or focused, and remain readable without client-side script. When the reader requests reduced motion, the strip MUST stop translating and remain manually scrollable. It MUST NOT autoplay video or audio, use a neon gradient, show a giant background wordmark, or show a floating purchase chip. When more products exist beyond the strip, the page MUST link to `/products`. An empty shelf MUST state that no product is available.

#### Scenario: Two published products

- **WHEN** two products are published
- **THEN** `/` shows both titles and major-unit prices in one sideways strip before the footer slogan

#### Scenario: Script is disabled

- **WHEN** a reader does not run JavaScript
- **THEN** the strip text and prices are already present, and no video or audio plays by itself
