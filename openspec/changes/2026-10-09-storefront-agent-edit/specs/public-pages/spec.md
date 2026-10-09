# Spec Delta

## MODIFIED Requirements

### Requirement: Landing page states how to start
When no storefront release is active, the `/` page MUST be server-rendered HTML. When a store profile is published, the first visible content MUST be that store, with the display name as the main heading, followed by its summary and any logo, area, address, and website. Published products MUST follow the store. The slogan “在 AI 时代，让天下没有难做的生意”, the explanation “帮中小商家做自己的店，并让各种 Agent 直接找到商品、完成购买。”, MercLink, the product list, the buyer skill, the merchant skill, the storefront skill, the API root, and discovery files MUST appear only in the footer. It MUST NOT use “查询已上架商品并下单” as that description, and it MUST NOT say that merchants cannot self-register. The visible order MUST NOT place the slogan or project links before the store or products. It MUST NOT list multiple stores, link to `/merchants/{id}`, or say “进入这一家的店”. The main content MUST be present without client-side script. When a store profile is published, the meta description MUST be the summary truncated to 150 characters, and JSON-LD MUST include an `OnlineStore` whose name, description, logo, sameAs, areaServed, and address match the visible profile. The canonical URL MUST remain this application's landing page. Title, description, canonical link, and JSON-LD MUST match the visible content. When a storefront release is active, those built-in copy and JSON-LD rules MUST NOT be applied to the release HTML.

#### Scenario: Client does not execute script
- **WHEN** no storefront release is active and a reader fetches `/` without running JavaScript
- **THEN** the HTML already contains the store name or product cards before the footer slogan and skill links

#### Scenario: Published store profile
- **WHEN** no storefront release is active and the public store seam returns a published profile
- **THEN** `/` shows that display name and summary above the product summary and does not show a login phone, a self-registration notice, or a link to another store

#### Scenario: Active release is not forced to use built-in copy
- **WHEN** a storefront release is active and a client fetches `/`
- **THEN** the response is the release document and is not required to include the built-in slogan or JSON-LD

### Requirement: Product pages use the public query seam
When no storefront release is active, `/products` and `/products/{id}` MUST render only products returned by the public-product seam. They MUST NOT read a second product store or hand-picked content. A product page MUST show the public fields and sellable variants. JSON-LD MUST use `ItemList` for the list and `Product` plus `Offer` for a product, with the same price, currency, and availability as the seam. When a storefront release is active, `/products` and `/products/{id}` MUST be rendered by the server on each request from the public-product seam and the active presentation. They MUST show the current product name, cover, public fields, and each sellable variant's option values, availability, and major-unit price without executing script. A page that shows the published store profile MUST render its current display name, summary, logo, website, area, and address from the public-store seam. A page that shows payment state MUST render the current order status only when the request carries the same buyer Authorization accepted by `GET /api/v1/orders/{id}` and that buyer owns the order. `order_id` MUST NOT be a public order query. Anonymous requests, other buyers, and tokens without `order:read` MUST leave the slot empty and MUST NOT expand `data-merclink="order.paid"`. The page MUST NOT add an error code for those cases, and opening a return page MUST NOT mark the order paid. The page MUST NOT present success unless the filled status is `paid`. The product list MUST declare a `products.next` slot. When the public-product seam returns a next cursor, the server MUST render that slot as a link to `/products?cursor=` for the current page only and MUST NOT render later pages into the same response. When the cursor is empty, the slot MUST be empty. A later fact change MUST appear on the next request without another activation. The server MUST NOT serve a stored snapshot of those facts, and MUST NOT inject unpublished offer data into the response.

#### Scenario: Seam returns one product
- **WHEN** no storefront release is active and the public-product seam returns one published product
- **THEN** `/products` and `/products/{id}` show that product and its offer price matches the seam

#### Scenario: Seam is unregistered
- **WHEN** no storefront release is active and the public-product seam has no implementation
- **THEN** the pages render successfully and show no products

#### Scenario: Active release renders the current price
- **WHEN** a storefront release is active and a client requests `/products/{id}` for a published product
- **THEN** the response shows that product's current name and major-unit price without executing script

#### Scenario: Store profile change does not require another activation
- **WHEN** a storefront release is active and the published store summary changes
- **THEN** the next response that displays the store profile shows the new summary

