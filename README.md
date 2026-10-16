<div align="center">

<img src="docs/images/hero.png" alt="MercLink：在 AI 时代，让天下没有难做的生意" width="100%" />

<h1>MercLink</h1>

<p><strong>在 AI 时代，让天下没有难做的生意</strong></p>

<p>帮中小商家做自己的店，并让各种 Agent 直接找到商品、完成购买。</p>

<p>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/ptonlix/MercLink?color=blue" alt="License" /></a>
  <a href="https://github.com/ptonlix/MercLink/releases/latest"><img src="https://img.shields.io/github/v/release/ptonlix/MercLink?sort=semver" alt="Release" /></a>
  <a href="https://github.com/ptonlix/MercLink/actions/workflows/ci.yml"><img src="https://github.com/ptonlix/MercLink/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <img src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/Node.js-24-339933?logo=nodedotjs&logoColor=white" alt="Node.js 24" />
  <img src="https://img.shields.io/badge/PostgreSQL-18-4169E1?logo=postgresql&logoColor=white" alt="PostgreSQL 18" />
</p>

<p>
  <a href="#-快速开始">快速开始</a> ·
  <a href="#-案例">案例</a> ·
  <a href="#-架构">架构</a> ·
  <a href="#-agent-入口">Agent 入口</a> ·
  <a href="#-文档">文档</a> ·
  <a href="README_EN.md">English</a>
</p>

</div>

---

## 💡 这是什么

MercLink 是一个**给 AI Agent 用的单店电商服务**：一家店，一套 HTTP API。

- **商家**把 `/merchant/skill.md` 交给自己的 Agent，用 API 建目录、定义字段、创建商品和规格、上下架、发布店铺介绍。
- **买家**的 Agent 读 `/skill.md` 查询已上架商品；部署开启买入后，还能按规格下单、查询支付结果。
- **店面**也交给 Agent：读 `/storefront/skill.md`，下载起始源码、改版、验收、上传、确认激活，就能换成自己的品牌页面。

人只在浏览器里登录并批准授权，Agent 不保管密码。公开页面、三份 Skill 和 API 说的是同一套事实；Agent 不直连数据库、Redis、对象存储或支付宝。

> 一句话：把一家小店变成 Agent 读得懂、能操作、能下单的网站，同时仍然是一个给人看的漂亮店面。

## ✨ 特性

**MercLink 完全 AI Native：Agent 是一等用户。开店、上架、改版、下单都由 Agent 通过公开文档和 HTTP API 完成，人只需要在浏览器里登录并点一次「批准」。**

- **Agent 就是操作界面**：没有给人点的商品后台。商家、买家、店面三类 Agent 分别读 `/merchant/skill.md`、`/skill.md`、`/storefront/skill.md`，用 API 建目录、定义字段、上下架、发布店铺介绍、下单和查单；管理页只用来改店主密码和批准店面重置。
- **自描述、可发现**：`/llms.txt` 是给 Agent 的总入口，列出三份 Skill、Markdown 页面、接口文档和 API 根地址。Skill 与 `/interfaces` 共用 [`src/shared/api-routes.ts`](src/shared/api-routes.ts) 这一份路由表，测试保证文档里的路径与代码一致。
- **为 Agent 设计的登录**：OAuth 2.1 设备码（基于 `oidc-provider`）。Agent 把短码交给人，人在自己的浏览器批准；Agent 拿到约 15 分钟的访问令牌和一次性轮换的刷新令牌，从不接触密码、短信验证码或 API Key。
- **Agent 读得懂的响应**：所有 `/api/v1` 响应都是统一的 `{ code, message, data, timestamp, request_id }` 外壳和数字错误码，价格一律整数分；页面有服务端生成的 Markdown 版本（`/index.md`、`/products.md`、`/products/{id}.md`），请求头 `Accept: text/markdown` 时自动返回。
- **Agent 可改版的店面**：Agent 下载起始源码，改 HTML/CSS，用 `node preview.mjs` 预览、`node accept.mjs` 验收，再上传并以 `{"confirm": true}` 激活，可一键回滚。店名、价格、库存、执照等事实用 `<merclink-slot>` 槽位由服务端每次渲染，JSON-LD 由服务端注入。
- **灵活的商品模型**：多本目录、目录内自定义字段（文本、数字、布尔、单选），必填等破坏性字段变更先预览再确认；规格轴 + 只创建实际出售的组合。
- **店铺介绍**：整店一份，包括展示名、简介、Logo、区域、地址、客服二维码与营业执照，可经 `GET /api/v1/store` 公开读取。
- **可选买入**：默认只开放查询。设 `MERCLINK_PURCHASE=1` 后开启买家手机号注册（阿里云验证码 2.0 + 短信）、单行订单、支付宝电脑 / 手机支付或易支付；只有订单状态 `paid` 才算支付成功，超时未付订单自动关闭。
- **对搜索引擎友好**：服务端生成 `sitemap.xml`、`robots.txt` 和 JSON-LD。
- **一条命令部署**：单进程 Next.js 镜像 + Docker Compose（PostgreSQL 18、Redis 8、RustFS），可选 Caddy 自动 HTTPS；安装 / 升级脚本中途取消会还原。

