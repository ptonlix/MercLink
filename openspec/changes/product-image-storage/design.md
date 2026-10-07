# Design

## Context

见 `proposal.md`。`cover` 现在是 `products.cover` 和规格 `cover` 上的可空文本，`parseCover` 只检查非空且不超过 2000 字符。公开页只在 `isHttpUrl` 时输出链接，JSON-LD 同样只接受 http(s)。架构要求一个进程、端口隔离外部依赖，并写明不引入 Redis。本变更按提案收窄这句：Redis 只做上传限流。

## Goals / Non-Goals

**Goals:**

- 图片只进入已配置的 S3 或 MinIO，商家 Agent 能上传并公开引用封面。
- 未配置对象存储、桶不可达、上传超限或限流器不可用时，不写对象，也不写本地文件。
- 领域层不依赖对象存储 SDK、Redis 或 Next.js。

**Non-Goals:**

- 不把图片字节放进 Redis、PostgreSQL 或本地磁盘。
- 不提供本地目录适配器，不用它做开发或生产兜底。
- 不迁移短信限流。
- 不做相册、缩略图、图片删除或跨目录复用。
- 不给公开读取加登录或限流。

## Decisions

### 对象存储必填，没有本地兜底

对象存储端口只提供 `put`、`open` 和 `headBucket`。唯一生产适配器使用 AWS SDK `@aws-sdk/client-s3`，通过自定义 endpoint 和 path-style 同时连接 AWS S3 和 MinIO。对象键是图片 id，不使用原始文件名。

必填环境变量：

- `OBJECT_STORAGE_ENDPOINT`
- `OBJECT_STORAGE_REGION`
- `OBJECT_STORAGE_BUCKET`
- `OBJECT_STORAGE_ACCESS_KEY_ID`
- `OBJECT_STORAGE_SECRET_ACCESS_KEY`

任一缺失，`loadEnv` 失败，进程拒绝启动。五项都在时，启动还要 `HeadBucket`。桶不存在或不可达，同样拒绝启动。不读取 `MEDIA_ROOT`，不创建 `data/media`，代码里不注册本地文件适配器。测试只注入内存假端口，这个假实现不进入生产装配。

上传运行中如果对象存储失败，返回 `dependency_unavailable`，不把字节写到磁盘再重试。公开读取只向桶取对象。取不到对象且元数据不存在时返回 404。存储调用失败时返回 `dependency_unavailable`，不回退本地副本。

限流端口按策略占用额度。图片上传使用商家 60 秒 30 次。适配器使用 Redis 有序集合，官方 Node Redis 客户端，不手写协议。若 `redis-rate-limits` 已创建该端口，本变更只增加上传策略，不新建第二个客户端。短信发送计数不在本变更迁移。

先调用限流，通过后再校验签名和大小，通过后再写桶和元数据。任一步失败都不留下可公开读取的对象。元数据插入失败时删除刚写入的对象。

备选是把限流也放进 PostgreSQL。能少一个进程，但提案明确引入 Redis，且上传限流不应和短信计数耦在同一套表锁上。本地目录曾作为无对象存储时的兜底，现已排除。

### Redis 是必填运行依赖

`REDIS_URL` 加入启动必填环境变量，缺少时拒绝启动。`compose.yaml` 增加 Redis，以及 MinIO `RELEASE.2025-10-15T17-29-55Z`，并在启动前创建桶。这只让本地 compose 能填满必填配置。不启动 MinIO 或清空对象存储变量时，应用必须启动失败。不设内存或磁盘假实现作为生产降级。Redis 故障时上传失败关闭，已存图片的 `GET /media/{id}` 不访问 Redis，但仍从对象存储读取。

镜像钉为官方 `redis:8.10.2`。本地 compose 只在应用网络内访问 Redis，不把 6379 发布到宿主机。生产若必须对外暴露，要求密码，且密码不进仓库。

### 元数据

新迁移 `060_product_images.sql`，表 `product_images`：`id`、`merchant_id`、`catalog_id`、`content_type`、`byte_size`、`created_at`。不建 `deleted_at`，本变更不提供删除。`merchant_id` 与目录表一样先不加指向 `merchants` 的外键；`catalog_id` 引用 `catalogs(id)`。id 前缀 `img_`，加入 `src/shared/id.ts`。

### 接口

`POST /api/v1/catalogs/{id}/images`，商家受众，要求 `product:write`，登记到 `apiRoutes`，商家 Skill 写明先上传再把返回的 `url` 写入 `cover`。

`GET /media/{id}` 不是 `/api/v1` 路由，不进买家或商家受众表。响应带存储的图片类型、`nosniff` 和 `inline`。未知 id 为 404。不加入 sitemap。`/media` 不在现有 `disallow` 前缀下，爬虫可以抓取被页面引用的图片，但不提供目录页。

新错误码 `rate_limited`，HTTP 429。不复用 `sms_rate_limited`。

### 封面

写路径把 `cover` 收紧为 null 或绝对 http(s) URL。若 URL 的 origin 和路径属于本应用 `/media/{id}`，则该行必须属于同一商家和同一目录，否则 `not_found`。外部 http(s) URL 原样保存。读路径不改写历史脏值。公开页对 http(s) 封面输出 `img`，alt 为商品名。

### 校验

领域函数只看字节签名和长度：JPEG `FF D8 FF`，PNG `89 50 4E 47`，WebP 为 `RIFF` 加 `WEBP`。上限 5 MiB。不信任客户端 Content-Type。拒绝 SVG。

## Risks / Trade-offs

- [没有对象存储就不能启动] → 这是明确取舍。本地 compose 提供 MinIO；生产必须配置 S3 或 MinIO。不提供磁盘兜底。
- [公开 URL 知道 id 就能读] → id 使用 16 字节随机值；这是商品图，不是私密文件。不提供列表接口。应用代读桶对象，桶本身不必公开。
- [固定引入 Redis，本地和部署都多一个进程] → compose 带上 Redis；启动缺少 `REDIS_URL` 直接失败，避免上传静默不可用。
- [Redis 8 是 RSALv2、SSPL 或 AGPL 三许可] → 只作为独立限流进程使用，不把 Redis 源码编进应用；实施前确认这种部署方式符合项目许可要求。
- [滑动窗口边界和时钟] → 限流测试注入可控时钟和假端口；Redis 适配器用服务器时间，不信客户端时间。
- [旧封面不是 URL] → 只拒绝新写入，读取和公开页保持兼容。

## Migration Plan

追加迁移，不改已有封面列。先部署 Redis 和可达的 S3 或 MinIO 桶，再启动新版本。回滚应用版本后，新表和桶对象可留着；已写入的媒体 URL 在旧版本里仍是普通字符串。回滚不把对象搬到本地磁盘。

## Open Questions

无。相册和缩略图留到后续变更。实施时若 `minio/minio:RELEASE.2025-10-15T17-29-55Z` 拉不下来，停止并更换已发布标签，不得改回本地目录。
