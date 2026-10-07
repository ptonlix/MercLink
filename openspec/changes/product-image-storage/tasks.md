# Tasks

## 1. 存储与限流端口

- [ ] 1.1 增加 `img_` id、`rate_limited` 错误码，以及必填 `REDIS_URL` 和五项对象存储变量，并验证缺任一项时启动失败、错误码测试仍通过
- [ ] 1.2 用 pnpm 加入官方 `redis` 客户端和 `@aws-sdk/client-s3`，并验证锁文件只新增这两个生产依赖
- [ ] 1.3 实现图片签名和 5 MiB 校验，并验证 JPEG、PNG、WebP 通过，SVG、空文件和超限被拒绝
- [ ] 1.4 实现 S3 兼容对象存储端口，并验证字节只发往配置的桶、启动时 `HeadBucket` 失败会拒绝启动、仓库中不存在本地目录适配器或 `MEDIA_ROOT`
- [ ] 1.5 实现上传限流端口和 Redis 滑动窗口适配器，并验证 60 秒内第 31 次被拒绝、窗口过期后允许、限流器不可用时不调用对象写入

## 2. 数据与上传接口

- [ ] 2.1 添加 `060_product_images.sql` 和 Drizzle 表，并验证迁移可重复应用到测试库、`catalog_id` 有外键、没有 `deleted_at`
- [ ] 2.2 实现 `POST /api/v1/catalogs/{id}/images`，并验证本商家 `product:write` 返回 201 和绝对媒体 URL，买家返回 `forbidden`，他人目录被拒绝
- [ ] 2.3 把上传路由登记到 `apiRoutes` 和商家 Skill，并验证 Skill 路径测试包含该路径且不包含真实令牌

## 3. 封面与公开读取

- [ ] 3.1 收紧商品和规格 `cover` 写入，并验证外部 http(s) URL 和同目录媒体 URL 可写，非 URL 与他人媒体 URL 被拒绝，已存旧值仍可读
- [ ] 3.2 实现 `GET /media/{id}`，并验证匿名读取返回原字节、正确类型和 `nosniff`，未知 id 为 404，且不访问 Redis
- [ ] 3.3 公开商品页对 http(s) 封面渲染 `img`，并验证 JSON-LD `image` 与 `src` 相同，空封面没有 `img`，sitemap 不含媒体 URL

## 4. 运行与架构说明

- [ ] 4.1 在 `compose.yaml` 增加不发布端口的 `redis:8.10.2` 和 MinIO `RELEASE.2025-10-15T17-29-55Z`，更新 `.env.example` 和 `docs/ARCHITECTURE.md`，并验证架构文档写明图片只进 S3 或 MinIO、没有本地兜底
- [ ] 4.2 运行目录、公开页和共享契约相关测试，并验证短信限流用例仍使用原错误码、领域层不引用 Redis 或对象存储 SDK、生产装配不注册本地文件存储
