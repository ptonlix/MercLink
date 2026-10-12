# Spec Delta

## MODIFIED Requirements

### Requirement: Discovery files stay small and current
`/llms.txt` MUST be server-generated Markdown with content type `text/markdown`. It MUST use an H1, one blockquote summary, and exactly three H2 sections in this order: `先读`, `页面`, `接口`. Each section MUST be a link list. Every directory link MUST be an absolute URL of this application's public origin. The file MUST NOT use a relative directory link, MUST NOT publish `llms-full.txt`, and MUST NOT add a product-catalog entry or embed product rows.

When no store profile is published, the H1 MUST be `MercLink` and the blockquote MUST be `帮中小商家做自己的店，并让各种 Agent 直接找到商品、完成购买。` When a profile is published, the H1 MUST be that display name and the blockquote MUST be that summary. Those two published strings MUST NOT appear again outside the H1 and blockquote.

`先读` MUST link to `/index.md`, `/products.md`, and `/skill.md`, and the descriptions MUST state who should read them, what they contain, and what they cannot do:

- The landing Markdown description MUST say it is the same published store facts as the landing page, including display name, summary, area, business address, website, and logo. It MUST say contact phone, contact note, contact QR, business name, unified social credit code, legal person, registered address, and license image appear only when the merchant has published that group, and that they carry the exact notice `商家自行填写，本系统未核验。` It MUST say both groups are omitted when absent, that the document has no variant id, and that it cannot be used to place an order.
- The product-list Markdown description MUST say it is the same current on-shelf summary as `/products`: name, major-unit price, in stock or out of stock, and product id. It MUST say there is no store profile and no variant id, that public fields, cover, integer minor units, and variant id are at `/products/{id}.md`, and that a next-page cursor appears in the body when there is another page.
- The buyer-skill description MUST say it is the buyer Agent's calling guide, not this store's product data. It MUST say to use it to query on-shelf products, read catalog fields, place a one-line order with a variant id, open payment, and then query that buyer's own orders. It MUST say product query works without login, and MUST forbid asking the user for a password, SMS code, or API key, supplying a price, or treating an opened payment link as paid.

`页面` MUST link to `/` and `/products`. The landing-page description MUST say it is the human-readable copy of the same store and product facts, that an Agent should read the landing Markdown instead of both, and that an active storefront may replace this page with merchant HTML while the landing Markdown remains server-generated. The product-list description MUST say it is the human-readable list, that an Agent should read the product-list Markdown, that a single product is `/products/{id}` and its Markdown is `/products/{id}.md`, and that unpublished, deleted, or products without a sellable variant are absent.

`接口` MUST link to `/api/v1/store`, `/merchant/skill.md`, `/storefront/skill.md`, `/interfaces`, and `/api/v1`. The `/interfaces` link is specified by `2026-10-12-llms-interface-and-storefront-guide`; this change does not embed the route list. The store JSON description MUST say it is the machine read of the published profile, that no token is required, that fields are always present, that a missing website, logo, `license`, or `contact` is null rather than omitted, that an unpublished profile is 404 and does not echo a draft, and that an Agent must not guess a missing item from Markdown. The merchant-skill description MUST say it is the merchant Agent's calling guide and does not contain this store's data or a token. It MUST say it manages catalogs, catalog fields, products, variants, publishing, and the one store-wide profile, that the profile is not one per catalog, that contact and license are recommended rather than listing conditions, that the four license facts must be read back and accepted before writing a license, and that it must not be used to place a buyer order. The storefront-skill description MUST say it only explains how to change the human-visible page, that products, prices, and the store profile still go through the merchant skill, that purchase still goes through the buyer skill, and that it cannot change `/llms.txt`, the three skills, `/api`, the authorization-page protocol, or payment-result judgment. It MUST say contact and license on a page must use slots and must not be hardcoded. The `/api/v1` description is specified by `2026-10-12-llms-interface-and-storefront-guide`: it is the HTTP API root and not a document, registered paths are in the interface directory, calling instructions remain in the three skills, and paths must not be guessed. This change still requires that product query is public, that ordering and profile changes need a token from the device-code flow, and that a robots disallow of `/api` constrains crawlers only, not an approved Agent.

The fixed notice sentence MAY appear in those link descriptions. The file MUST NOT embed a token, an address value, an area value, a website, a logo, an identifier, a credit code, a legal person, a phone number, or a product title. Citing field names is not embedding those values.

`/sitemap.xml` MUST include the landing page, product list, currently public products, and both skills. It MUST NOT add per-merchant store URLs. `/robots.txt` MUST allow those public pages and MUST disallow authorization pages, the super-admin page, and `/api`.

#### Scenario: Product becomes unpublished
- **WHEN** a product is no longer returned by the public-product seam
- **THEN** it is absent from the sitemap and its public URL is not indexable

#### Scenario: Profile is withdrawn
- **WHEN** the store profile is no longer published
- **THEN** `/` no longer shows that display name or summary

#### Scenario: Unpublished directory names each link
- **WHEN** no store profile is published and a client fetches `/llms.txt`
- **THEN** the H1 is `MercLink`, the blockquote is the existing store explanation, the three H2 sections appear in order, each listed path is an absolute URL, and the landing-Markdown description contains `商家自行填写，本系统未核验。`

#### Scenario: Published quote stays in the heading
- **WHEN** a published profile has a display name, summary, address, area, website, logo, credit code, legal person, and phone, and a public product has a title
- **THEN** `/llms.txt` shows the name and summary only in the H1 and blockquote, still contains the fixed notice sentence, and does not contain the address, area, website, logo, credit code, legal person, phone, or product title

#### Scenario: Withdrawn profile leaves the directory
- **WHEN** the store profile is no longer published
- **THEN** `/llms.txt` does not keep the withdrawn name or summary

#### Scenario: Directory does not become a catalog
- **WHEN** a client fetches `/llms.txt`
- **THEN** the body does not contain a product row, a product-catalog link, or `llms-full.txt`
