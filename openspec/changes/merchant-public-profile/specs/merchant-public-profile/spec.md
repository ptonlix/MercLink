# Spec Delta

## Purpose

让商家 Agent 维护这一家店的公开介绍，并让落地页和公开接口只展示这份已发布内容。

## ADDED Requirements

### Requirement: Merchant agent edits only its own profile
`GET /api/v1/merchant/profile` MUST require a merchant bearer token and MUST NOT require a body. It MUST return `200` and this JSON object even when no profile row exists: `display_name` string, `summary` string, `website_url` string or `null`, `logo_url` string or `null`, `area_served` string or `null`, `address` string or `null`, `published` boolean, and `updated_at` string or `null`. An unsaved profile MUST use empty strings, `null` for the four optional fields, `published` `false`, and `updated_at` `null`.

`PUT /api/v1/merchant/profile` MUST require `application/json` and a merchant bearer token with `product:write`. The body MUST contain exactly `display_name`, `summary`, `website_url`, `logo_url`, `area_served`, `address`, and `published`. `website_url`, `logo_url`, `area_served`, and `address` MUST each be a string or `null`. The handler MUST replace the whole profile, return `200`, and use the same response object as the read, including the new `updated_at`. A missing token MUST return `401` and `unauthorized`. A buyer token or a merchant token without `product:write` MUST return `403` and `forbidden` without writing. A body with an undeclared field, including `phone`, `password`, or `email`, MUST return `400` and `validation_error` without writing. Neither response MUST include the login phone, account email, password hash, or merchant id.

#### Scenario: Merchant saves a draft
- **WHEN** a merchant with `product:write` submits `display_name`, `summary`, `website_url` `null`, and `published` `false`
- **THEN** a later read returns those values with a non-null `updated_at`, and `/` does not show the summary

#### Scenario: Buyer cannot save
- **WHEN** a buyer token calls `PUT /api/v1/merchant/profile`
- **THEN** the profile is unchanged and the response is `403` with `forbidden`

#### Scenario: Unknown field is rejected
- **WHEN** a merchant submits a valid profile plus `phone`
- **THEN** the response is `400` with `validation_error` and the stored profile is unchanged

### Requirement: Publishing requires plain public facts
`display_name` MUST be 1 to 40 characters after trimming when published. `summary` MUST be 1 to 300 characters after trimming when published. Both MUST be plain text. `website_url` and `logo_url` MAY be empty. A non-empty value MUST be an absolute `http` or `https` URL no longer than 200 characters. `area_served` MAY be empty and MUST be at most 40 characters of plain text. `address` MAY be empty and MUST be at most 120 characters of plain text. A non-empty address MUST be shown on the landing page. HTML, Markdown, other URL schemes, and the merchant login phone MUST be rejected with `validation_error`. An invalid publish request MUST NOT change the previously published public profile. The landing page MUST use the summary both as visible text and, truncated to 150 characters, as the meta description. It MUST NOT store a separate SEO description.

#### Scenario: Publish without a summary
- **WHEN** a merchant publishes a profile whose summary is empty
- **THEN** the response is `validation_error` and the public page does not gain a new profile

#### Scenario: Phone is submitted as the website
- **WHEN** a merchant submits its login phone as `website_url`
- **THEN** the response is `validation_error` and the phone is not stored as a public website

### Requirement: Public reads share one published seam
`GET /api/v1/store` and `/` MUST use one public store seam. A published profile MUST return `200` and only `display_name`, `summary`, `website_url`, `logo_url`, `area_served`, and `address`. An unpublished, withdrawn, disabled, or missing profile MUST return `404` and `not_found` without draft fields. The seam MUST return at most one published profile. It MUST NOT return a merchant directory. It MUST NOT include a login phone, account email, or draft. When nothing is published, or the owning merchant is disabled or deleted, the seam MUST return no profile.

#### Scenario: Disabled merchant had a published profile
- **WHEN** the merchant that published the store profile is disabled
- **THEN** `/` and `GET /api/v1/store` no longer show that profile

#### Scenario: No second store page
- **WHEN** a client requests `/merchants/{id}`
- **THEN** that path is not a public store page for this change
