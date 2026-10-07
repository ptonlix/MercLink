# public-pages Specification

## Purpose

给人、搜索引擎和 Agent 同一份服务端渲染的公开商品入口，且不另建一套商品内容数据。

## Requirements

### Requirement: Landing page states how to start
The `/` page MUST be server-rendered HTML. When a store profile is published, the first visible content MUST be that store, with the display name as the main heading, followed by its summary and any logo, area, address, and website. Published products MUST follow the store. The slogan “在 AI 时代，让天下没有难做的生意”, the explanation “帮中小商家做自己的店，并让各种 Agent 直接找到商品、完成购买。”, MercLink, the product list, both skills, the API root, and discovery files MUST appear only in the footer. It MUST NOT use “查询已上架商品并下单” as that description, and it MUST NOT say that merchants cannot self-register. The visible order MUST NOT place the slogan or project links before the store or products. It MUST NOT list multiple stores, link to `/merchants/{id}`, or say “进入这一家的店”. The main content MUST be present without client-side script. When a store profile is published, the meta description MUST be the summary truncated to 150 characters, and JSON-LD MUST include an `OnlineStore` whose name, description, logo, sameAs, areaServed, and address match the visible profile. The canonical URL MUST remain this application's landing page. Title, description, canonical link, and JSON-LD MUST match the visible content.

#### Scenario: Client does not execute script
- **WHEN** a reader fetches `/` and does not run JavaScript
- **THEN** the HTML already contains the store name or product cards before the footer slogan and skill links

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
The published products on `/` MUST render as linked product cards in one horizontal shelf. Each card MUST show the cover or a placeholder, the title, and the price in major currency units derived from minor units. The whole card MUST link to `/products/{id}`. The shelf MUST be movable sideways without autoplay and MUST remain readable without client-side script. The page MUST use a warm paper background, serif slogan and store name, and one green accent. It MUST NOT use a neon gradient, giant background wordmark, floating purchase chip, or autoplay media. When more products exist beyond the shelf, the page MUST link to `/products`. An empty shelf MUST state that no product is available.

#### Scenario: Two published products
- **WHEN** the public-product seam returns two products priced at 159900 and 800 minor units
- **THEN** `/` shows two cards with `¥1599.00` and `¥8.00`, and each card links to that product

#### Scenario: Script is disabled
- **WHEN** a reader fetches `/` and does not run JavaScript
- **THEN** the product cards and their links are already present in the shelf
