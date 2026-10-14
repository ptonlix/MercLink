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

| 部分   | 选择                                             |
| ------ | ------------------------------------------------ |
| 应用   | Next.js 16、TypeScript、一个进程                 |
| 数据   | PostgreSQL 18、Drizzle                           |
| 限流   | Redis 8。只记次数，不做缓存                      |
| 图片   | S3 兼容存储。本地用固定版本 RustFS，不写应用磁盘 |
| 授权   | OAuth 2.1 设备码，`node-oidc-provider`           |
| 包管理 | pnpm 12.9.1                                      |

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

| 路径                  | 谁用        | 用途                           |
| --------------------- | ----------- | ------------------------------ |
| `/`                   | 访客        | 这一家店的落地页               |
| `/products`           | 访客、Agent | 已上架商品                     |
| `/skill.md`           | 用户 Agent  | 默认只查商品。开启买入后才下单 |
| `/merchant/skill.md`  | 商家 Agent  | 怎么管目录和商品               |
| `/llms.txt`           | Agent       | 发现上述入口                   |
| `/oauth/device/auth`  | Agent       | 申请设备码                     |
| `/authorize/buyer`    | 买家        | 注册、登录、批准               |
| `/authorize/merchant` | 商家        | 登录、批准。没有注册           |
| `/admin`              | 店主        | 修改店主密码                   |
| `/interfaces`         | 人          | 接口文档。默认展示第一条接口   |
| `/api/v1`             | Agent、脚本 | 机器接口前缀，不是文档页       |
| `/api/health`         | 部署检查    | 健康检查                       |

查已上架商品不需要登录。下单和管理接口使用 `Authorization: Bearer <访问令牌>`。错误体是 `{ "code", "message", "data", "timestamp", "request_id" }`。路径以 `src/shared/api-routes.ts` 为准。公开字段页展示字段、认证和权限；Skill 必须与它对齐，不能另写一份覆盖它的协议。

## 配置

变量名和用途见 [.env.example](.env.example)。不要把真实密钥提交到仓库。`.env` 已被忽略。

缺少始终必填的变量，或启动时连不上 Redis 和对象桶，应用拒绝启动。`MERCLINK_PURCHASE` 默认关闭。关闭时不必填写验证码、短信和支付商户密钥。需要下单的部署必须设 `MERCLINK_PURCHASE=1`，并填写对应厂商密钥。数据库迁移在启动时执行，不在请求里改表。首次启动用 `ADMIN_PHONE` 和 `ADMIN_PASSWORD` 创建唯一超级管理员；已有超管后不再使用这两个值。

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

正式环境使用 `compose.yaml`。它包含应用、PostgreSQL、Redis 和 RustFS。设置 `COMPOSE_PROFILES=caddy` 后还会启动 Caddy。应用使用已发布镜像，不在部署机编译。数据库、Redis 和对象存储只在 Compose 网络内，数据放在命名卷，并仍用 Compose 里的固定镜像。对象存储镜像是单盘 `rustfs/rustfs:1.0.1`，不使用 `latest`。控制台端口 `9001` 不发布，图片仍由应用的媒体路由提供。应用默认监听 `3000`。

新机器可以一条命令安装。脚本会在这台机器的 `/opt/merclink` 写下配置和密码，拉取已经发布的镜像并启动。它不会在机器上编译，也不会把域名或密码写进仓库。

```bash
curl -fsSL -o /tmp/merclink-install.sh https://github.com/ptonlix/MercLink/releases/latest/download/install.sh && bash /tmp/merclink-install.sh
```

这条地址始终是当前正式版，不会装到预发布版。脚本把应用镜像写成 `merclink:latest`，不用填写版本号，拉取的就是当前最新正式版。域名要先解析到这台机器，并放行 80 和 443 端口。如果这两个端口已被占用，或机器上还没有 Docker，脚本会停下来，不会自动安装软件，也不会关掉现有网站。