## 🛒 案例

两家已经上线的 MercLink 店铺。它们跑的是同一套服务，都由 Agent 只读公开 Skill 完成配置和店面定制，没有改服务端代码。

<table>
  <tr>
    <th width="50%"><a href="https://txpearl.cn">童心珠宝 · txpearl.cn</a></th>
    <th width="50%"><a href="https://www.eileenpeng.com">Chengdu Tour · eileenpeng.com</a></th>
  </tr>
  <tr>
    <td><a href="https://txpearl.cn"><img src="docs/images/showcase-txpearl-desktop.webp" alt="童心珠宝首页（电脑）" /></a></td>
    <td><a href="https://www.eileenpeng.com"><img src="docs/images/showcase-eileenpeng-desktop.webp" alt="Chengdu Tour 首页（电脑）" /></a></td>
  </tr>
  <tr>
    <td>北海珍珠首饰零售。中文店面、深海蓝 + 金色品牌页，6 款商品按「珠径」规格定价，配齐店铺介绍、客服与营业执照，并完成百度 / Bing / Google 站点验证。</td>
    <td>面向海外游客的成都本地小团游。英文店面、深色 3D 卡片轮播，卖的是导览体验而不是实物，说明 MercLink 同样适用于服务类商品。</td>
  </tr>
  <tr>
    <td align="center"><img src="docs/images/showcase-txpearl-mobile.webp" alt="童心珠宝首页（手机）" width="200" /></td>
    <td align="center"><img src="docs/images/showcase-eileenpeng-mobile.webp" alt="Chengdu Tour 首页（手机）" width="200" /></td>
  </tr>
  <tr>
    <td align="center"><a href="docs/cases/txpearl.md">📖 完整上线过程</a></td>
    <td align="center"><a href="docs/cases/eileenpeng.md">📖 案例说明</a></td>
  </tr>
</table>

想看一家 MercLink 店给 Agent 的视角，打开任意一家的 `/llms.txt`，例如 <https://txpearl.cn/llms.txt>。

## 🚀 快速开始

### 📦 方式一：一键部署到服务器

前提：机器已安装 Docker 与 Docker Compose v2，域名已解析到这台机器，并放行 80 和 443 端口。

```bash
curl -fsSL -o /tmp/merclink-install.sh https://github.com/ptonlix/MercLink/releases/latest/download/install.sh && bash /tmp/merclink-install.sh
```

脚本会在 `/opt/merclink` 写下配置和密码，拉取最新正式版镜像并启动，不在机器上编译，也不会把域名或密码写进仓库。端口被占用或缺少 Docker 时会直接停下，不会自动安装软件或关掉现有网站。

以后升级到新的正式版（不会重新生成密码）：

```bash
curl -fsSL -o /tmp/merclink-install.sh https://github.com/ptonlix/MercLink/releases/latest/download/install.sh && bash /tmp/merclink-install.sh upgrade
```

部署完成后，把 `https://<你的域名>/merchant/skill.md` 交给你的 Agent，让它开始上架商品。

### 💻 方式二：本地开发

环境要求：

- Node.js `>=24.18.0 <25`
- pnpm 12.9.1（通过 Corepack 启用）
- Docker 与 Docker Compose v2

```bash
git clone https://github.com/ptonlix/MercLink.git
cd MercLink
corepack enable
corepack prepare pnpm@12.9.1 --activate
pnpm install --frozen-lockfile
cp .env.example .env
```

在 `.env` 填入本地依赖地址（只用于本机，不要拿去当生产配置）：

```bash
DATABASE_URL=postgres://merclink:merclink@127.0.0.1:5432/merclink
REDIS_URL=redis://127.0.0.1:6379
OBJECT_STORAGE_ENDPOINT=http://127.0.0.1:9000
OBJECT_STORAGE_REGION=us-east-1
OBJECT_STORAGE_BUCKET=merclink
OBJECT_STORAGE_ACCESS_KEY_ID=merclink
OBJECT_STORAGE_SECRET_ACCESS_KEY=merclinkminio
APP_BASE_URL=http://127.0.0.1:3000
MERCLINK_DEV_STUBS=1
```

