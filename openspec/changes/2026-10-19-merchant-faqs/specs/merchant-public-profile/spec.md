# merchant-public-profile Specification

## MODIFIED Requirements

### Requirement: Public reads share one published seam
`GET /api/v1/store` and `/` MUST use one public store seam for the profile. A published profile MUST return `200` and the existing public profile fields, plus `faqs`. `faqs` MUST be the published store FAQ items in stored order, or an empty array when the store FAQ set is missing, unpublished, or empty. An unpublished, withdrawn, disabled, or missing profile MUST return `404` and `not_found` without draft profile fields, except when a store FAQ set is publicly visible: then the response MUST be `200` and the JSON object MUST contain only `faqs`. The seam MUST return at most one published profile. It MUST NOT return a merchant directory. It MUST NOT include a login phone, account email, a profile draft, or an unpublished FAQ draft. When the profile is not publicly visible and no store FAQ set is publicly visible, or the owning merchant is disabled or deleted, the seam MUST return no profile and no FAQ items.

#### Scenario: Disabled merchant had a published profile
- **WHEN** the merchant that published the store profile is disabled
- **THEN** `/` and `GET /api/v1/store` no longer show that profile or its FAQ items

#### Scenario: No second store page
- **WHEN** a client requests `/merchants/{id}`
- **THEN** that path is not a public store page for this change

#### Scenario: Published profile includes an empty FAQ list
- **WHEN** the profile is published and the store FAQ set is unpublished
- **THEN** `GET /api/v1/store` returns `200` with the profile fields and `faqs` `[]`

#### Scenario: Only the store FAQ is public
- **WHEN** the profile is withdrawn and the store FAQ set is published with one item
- **THEN** `GET /api/v1/store` returns `200` with only `faqs`, and the body does not contain the withdrawn summary
