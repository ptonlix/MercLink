# Design

## Context

见 `proposal.md`。应用通过 `src/adapters/s3/adapter.ts` 使用 AWS SDK，配置来自 `OBJECT_STORAGE_ENDPOINT`、`OBJECT_STORAGE_REGION`、`OBJECT_STORAGE_BUCKET` 和一对访问密钥。客户端固定 `forcePathStyle: true`。启动时对桶执行 HeadBucket，失败则拒绝启动。公开读取仍由应用从桶取对象，不把桶公开到互联网。

`compose.yaml` 和 `compose.dev.yaml` 现在启动 `quay.io/minio/minio:RELEASE.2025-09-07T16-13-09Z`，用 `MINIO_ROOT_USER` 和 `MINIO_ROOT_PASSWORD` 覆盖应用的对象存储密钥，并用同一镜像里的 `mc` 建桶。健康检查是 `/minio/health/live`。

## Goals / Non-Goals

**Goals:**

- 用一个可匿名拉取的固定 RustFS 镜像替换捆绑的 MinIO。
- 保持应用只认 S3 端点和现有对象存储环境变量。
- 桶在应用接受流量前存在，控制台不对公网开放。

**Non-Goals:**

- 不改上传格式、限流、媒体 URL、支付、授权或 Postgres、Redis。
- 不引入 AIStor，不申请许可证，不把对象存储打进应用镜像。
- 不迁移已有 MinIO 数据卷，也不把单盘部署设计成以后原地扩成多盘。

## Decisions

### 只替换 Compose 里的对象存储服务

应用代码先不改。`OBJECT_STORAGE_*` 仍是唯一配置面。Compose 把 RustFS 的访问密钥映射到这两个密钥字段。服务名使用 `rustfs`，应用端点改为 `http://rustfs:9000`，避免继续把主机名叫 `minio`。

备选是保留服务名 `minio`，少改环境变量。那会让以后的排障继续指向已经删除的镜像，不采用。

### 镜像钉死，先验证能拉取

使用 `rustfs/rustfs` 的明确版本标签，不使用 `latest`。实现时先在目标部署环境执行 `docker pull`。候选标签是官方快速开始里的 `1.0.1`；如果该标签不能匿名拉取，停下来换一个已发布的明确标签，不改成浮动标签。

实现环境已成功匿名拉取 `rustfs/rustfs:1.0.1`，摘要 `sha256:1803faef57627e2d9c2e7d89d655d712ddded5389040054987163043fecb6a3c`。Compose 钉这个标签，不改用其他仓库。

数据目录使用单盘 `/data`。不复制官方示例的四块盘，因为那只是同一台机器上的假多盘，而且单盘以后不能原地扩展。容器运行用户是 `10001:10001`；命名卷在启动前交给这个用户，避免权限失败。新卷名是 `rustfs_data`，不复用 `minio_data`。

### 建桶使用 S3 API，而不是 mc

`minio-init` 删除。新增只跑一次的初始化容器，用 S3 CreateBucket 创建 `OBJECT_STORAGE_BUCKET`。它不依赖 RustFS 镜像里的 `mc`。应用仍在启动时 HeadBucket；桶不可达就拒绝启动。

初始化容器使用已匿名拉取的 `amazon/aws-cli:2.27.49`，执行 `aws s3api create-bucket`。这不是应用的第二套配置，也不进入应用镜像。RustFS 1.0.1 对同一桶重复 CreateBucket 返回成功，因此不需要 `mc mb --ignore-existing`。

健康检查改为 RustFS 的 `http://127.0.0.1:9000/health`。`9001` 控制台不发布到宿主机。

部署密钥名是 `RUSTFS_ACCESS_KEY` 和 `RUSTFS_SECRET_KEY`。Compose 只把它们注入现有的 `OBJECT_STORAGE_ACCESS_KEY_ID` 和 `OBJECT_STORAGE_SECRET_ACCESS_KEY`。已有部署机 `.env` 要改这两个变量名；`tmp/.env` 不进仓库。

### 文档和样例一起改

`.env.example`、README 和 `docs/ARCHITECTURE.md` 不再把本地对象存储写成 MinIO 固定镜像。部署密钥改名为 RustFS 的访问密钥和秘密密钥，仍只放部署机 `.env`。已生成的 `tmp/.env` 不进仓库；实现时只说明部署者要改哪些变量名。

## Risks / Trade-offs

- [目标机器拉不到 `rustfs/rustfs` 的固定标签] → 实现前先 pull。失败就不改 Compose 去指向另一个未验证的仓库。
- [RustFS 不接受现有 path-style 或 HeadBucket] → 停下来，只做让现有四个 S3 操作通过所需的最小适配器调整，不换第二套存储客户端。实现时用现有 AWS SDK 对 `rustfs/rustfs:1.0.1` 完成了 path-style 的 CreateBucket、Put、Get、Delete 和 HeadBucket，适配器未改。
- [单盘以后不能原地扩容] → 接受。一家店的图片以后通过 S3 复制迁移，不承诺扩盘。
- [旧 MinIO 卷被误挂到 RustFS] → 文档写明不支持。新部署使用新的命名卷。

## Migration Plan

1. 在部署机验证固定 RustFS 标签可以匿名拉取。
2. 合并后，新部署使用新的 Compose 和新的空数据卷。不要把旧 `minio_data` 挂给 RustFS。
3. 更新部署机 `.env` 的对象存储密钥名和端点。Postgres、Redis 和应用镜像变量不变。
4. 回滚是改回含 MinIO 的 Compose，并使用独立的数据卷。没有图片数据时不需要导出对象。

## Open Questions

无。镜像仓库、单盘、不迁移旧卷和应用协议都已定。唯一允许在实现时替换的是不能拉取的具体版本标签，且替换结果仍必须是明确版本。