#### Scenario: Price change does not require another activation
- **WHEN** a storefront release is active and the seam price changes
- **THEN** the next `/products/{id}` response shows the new price in the custom presentation

#### Scenario: Anonymous order id does not show payment success
- **WHEN** a storefront release is active and an anonymous client requests a page with `order_id` of a paid order
- **THEN** the response does not show payment success and does not reveal that order's status

#### Scenario: Owning buyer sees paid
- **WHEN** the buyer who owns a paid order requests that page with the same Authorization as `GET /api/v1/orders/{id}`
- **THEN** the order status slot is `paid` and the paid template is shown

#### Scenario: Another buyer does not see the order
- **WHEN** a different buyer requests the same `order_id`
- **THEN** the status slot is empty and the paid template is not shown

#### Scenario: Product list links only the next page
- **WHEN** a storefront release is active and the public-product seam returns a next cursor
- **THEN** the product list renders a link to `/products?cursor=` for that cursor and does not include the following page's products

### Requirement: Discovery files stay small and current
`/llms.txt` MUST point to the landing page, product list, buyer skill, merchant skill, storefront skill, and the API, and MUST NOT embed the full catalog or the store profile. `/sitemap.xml` MUST include the landing page, product list, currently public products, and those three skills. It MUST NOT add per-merchant store URLs. `/robots.txt` MUST allow those public pages and MUST disallow authorization pages, the super-admin page, and `/api`. These discovery files MUST remain server-generated when a storefront release is active.

#### Scenario: Product becomes unpublished
- **WHEN** a product is no longer returned by the public-product seam
- **THEN** it is absent from the sitemap and its public URL is not indexable

#### Scenario: Sitemap does not advertise a homepage fallback
- **WHEN** a storefront release is active and a product canonical path would only be served by the release fallback document
- **THEN** the sitemap does not list that path as a product document

#### Scenario: Profile is withdrawn
- **WHEN** no storefront release is active and the store profile is no longer published
- **THEN** `/` no longer shows that display name or summary

#### Scenario: Active release does not replace discovery files
- **WHEN** a storefront release is active and a client fetches `/llms.txt`
- **THEN** the body is server-generated and points to `/storefront/skill.md`

### Requirement: Hidden products are not indexable
A request for an unpublished, deleted, or otherwise non-public product URL MUST return a non-indexable status and MUST NOT include that product's offer data. This remains true when a storefront release is active. The server MUST NOT serve release HTML or a release fallback document for that URL.

#### Scenario: Direct request for unpublished id
- **WHEN** a client requests `/products/{id}` for a product the seam does not return
- **THEN** the response is not indexable and does not embed the product as available

#### Scenario: Active release cannot revive a hidden product URL
- **WHEN** a storefront release is active and contains a document for an unpublished product id
- **THEN** the response is still not indexable and is not the release fallback document

### Requirement: Landing products use a store shelf
When no storefront release is active, the published products on `/` MUST render as linked product cards in one horizontal shelf. Each card MUST show the cover or a placeholder, the title, and the price in major currency units derived from minor units. The whole card MUST link to `/products/{id}`. The shelf MUST be movable sideways without autoplay and MUST remain readable without client-side script. The page MUST use a warm paper background, serif slogan and store name, and one green accent. It MUST NOT use a neon gradient, giant background wordmark, floating purchase chip, or autoplay media. When more products exist beyond the shelf, the page MUST link to `/products`. An empty shelf MUST state that no product is available. These presentation rules MUST NOT be required of an active storefront release.

#### Scenario: Two published products
- **WHEN** no storefront release is active and the public-product seam returns two products priced at 159900 and 800 minor units
- **THEN** `/` shows two cards with `¥1599.00` and `¥8.00`, and each card links to that product

#### Scenario: Script is disabled
- **WHEN** no storefront release is active and a reader fetches `/` without running JavaScript
- **THEN** the product cards and their links are already present in the shelf

## ADDED Requirements

### Requirement: Pointer read failure does not fall back to built-in copy
When a storefront release cannot be confirmed because the active pointer query fails, a public page that would otherwise be replaced MUST return 503 with a short body that does not reveal the internal error and MUST NOT be served as the built-in page. An unset database configuration MUST continue to serve the built-in pages.

#### Scenario: Pointer query fails
- **WHEN** the active pointer cannot be read
- **THEN** the public response is 503 and does not include the built-in landing copy
