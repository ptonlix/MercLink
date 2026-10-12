## MODIFIED Requirements

### Requirement: Browser page icon
Pages using the root application layout SHALL declare a shared Chengdu panda browser icon in pale cyan, ice white and graphite. The logo before the homepage name SHALL use the same panda artwork and colors. An SVG icon and a multi-size ICO fallback SHALL be available as static application assets without client JavaScript or database access.

#### Scenario: Identify a browser tab
- **WHEN** a reader opens the homepage or a product detail
- **THEN** its HTML declares the shared panda icon and the browser can retrieve both icon formats

#### Scenario: Consistent storefront identity
- **WHEN** the homepage displays the name and logo
- **THEN** its logo matches the browser icon while the existing animated panda above the letters remains available
