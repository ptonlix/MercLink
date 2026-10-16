# public-pages Specification

## MODIFIED Requirements

### Requirement: Product pages use the public query seam
`/products` and `/products/{id}` MUST render only products returned by the public-product seam. They MUST NOT read a second product store or hand-picked content. A product page MUST show the public fields and sellable variants. On the builtin page, and in server-written `product.fields` or `product.variants` fallback HTML, a public field with a display label MUST use that label as the visible heading and MUST NOT use the field key. A missing label MUST fall back to the key. A template that declares `field.key` or `variant.id` MUST still receive the key and the variant id. Boolean values MUST remain 是 and 否, and an empty value MUST remain 未填写. The builtin page MUST NOT include a product-information block showing the product id, catalog id, minor-unit price, or raw availability token. It MUST NOT repeat the currency code as a separate machine fact. CNY prices MUST stay in the existing `¥` format, and other currencies MUST keep the existing major-unit format that includes the currency code. It MUST NOT show a variant id as the variant name. A variant with no option values MUST be labeled `默认规格`. Those machine facts, including each sellable variant id, MUST remain available in the product Markdown. When the seam returns a description, `/products/{id}` MUST show that plain text below the title and offer, preserving line breaks, and MUST NOT interpret it as HTML or Markdown. When the description is empty, the page MUST NOT render an empty description block. `/products` and the landing shelf MUST NOT render the description body. The product meta description and JSON-LD `description` MUST use the description with internal whitespace collapsed to single spaces and then truncated to 150 characters. When the description is empty, they MUST keep the existing sentence made from title, price, and availability. JSON-LD MUST use `ItemList` for the list and `Product` plus `Offer` for a product, with the same price, currency, and availability as the seam. JSON-LD MUST NOT add field labels.

#### Scenario: Seam returns one product
- **WHEN** the public-product seam returns one published product
- **THEN** `/products` and `/products/{id}` show that product and its offer price matches the seam

#### Scenario: Seam is unregistered
- **WHEN** the public-product seam has no implementation
- **THEN** the pages render successfully and show no products

#### Scenario: Public field has a display label
- **WHEN** the seam returns a public field `origin` with value `北海合浦` and label `产地`
- **THEN** `/products/{id}` shows `产地` and `北海合浦`, and the visible field heading is not `origin`

#### Scenario: Machine identifiers stay off the human page
- **WHEN** a person fetches `/products/{id}` for a product priced at 168000 minor units with availability `in_stock` and currency `CNY`
- **THEN** the visible page shows the major-unit price and does not show a product-information block with the product id, catalog id, `168000`, `in_stock`, or a separate `CNY` machine fact

#### Scenario: Declared slots still receive keys
- **WHEN** an active storefront template declares `field.key` or `variant.id`
- **THEN** those slots are filled with the key and the variant id, not replaced by the display label

#### Scenario: Description keeps its line breaks
- **WHEN** the seam returns a description of two lines
- **THEN** `/products/{id}` shows both lines as text, the product list and landing shelf do not show that body, and the meta description is a single line of at most 150 characters taken from that description

#### Scenario: Missing description keeps the generated summary
- **WHEN** the seam returns a product with no description
- **THEN** `/products/{id}` has no description block and the meta description still states the title, price, and availability

### Requirement: Landing products use a store shelf
The published products on `/` MUST render as linked product cards in one horizontal shelf. Each card MUST show the cover or a placeholder, the title, and the price in major currency units derived from minor units. A card MUST NOT show the product description. The whole card MUST link to `/products/{id}`. The shelf MUST be movable sideways without autoplay and MUST remain readable without client-side script. The page MUST use a warm paper background, serif slogan and store name, and one green accent. It MUST NOT use a neon gradient, giant background wordmark, floating purchase chip, or autoplay media. When more products exist beyond the shelf, the page MUST link to `/products`. An empty shelf MUST state that no product is available.

#### Scenario: Two published products
- **WHEN** the public-product seam returns two products priced at 159900 and 800 minor units
- **THEN** `/` shows two cards with `¥1599.00` and `¥8.00`, and each card links to that product

#### Scenario: Script is disabled
- **WHEN** a reader fetches `/` and does not run JavaScript
- **THEN** the product cards and their links are already present in the shelf

#### Scenario: Shelf hides a long description
- **WHEN** a published product on `/` has a description
- **THEN** the shelf card shows the title and price and does not show the description text

## ADDED Requirements

### Requirement: Product markdown keeps the description
`/products/{id}.md` MUST include the product description when the seam returns one, preserving line breaks. It MUST NOT collapse that description onto one line and MUST NOT treat it as a catalog field key. When the description is empty, the Markdown MUST omit the description section and MUST NOT invent one. The same response MUST still list public field keys and values.

#### Scenario: Multiline description stays multiline
- **WHEN** a client fetches `/products/{id}.md` for a product whose description has two lines
- **THEN** the body contains both lines and does not list `description` as a public field key

### Requirement: Storefront templates can place the description
The builtin product template and the starter product page MUST include `product.description`. Filling that slot MUST insert the description as escaped text, or nothing when the description is empty. An already published storefront that does not declare `product.description` MUST remain valid and MUST NOT be rewritten to insert the description.

#### Scenario: Starter page has the slot
- **WHEN** the starter product page is rendered for a product with a description
- **THEN** the description is visible through `product.description`

#### Scenario: Published template without the slot
- **WHEN** an active storefront product template does not declare `product.description`
- **THEN** the page still renders and does not add a description block that the template did not declare
