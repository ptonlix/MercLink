# Proposal

## Why

商品和规格的 `cover` 只保存调用方自带的字符串。没有上传接口，图片也没有指定存到 S3 或 MinIO。公开页也只把 http(s) 封面渲染成链接，买家看不到图。

## What Changes

- 商家可以用 `product:write` 上传一张图片。字节只写入已配置的 S3 或 MinIO 桶，并返回稳定的本应用公开 URL。
- 商品和规格的 `cover` 仍是可空 URL。上传得到的本应用媒体 URL 可以写入封面；外部 http(s) URL 继续有效。
- **BREAKING**：新写入的 `cover` 只能是空、绝对 http(s) URL，或本商家拥有的媒体 URL。不再接受任意非 URL 字符串。已存的旧值仍可读。
- 公开 `GET /media/{id}` 从对象存储读取字节，不要求登录，也不读本地文件。公开商品页对 http(s) 封面渲染图片，而不只是链接。
- 上传按商家限流。超限返回新错误码 `rate_limited`，不写对象。
- 引入 Redis，但只做上传限流。图片字节不进 Redis，不进 PostgreSQL，也不写本地磁盘。短信限流仍留在 PostgreSQL。
- S3 与 MinIO 共用一个 S3 兼容端口。没有本地目录适配器，也没有磁盘兜底。

## Capabilities

### New Capabilities

- `product-images`: 商家上传到 S3 或 MinIO、公开读取，以及把上传结果或外部 URL 用作商品和规格封面。

### Modified Capabilities

- 无。`openspec/specs` 里还没有已同步的目录或公开页规格；封面写入和公开页展示的行为变化都记在 `product-images`。

## Impact

- 新增商家上传路由，并登记到 `src/shared/api-routes.ts` 和商家 Skill。
- 新增媒体元数据表和迁移；字节不进 PostgreSQL，也不写本地文件。
- 新增 S3 兼容对象存储端口。AWS S3 和 MinIO 都走这一个适配器。
- `cover` 写入校验、公开商品页和 JSON-LD 要能使用本应用媒体 URL。
- **BREAKING**（运行）：`REDIS_URL` 和对象存储端点、区域、桶、访问密钥都必填。缺任一项，或启动时桶不可达，应用拒绝启动。
- 本地 compose 增加 Redis 和 MinIO，只为满足必填依赖。应用代码不在它们缺失时改写本地磁盘。
- `docs/ARCHITECTURE.md` 现在写明不引入 Redis。本变更把这句收窄为：Redis 只承担上传限流；图片只进 S3 或 MinIO。
