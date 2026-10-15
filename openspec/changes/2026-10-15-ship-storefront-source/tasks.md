# Tasks

## 1. 规格

- [x] 1.1 写本变更的提案、设计和 `storefront-release` 规格增量。

## 2. 镜像

- [x] 2.1 runner 在 `/app` 下复制 `storefront/`。`.dockerignore` 不排除该目录，并注明原因。
- [x] 2.2 测试锁住 runner 的复制位置，以及忽略文件没有排除 `storefront/`。

## 3. 检查

- [x] 3.1 跑镜像内容测试和类型检查。不构建部署，也不改线上指针。
