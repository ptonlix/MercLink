# Spec Delta

## MODIFIED Requirements

### Requirement: Merchant skill teaches catalog operations
`/merchant/skill.md` MUST be public and MUST explain catalog creation, field preview and confirmation, product and variant creation, publish, unpublish, soft delete, and restore. It MUST also explain `GET /api/v1/merchant/profile` and `PUT /api/v1/merchant/profile`, including the exact request fields `display_name`, `summary`, `website_url`, `logo_url`, `area_served`, `address`, `license`, `contact`, and `published`, a generic JSON example with `license` and `contact` set to `null`, that a profile is public only after `published` is true, and that setting `published` to false removes it immediately. It MUST describe a non-null `license` as exactly `name`, `credit_code`, `legal_person`, `registered_address`, and `image_url`, and a non-null `contact` as exactly `phone`, `label`, and `qr_url`. It MUST tell the agent not to submit the login phone, password, SMS code, API key, or citizen identity number as public profile data. It MUST say that unpublish, soft delete, and field retirement are different. It MUST tell the agent not to guide self-registration and not to request a password or API key. It MUST state that a merchant token cannot mark an order paid or place an order, and a buyer token cannot call merchant mutations. The document MUST NOT include any merchant's product data, profile text, or a valid credit code.

The skill MUST say that license and contact are recommended and MUST NOT be required before creating catalogs, creating products, publishing products, or publishing the profile. It MUST tell the agent to read a license image locally, show the user the enterprise name, unified social credit code, legal person, and registered address, and wait for explicit agreement to those four values before uploading the image or writing `license`. It MUST say not to guess a missing value, not to upload the image before agreement, not to decode a QR payload, and not to use the catalog image endpoint for a license or contact QR. It MUST name `POST /api/v1/merchant/profile/images` and the `purpose` values `license` and `contact_qr`. It MUST say that a profile image URL is publicly readable once known, and that this does not publish the profile.

#### Scenario: Merchant skill has no private catalog
- **WHEN** a client fetches `/merchant/skill.md`
- **THEN** the body contains the merchant API paths from the shared route table, including the profile paths and the profile image path, and does not contain a specific merchant's products, profile summary, license, or a token

#### Scenario: Consent comes before upload
- **WHEN** a client fetches `/merchant/skill.md`
- **THEN** the body says to obtain agreement to the four license values before uploading, and says that license and contact may be skipped

## ADDED Requirements

### Requirement: Storefront skill names the recommended profile slots
`/storefront/skill.md` MUST list `store.contact_phone`, `store.contact_label`, `store.contact_qr`, `store.license_name`, `store.license_credit_code`, `store.license_legal_person`, `store.license_address`, and `store.license_image` as store fact slots. It MUST say that a release may omit them, and that a visible value for those facts without the matching slot cannot be published. It MUST NOT include a merchant's license number or contact phone.

#### Scenario: Storefront skill lists the new slots
- **WHEN** a client fetches `/storefront/skill.md`
- **THEN** the body contains `store.license_credit_code` and `store.contact_qr`, and does not contain a credit code value
