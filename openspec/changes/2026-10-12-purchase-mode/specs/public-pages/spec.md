# Spec Delta

## MODIFIED Requirements

### Requirement: Landing page states how to start
The `/` page MUST be server-rendered HTML. When a store profile is published, the first visible content MUST be that store, with the display name as the main heading, followed by its summary and any logo, area, address, and website. Published products MUST follow the store. The slogan “在 AI 时代，让天下没有难做的生意”, one explanation, MercLink, the product list, both skills, the interface directory, and discovery files MUST appear only in the footer. The interface-directory link MUST be labeled `接口文档` and MUST point to `/interfaces`. It MUST NOT be labeled `API 根地址` and MUST NOT point to `/api/v1`. When purchase mode is disabled, the explanation MUST be “帮中小商家做自己的店，并让各种 Agent 直接找到商品。” When purchase mode is enabled, the explanation MUST be “帮中小商家做自己的店，并让各种 Agent 直接找到商品、完成购买。” It MUST NOT use “查询已上架商品并下单” as that description, and it MUST NOT say that merchants cannot self-register. The visible order MUST NOT place the slogan or project links before the store or products. It MUST NOT list multiple stores, link to `/merchants/{id}`, or say “进入这一家的店”. The main content MUST be present without client-side script. When a store profile is published, the meta description MUST be the summary truncated to 150 characters, and JSON-LD MUST include an `OnlineStore` whose name, description, logo, sameAs, areaServed, and address match the visible profile. The canonical URL MUST remain this application's landing page. Title, description, canonical link, and JSON-LD MUST match the visible content.

#### Scenario: Client does not execute script
- **WHEN** a reader fetches `/` and does not run JavaScript
- **THEN** the HTML already contains the store name or product cards before the footer slogan and skill links

#### Scenario: Published store profile
- **WHEN** the public store seam returns a published profile
- **THEN** `/` shows that display name and summary above the product summary and does not show a login phone, a self-registration notice, or a link to another store

#### Scenario: Footer names the directory
- **WHEN** a reader fetches `/`
- **THEN** the footer links `接口文档` to `/interfaces` and does not link `API 根地址` to `/api/v1`

#### Scenario: Explanation follows purchase mode
- **WHEN** purchase mode is disabled and a reader fetches `/`
- **THEN** the footer explanation does not contain “完成购买”

## ADDED Requirements

### Requirement: Public purchase prompts follow purchase mode
When purchase mode is disabled, `/`, `/products`, and `/products/{id}` MUST NOT show a purchase guide, a control that copies a purchase request, or text that tells a person to register in order to buy. When purchase mode is enabled, a purchase guide MAY be shown and MUST call `/skill.md` 用户 Skill, not 买家 Skill. `/llms.txt` MUST continue to link to `/skill.md`. That link's description MUST call it 用户 Skill. When purchase mode is disabled, the description MUST say the document is for finding published products and MUST NOT say it places an order. When purchase mode is enabled, the description MUST say it can place a one-line order and then look up that order. Product JSON, Markdown, and JSON-LD MUST still include sellable variant facts in both modes. Those facts MUST NOT be described as an order instruction while purchase is disabled.

#### Scenario: Product page while purchase is disabled
- **WHEN** purchase mode is disabled and a reader fetches a public product page
- **THEN** the page shows the product facts and does not offer a control labeled as copying a purchase request

#### Scenario: Directory describes the user skill
- **WHEN** purchase mode is disabled and a client fetches `/llms.txt`
- **THEN** the `/skill.md` entry says 用户 Skill, does not say 买家 Skill, and does not say to place an order
