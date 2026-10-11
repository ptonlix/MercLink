# Spec Delta

## MODIFIED Requirements

### Requirement: Upload attempts are rate limited
Each authenticated upload attempt, whether to a catalog image endpoint or `POST /api/v1/merchant/profile/images`, MUST count toward the owning merchant, including attempts later rejected for file validation. A merchant MUST NOT be allowed more than 30 upload attempts in any rolling 60 seconds. The 31st attempt in that window MUST be rejected with HTTP 429 and error code `rate_limited`, and MUST NOT write image bytes. Public media reads MUST NOT consume this limit. SMS rate limits MUST remain unchanged. The system MUST NOT keep a second upload counter for profile images.

#### Scenario: Thirty-first attempt
- **WHEN** a merchant has already made 30 upload attempts in the last 60 seconds and attempts another
- **THEN** the response is HTTP 429 with `rate_limited` and no new image is stored

#### Scenario: Window expires
- **WHEN** the merchant's 30 attempts are all older than 60 seconds and they upload a valid image
- **THEN** the upload succeeds

#### Scenario: Profile upload shares the catalog window
- **WHEN** a merchant has made 29 catalog image upload attempts in the last 60 seconds and then uploads a profile image
- **THEN** that profile upload consumes the 30th attempt

### Requirement: Cover accepts owned media or external URL
New product and variant `cover` values MUST be null, an absolute http(s) URL, or the media URL of an image owned by the same merchant and catalog. A same-application media URL that the caller does not own MUST be rejected with `not_found`. A media URL created by `POST /api/v1/merchant/profile/images` MUST be rejected with `not_found` when used as a cover. Non-URL strings, including `javascript:` and `data:` URLs, MUST be rejected with `validation_error` on write. Previously stored non-URL cover strings MUST remain readable and MUST NOT be rewritten by this rule. Replacing a cover MUST NOT delete the previous image bytes.

#### Scenario: Attach uploaded cover
- **WHEN** a merchant sets a product cover to a media URL uploaded into that product's catalog
- **THEN** the product cover is that absolute URL

#### Scenario: External URL remains valid
- **WHEN** a merchant sets a cover to `https://img.example/a.png`
- **THEN** the cover is stored as that URL

#### Scenario: Arbitrary string rejected
- **WHEN** a merchant sets a cover to `not a url`
- **THEN** the write is rejected with `validation_error` and the existing cover is unchanged

#### Scenario: Profile image is not a cover
- **WHEN** a merchant sets a product cover to a media URL uploaded with purpose `license`
- **THEN** the response is `not_found` and the cover is unchanged

## ADDED Requirements

### Requirement: Merchant can upload a profile image
A merchant actor with `product:write` MUST be able to upload one profile image with `POST /api/v1/merchant/profile/images`. The request MUST be `multipart/form-data` with one file field named `file` and one text field `purpose` whose value is exactly `license` or `contact_qr`. A successful upload MUST return `201` and a body containing `id`, absolute `url`, `content_type`, `byte_size`, and `purpose`. The `url` MUST be an absolute http(s) URL under this application's `/media/{id}` path. The image id MUST be unguessable and MUST NOT be derived from the original filename. The bytes MUST be written only to the configured object storage. A buyer, anonymous caller, or merchant without `product:write` MUST NOT upload. Another merchant MUST NOT reference the resulting URL as its own license or contact image.

The accepted bytes, size limit, signature check, SVG rejection, and limiter-unavailable behavior MUST be the same as catalog image upload. An unknown `purpose`, a missing file, or more than one file MUST be rejected with `validation_error` and MUST NOT leave a publicly readable object. Uploading a profile image MUST NOT publish the store profile and MUST NOT create a catalog image row.

`GET /media/{id}` MUST return a stored profile image with the same public headers as a catalog image. The response MUST NOT list other images, and the URL MUST NOT be added to the sitemap. The system MUST NOT offer deletion, a directory, or a gallery for profile images.

#### Scenario: License image upload
- **WHEN** a merchant with `product:write` uploads a valid PNG with `purpose` `license`
- **THEN** the response is `201`, the URL is an absolute `/media/{id}` URL, and the store profile remains unpublished

#### Scenario: Buyer cannot upload a profile image
- **WHEN** a buyer token calls `POST /api/v1/merchant/profile/images`
- **THEN** the upload is rejected with `forbidden` and no image is stored

#### Scenario: Public read of a profile image
- **WHEN** an anonymous client requests the media URL returned by a successful profile upload
- **THEN** the response body is the original image bytes and the content type is the stored image type
