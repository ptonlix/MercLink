# Spec Delta

## MODIFIED Requirements

### Requirement: Landing page states how to start
The `/` page MUST be server-rendered HTML. When a store profile is published, the first visible content MUST be that store, with the display name as the main heading, followed by its summary and any logo, area, address, and website. When the published profile has a non-null `contact` or `license`, those saved facts MUST appear with the store, before the products, and the page MUST show the exact notice `商家自行填写，本系统未核验。` When both are null, the page MUST NOT show that notice or an empty contact or license section. Published products MUST follow the store. The slogan “在 AI 时代，让天下没有难做的生意”, the explanation “帮中小商家做自己的店，并让各种 Agent 直接找到商品、完成购买。”, MercLink, the product list, both skills, the API root, and discovery files MUST appear only in the footer. It MUST NOT use “查询已上架商品并下单” as that description, and it MUST NOT say that merchants cannot self-register. The visible order MUST NOT place the slogan or project links before the store or products. It MUST NOT list multiple stores, link to `/merchants/{id}`, or say “进入这一家的店”. The main content MUST be present without client-side script. When a store profile is published, the meta description MUST be the summary truncated to 150 characters, and JSON-LD MUST include an `OnlineStore` whose name, description, logo, sameAs, areaServed, and address match the visible profile. A non-null contact phone MUST be `telephone`. A non-null credit code, legal person, and registered address MUST be `identifier` entries of type `PropertyValue`, using the names `统一社会信用代码`, `法人姓名`, and `注册地址`. The registered address MUST NOT be written into `PostalAddress`. The document MUST NOT add a certification, verification status, `taxID`, `founder`, rating, or citizen identity number. The canonical URL MUST remain this application's landing page. Title, description, canonical link, and JSON-LD MUST match the visible content.

#### Scenario: Client does not execute script
- **WHEN** a reader fetches `/` and does not run JavaScript
- **THEN** the HTML already contains the store name or product cards before the footer slogan and skill links

#### Scenario: Published store profile
- **WHEN** the public store seam returns a published profile
- **THEN** `/` shows that display name and summary above the product summary and does not show a login phone, a self-registration notice, or a link to another store

#### Scenario: Published license is visible and unverified
- **WHEN** the public store seam returns a published profile with a license and no contact
- **THEN** `/` shows the four license facts and `商家自行填写，本系统未核验。`, and the JSON-LD identifier contains the credit code without a certification type

## ADDED Requirements

### Requirement: Recommended profile facts stay on the public fact seam
`/index.md` and `/` with `Accept: text/markdown` MUST include the same published contact and license facts as `/`, including the unverified notice when either group is present, and MUST omit both groups and the notice when both are null. The Markdown MUST NOT include a draft, login phone, or citizen identity number. `/llms.txt` MUST NOT embed the license, contact, or notice.

When a storefront release is active, a document that declares `store.contact_phone`, `store.contact_label`, `store.contact_qr`, `store.license_name`, `store.license_credit_code`, `store.license_legal_person`, `store.license_address`, or `store.license_image` MUST have that slot filled from the current published seam. A null fact MUST leave its slot empty. A release that does not declare these slots MUST remain activatable. A visible hardcoded value after `统一社会信用代码`, `法人姓名`, `注册地址`, `客服电话`, or `客服二维码` MUST be rejected as a hardcoded store fact. Server-injected `OnlineStore` data for a document with store slots MUST use the same telephone and identifier rules as the built-in landing page.

#### Scenario: Markdown matches the landing page
- **WHEN** a published profile has a contact phone and no license
- **THEN** `/index.md` shows that phone and the unverified notice, and does not show a license section

#### Scenario: Discovery file stays a link list
- **WHEN** a published profile includes a license
- **THEN** `/llms.txt` does not contain the credit code or legal person

#### Scenario: Old storefront omits the new slots
- **WHEN** an otherwise valid storefront release does not declare the contact or license slots
- **THEN** activation succeeds and those facts are not invented in the release HTML
