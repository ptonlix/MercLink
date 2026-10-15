# Spec Delta

## ADDED Requirements

### Requirement: Production image ships rendered starter fragments

Before any release is accepted, packing the shipped source MUST include the current default pages and stylesheet for the process purchase mode. The production runner MUST NOT spawn the starter renderer or load the TypeScript compiler to produce those pages. The Docker build MUST copy `scripts/render-starter.mjs` into the build stage only after the application build, and MUST NOT copy that script, the TypeScript compiler, or the template sources into the runner. In that build stage the renderer MUST run twice, once with `MERCLINK_PURCHASE=0` and once with `MERCLINK_PURCHASE=1`. Those assignments MUST belong only to that build command and MUST NOT be image `ENV` or `ARG` values. The build MUST combine both results into `storefront-starter.json` and MUST fail when either payload lacks a non-empty string for `index.html`, `products/index.html`, `products/item.html`, `account/buyer.html`, `account/merchant.html`, or `pay/result.html`. The runner MUST copy that JSON into the working directory, along with `src/app/globals.css`, `src/public-discovery/public.css`, and `src/app/authorize/authorize.css`, explicitly rather than by standalone file tracing.

When `scripts/render-starter.mjs` is in the working directory, packing MUST spawn that script and MUST ignore `storefront-starter.json`. When the script is absent, packing MUST read `storefront-starter.json` and MUST choose the `0` or `1` payload with `currentPurchaseEnabled()`, without a second implementation of the `0` and `1` rules. The loaded payloads MUST be cached per enabled value, so clearing the purchase-mode cache and changing the environment selects the other payload. An incomplete payload MUST throw, and the source download MUST still return `50301` instead of a partial archive.

#### Scenario: Image contains both purchase payloads

- **WHEN** the production image is built from the repository Dockerfile
- **THEN** the build stage copies `scripts/render-starter.mjs` after the application build, renders both `MERCLINK_PURCHASE=0` and `MERCLINK_PURCHASE=1` into `storefront-starter.json`, and the runner copies that file into the `/app` workdir along with the three stylesheets, without copying the renderer script

#### Scenario: First download selects the payload for the process purchase mode

- **WHEN** no storefront release has been accepted, the working directory has no renderer script, and `storefront-starter.json` contains both payloads
- **THEN** the source archive uses the payload selected by `currentPurchaseEnabled()` and does not execute `scripts/render-starter.mjs`

#### Scenario: A present renderer wins over a baked file

- **WHEN** the working directory contains both `scripts/render-starter.mjs` and `storefront-starter.json`
- **THEN** packing spawns the script and does not use the baked file

#### Scenario: An incomplete baked payload fails the download

- **WHEN** the renderer script is absent and either baked payload is missing a non-empty page
- **THEN** packing throws and the source download returns `50301`
