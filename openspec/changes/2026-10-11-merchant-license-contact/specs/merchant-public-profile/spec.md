# Spec Delta

## MODIFIED Requirements

### Requirement: Merchant agent edits only its own profile
`GET /api/v1/merchant/profile` MUST require a merchant bearer token and MUST NOT require a body. It MUST return `200` and this JSON object even when no profile row exists: `display_name` string, `summary` string, `website_url` string or `null`, `logo_url` string or `null`, `area_served` string or `null`, `address` string or `null`, `license` object or `null`, `contact` object or `null`, `published` boolean, and `updated_at` string or `null`. An unsaved profile MUST use empty strings, `null` for `website_url`, `logo_url`, `area_served`, `address`, `license`, and `contact`, `published` `false`, and `updated_at` `null`.

`PUT /api/v1/merchant/profile` MUST require `application/json` and a merchant bearer token with `product:write`. The body MUST contain exactly `display_name`, `summary`, `website_url`, `logo_url`, `area_served`, `address`, `license`, `contact`, and `published`. `website_url`, `logo_url`, `area_served`, and `address` MUST each be a string or `null`. `license` MUST be `null` or an object with exactly `name`, `credit_code`, `legal_person`, `registered_address`, and `image_url`, each a string. `contact` MUST be `null` or an object with exactly `phone`, `label`, and `qr_url`, each a string or `null`. The handler MUST replace the whole profile, return `200`, and use the same response object as the read, including the new `updated_at`. A missing token MUST return `401` and `unauthorized`. A buyer token or a merchant token without `product:write` MUST return `403` and `forbidden` without writing. A body with an undeclared field, including top-level `phone`, `password`, or `email`, or an undeclared field inside `license` or `contact`, MUST return `400` and `validation_error` without writing. Neither response MUST include the login phone, account email, password hash, merchant id, or a citizen identity number.

A saved profile MUST NOT be required before creating a catalog, creating a product, or publishing a product. `license` and `contact` MUST NOT be copied from the merchant account.

#### Scenario: Merchant saves a draft
- **WHEN** a merchant with `product:write` submits `display_name`, `summary`, `website_url` `null`, `license` `null`, `contact` `null`, and `published` `false`
- **THEN** a later read returns those values with a non-null `updated_at`, and `/` does not show the summary

#### Scenario: Buyer cannot save
- **WHEN** a buyer token calls `PUT /api/v1/merchant/profile`
- **THEN** the profile is unchanged and the response is `403` with `forbidden`

#### Scenario: Unknown field is rejected
- **WHEN** a merchant submits a valid profile plus `phone`
- **THEN** the response is `400` with `validation_error` and the stored profile is unchanged

#### Scenario: Old seven-field body is rejected
- **WHEN** a merchant submits the previous seven profile fields and omits `license` and `contact`
- **THEN** the response is `400` with `validation_error` and the stored profile is unchanged

### Requirement: Publishing requires plain public facts
`display_name` MUST be 1 to 40 characters after trimming when published. `summary` MUST be 1 to 300 characters after trimming when published. Both MUST be plain text. `website_url` and `logo_url` MAY be empty. A non-empty value MUST be an absolute `http` or `https` URL no longer than 200 characters. `area_served` MAY be empty and MUST be at most 40 characters of plain text. `address` MAY be empty and MUST be at most 120 characters of plain text. A non-empty address MUST be shown on the landing page. HTML, Markdown, other URL schemes, and the merchant login phone MUST be rejected with `validation_error`. An invalid publish request MUST NOT change the previously published public profile. The landing page MUST use the summary both as visible text and, truncated to 150 characters, as the meta description. It MUST NOT store a separate SEO description.

`license` and `contact` MUST NOT be required to publish the profile or a product. When `license` is an object, all five of its fields MUST be non-empty plain text, and a partial object MUST be rejected with `validation_error` without writing. `name` MUST be 1 to 80 characters. `credit_code` MUST be 18 characters from `0123456789ABCDEFGHJKLMNPQRTUWXY` and MUST match the GB 32100-2015 check character. `legal_person` MUST be 1 to 40 characters and MUST NOT contain a citizen identity number or 17 consecutive digits. `registered_address` MUST be 1 to 200 characters and MUST NOT replace `address`. `image_url` MUST be an absolute media URL of a `license` image owned by the same merchant. An external URL, a catalog image URL, or a `contact_qr` image URL MUST be rejected with `not_found` or `validation_error` and MUST NOT be stored.

When `contact` is an object, `phone` and `qr_url` MUST NOT both be `null`. `phone`, when present, MUST be 5 to 20 characters of digits, spaces, hyphens, parentheses, and an optional leading `+`, and MUST contain at least 5 digits. `label`, when present, MUST be 1 to 20 characters of plain text. `qr_url`, when present, MUST be an absolute media URL of a `contact_qr` image owned by the same merchant. The login phone and account email MUST be rejected in `phone`, `label`, and every license text field. The system MUST NOT decode a QR image or store its payload.

#### Scenario: Publish without a summary
- **WHEN** a merchant publishes a profile whose summary is empty
- **THEN** the response is `validation_error` and the public page does not gain a new profile

#### Scenario: Phone is submitted as the website
- **WHEN** a merchant submits its login phone as `website_url`
- **THEN** the response is `validation_error` and the phone is not stored as a public website

#### Scenario: Recommended facts are absent
- **WHEN** a merchant publishes a profile with `license` `null`, `contact` `null`, a non-empty display name, and a non-empty summary
- **THEN** the profile is published and product publishing remains available

#### Scenario: Partial license is rejected
- **WHEN** a merchant submits a license object that omits `legal_person` or uses a credit code whose check character does not match GB 32100-2015
- **THEN** the response is `validation_error` and the previously stored profile is unchanged

#### Scenario: Registered address stays separate
- **WHEN** a merchant saves a license registered address and a different operating `address`
- **THEN** a later read returns both values unchanged

### Requirement: Public reads share one published seam
`GET /api/v1/store` and `/` MUST use one public store seam. A published profile MUST return `200` and only `display_name`, `summary`, `website_url`, `logo_url`, `area_served`, `address`, `license`, and `contact`. `license` and `contact` MUST be present and MUST be `null` when that group was not saved. A non-null `license` MUST contain only `name`, `credit_code`, `legal_person`, `registered_address`, and `image_url`. A non-null `contact` MUST contain only `phone`, `label`, and `qr_url`. An unpublished, withdrawn, disabled, or missing profile MUST return `404` and `not_found` without draft fields. The seam MUST return at most one published profile. It MUST NOT return a merchant directory. It MUST NOT include a login phone, account email, citizen identity number, or draft. When nothing is published, or the owning merchant is disabled or deleted, the seam MUST return no profile.

#### Scenario: Disabled merchant had a published profile
- **WHEN** the merchant that published the store profile is disabled
- **THEN** `/` and `GET /api/v1/store` no longer show that profile

#### Scenario: No second store page
- **WHEN** a client requests `/merchants/{id}`
- **THEN** that path is not a public store page for this change

#### Scenario: Draft license is not public
- **WHEN** a merchant saves a complete license with `published` `false`
- **THEN** `GET /api/v1/store` is `404` and does not include the license name or image URL
