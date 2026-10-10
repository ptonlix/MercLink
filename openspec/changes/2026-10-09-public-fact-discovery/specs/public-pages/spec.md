# Spec Delta

## MODIFIED Requirements

### Requirement: Product pages use the public query seam
`/products` and `/products/{id}` MUST render only products returned by the public-product seam. They MUST NOT read a second product store or hand-picked content. A product page MUST show the public fields and sellable variants. The product meta description MUST be generated from the title, the major-unit price, and the visible availability text, then truncated to 150 characters. It MUST NOT say the price is in minor units, and the system MUST NOT store a separate SEO description.

JSON-LD MUST use `ItemList` for the products in that response only. A product document MUST use `Product` and one `Offer` for each sellable variant returned by the seam. Each offer price MUST be the major-unit decimal derived from that variant's minor units, with two digits after the decimal point. 159900 minor units MUST be `1599.00`, and 800 minor units MUST be `8.00`. The JSON-LD price MUST NOT be the minor-unit integer. Currency MUST be the seam currency. `in_stock` MUST be `https://schema.org/InStock`, and `out_of_stock` MUST be `https://schema.org/OutOfStock`. The JSON-LD MUST NOT use the internal availability token. A null cover MUST NOT add an image. A non-null absolute http(s) cover MUST be the JSON-LD image. An existing variant `sku` MUST be copied to that offer. The document MUST NOT add a brand, GTIN, rating, shipping rate, or return policy that the seam did not return.

The canonical URL of `/products` without a cursor MUST be `/products`. A request with a cursor MUST use that cursor URL as its canonical URL and MUST NOT canonicalize to the first page. The response MUST expose `rel="next"` only when the seam returns a next cursor, and `rel="prev"` only when the request had a cursor. The `ItemList` MUST contain only the products in that response.

When a storefront release is active, `/products` and `/products/{id}` MUST still be rendered on each request from the public-product seam and the active presentation. They MUST show the current product name, cover, public fields, and each sellable variant's option values, availability, and major-unit price without executing script. Their JSON-LD MUST follow the same price and availability rules.

#### Scenario: Seam returns one product
- **WHEN** the public-product seam returns one published product priced at 159900 minor units
- **THEN** `/products` and `/products/{id}` show `¥1599.00`, and the product JSON-LD price is `1599.00` rather than `159900`

#### Scenario: Seam is unregistered
- **WHEN** the public-product seam has no implementation
- **THEN** the pages render successfully and show no products

#### Scenario: Two sellable variants
- **WHEN** a published product has two sellable variants priced at 159900 and 800 minor units
- **THEN** the product JSON-LD contains two offers, `1599.00` and `8.00`, each with the schema.org availability URL for that variant

#### Scenario: Cursor page is not folded into the first page
- **WHEN** a client requests `/products` with a cursor and the seam returns a further cursor
- **THEN** the canonical URL contains that request cursor, and the response links to the next cursor without including the next page's products

### Requirement: Discovery files stay small and current
`/llms.txt` MUST be server-generated Markdown with content type `text/markdown`. It MUST use an H1, a blockquote, and H2 link lists. It MUST point to the landing page, its Markdown alternate, the product list, the product-list Markdown alternate, both skills, and the API. When `/storefront/skill.md` is published, the file MUST also point to it. A published store display name and summary MAY appear only in the H1 and blockquote. The file MUST NOT include the address, area, website, logo, catalog rows, tokens, or a full-text dump. It MUST NOT publish `llms-full.txt`.

`/sitemap.xml` MUST include the landing page, product list, currently public product HTML URLs, and both skills. It MUST NOT add Markdown alternates, cursor pages, media URLs, or per-merchant store URLs. It MUST NOT add `lastmod`. `/robots.txt` MUST allow the public HTML and Markdown pages, and MUST disallow authorization pages, the super-admin page, and `/api`. These discovery files MUST remain server-generated when a storefront release is active. A release MUST NOT replace them.