再自己填写 `ADMIN_PHONE`、`ADMIN_PASSWORD` 和 `OAUTH_SIGNING_SECRET`。签名密钥可以这样生成：

```bash
openssl rand -base64 32
```

启动本地依赖（PostgreSQL、Redis、RustFS）和应用：

```bash
docker compose -f compose.dev.yaml up -d
pnpm dev
```

打开 <http://127.0.0.1:3000>，健康检查在 <http://127.0.0.1:3000/api/health>。

> [!TIP]
> `MERCLINK_DEV_STUBS=1` 只在 `pnpm dev`（`NODE_ENV=development`）下生效：阿里云和支付宝变量可以留空，注册不发短信、验证码固定为 `123456`，支付链接指向本机确认页。`NODE_ENV=production` 时设置它会让应用拒绝启动。
>
> 如果机器上还有旧的 `merclink` 项目容器，先执行 `docker compose -p merclink down` 再启动本地依赖。

## 🔧 配置

完整变量名和说明见 [`.env.example`](.env.example)。不要把真实密钥提交到仓库，`.env` 已被忽略。

| 变量                                                           | 说明                                                                  |
| -------------------------------------------------------------- | --------------------------------------------------------------------- |
| `DATABASE_URL`                                                 | PostgreSQL 连接串。数据库迁移在启动时执行                             |
| `REDIS_URL`                                                    | Redis 连接串。只做短信和上传限流计数，缺少时拒绝启动                  |
| `OBJECT_STORAGE_*`                                             | S3 兼容对象存储（端点、区域、桶、密钥）。启动时检查桶是否可达         |
| `APP_BASE_URL`                                                 | 本应用的公开绝对地址，用于授权元数据和页面绝对链接                    |
| `ADMIN_PHONE` / `ADMIN_PASSWORD`                               | 首次启动时创建唯一店主（超级管理员）。已有店主后不再使用              |
| `OAUTH_SIGNING_SECRET`                                         | 授权服务签名和登录会话的密钥                                          |
| `MERCLINK_PURCHASE`                                            | 买入开关，默认关闭。设为 `1` 才开启买家注册、短信、图形验证和支付下单 |
| `MERCLINK_PAYMENT_PROVIDER`                                    | `alipay`（默认）或 `easypay`                                          |
| `ALIYUN_CAPTCHA_*` / `ALIYUN_SMS_*` / `ALIPAY_*` / `EASYPAY_*` | 买入开启时才需要的验证码、短信和支付商户配置                          |
| `MERCLINK_DEV_STUBS`                                           | 仅本地开发：模拟验证码、短信和支付                                    |

缺少始终必填的变量，或启动时连不上 Redis 和对象桶，应用会拒绝启动。日志不记录密码、短信验证码、访问令牌、刷新令牌、支付私钥和对象存储密钥。

## 🧱 架构

<p align="center">
  <img src="docs/images/architecture.png" alt="MercLink 系统架构：Agent 用设备码换取令牌后调用 HTTP API，人在浏览器批准授权和浏览店面；单个 Next.js 进程使用 PostgreSQL、Redis 和 RustFS，开启买入时对接支付、验证码和短信" width="100%" />
</p>

- **一个进程**：页面、API、授权和支付通知都在同一个 Next.js 应用里，不拆微服务，不引入队列。
- **分层**：`app` → `app-services` → `domain`；领域层是纯 TypeScript，外部服务都经 `ports` / `adapters` 接入，由 `pnpm run boundaries` 检查。
- **一件事一个事务**：下单扣库存、支付通知改状态、破坏性字段变更都在单个数据库事务里完成。

| 角色       | 做什么                                       | 不做什么                                |
| ---------- | -------------------------------------------- | --------------------------------------- |
| 商家 Agent | 建目录、定义字段、创建商品和规格、上架或下架 | 不能再开一家店，不能把订单标成已支付    |
| 买家 Agent | 查已上架商品，按规格下一行订单，查支付结果   | 不能改商品，不能自己传价格              |
| 店面 Agent | 下载、修改、上传并激活给人看的店面页面       | 不能覆盖 `/api`、授权、Skill 等保留路径 |
| 店主       | 改密码，在授权页批准 Agent，批准店面重置     | 不在管理页改商品，也不能再开一家店      |

