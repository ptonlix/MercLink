# Spec Delta

## ADDED Requirements

### Requirement: Public media is cacheable by id
A successful `GET /media/{id}` MUST include `cache-control: public, max-age=31536000, immutable` and a weak `ETag` derived from the image id. The body MUST remain the original stored bytes. A later request for that same id with a matching `If-None-Match` MUST return `304` and MUST NOT read the object again. An unknown id MUST still return `404`, including when the request carries `If-None-Match: *` or any other validator.

#### Scenario: Repeat read skips object storage
- **WHEN** an anonymous client fetches a stored media URL and repeats the request with the returned `ETag`
- **THEN** the second response is `304` and the stored bytes are not read again

#### Scenario: Unknown id stays private
- **WHEN** an anonymous client requests an id that was never stored and sends `If-None-Match: *`
- **THEN** the response is `404` and does not include another image id