#### Scenario: Product becomes unpublished
- **WHEN** a product is no longer returned by the public-product seam
- **THEN** it is absent from the sitemap and its public HTML and Markdown URLs are not indexable

#### Scenario: Profile quote stays limited
- **WHEN** a published store profile has a display name, summary, and address
- **THEN** `/llms.txt` may show the name and summary, and does not show the address or any product row

#### Scenario: Profile is withdrawn
- **WHEN** the store profile is no longer published
- **THEN** `/` no longer shows that display name or summary

#### Scenario: Withdrawn profile leaves the discovery file
- **WHEN** the store profile is no longer published
- **THEN** `/llms.txt` does not keep the withdrawn name or summary

#### Scenario: Active release does not replace discovery files
- **WHEN** a storefront release is active and a client fetches `/llms.txt`, `/sitemap.xml`, or `/robots.txt`
- **THEN** the body is server-generated and is not a file from the release

### Requirement: Hidden products are not indexable
A request for an unpublished, deleted, or otherwise non-public product URL, including its Markdown alternate, MUST return a non-indexable status and MUST NOT include that product's offer data. This remains true when a storefront release is active. The server MUST NOT serve release HTML or a release fallback document for that URL.

#### Scenario: Direct request for unpublished id
- **WHEN** a client requests `/products/{id}` or its Markdown alternate for a product the seam does not return
- **THEN** the response is not indexable and does not embed the product as available

#### Scenario: Active release cannot revive a hidden product URL
- **WHEN** a storefront release is active and contains a document for an unpublished product id
- **THEN** the response is still not indexable and is not the release fallback document

## ADDED Requirements

### Requirement: Public pages publish Markdown alternates
The landing page, `/products`, and each public `/products/{id}` MUST have a Markdown alternate at `/index.md`, `/products.md`, and `/products/{id}.md`. The same URL with `Accept: text/markdown` MUST return that same Markdown body. The body MUST contain only facts from the public store seam and public-product seam for that response, using major-unit prices and the visible availability words. It MUST NOT include order status, a bearer token, or unpublished offer data. The HTML response MUST send `rel="alternate"` with type `text/markdown` and `rel="describedby"` pointing to `/llms.txt`. The Markdown response MUST send a canonical link to the corresponding HTML URL and MUST NOT be listed in the sitemap.

#### Scenario: Product Markdown matches the page
- **WHEN** a client fetches `/products/{id}.md` for a published product priced at 800 minor units
- **THEN** the body shows `¥8.00` and does not show `800` as the price or any order status

#### Scenario: Accept header matches the alternate path
- **WHEN** a client fetches `/products/{id}` with `Accept: text/markdown`
- **THEN** the body is the same Markdown as `/products/{id}.md`

### Requirement: Storefront fact pages use server structured data
When a storefront release is active, the server MUST remove every merchant-authored `application/ld+json` script before responding. A rendered document that declares store or product fact slots MUST then include the server JSON-LD for those rendered facts, using the same major-unit prices and schema.org availability URLs as the built-in product pages. A document with neither store nor product slots MUST NOT receive injected `Product`, `Offer`, `ItemList`, or `OnlineStore` data. Confirming activation of a release whose static set contains `application/ld+json` MUST return `validation_error` and MUST NOT change the active pointer. A published storefront skill MUST say that the server owns this structured data and that an upload must not include it.

#### Scenario: Merchant JSON-LD is not served
- **WHEN** an active release document contains an `application/ld+json` script with a product price
- **THEN** the response does not contain that script, and a fact-slot document contains only the server JSON-LD

#### Scenario: Activation rejects authored structured data
- **WHEN** a merchant confirms activation of a release that contains `application/ld+json`
- **THEN** the response is `validation_error` and the active pointer does not change

#### Scenario: Page without fact slots stays free of product schema
- **WHEN** an active release document declares no store or product fact slots
- **THEN** the response does not include server `Product` or `Offer` data