已经安装过就不要再跑上面的命令。它会因为已有配置而停止，这是为了避免覆盖密码。写出 `.env` 之前按 Ctrl+C，不会留下配置。写出之后再取消，配置和数据都保留，不要手工删除 `.env`。以后要换成更新的正式版，再执行升级。升级会重新拉取 `latest`，不重新生成密码。升级没有完成或中途取消时，会把 `compose.yaml` 和版本号还原；已经换成新镜像的容器不会自动退回。

```bash
curl -fsSL -o /tmp/merclink-install.sh https://github.com/ptonlix/MercLink/releases/latest/download/install.sh && bash /tmp/merclink-install.sh upgrade
```

版本 tag 由 GitHub Actions 推送镜像。仓库名是 `docker.io/${DOCKERHUB_USERNAME}/merclink`。用户名是 Actions variable `DOCKERHUB_USERNAME`，令牌是 secret `DOCKERHUB_TOKEN`。不要把真实用户名或令牌写进仓库。正式 tag `v1.2.3` 推 `1.2.3` 和 `latest`。预发布 tag 如 `v1.2.3-rc.1` 只推 `1.2.3-rc.1`，不移动 `latest`。`latest` 会被下一个正式版覆盖，不能当作可逆的回滚点。生产回滚把 `MERCLINK_IMAGE` 改回旧的版本号标签，再执行下面的命令。

在部署机准备 `.env`，并额外提供：

- `MERCLINK_IMAGE`，例如 `docker.io/<DOCKERHUB_USERNAME>/merclink:1.2.3`
- `POSTGRES_PASSWORD`
- `REDIS_PASSWORD`
- `RUSTFS_ACCESS_KEY`
- `RUSTFS_SECRET_KEY`

已有部署要把 `.env` 里的 `MINIO_ROOT_USER` 和 `MINIO_ROOT_PASSWORD` 改成这两个名字。Compose 会把它们注入应用已有的 `OBJECT_STORAGE_ACCESS_KEY_ID` 和 `OBJECT_STORAGE_SECRET_ACCESS_KEY`，不要再加一套对象存储变量。密码使用 URL 安全字符。`APP_BASE_URL` 填公网地址。只有 `MERCLINK_PURCHASE=1` 时，才把支付通知地址填成同一公网地址。容器内的数据库、Redis 和对象存储地址由 Compose 覆盖，不要写成 `127.0.0.1`。

不要把旧的 `minio_data` 卷挂给 `rustfs`。旧卷不是受支持的迁移。没有图片的新部署使用新的空卷 `rustfs_data`。单盘以后不能原地扩成多盘。

```bash
docker compose pull && docker compose up -d
```

本地没有远程镜像、需要在本机构建应用时，使用明确的本地命令。这不是正式部署：

```bash
docker compose -f compose.yaml -f compose.build.yaml up -d --build
```

公网 HTTPS 由 `compose.yaml` 的 Caddy 提供。部署机 `.env` 设置 `COMPOSE_PROFILES=caddy`、`APP_DOMAIN` 和 `ACME_EMAIL`，并把 `APP_BIND` 设为 `127.0.0.1`。`APP_BASE_URL` 填 `https://` 加同一个主机名。域名要先解析到这台机器，安全组放行 TCP 80 和 443。证书由 Caddy 向 Let's Encrypt 申请并自动续期，保存在 `caddy_data` 卷，不写进仓库。Caddy 只压缩文本和 SVG，不压缩已经是 WebP 或 PNG 的商品图。未设置该 profile 时不启动 Caddy。可选 `APEX_DOMAIN` 也会拿到证书，但只 301 到 `https://APP_DOMAIN`，避免授权和支付通知落到另一个主机。

## 目录

```text
src/app            页面和路由
src/domain         账号、目录、商品、订单规则
src/app-services   用例
src/adapters       支付宝、阿里云、S3、Redis
src/db             表和迁移
docs               需求和架构
compose.dev.yaml   本地 Postgres、Redis、RustFS
compose.yaml       正式环境。应用拉已发布镜像，可选 Caddy
compose.build.yaml 仅本地构建应用镜像
scripts/install.sh 正式版一键安装。仓库里不带镜像用户名
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
