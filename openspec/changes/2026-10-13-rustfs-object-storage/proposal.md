# Proposal

## Why

部署机已经拉不到仓库钉死的 MinIO 镜像。Docker Hub 删除了 `minio/minio`，Quay 对 `quay.io/minio/minio:RELEASE.2025-09-07T16-13-09Z` 的匿名拉取返回 401。社区版仓库已停止维护，没有可匿名拉取的新官方标签。一家店的图片存储要换成仍能公开拉取、并且兼容现有 S3 客户端的 RustFS。

## What Changes

- 本地和正式 Compose 的对象存储从 MinIO 换成固定版本的 `rustfs/rustfs`。不使用 `latest`，也不改成 AIStor。
- 应用继续只通过现有 S3 适配器访问对象存储。不改上传、公开读取、限流、支付或授权规则。
- 部署用单盘数据目录。控制台端口不对公网开放。建桶不再使用 MinIO 的 `mc`。
- 已有 MinIO 磁盘数据不在本次迁移。这台新部署还没有图片；旧磁盘格式不保证能被 RustFS 直接读取。
- **BREAKING**：已经按旧 Compose 启动过 MinIO 的部署，不能只改镜像名后复用原来的数据卷。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `product-images`: 捆绑的本地对象存储从钉死的 MinIO 镜像改为固定版本的 RustFS。应用仍要求 S3 兼容端点、区域、桶和凭证，桶不可达时拒绝启动，图片仍不写本地磁盘。

## Impact

- `compose.yaml`、`compose.dev.yaml`、`.env.example`、README 和 `docs/ARCHITECTURE.md`。
- 不改 `src/adapters/s3` 的协议，除非固定版本的 RustFS 不能完成现有的 Put、Get、Delete 和 HeadBucket。
- 不新增 npm 依赖，不把对象存储打进应用镜像。Postgres 和 Redis 的固定镜像不变。
