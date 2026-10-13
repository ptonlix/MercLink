# Spec Delta

## ADDED Requirements

### Requirement: Released non-HTML assets are briefly cacheable
When an active storefront release serves a non-HTML file, the response MUST include `cache-control: public, max-age=600, stale-while-revalidate=86400`, a weak `ETag` derived from that file's object key, and `X-Content-Type-Options: nosniff`. A request with `If-None-Match` matching that validator MUST return `304` without reading the object again. The same URL after a new release MUST use the new object key as its validator. A released file whose content type is `text/html` MUST be treated as HTML even when its path does not end in lowercase `.html`. HTML documents rendered from a release MUST keep `cache-control: no-store` so price, stock, and profile facts are not reused from a previous response.

#### Scenario: Stylesheet can be revalidated
- **WHEN** a client fetches a released stylesheet and then repeats the request with the returned `ETag`
- **THEN** the second response is `304` and the object storage is not read again

#### Scenario: Rendered page is not stored
- **WHEN** a client fetches a released HTML page that includes current product facts
- **THEN** the response is `cache-control: no-store` and contains those current facts

#### Scenario: Uppercase HTML suffix is still rendered
- **WHEN** a released file is named `About.HTML` and its content type is `text/html`
- **THEN** the response is `cache-control: no-store` and is not served as a long-cached static asset

### Requirement: Released text is gzipped when accepted
A released text response whose media type is HTML, CSS, JavaScript, JSON, plain text, or SVG MUST be gzipped when the request `Accept-Encoding` includes gzip and the gzipped body is smaller than the original. The response MUST set `content-encoding: gzip` and `Vary: Accept-Encoding`. Image and font bytes from the release MUST be sent unchanged. A client that does not accept gzip MUST receive the original bytes.

#### Scenario: Script is compressed
- **WHEN** a client requests a released JavaScript file with `Accept-Encoding: gzip`
- **THEN** the response is gzipped and decompresses to the released file bytes

#### Scenario: Image is not compressed
- **WHEN** a client requests a released WebP or PNG with `Accept-Encoding: gzip`
- **THEN** the response has no content encoding and the body is the original file bytes

### Requirement: Bundled Caddy compresses text responses
The production Caddy site MUST compress upstream responses whose `Content-Type` is text, JSON, XML, JavaScript, or SVG when the client accepts gzip or zstd. The match MUST be on the response, not on the request `Content-Type`. WebP, PNG, JPEG, and GIF responses MUST NOT be selected for that compression.

#### Scenario: Browser GET is compressed at the edge
- **WHEN** a browser fetches a released stylesheet and the upstream response is `text/css` without `Content-Encoding`
- **THEN** Caddy may gzip or zstd that response

#### Scenario: Product image is not selected
- **WHEN** the upstream response is `image/webp` or `image/png`
- **THEN** the Caddy encode matcher does not select it
