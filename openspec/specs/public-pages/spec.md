# public-pages Specification

## Purpose

给人、搜索引擎和 Agent 同一份服务端渲染的公开商品入口，且不另建一套商品内容数据。

## Requirements

### Requirement: Landing page states how to start
The `/` page MUST be server-rendered HTML and MUST state that the service lets agents query published products and place orders. It MUST link the product list, buyer skill, merchant skill, and API root. It MUST state that merchants cannot self-register and need an administrator. The main content MUST be present without client-side script. Title, description, canonical link, and JSON-LD MUST match the visible content.

#### Scenario: Client does not execute script
- **WHEN** a reader fetches `/` and does not run JavaScript
- **THEN** the HTML already contains the service description, start links, and the published-product summary

### Requirement: Product pages use the public query seam
`/products` and `/products/{id}` MUST render only products returned by the public-product seam. They MUST NOT read a second product store or hand-picked content. A product page MUST show the public fields and sellable variants. JSON-LD MUST use `ItemList` for the list and `Product` plus `Offer` for a product, with the same price, currency, and availability as the seam.

#### Scenario: Seam returns one product
- **WHEN** the public-product seam returns one published product
- **THEN** `/products` and `/products/{id}` show that product and its offer price matches the seam

#### Scenario: Seam is unregistered
- **WHEN** the public-product seam has no implementation
- **THEN** the pages render successfully and show no products

### Requirement: Discovery files stay small and current
`/llms.txt` MUST point to the landing page, product list, both skills, and the API, and MUST NOT embed the full catalog. `/sitemap.xml` MUST include the landing page, product list, currently public products, and both skills. `/robots.txt` MUST allow those public pages and MUST disallow authorization pages, the super-admin page, and `/api`.

#### Scenario: Product becomes unpublished
- **WHEN** a product is no longer returned by the public-product seam
- **THEN** it is absent from the sitemap and its public URL is not indexable

### Requirement: Hidden products are not indexable
A request for an unpublished, deleted, or otherwise non-public product URL MUST return a non-indexable status and MUST NOT include that product's offer data.

#### Scenario: Direct request for unpublished id
- **WHEN** a client requests `/products/{id}` for a product the seam does not return
- **THEN** the response is not indexable and does not embed the product as available
