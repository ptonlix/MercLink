# MercLink

给 AI Agent 用的商品与下单服务。商家 Agent 管理目录和商品，买家 Agent 查询已上架商品并完成支付宝支付。

人批准授权，Agent 只拿到短期令牌。长期密钥留在服务端，不放进对话。

## 功能

- 商家可以有多本目录。字段、商品和规格属于目录，不属于商家账号。
- 商家 Agent 通过 HTTP API 定义字段、创建商品和可售规格，并上架或下架。
- 买家 Agent 可以查询已上架商品。下单前，买家在授权页用手机号注册或登录。
- 支付走支付宝。本服务不保存银行卡或支付宝账号密码。
- 公开页面、`/skill.md`、`/merchant/skill.md` 和 `/llms.txt` 给人和 Agent 同一套事实。
- 超级管理员开通和停用商家。商家不能自助注册。

v1 不接其他电商平台，不做购物车、营销页、优惠券、运费或推荐。完整边界见 [docs/PRD.md](docs/PRD.md)。

## 技术栈

| 部分   | 选择                                    |
| ------ | --------------------------------------- |
| 应用   | Next.js 16、TypeScript、一个进程        |
| 数据   | PostgreSQL 18、Drizzle                  |
| 限流   | Redis 8                                 |
| 图片   | S3 兼容存储。本地用 MinIO，不写应用磁盘 |
| 授权   | OAuth 2.1，`node-oidc-provider`         |
| 包管理 | pnpm 12.9.1                             |

实现约束见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

## 要求

- Node.js `>=24.18.0 <25`
- pnpm 12.9.1，通过 Corepack 启用
- Docker 与 Docker Compose v2

## 快速开始

```bash
corepack enable
corepack prepare pnpm@12.9.1 --activate
pnpm install --frozen-lockfile
cp .env.example .env
```

编辑 `.env`。本地依赖的连接信息是：

```bash
DATABASE_URL=postgres://merclink:merclink@127.0.0.1:5432/merclink
REDIS_URL=redis://127.0.0.1:6379
OBJECT_STORAGE_ENDPOINT=http://127.0.0.1:9000
OBJECT_STORAGE_REGION=us-east-1
OBJECT_STORAGE_BUCKET=merclink
OBJECT_STORAGE_ACCESS_KEY_ID=merclink
OBJECT_STORAGE_SECRET_ACCESS_KEY=merclinkminio
APP_BASE_URL=http://127.0.0.1:3000
```

这些值只用于本机。`ADMIN_PHONE`、`ADMIN_PASSWORD` 和 `OAUTH_SIGNING_SECRET` 自己填写。签名密钥可以用：

```bash
openssl rand -base64 32
```

本地开发在 `.env` 增加 `MERCLINK_DEV_STUBS=1`。`pnpm dev` 会把 `NODE_ENV` 设为 `development`，这时阿里云和支付宝变量可以留空：注册不发送短信，验证码固定为 `123456`；下单返回的 `payment.action` 是本机确认页，点确认后订单才变为已支付。`NODE_ENV=production` 时这个开关会让应用拒绝启动。

```bash
docker compose -f compose.dev.yaml up -d
pnpm dev
```

打开 <http://127.0.0.1:3000>。健康检查是 <http://127.0.0.1:3000/api/health>。

如果机器上还有旧的 `merclink` 项目容器，先停掉再启动本地依赖：

```bash
docker compose -p merclink down
```

## 常用入口

| 路径                  | 用途                     |
| --------------------- | ------------------------ |
| `/`                   | 总落地页                 |
| `/products`           | 已上架商品               |
| `/skill.md`           | 买家 Agent 说明          |
| `/merchant/skill.md`  | 商家 Agent 说明          |
| `/llms.txt`           | Agent 发现文件           |
| `/authorize/buyer`    | 买家注册、登录和批准     |
| `/authorize/merchant` | 商家登录和批准           |
| `/admin`              | 超级管理员开通或停用商家 |
| `/api/v1`             | HTTP API                 |
| `/api/health`         | 健康检查                 |

已上架商品可以不登录查询。下单和管理接口使用 `Authorization: Bearer <访问令牌>`。错误体是 `{ "error": "<code>", "message": "<可读说明>" }`。接口清单以 [docs/PRD.md](docs/PRD.md) 第 10 节和两份 Skill 为准。

## 配置

变量名和用途见 [.env.example](.env.example)。不要把真实密钥提交到仓库。`.env` 已被忽略。

缺少任一必填变量，或启动时连不上 Redis 和对象桶，应用拒绝启动。数据库迁移在启动时执行，不在请求里改表。首次启动用 `ADMIN_PHONE` 和 `ADMIN_PASSWORD` 创建唯一超级管理员；已有超管后不再使用这两个值。

日志不记录密码、短信验证码、访问令牌、刷新令牌、支付私钥和对象存储密钥。

## 开发

```bash
pnpm dev              # 本地应用
pnpm run check        # 格式、lint、类型、测试、边界和未使用代码
pnpm test             # 单元测试和集成测试
pnpm run test:acceptance
```

集成测试需要已启动的 Postgres，并导出 `DATABASE_URL`。

`pnpm run check` 是合并前的本地门禁。依赖只用 pnpm 安装，不运行 `npm install` 或 `yarn`。

## 部署

正式环境使用 `compose.yaml`。它包含应用、PostgreSQL、Redis 和 MinIO。数据库、Redis 和对象存储只在 Compose 网络内，数据放在命名卷。应用默认监听 `3000`。

在部署机准备 `.env`，并额外提供：

- `POSTGRES_PASSWORD`
- `REDIS_PASSWORD`
- `MINIO_ROOT_USER`
- `MINIO_ROOT_PASSWORD`

密码使用 URL 安全字符。MinIO 密码至少 8 位。`APP_BASE_URL` 和 `ALIPAY_NOTIFY_URL` 填公网地址。容器内的数据库、Redis 和对象存储地址由 Compose 覆盖，不要写成 `127.0.0.1`。

```bash
docker compose up -d --build
```

公网 HTTPS 由部署机上的反向代理提供。本文件不包含证书或域名配置。

## 目录

```text
src/app            页面和路由
src/domain         账号、目录、商品、订单
src/app-services   用例
src/adapters       支付宝、阿里云、S3、Redis
src/db             表和迁移
docs               需求和架构
compose.dev.yaml   本地 Postgres、Redis、MinIO
compose.yaml       正式环境应用和依赖
```

## 文档

- [产品需求](docs/PRD.md)
- [技术架构](docs/ARCHITECTURE.md)

## 安全

发现密钥泄漏或可利用的漏洞时，不要在公开议题里粘贴密钥、令牌或客户数据。先撤掉已暴露的密钥，再私下联系维护者。

## 贡献

1. 从当前主干拉分支。
2. 保持改动和 [docs/PRD.md](docs/PRD.md) 的范围一致。
3. 提交前运行 `pnpm run check`。
4. 发起 Pull Request，说明行为和验证方式。

## 许可证

仓库尚未添加 `LICENSE`。在选择并加入许可证之前，保留所有权利。
