# Spec Delta

## MODIFIED Requirements

### Requirement: Merchant can upload one image
A merchant actor with `product:write` MUST be able to upload one image to a catalog they own. The request MUST be `multipart/form-data` with a single file field named `file`. A successful upload MUST return HTTP `201`, body `code` `200`, and a `data` object containing `id`, absolute `url`, `content_type`, and `byte_size`. The `url` MUST be an absolute http(s) URL under this application's `/media/{id}` path. The image id MUST be unguessable and MUST NOT be derived from the original filename. A buyer, anonymous caller, or merchant without `product:write` MUST NOT upload. A merchant MUST NOT upload into another merchant's catalog. `GET /media/{id}` MUST continue to return image bytes and MUST NOT use the JSON envelope.

#### Scenario: Owned catalog upload
- **WHEN** a merchant with `product:write` uploads a valid image to their catalog
- **THEN** the HTTP status is `201`, body `code` is `200`, and `data.url` is an absolute media URL for that image

#### Scenario: Buyer cannot upload
- **WHEN** a buyer token calls the upload endpoint
- **THEN** the upload is rejected with body `code` `40300` and no image is stored

#### Scenario: Public media read
- **WHEN** a client fetches the returned media URL
- **THEN** the response body is the image bytes and is not a JSON envelope
