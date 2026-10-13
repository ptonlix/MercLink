# Tasks

## 1. 规格

- [x] 1.1 核对提案、设计和 `product-images` 增量。验证未把未归档变更写入 `openspec/specs/`，也未要求改支付、授权或上传规则。

## 2. Compose

- [x] 2.1 在实现环境执行 `docker pull rustfs/rustfs:1.0.1`。成功则钉这个标签；失败则改用另一个可匿名拉取的明确版本，并在设计记录里写明。验证没有使用 `latest` 或 MinIO 镜像。
- [x] 2.2 把 `compose.yaml` 和 `compose.dev.yaml` 的 MinIO 服务换成单盘 RustFS。端点使用 `http://rustfs:9000`，健康检查使用 `/health`，不发布 `9001`。验证渲染后的 Compose 不再包含 `quay.io/minio/minio`。
- [x] 2.3 用只跑一次的 S3 CreateBucket 替换 `mc mb`。命名卷在 RustFS 启动前属于 `10001:10001`。验证桶名仍来自 `OBJECT_STORAGE_BUCKET`，默认 `merclink`。
- [x] 2.4 把 Compose 覆盖的访问密钥改为 RustFS 的访问密钥和秘密密钥，并继续注入 `OBJECT_STORAGE_ACCESS_KEY_ID` 和 `OBJECT_STORAGE_SECRET_ACCESS_KEY`。验证应用环境变量名没有新增第二套。

## 3. 文档和样例

- [x] 3.1 更新 `.env.example`、README 和 `docs/ARCHITECTURE.md`。写明固定 RustFS 版本、单盘、控制台不公开，以及旧 MinIO 卷不能原地挂给 RustFS。验证样例文件没有真实密钥。
- [x] 3.2 确认 `src/adapters/s3` 仍使用现有 endpoint、region、path-style 和 HeadBucket。只有固定版本不能完成 Put、Get、Delete 或 HeadBucket 时才做最小调整，并补对应测试。

## 4. 检查

- [x] 4.1 运行受影响的对象存储适配器测试和 `pnpm run typecheck`。验证没有为了通过去改 `openspec/specs/`。
