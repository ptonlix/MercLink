# Spec Delta

## MODIFIED Requirements

### Requirement: Landing page states how to start

The `/` page MUST be server-rendered HTML. When a store profile is published, the first visible content MUST be that store, with the display name as the main heading, followed by its summary and any logo, area, address, and website. Published products MUST follow the store. The slogan “在 AI 时代，让天下没有难做的生意”, the explanation “帮中小商家做自己的店，并让各种 Agent 直接找到商品、完成购买。”, MercLink, the product list, both skills, the interface directory, and discovery files MUST appear only in the footer. The interface-directory link MUST be labeled `接口文档` and MUST point to `/interfaces`. It MUST NOT be labeled `API 根地址` and MUST NOT point to `/api/v1`. It MUST NOT use “查询已上架商品并下单” as that description, and it MUST NOT say that merchants cannot self-register. The visible order MUST NOT place the slogan or project links before the store or products. It MUST NOT list multiple stores, link to `/merchants/{id}`, or say “进入这一家的店”. The main content MUST be present without client-side script. When a store profile is published, the meta description MUST be the summary truncated to 150 characters, and JSON-LD MUST include an `OnlineStore` whose name, description, logo, sameAs, areaServed, and address match the visible profile. The canonical URL MUST remain this application's landing page. Title, description, canonical link, and JSON-LD MUST match the visible content.

#### Scenario: Client does not execute script

- **WHEN** a reader fetches `/` and does not run JavaScript
- **THEN** the HTML already contains the store name or product cards before the footer slogan and skill links

#### Scenario: Published store profile

- **WHEN** the public store seam returns a published profile
- **THEN** `/` shows that display name and summary above the product summary and does not show a login phone, a self-registration notice, or a link to another store

#### Scenario: Footer names the directory

- **WHEN** a reader fetches `/`
- **THEN** the footer links `接口文档` to `/interfaces` and does not link `API 根地址` to `/api/v1`

## ADDED Requirements

### Requirement: Interface directory is a human path index

`/interfaces` MUST be server-rendered HTML. The entry link MUST be labeled `接口文档`. Opening `/interfaces` MUST show the first registered operation, not an empty instruction. It MUST NOT explain itself as not the API root, and MUST NOT tell the reader that the page cannot replace a skill. It MUST list every method and path in the sole route registry, and each operation MUST have its own page under `/interfaces/{slug}`. That page MUST show body or query fields and response fields as separate paragraphs, including type and whether the field is required. Each listed operation MUST show authentication and permission as separate facts, plus its request parameters or body and response shape. Authentication MUST name the header or say that login is not required. Permission MUST name the required scope or say that none is required. A path documented by more than one skill MUST appear in each of those groups. Payment notification routes MUST show a signed provider request and a plain-text `success` or `fail` response, not a JSON envelope. The page MUST show the shared JSON response shape once, labeled `响应结构`, after the operation groups in both the menu and the page. It MUST NOT embed a token or a try-it-out form. It MUST NOT have a Markdown alternate. The main content MUST be present without client-side script.

#### Scenario: Reader opens the directory

- **WHEN** a reader fetches `/interfaces`
- **THEN** the footer is labeled `接口文档`, `/interfaces` shows the first registered operation, and the page does not link to `/api/v1` as a document

#### Scenario: Registered path is removed from the page

- **WHEN** a registered path is absent from the rendered directory
- **THEN** that rendering does not satisfy this requirement

### Requirement: Interface directory stays on the server

`/sitemap.xml` MUST include `/interfaces`. `/robots.txt` MUST allow `/interfaces`. An active storefront release MUST NOT replace `GET /interfaces`. A release MUST NOT be activatable when it contains a document for that exact path.

#### Scenario: Active release does not replace the directory

- **WHEN** a storefront release is active and a client fetches `/interfaces`
- **THEN** the response is this server's interface directory, not a release document

#### Scenario: Directory is discoverable

- **WHEN** a client fetches `/sitemap.xml` and `/robots.txt`
- **THEN** the sitemap includes `/interfaces` and robots allows that path
