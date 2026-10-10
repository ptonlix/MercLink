# storefront-skill Specification

## Purpose

告诉商家 Agent：本地预览会填入当前公开事实，但预览和上传都不是激活。

## ADDED Requirements

### Requirement: Skill states preview renders facts without activation
The storefront skill MUST state that local preview reads the published store and published products from the source deployment and fills fact slots, including expanding the product template, before activation. It MUST state that preview is not activation and that the public site does not change until activation is confirmed. It MUST forbid hardcoding a store name, price, or stock. It MUST state that the preview returns 502 when the public source API is unavailable.

#### Scenario: Preview rendering is explicit
- **WHEN** a client fetches `/storefront/skill.md`
- **THEN** the body says local preview fills fact slots before activation and that preview does not activate the release
