# Spec Delta

## MODIFIED Requirements

### Requirement: Discovery files stay small and current

`/llms.txt` MUST be server-generated Markdown with content type `text/markdown`. It MUST use an H1, one blockquote summary, and exactly three H2 sections in this order: `先读`, `页面`, `接口`. Each section MUST be a link list. Every directory link MUST be an absolute URL of this application's public origin. The file MUST NOT use a relative directory link, MUST NOT publish `llms-full.txt`, and MUST NOT add a product-catalog entry or embed product rows.

When no store profile is published, the H1 MUST be `MercLink`. When purchase mode is disabled, the blockquote MUST be `帮中小商家做自己的店，并让各种 Agent 直接找到商品。` When purchase mode is enabled, the blockquote MUST be `帮中小商家做自己的店，并让各种 Agent 直接找到商品、完成购买。` When a profile is published, the H1 MUST be that display name and the blockquote MUST be that summary. Those two published strings MUST NOT appear again outside the H1 and blockquote.

`先读` MUST link to `/index.md`, `/products.md`, and `/skill.md`. `页面` MUST link to `/` and `/products`. `接口` MUST link to `/api/v1/store`, `/merchant/skill.md`, `/storefront/skill.md`, `/interfaces`, and `/api/v1`. The `/interfaces` description MUST call it the human-readable index of registered paths, fields, authentication, and permission. It MUST say that index is not the calling guide and MUST NOT replace the three skills. It MUST forbid guessing an unregistered path from that page. The `/api/v1` description MUST say it is the HTTP API root and not a document, that registered paths are in the interface directory, that calling instructions remain in the three skills, and that paths must not be guessed. The file MUST NOT embed the registered route list, a token, or a product title.

`/sitemap.xml` MUST include the landing page, product list, currently public products, and both skills. It MUST NOT add per-merchant store URLs. `/robots.txt` MUST allow those public pages and MUST disallow authorization pages, the super-admin page, and `/api`.

#### Scenario: Product becomes unpublished

- **WHEN** a product is no longer returned by the public-product seam
- **THEN** it is absent from the sitemap and its public URL is not indexable

#### Scenario: Profile is withdrawn

- **WHEN** the store profile is no longer published
- **THEN** `/` no longer shows that display name or summary

#### Scenario: Directory points at the interface document

- **WHEN** a client fetches `/llms.txt`
- **THEN** the `接口` section contains an absolute link to `/interfaces` labeled as the interface document, still contains `/api/v1`, and does not list every registered operation

## ADDED Requirements

### Requirement: Storefront editing is its own usage guide

The landing-page usage section MUST server-render two selectable roles: finding or buying, and merchant configuration. The merchant role MUST be labeled `我是店主，想配置` and MUST be selectable without client-side script. Inside that role, the page MUST distinguish two workflows with the visible headings `上架商品` and `修改店面`. The storefront workflow MUST link to `/storefront/skill.md` with the visible label `查看店面 Skill`. Its steps MUST say that the skill only changes the human-visible page, that products, prices, and the store profile still go through the merchant skill, that visible facts must use slots and must not be hardcoded, that upload is not activation, and that the page must not change `/llms.txt`, the three skills, `/api`, or the authorization protocol. The listing workflow MUST link to the merchant skill and MUST NOT also present `查看店面 Skill`. The page MUST NOT offer `我是店主，想上架` or `我是店主，想改店面` as peer role tabs. When purchase mode is disabled, the storefront workflow MUST NOT tell the reader to place an order or complete a purchase. When purchase mode is enabled, it MAY say that purchase still goes through the user skill.

#### Scenario: Reader sees how to change the storefront

- **WHEN** a reader fetches `/` and does not run JavaScript
- **THEN** the HTML already contains both merchant workflows under `我是店主，想配置`, the storefront skill link only in `修改店面`, and the listing workflow without that link

#### Scenario: Purchase is disabled

- **WHEN** purchase mode is disabled and a reader fetches `/`
- **THEN** the storefront workflow does not say to place an order or complete a purchase
