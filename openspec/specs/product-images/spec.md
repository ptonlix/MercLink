# product-images Specification

## Purpose
让商家把商品图片上传到已配置的 S3 或 MinIO，并由本应用限流和公开提供这些图片。

## Requirements

### Requirement: Object storage is required at startup
The application MUST refuse to start when S3-compatible object storage is not fully configured, or when the configured bucket cannot be reached. Uploaded image bytes MUST be written only to that bucket. The application MUST NOT write uploaded image bytes to the local filesystem and MUST NOT start with a local-directory fallback.

#### Scenario: Missing object storage configuration
- **WHEN** the process starts without the object storage endpoint, region, bucket, or credentials
- **THEN** startup fails before the application serves requests

#### Scenario: Bucket unreachable
- **WHEN** object storage is configured but the bucket cannot be reached during startup
- **THEN** startup fails before the application serves requests

### Requirement: Merchant can upload one image
A merchant actor with `product:write` MUST be able to upload one image to a catalog they own. The request MUST be `multipart/form-data` with a single file field named `file`. A successful upload MUST return `201` and a body containing `id`, absolute `url`, `content_type`, and `byte_size`. The `url` MUST be an absolute http(s) URL under this application's `/media/{id}` path. The image id MUST be unguessable and MUST NOT be derived from the original filename. A buyer, anonymous caller, or merchant without `product:write` MUST NOT upload. A merchant MUST NOT upload into another merchant's catalog.

#### Scenario: Owned catalog upload
- **WHEN** a merchant with `product:write` uploads a valid image to their catalog
- **THEN** the response is `201` and includes an absolute media URL for that image

#### Scenario: Buyer cannot upload
- **WHEN** a buyer token calls the upload endpoint
- **THEN** the upload is rejected with `forbidden` and no image is stored

### Requirement: Accepted images are bounded
The system MUST accept only JPEG, PNG, and WebP, identified by file signature rather than the client-supplied type alone. A file larger than 5 MiB, a file with any other signature, an empty file, or a request with more than one file MUST be rejected with `validation_error`. SVG and other non-image content MUST be rejected. A rejected upload MUST NOT leave a publicly readable object.

#### Scenario: PNG signature accepted
- **WHEN** a merchant uploads a PNG whose bytes start with the PNG signature and whose size is at most 5 MiB
- **THEN** the stored content type is `image/png` and the byte size matches the file

#### Scenario: SVG rejected
- **WHEN** a merchant uploads an SVG document
- **THEN** the response is `validation_error` and the public media URL does not serve that upload

### Requirement: Upload attempts are rate limited
Each authenticated upload attempt MUST count toward the owning merchant, including attempts later rejected for file validation. A merchant MUST NOT be allowed more than 30 upload attempts in any rolling 60 seconds. The 31st attempt in that window MUST be rejected with HTTP 429 and error code `rate_limited`, and MUST NOT write image bytes. Public media reads MUST NOT consume this limit. SMS rate limits MUST remain unchanged.

#### Scenario: Thirty-first attempt
- **WHEN** a merchant has already made 30 upload attempts in the last 60 seconds and attempts another
- **THEN** the response is HTTP 429 with `rate_limited` and no new image is stored

#### Scenario: Window expires
- **WHEN** the merchant's 30 attempts are all older than 60 seconds and they upload a valid image
- **THEN** the upload succeeds

### Requirement: Limiter failure does not write files
If the upload rate limiter is unavailable, the upload MUST be rejected with `dependency_unavailable` and MUST NOT write image bytes. Already stored images MUST remain publicly readable without consulting the limiter.

#### Scenario: Limiter down
- **WHEN** a merchant uploads a valid image while the rate limiter is unavailable
- **THEN** the response is `dependency_unavailable` and the image is not stored

### Requirement: Stored images are publicly readable
`GET /media/{id}` MUST return the image bytes without authentication, with the stored image content type, `X-Content-Type-Options: nosniff`, and a response that browsers can display inline. An unknown id MUST return `404` and MUST NOT list other images. Media URLs MUST NOT be added to the sitemap. The system MUST NOT offer an image directory listing, image deletion, or a multi-image gallery in this capability.

#### Scenario: Public read
- **WHEN** an anonymous client requests the media URL returned by a successful upload
- **THEN** the response body is the original image bytes and the content type is the stored image type

#### Scenario: Unknown id
- **WHEN** an anonymous client requests `/media/{id}` for an id that was never stored
- **THEN** the response is `404`

### Requirement: Cover accepts owned media or external URL
New product and variant `cover` values MUST be null, an absolute http(s) URL, or the media URL of an image owned by the same merchant and catalog. A same-application media URL that the caller does not own MUST be rejected with `not_found`. Non-URL strings, including `javascript:` and `data:` URLs, MUST be rejected with `validation_error` on write. Previously stored non-URL cover strings MUST remain readable and MUST NOT be rewritten by this rule. Replacing a cover MUST NOT delete the previous image bytes.

#### Scenario: Attach uploaded cover
- **WHEN** a merchant sets a product cover to a media URL uploaded into that product's catalog
- **THEN** the product cover is that absolute URL

#### Scenario: External URL remains valid
- **WHEN** a merchant sets a cover to `https://img.example/a.png`
- **THEN** the cover is stored as that URL

#### Scenario: Arbitrary string rejected
- **WHEN** a merchant sets a cover to `not a url`
- **THEN** the write is rejected with `validation_error` and the existing cover is unchanged

### Requirement: Public pages show http covers as images
A public product page MUST render an `img` element whose `src` is the cover when the cover is an absolute http(s) URL, including a media URL returned by this application. The image alternative text MUST be the product title. JSON-LD `image` MUST use that same URL. A null cover MUST NOT render an `img`.

#### Scenario: Uploaded cover on product page
- **WHEN** the public product seam returns a product whose cover is an absolute media URL
- **THEN** the product page HTML contains an `img` with that URL and the JSON-LD image is the same URL
