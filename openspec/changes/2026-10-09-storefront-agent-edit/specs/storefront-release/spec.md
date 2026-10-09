# Spec Delta

## Purpose

让这一家店的商家 Agent 下载当前店面源码、推送静态发布，并原子替换线上公开店面，同时不在服务端执行上传代码。

## ADDED Requirements

### Requirement: One deployment has one replaceable storefront
The deployment MUST have at most one active storefront release. It MUST NOT provide a template registry, a theme marketplace, or a per-merchant choice of storefronts. When no release is active, public pages MUST continue to use the built-in pages.

#### Scenario: No release has been activated
- **WHEN** a client requests `/` and no storefront release is active
- **THEN** the response is the built-in page, not a merchant-uploaded document

### Requirement: Merchant can download the current storefront source
A merchant token with `storefront:write` MUST be able to download the current storefront source archive. Before any release is accepted, that archive MUST be the storefront source shipped with this deployment. After a release is accepted, the download MUST be the source archive accepted for that release, not the original shipped source. The archive MUST NOT contain deployment secrets, payment private keys, database URLs, or the admin password page. The server MUST NOT build or execute the archive when it is downloaded or stored.

#### Scenario: First download is the shipped source
- **WHEN** a merchant token with `storefront:write` downloads the storefront source before any release is accepted
- **THEN** the response is the shipped source archive and does not contain a deployment secret

#### Scenario: Later download continues the accepted source
- **WHEN** a release with a source archive has been accepted and the merchant downloads the source again
- **THEN** the response is that accepted source archive

#### Scenario: Product write cannot download source
- **WHEN** a merchant token has `product:write` but not `storefront:write`
- **THEN** the source download is rejected with `forbidden`

### Requirement: Upload stores a static release without executing it
A merchant token with `storefront:write` MUST be able to submit one source archive and one static file set as a release. The server MUST store both as immutable objects and MUST NOT install dependencies, compile, or execute the submission. The static set MUST include `index.html`. A submission that exceeds the configured size, contains a reserved path, contains a secret file, or lacks `index.html` MUST be rejected with `validation_error` and MUST NOT become active. A compressed entry MUST NOT expand beyond the configured uncompressed size, including when the declared uncompressed size is 0. A `validation_error` MUST NOT consume the upload rate limit. Upload frequency MUST use the existing expiring rate limit. When that limit is exceeded, the response MUST be `rate_limited` and nothing is stored. When object storage is unavailable, the response MUST be `dependency_unavailable` and nothing is activated.

#### Scenario: Valid static set is stored inactive
- **WHEN** a merchant with `storefront:write` submits a source archive and a static set that contains `index.html` and no reserved path
- **THEN** the release is stored and is not yet the active public storefront

#### Scenario: Reserved path is rejected
- **WHEN** the static set contains a file under `/api`, `/authorize`, `/oauth`, `/admin`, `/media`, `/.well-known`, `/skill.md`, `/merchant/skill.md`, or `/storefront/skill.md`
- **THEN** the response is `validation_error` and no active pointer changes

#### Scenario: Invalid archive does not consume upload quota
- **WHEN** a submission fails validation before it is stored
- **THEN** the response is `validation_error` and the upload rate limit is not consumed

#### Scenario: Declared-zero zip bomb is rejected
- **WHEN** a compressed entry declares an uncompressed size of 0 but expands beyond the configured size
- **THEN** the response is `validation_error` and the active pointer does not change

### Requirement: Activation and rollback switch a pointer
Activation MUST require an explicit confirmation and MUST NOT happen because a release was uploaded. An unconfirmed activation MUST be rejected with `validation_error` and MUST NOT change the active pointer. Before changing the pointer, the server MUST verify that every document showing store, product, or order facts declares the corresponding fact slots and does not hardcode those facts. Product list and product documents MUST declare product slots. The product list MUST also declare a `products.next` slot. A document that hardcodes a price, including 售价, 单价, or 标价 followed by a number, a stock figure, a store profile field, or payment success MUST be rejected with `validation_error`, and the pointer MUST NOT change. A product list that omits `products.next` MUST be rejected the same way. A confirmed activation MUST serve documents that contain no fact slots as stored bytes. Documents with fact slots MUST be rendered by the server on each request. Rollback MUST restore the previous release, or the built-in pages when there is no previous release. Neither action MUST restart the process or change payment notification handling. A token without `storefront:write` MUST receive `forbidden` and MUST NOT change the pointer.

#### Scenario: Upload does not replace the live page
- **WHEN** a release is stored and has not been confirmed active
- **THEN** `/` is unchanged

#### Scenario: Confirmed activation serves static pages without facts
- **WHEN** a merchant with `storefront:write` confirms activation of a release whose fact documents declare slots and whose other documents contain no store, product, or order facts
- **THEN** a fact-free public GET serves stored bytes from that release, and `/api/v1/payments/alipay/notify` is still handled by the server

#### Scenario: Hardcoded fact blocks activation
- **WHEN** a document hardcodes a product price, stock figure, store profile field, or payment success, or a product document omits its fact slots
- **THEN** confirmed activation returns `validation_error` and the live page is unchanged

#### Scenario: Selling price text blocks activation
- **WHEN** a document contains 售价 followed by a number and the merchant confirms activation
- **THEN** the response is `validation_error` and the pointer does not change

#### Scenario: Product list without a next slot
- **WHEN** the product list omits the `products.next` slot and the merchant confirms activation
- **THEN** the response is `validation_error` and the pointer does not change

#### Scenario: Backend fact change keeps the custom page
- **WHEN** a release is active and a public product price or published store summary changes
- **THEN** the next rendered response still uses the custom document and shows the new fact without another activation

#### Scenario: Rollback restores the previous public page
- **WHEN** the merchant rolls back the active release
- **THEN** public non-reserved GET requests serve the previous release, or the built-in pages when no previous release exists

### Requirement: Protocol paths stay on the server
After any activation, `/api`, `/authorize`, `/oauth`, `/admin`, `/media`, `/.well-known`, `/skill.md`, `/merchant/skill.md`, `/storefront/skill.md`, `/llms.txt`, `/sitemap.xml`, and `/robots.txt` MUST still be served by the server. A release fallback document MUST NOT be served for those paths. A declared fallback document MUST NOT be served for `/products` or `/products/{id}`. The server MUST NOT add an endpoint that marks an order paid because a browser returned from the payment host. Payment notification routes MUST continue to verify signatures before changing payment state.

#### Scenario: Fallback cannot hide OAuth
- **WHEN** a release declares a fallback document and a client requests `/oauth/device/auth`
- **THEN** the response is the server protocol handler, not the fallback document

#### Scenario: Product paths do not use the homepage fallback
- **WHEN** a release declares a fallback document and a client requests `/products/{id}`
- **THEN** the response is not that fallback document

#### Scenario: Return from payment does not mark paid
- **WHEN** a browser opens a storefront page after the payer leaves the payment host
- **THEN** the order remains unpaid until the existing verified notification or payment query marks it `paid`
