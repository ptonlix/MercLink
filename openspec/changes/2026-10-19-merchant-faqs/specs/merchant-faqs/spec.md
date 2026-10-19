# merchant-faqs Specification

## Purpose

让商家 Agent 单独维护全店和单件商品的问答，并只把已公开的条目交给公开页和公开接口。

## ADDED Requirements

### Requirement: Merchant replaces the store FAQ set
`GET /api/v1/merchant/faqs` MUST require a merchant bearer token and MUST NOT require a body. It MUST return `200` and this JSON object even when no store FAQ row exists: `published` boolean, `items` array, and `updated_at` string or `null`. An unsaved set MUST use `published` `false`, `items` `[]`, and `updated_at` `null`.

`PUT /api/v1/merchant/faqs` MUST require `application/json` and a merchant bearer token with `product:write`. The body MUST contain exactly `published` and `items`. The handler MUST replace the whole store set, return `200`, and use the same response object as the read, including the new `updated_at`. A missing token MUST return `401` and `unauthorized`. A buyer token or a merchant token without `product:write` MUST return `403` and `forbidden` without writing. A body with an undeclared field MUST return `400` and `validation_error` without writing. Neither response MUST include the login phone, account email, password, or merchant id.

#### Scenario: Merchant saves a store draft
- **WHEN** a merchant with `product:write` submits `published` `false` and one valid item
- **THEN** a later read returns that item with `published` `false` and a non-null `updated_at`, and `/` does not show the question

#### Scenario: Buyer cannot save the store set
- **WHEN** a buyer token calls `PUT /api/v1/merchant/faqs`
- **THEN** the store FAQ set is unchanged and the response is `403` with `forbidden`

#### Scenario: Unknown field is rejected
- **WHEN** a merchant submits a valid store FAQ body plus `summary`
- **THEN** the response is `400` with `validation_error` and the stored set is unchanged

### Requirement: Merchant replaces one product FAQ set
`GET /api/v1/catalogs/{id}/products/{product_id}/faqs` and `PUT` on that path MUST require a merchant bearer token. `PUT` MUST require `product:write` and the same body and response object as the store set. The product MUST belong to that merchant and that catalog and MUST NOT be soft-deleted. Otherwise the response MUST be `404` and `not_found` without writing. An unsaved set for a visible product MUST return `200`, `published` `false`, `items` `[]`, and `updated_at` `null`. A missing token MUST return `401` and `unauthorized`. A buyer token or a merchant token without `product:write` MUST return `403` and `forbidden` without writing.

#### Scenario: Product in another catalog
- **WHEN** a merchant writes FAQs using a catalog id that does not own the product
- **THEN** the response is `404` with `not_found` and no FAQ row is created

#### Scenario: Soft-deleted product keeps its saved set
- **WHEN** a product with a saved FAQ set is soft-deleted and later restored
- **THEN** the merchant FAQ read after restore returns the same items and `published` value, and the read while deleted is `404`

### Requirement: FAQ items are plain bounded text
Each item MUST contain exactly `question` and `answer`, both strings. After trimming, a question MUST be 1 to 80 characters and an answer MUST be 1 to 400 characters. Both MUST be a single line of plain text. HTML, Markdown, and line breaks MUST be rejected with `validation_error`. The login phone and account email MUST be rejected with `validation_error` and MUST NOT be stored. A store set MUST contain at most 12 items. A product set MUST contain at most 8 items. A repeated question inside one set, compared after trimming, MUST be rejected. Item order MUST be the submitted order. `published` `true` with an empty `items` array MUST return `validation_error` and MUST NOT change the previously stored set. `published` `false` with an empty `items` array MUST clear the items and leave the set unpublished.

#### Scenario: Empty publish is rejected
- **WHEN** a merchant submits `published` `true` and `items` `[]` for a set that already has one published item
- **THEN** the response is `validation_error` and a later read still returns the previous item and `published` `true`

#### Scenario: Markup and the login phone are rejected
- **WHEN** a merchant submits a question containing HTML or an answer equal to the login phone
- **THEN** the response is `validation_error` and that text is not stored

### Requirement: FAQ publication is independent
Saving or publishing the merchant profile MUST NOT create, replace, or change the store FAQ set. Creating, editing, publishing, or unpublishing a product MUST NOT create, replace, or change that product's FAQ set. Profile and product bodies that include `faqs` MUST return `validation_error` without writing. A FAQ item MUST NOT be stored as a catalog field value.

#### Scenario: Profile publish leaves the FAQ draft
- **WHEN** the store FAQ set is an unpublished draft and the merchant then publishes the profile
- **THEN** the FAQ set remains unpublished and `/` does not show its questions

#### Scenario: Unpublishing a product keeps the FAQ flag
- **WHEN** a product FAQ set is published and the merchant unpublishes that product
- **THEN** the merchant FAQ read still returns `published` `true` and the same items

### Requirement: Public FAQ visibility follows its own flag
A published store FAQ set with at least one item MUST be visible on `/` and in `/index.md` whether or not the profile is published. An unpublished or empty store set MUST NOT be visible. A product FAQ set MUST be visible on `/products/{id}` and in `/products/{id}.md` only when that set is published and the product is returned by the public-product seam. Unpublishing or soft-deleting the product MUST hide those items from the public page and public product JSON without clearing the merchant set. Publishing the product again MUST show the items when the FAQ set is still published. A disabled or deleted merchant MUST hide both store and product FAQ items from public reads. The system MUST NOT insert default questions.

#### Scenario: Published store FAQ without a profile
- **WHEN** the profile is unpublished and the store FAQ set is published with one item
- **THEN** `/` shows that question and answer and does not show a profile draft

#### Scenario: Republished product shows the same FAQ
- **WHEN** a publicly visible product has a published FAQ item, the product is unpublished, and it is published again
- **THEN** the public product page hides the item while unpublished and shows the same item after publish
