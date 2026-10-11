# public-pages Specification

## MODIFIED Requirements

### Requirement: Product pages use the public query seam
`/products` and `/products/{id}` MUST render only products returned by the public-product seam. They MUST NOT read a second product store or hand-picked content. A product page MUST show the public fields and sellable variants. On the builtin page, and in server-written `product.fields` or `product.variants` fallback HTML, a public field with a display label MUST use that label as the visible heading and MUST NOT use the field key. A missing label MUST fall back to the key. A template that declares `field.key` or `variant.id` MUST still receive the key and the variant id. Boolean values MUST remain 是 and 否, and an empty value MUST remain 未填写. The builtin page MUST NOT include a product-information block showing the product id, catalog id, minor-unit price, or raw availability token. It MUST NOT repeat the currency code as a separate machine fact. CNY prices MUST stay in the existing `¥` format, and other currencies MUST keep the existing major-unit format that includes the currency code. It MUST NOT show a variant id as the variant name. A variant with no option values MUST be labeled `默认规格`. Those machine facts, including each sellable variant id, MUST remain available in the product Markdown. JSON-LD MUST use `ItemList` for the list and `Product` plus `Offer` for a product, with the same price, currency, and availability as the seam. JSON-LD MUST NOT add field labels.

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

## ADDED Requirements

### Requirement: Product markdown keeps field keys and explains them
`/products/{id}.md` MUST keep each public field key and its value. When the seam provides a display label for that key, the next line MUST be `含义：` followed by that label. The Markdown MUST NOT replace the key with the label. A field without a label MUST still show the key and value and MUST NOT invent a meaning. The public product JSON `fields` object MUST remain key-value pairs and MUST NOT be replaced by labels. The same Markdown MUST include the product id, catalog id, offer price in integer minor units labeled as such, the raw availability token, and the currency code. It MUST still show the major-unit price. It MUST NOT present the minor-unit integer as the display price.

#### Scenario: Labeled field stays addressable by key
- **WHEN** a client fetches `/products/{id}.md` for a product whose public field `origin` is `北海合浦` and whose label is `产地`
- **THEN** the body contains `origin: 北海合浦` and `含义：产地`, and does not omit the key

#### Scenario: Unlabeled field is not annotated
- **WHEN** a public field has a value and the seam provides no label
- **THEN** the Markdown shows the key and value and does not add a `含义：` line for that field

#### Scenario: Machine facts are labeled in Markdown
- **WHEN** a client fetches `/products/{id}.md` for a product priced at 800 minor units, availability `out_of_stock`, and currency `CNY`
- **THEN** the body shows `¥8.00`, `价格整数分：800`, `可售状态：out_of_stock`, and `货币：CNY`, and also shows the product id and catalog id