Mermaid 版系统总览图、分层和关键流程见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#系统总览图)。

## 🤖 Agent 入口

| 路径                   | 谁用        | 用途                                           |
| ---------------------- | ----------- | ---------------------------------------------- |
| `/llms.txt`            | Agent       | 发现下面所有入口                               |
| `/skill.md`            | 用户 Agent  | 查询已上架商品；开启买入后下单、查订单         |
| `/merchant/skill.md`   | 商家 Agent  | 目录、字段、商品、规格、封面、上下架、店铺介绍 |
| `/storefront/skill.md` | 店面 Agent  | 下载源码、预览、验收、上传、激活、回滚店面     |
| `/interfaces`          | 人          | 接口文档：已登记路径、字段、认证和权限         |
| `/api/v1`              | Agent、脚本 | 机器接口前缀，不是文档页                       |
| `/api/v1/store`        | 任何人      | 已发布的店铺介绍（JSON，无需令牌）             |
| `/`、`/products`       | 访客        | 店铺落地页和商品列表                           |
| `/oauth/device/auth`   | Agent       | 申请设备码                                     |
| `/authorize/buyer`     | 买家        | 注册、登录、批准                               |
| `/authorize/merchant`  | 店主        | 登录、批准（没有注册）                         |
| `/admin`               | 店主        | 修改店主密码、批准店面重置                     |
| `/api/health`          | 部署检查    | 健康检查                                       |

查已上架商品不需要登录；下单和管理接口使用 `Authorization: Bearer <访问令牌>`。所有 `/api/v1` JSON 响应都是 `{ "code", "message", "data", "timestamp", "request_id" }`。路径以 [`src/shared/api-routes.ts`](src/shared/api-routes.ts) 为准。

API Key 不是 Agent 的登录方式，只给没有浏览器的服务器脚本使用，登录后在账号页创建。

## 📁 项目结构

```text
MercLink/
├── src/
│   ├── app/              # Next.js 页面和路由（/api/v1、/oauth、/authorize、/admin……）
│   ├── app-services/     # 用例：一个用例一个文件，负责事务和编排
│   ├── domain/           # 纯业务规则：账号、授权、目录、交易、店面
│   ├── ports/            # 端口接口：支付、短信、验证码、对象存储、限流、时钟
│   ├── adapters/         # 支付宝、易支付、阿里云、S3、Redis 实现
│   ├── agent-docs/       # 三份 Skill 正文，测试核对其中的路径
│   ├── public-discovery/ # llms.txt、Markdown 页面、接口文档、起始店面
│   ├── db/               # Drizzle schema 和 SQL 迁移
│   └── shared/           # 路由注册表、环境变量、错误码、响应外壳
├── storefront/           # 随部署分发的店面起始源码（预览、验收脚本）
├── tests/                # 验收测试和 API 冒烟测试
├── openspec/             # 行为规格与变更记录
├── docs/                 # 产品需求、技术架构、前端对接指南、案例
├── scripts/              # 一键安装脚本、起始页渲染
├── compose.yaml          # 正式环境：应用 + PostgreSQL + Redis + RustFS（可选 Caddy）
├── compose.dev.yaml      # 本地依赖
└── compose.build.yaml    # 仅本地构建应用镜像
```

## 🧪 开发

```bash
pnpm dev                  # 本地应用
pnpm run check            # 格式、lint、类型、测试、边界和未使用代码
pnpm test                 # 单元测试和集成测试（需要已启动的 Postgres 并导出 DATABASE_URL）
pnpm run test:acceptance  # 验收测试
pnpm run test:smoke       # API 冒烟测试
```

`pnpm run check` 是合并前的本地门禁。依赖只用 pnpm 安装，不运行 `npm install` 或 `yarn`。人和 AI Coding 助手改代码前先读 [AGENTS.md](AGENTS.md)。

## 🚢 部署

<details>
<summary><strong>Docker Compose 正式部署详解</strong></summary>

正式环境使用 `compose.yaml`，包含应用、PostgreSQL、Redis 和 RustFS；设置 `COMPOSE_PROFILES=caddy` 后还会启动 Caddy。应用使用已发布镜像，不在部署机编译。数据库、Redis 和对象存储只在 Compose 网络内，数据放在命名卷。对象存储镜像是单盘 `rustfs/rustfs:1.0.1`，控制台端口 `9001` 不发布，图片由应用的媒体路由提供。应用默认监听 `3000`。

在部署机准备 `.env`，并额外提供：

