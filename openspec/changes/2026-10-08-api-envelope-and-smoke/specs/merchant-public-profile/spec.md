# Spec Delta

## MODIFIED Requirements

### Requirement: Merchant agent edits only its own profile
`GET /api/v1/merchant/profile` MUST require a merchant bearer token and MUST NOT require a body. It MUST return HTTP `200`, body `code` `200`, `message` `成功`, and, inside `data`, this object even when no profile row exists: `display_name` string, `summary` string, `website_url` string or `null`, `logo_url` string or `null`, `area_served` string or `null`, `address` string or `null`, `published` boolean, and `updated_at` string or `null`. An unsaved profile MUST use empty strings, `null` for the four optional fields, `published` `false`, and `updated_at` `null`.

`PUT /api/v1/merchant/profile` MUST require `application/json` and a merchant bearer token with `product:write`. The body MUST contain exactly `display_name`, `summary`, `website_url`, `logo_url`, `area_served`, `address`, and `published`. `website_url`, `logo_url`, `area_served`, and `address` MUST each be a string or `null`. The handler MUST replace the whole profile, return HTTP `200`, and use the same `data` object as the read, including the new `updated_at`. A missing token MUST return HTTP `401` and body `code` `40100`. A buyer token or a merchant token without `product:write` MUST return HTTP `403` and body `code` `40300` without writing. A body with an undeclared field, including `phone`, `password`, or `email`, MUST return HTTP `400` and body `code` `40000` without writing. Neither response MUST include the login phone, account email, password hash, or merchant id at any level.

#### Scenario: Merchant saves a draft
- **WHEN** a merchant with `product:write` submits `display_name`, `summary`, `website_url` `null`, and `published` `false`
- **THEN** a later read returns those values inside `data` with a non-null `updated_at`, and `/` does not show the summary

#### Scenario: Buyer cannot save
- **WHEN** a buyer token calls `PUT /api/v1/merchant/profile`
- **THEN** the profile is unchanged and the response is HTTP `403` with body `code` `40300` and `data` `null`

#### Scenario: Unknown field is rejected
- **WHEN** a merchant submits a valid profile plus `phone`
- **THEN** the response is HTTP `400` with body `code` `40000` and the stored profile is unchanged

### Requirement: Public reads share one published seam
`GET /api/v1/store` and `/` MUST use one public store seam. A published profile MUST return HTTP `200`, body `code` `200`, and only `display_name`, `summary`, `website_url`, `logo_url`, `area_served`, and `address` inside `data`. An unpublished, withdrawn, disabled, or missing profile MUST return HTTP `404`, body `code` `40400`, and `data` `null` without draft fields. The seam MUST return at most one published profile. It MUST NOT return a merchant directory. It MUST NOT include a login phone, account email, or draft. When nothing is published, or the owning merchant is disabled or deleted, the seam MUST return no profile.

#### Scenario: Disabled merchant had a published profile
- **WHEN** the merchant that published the store profile is disabled
- **THEN** `/` and `GET /api/v1/store` no longer show that profile

#### Scenario: No second store page
- **WHEN** a client requests `/merchants/{id}`
- **THEN** that path is not a public store page for this change
