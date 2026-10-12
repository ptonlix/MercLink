## Purpose

统一内置店面、授权、账户与接口文档的视觉和可访问交互，并保持默认下载模板与公开事实兼容。

## ADDED Requirements

### Requirement: Consistent presentation across surfaces
The built-in storefront, authorization, account, documentation and recovery pages SHALL share semantic colors, control sizes and focus treatment. Storefront display typography SHALL be distinct from form and documentation typography. Content SHALL remain usable at widths from 320 CSS pixels with no document-level horizontal overflow, and controls SHALL have at least 44 CSS pixels of target height.

#### Scenario: Reader opens a phone-sized page
- **WHEN** a reader opens the product, authorization or documentation page at 390 CSS pixels
- **THEN** content reflows, the primary action remains reachable, and navigation does not cover content

### Requirement: Default templates preserve readable facts
Downloaded default documents SHALL include a viewport declaration and use the same base presentation as built-in pages. Existing product, field, variant and authorization slots SHALL remain compatible. Core facts and native navigation SHALL work without JavaScript, and no inert client-only control SHALL be presented as functional in static templates.

#### Scenario: Static product template is populated
- **WHEN** the existing slot renderer populates the default product document
- **THEN** the cover, name, public fields, price and variants are readable without React hydration

### Requirement: Authorization presentation preserves the journey
Authorization styling SHALL preserve form actions, inputs, captcha ownership and device-code approval semantics. The current step SHALL be identifiable without color alone. Passwords and verification codes SHALL remain browser-only inputs.

#### Scenario: Buyer starts authorization
- **WHEN** a buyer opens the phone step
- **THEN** the current step is visibly named and the existing verification submission remains available
