# MercLink

在 AI 时代，让天下没有难做的生意

帮中小商家做自己的店，并让各种 Agent 直接找到商品、完成购买。

## 这是什么

一家店，一套 HTTP API。商家用自己的 Agent 维护商品，买家用自己的 Agent 查询并下单。人在浏览器里批准授权，Agent 不保管密码。

公开页面、两份 Skill 和 API 说的是同一套事实。Agent 不直连数据库、Redis、对象存储或支付宝。

## 谁做什么

| 角色       | 做什么                                       | 不做什么                             |
| ---------- | -------------------------------------------- | ------------------------------------ |
| 商家 Agent | 建目录、定义字段、创建商品和规格、上架或下架 | 不能再开一家店，不能把订单标成已支付 |
| 买家 Agent | 查已上架商品，按规格下一行订单，查支付结果   | 不能改商品，不能自己传价格           |
| 付款人     | 在支付宝完成支付                             | 不把支付宝密码交给 Agent             |
| 店主       | 改密码，并在授权页批准商家 Agent             | 不在管理页改商品，也不能再开一家店   |

字段、商品和规格属于目录，不属于商家账号。一家商家可以有多本目录。

v1 不接其他电商平台，不做购物车、营销页、优惠券、运费或推荐。完整边界见 [docs/PRD.md](docs/PRD.md)。

## 授权和支付

Agent 用设备码让用户在自己的浏览器里登录并批准，然后只拿到短期访问令牌和可轮换的刷新令牌。不要向用户索要密码、短信验证码或 API Key，也不要把令牌贴进对话。

API Key 不是 Agent 的登录方式。它只给没有浏览器的服务器脚本使用，登录后在账号页创建。授权页不会发放。

支付走支付宝。电脑上打开收银台扫码；手机上的 Agent 第一次下单要传 `payment_channel: "mobile"`。打开支付链接不等于成功，只有订单状态 `paid` 才算付完。本服务不保存银行卡或支付宝账号密码。

## 技术栈

| 部分   | 选择                                    |
| ------ | --------------------------------------- |
| 应用   | Next.js 16、TypeScript、一个进程        |
| 数据   | PostgreSQL 18、Drizzle                  |
| 限流   | Redis 8。只记次数，不做缓存             |
| 图片   | S3 兼容存储。本地用 MinIO，不写应用磁盘 |
| 授权   | OAuth 2.1 设备码，`node-oidc-provider`  |
| 包管理 | pnpm 12.9.1                             |

实现约束见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。人和 AI Coding 助手改代码前先读 [AGENTS.md](AGENTS.md)。

## 要求

- Node.js `>=24.18.0 <25`
- pnpm 12.9.1，通过 Corepack 启用
- Docker 与 Docker Compose v2

## 本地运行

```bash
corepack enable
corepack prepare pnpm@12.9.1 --activate
pnpm install --frozen-lockfile
cp .env.example .env
```

本地依赖使用这些地址。只用于本机，不要拿去当生产配置：

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

`ADMIN_PHONE`、`ADMIN_PASSWORD` 和 `OAUTH_SIGNING_SECRET` 自己填写。签名密钥可以这样生成：

```bash
openssl rand -base64 32
```

在 `.env` 加上 `MERCLINK_DEV_STUBS=1` 后再启动。`pnpm dev` 会把 `NODE_ENV` 设为 `development`，这时阿里云和支付宝变量可以留空：注册不发短信，验证码固定为 `123456`；支付链接指向本机确认页，点确认后订单才变为已支付。`NODE_ENV=production` 时这个开关会让应用拒绝启动。

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

| 路径                  | 谁用        | 用途                     |
| --------------------- | ----------- | ------------------------ |
| `/`                   | 访客        | 这一家店的落地页         |
| `/products`           | 访客、Agent | 已上架商品               |
| `/skill.md`           | 买家 Agent  | 怎么查商品、下单、查支付 |
| `/merchant/skill.md`  | 商家 Agent  | 怎么管目录和商品         |
| `/llms.txt`           | Agent       | 发现上述入口             |
| `/oauth/device/auth`  | Agent       | 申请设备码               |
| `/authorize/buyer`    | 买家        | 注册、登录、批准         |
| `/authorize/merchant` | 商家        | 登录、批准。没有注册     |
| `/admin`              | 店主        | 修改店主密码             |
| `/api/v1`             | Agent、脚本 | HTTP API                 |
| `/api/health`         | 部署检查    | 健康检查                 |

查已上架商品不需要登录。下单和管理接口使用 `Authorization: Bearer <访问令牌>`。错误体是 `{ "error": "<code>", "message": "<可读说明>" }`。路径以 `src/shared/api-routes.ts` 为准，说明以两份 Skill 为准。

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
src/domain         账号、目录、商品、订单规则
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
- [AI 开发规范](AGENTS.md)

## 安全

发现密钥泄漏或可利用的漏洞时，不要在公开议题里粘贴密钥、令牌或客户数据。先撤掉已暴露的密钥，再私下联系维护者。

## 贡献

1. 从当前主干拉分支。
2. 保持改动和 [docs/PRD.md](docs/PRD.md) 的范围一致。
3. 提交前运行 `pnpm run check`。
4. 发起 Pull Request，说明行为和验证方式。

## 许可证

[Apache License 2.0](LICENSE)。