- `MERCLINK_IMAGE`，例如 `docker.io/<DOCKERHUB_USERNAME>/merclink:1.2.3`
- `POSTGRES_PASSWORD`
- `REDIS_PASSWORD`
- `RUSTFS_ACCESS_KEY`
- `RUSTFS_SECRET_KEY`

密码使用 URL 安全字符。`APP_BASE_URL` 填公网地址。只有 `MERCLINK_PURCHASE=1` 时，才把支付通知地址填成同一公网地址。容器内的数据库、Redis 和对象存储地址由 Compose 覆盖，不要写成 `127.0.0.1`。

```bash
docker compose pull && docker compose up -d
```

本地没有远程镜像、需要在本机构建应用时（这不是正式部署）：

```bash
docker compose -f compose.yaml -f compose.build.yaml up -d --build
```

**HTTPS**：部署机 `.env` 设置 `COMPOSE_PROFILES=caddy`、`APP_DOMAIN` 和 `ACME_EMAIL`，并把 `APP_BIND` 设为 `127.0.0.1`；`APP_BASE_URL` 填 `https://` 加同一个主机名。证书由 Caddy 向 Let's Encrypt 申请并自动续期，保存在 `caddy_data` 卷。可选 `APEX_DOMAIN` 也会拿到证书，但只 301 到 `https://APP_DOMAIN`。

**镜像发布**：推送版本 tag 后由 GitHub Actions 构建并推送 `docker.io/${DOCKERHUB_USERNAME}/merclink`。正式 tag `v1.2.3` 推 `1.2.3` 和 `latest`；预发布 tag 如 `v1.2.3-rc.1` 只推 `1.2.3-rc.1`。`latest` 会被下一个正式版覆盖，生产回滚请把 `MERCLINK_IMAGE` 改回旧的版本号标签。

**从 MinIO 迁移**：已有部署要把 `.env` 里的 `MINIO_ROOT_USER` 和 `MINIO_ROOT_PASSWORD` 改名为 `RUSTFS_ACCESS_KEY` 和 `RUSTFS_SECRET_KEY`。不要把旧的 `minio_data` 卷挂给 `rustfs`，没有图片的新部署使用新的空卷 `rustfs_data`。

**一键安装脚本**：已经安装过就不要再跑安装命令，它会因为已有配置而停止，避免覆盖密码。写出 `.env` 之前按 Ctrl+C 不会留下配置；写出之后再取消，配置和数据都保留。升级没有完成或中途取消时，会把 `compose.yaml` 和版本号还原；已经换成新镜像的容器不会自动退回。

</details>

## 📚 文档

- [产品需求（PRD）](docs/PRD.md)：做什么、不做什么
- [技术架构](docs/ARCHITECTURE.md)：分层、依赖与关键流程
- [前端接口对接指南](docs/FRONTEND_API_GUIDE.md)
- [店面源码说明](storefront/README.md)
- [AI 开发规范](AGENTS.md)
- [案例：童心珠宝上线全过程](docs/cases/txpearl.md)
- 运行中的实例：`/llms.txt`、`/skill.md`、`/merchant/skill.md`、`/storefront/skill.md`、`/interfaces`

## 🤝 贡献

欢迎 Issue 和 Pull Request。

1. 从当前 `main` 拉分支。
2. 保持改动和 [docs/PRD.md](docs/PRD.md) 的范围一致；影响对外行为的改动先写 OpenSpec 变更（见 [AGENTS.md](AGENTS.md)）。
3. 提交前运行 `pnpm run check`。
4. 发起 Pull Request，说明行为和验证方式。

## 📄 许可证

[Apache License 2.0](LICENSE)

## 🙏 致谢

感谢第一批试用 MercLink 的商家，是你们让「只读 Skill 就能开店」变成了真实的店铺。

<!-- 新商家请按此格式在表格末尾追加一行：| [店铺名](网址) | 网址 | 一句话介绍 | -->

| 商家                                       | 网址                         | 介绍                                                                       |
| ------------------------------------------ | ---------------------------- | -------------------------------------------------------------------------- |
| [童心珠宝](https://txpearl.cn)             | <https://txpearl.cn>         | 北海珍珠首饰，中文店面（[案例](docs/cases/txpearl.md)）                    |
| [Chengdu Tour](https://www.eileenpeng.com) | <https://www.eileenpeng.com> | 面向海外游客的成都本地小团游，英文店面（[案例](docs/cases/eileenpeng.md)） |

你的店也跑在 MercLink 上？欢迎提交 Pull Request，在上表末尾加上一行，成为下一位试用商家。
