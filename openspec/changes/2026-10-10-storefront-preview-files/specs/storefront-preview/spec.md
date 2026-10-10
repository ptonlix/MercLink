# storefront-preview Specification

## Purpose

随店面源码分发的本地预览只提供静态文件，并把协议路径代理到当前部署。它不是第二套事实渲染器。

## ADDED Requirements

### Requirement: Local preview resolves shipped static files
`preview.mjs` MUST serve `/` from `index.html`, `/products` and `/products/` from `products/index.html`, and a single-segment `/products/{id}` whose id contains no dot from `products/item.html`, when that file exists. Other non-proxy paths MUST try the path, the path plus `.html`, and `path/index.html`, and MUST serve only a regular file inside the static root. A directory MUST NOT be opened as a file. A path containing `..`, a null byte, or a backslash MUST NOT be read. `/products` and `/products/{id}` MUST NOT fall back to `index.html`.

#### Scenario: Product list is a directory
- **WHEN** the static root contains a `products` directory and `products/index.html`
- **THEN** a request for `/products` returns that file and the preview process keeps accepting requests

#### Scenario: Product path is missing
- **WHEN** `products/index.html` is absent
- **THEN** `/products` returns 404 and does not return the home page

### Requirement: Local preview renders facts before activation
This requirement is superseded by `2026-10-10-storefront-preview-render`. The preview MUST fill fact slots from the source deployment before activation, and MUST NOT treat an empty slot as a successful preview when the origin is unavailable.
