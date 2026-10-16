<div align="center">

<img src="docs/images/hero.png" alt="MercLink: no business should be hard to run in the age of AI" width="100%" />

<h1>MercLink</h1>

<p><strong>In the age of AI, no business should be hard to run.</strong></p>

<p>Help small merchants run their own store, and let any AI agent find products and complete purchases directly.</p>

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
  <a href="#-quick-start">Quick Start</a> ·
  <a href="#-showcase">Showcase</a> ·
  <a href="#-architecture">Architecture</a> ·
  <a href="#-agent-entry-points">Agent Entry Points</a> ·
  <a href="#-documentation">Docs</a> ·
  <a href="README.md">简体中文</a>
</p>

</div>

---

## 💡 What is MercLink?

MercLink is a **single-store commerce service built for AI agents**: one store, one HTTP API.

- **Merchants** hand `/merchant/skill.md` to their agent, which uses the API to create catalogs, define fields, create products and variants, publish or unpublish them, and publish the store profile.
- **Buyers'** agents read `/skill.md` to query published products. When the deployment enables purchasing, the same guide lets them place an order for a specific variant and check the payment result.
- **The storefront** is agent-editable too: with `/storefront/skill.md`, an agent downloads the starter source, redesigns it, runs the acceptance check, uploads, and activates a fully branded site.

Humans only sign in and approve access in their own browser; agents never hold passwords. Public pages, the three skills and the API all describe the same facts, and agents never talk to the database, Redis, object storage or Alipay directly.

> The documentation, skills and API responses are primarily written in Chinese.

## ✨ Features

**MercLink is fully AI native: agents are first-class users. Opening the store, listing products, redesigning pages and placing orders are all done by agents through public docs and the HTTP API; a human only signs in and clicks "Approve" once in the browser.**

- **Agents are the interface**: there is no click-through product admin. Merchant, buyer and storefront agents read `/merchant/skill.md`, `/skill.md` and `/storefront/skill.md` and use the API to create catalogs, define fields, publish products, publish the store profile, place orders and check them; the admin page only changes the owner password and approves storefront resets.
- **Self-describing and discoverable**: `/llms.txt` is the agents' front door, listing the three skills, the Markdown pages, the interface reference and the API root. The skills and `/interfaces` share one route registry, [`src/shared/api-routes.ts`](src/shared/api-routes.ts), and tests keep the documented paths in sync with the code.
- **Sign-in designed for agents**: OAuth 2.1 device authorization (built on `oidc-provider`). The agent hands a short code to a human, who approves in their own browser; the agent receives a ~15-minute access token and a single-use rotating refresh token, and never touches passwords, SMS codes or API keys.
- **Responses agents can parse**: every `/api/v1` response uses the same `{ code, message, data, timestamp, request_id }` envelope with numeric error codes, and prices are always integer cents; pages have server-generated Markdown versions (`/index.md`, `/products.md`, `/products/{id}.md`), also served when a request sends `Accept: text/markdown`.
- **Agent-editable storefront**: an agent downloads the starter source, edits HTML/CSS, previews with `node preview.mjs`, checks with `node accept.mjs`, then uploads and activates with `{"confirm": true}`; rollback is one call. Facts such as name, price, stock and license are `<merclink-slot>` placeholders rendered by the server on every request, and JSON-LD is injected server-side.
- **Flexible catalog model**: multiple catalogs, custom fields per catalog (text, number, boolean, single-select), preview-then-confirm for breaking field changes, and variant axes with only the combinations you actually sell.
- **Store profile**: one per store, with display name, summary, logo, service area, address, contact QR code and business license, publicly readable at `GET /api/v1/store`.
- **Optional purchasing**: query-only by default. Set `MERCLINK_PURCHASE=1` to enable buyer phone sign-up (Aliyun CAPTCHA 2.0 + SMS), single-line orders, and Alipay (desktop / mobile) or EasyPay. Only order status `paid` counts as success; expired unpaid orders are closed automatically.
- **Search-engine friendly**: server-generated `sitemap.xml`, `robots.txt` and JSON-LD.
- **One-command deployment**: a single-process Next.js image plus Docker Compose (PostgreSQL 18, Redis 8, RustFS), optional Caddy for automatic HTTPS, and an install / upgrade script that restores files if interrupted.

## 🛒 Showcase

Two live MercLink stores. Both run the same service and were configured and redesigned by agents that only read the public skills, with no server code changes.

<table>
  <tr>
    <th width="50%"><a href="https://txpearl.cn">童心珠宝 · txpearl.cn</a></th>
    <th width="50%"><a href="https://www.eileenpeng.com">Chengdu Tour · eileenpeng.com</a></th>
  </tr>
  <tr>
    <td><a href="https://txpearl.cn"><img src="docs/images/showcase-txpearl-desktop.webp" alt="童心珠宝 home page (desktop)" /></a></td>
    <td><a href="https://www.eileenpeng.com"><img src="docs/images/showcase-eileenpeng-desktop.webp" alt="Chengdu Tour home page (desktop)" /></a></td>
  </tr>
  <tr>
    <td>Beihai pearl jewelry retailer. Chinese storefront with a deep-navy-and-gold brand page, six products priced by bead-size variants, a full store profile with contact and business license, and Baidu / Bing / Google site verification.</td>
    <td>Small-group local tours of Chengdu for international visitors. English storefront with a dark 3D card carousel. It sells experiences rather than physical goods, showing that MercLink works for services too.</td>
  </tr>
  <tr>
    <td align="center"><img src="docs/images/showcase-txpearl-mobile.webp" alt="童心珠宝 home page (mobile)" width="200" /></td>
    <td align="center"><img src="docs/images/showcase-eileenpeng-mobile.webp" alt="Chengdu Tour home page (mobile)" width="200" /></td>
  </tr>
  <tr>
    <td align="center"><a href="docs/cases/txpearl.md">📖 Full launch walkthrough (Chinese)</a></td>
    <td align="center"><a href="docs/cases/eileenpeng.md">📖 Case notes (Chinese)</a></td>
  </tr>
</table>

To see a MercLink store from an agent's point of view, open its `/llms.txt`, for example <https://txpearl.cn/llms.txt>.

## 🚀 Quick Start

### 📦 Option 1: one-command server install

Prerequisites: Docker and Docker Compose v2 are installed, your domain resolves to the machine, and ports 80 and 443 are open.

```bash
curl -fsSL -o /tmp/merclink-install.sh https://github.com/ptonlix/MercLink/releases/latest/download/install.sh && bash /tmp/merclink-install.sh
```

The script writes the configuration and passwords to `/opt/merclink`, pulls the latest stable image and starts it. It never compiles on the host and never writes your domain or passwords into the repository. If ports are taken or Docker is missing, it stops instead of installing software or shutting down existing sites.

Upgrade to a newer stable release later (passwords are kept):

```bash
curl -fsSL -o /tmp/merclink-install.sh https://github.com/ptonlix/MercLink/releases/latest/download/install.sh && bash /tmp/merclink-install.sh upgrade
```

Then give `https://<your-domain>/merchant/skill.md` to your agent and let it start listing products.

### 💻 Option 2: local development

Requirements:

- Node.js `>=24.18.0 <25`
- pnpm 12.9.1 (enabled via Corepack)
- Docker and Docker Compose v2

```bash
git clone https://github.com/ptonlix/MercLink.git
cd MercLink
corepack enable
corepack prepare pnpm@12.9.1 --activate
pnpm install --frozen-lockfile
cp .env.example .env
```

Fill in the local dependency addresses in `.env` (local only, never for production):

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

Also set your own `ADMIN_PHONE`, `ADMIN_PASSWORD` and `OAUTH_SIGNING_SECRET`. Generate the signing secret with:

```bash
openssl rand -base64 32
```

Start the local dependencies (PostgreSQL, Redis, RustFS) and the app:

```bash
docker compose -f compose.dev.yaml up -d
pnpm dev
```

Open <http://127.0.0.1:3000>. The health check is at <http://127.0.0.1:3000/api/health>.

> [!TIP]
> `MERCLINK_DEV_STUBS=1` only works under `pnpm dev` (`NODE_ENV=development`): Aliyun and Alipay variables may stay empty, no SMS is sent and the code is always `123456`, and payment links point to a local confirmation page. With `NODE_ENV=production` the app refuses to start if it is set.
>
> If old `merclink` project containers are still running, stop them first with `docker compose -p merclink down`.

## 🔧 Configuration

See [`.env.example`](.env.example) for every variable (comments are in Chinese). Never commit real secrets; `.env` is git-ignored.

| Variable                                                       | Purpose                                                                   |
| -------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `DATABASE_URL`                                                 | PostgreSQL connection string. Migrations run at startup                   |
| `REDIS_URL`                                                    | Redis connection string. Only used for SMS / upload rate-limit counters   |
| `OBJECT_STORAGE_*`                                             | S3-compatible object storage (endpoint, region, bucket, keys)             |
| `APP_BASE_URL`                                                 | Public absolute URL of the app, used in OAuth metadata and absolute links |
| `ADMIN_PHONE` / `ADMIN_PASSWORD`                               | Creates the single store owner on first start; ignored afterwards         |
| `OAUTH_SIGNING_SECRET`                                         | Secret for the authorization server and login sessions                    |
| `MERCLINK_PURCHASE`                                            | Purchase switch, off by default. `1` enables buyer sign-up and payments   |
| `MERCLINK_PAYMENT_PROVIDER`                                    | `alipay` (default) or `easypay`                                           |
| `ALIYUN_CAPTCHA_*` / `ALIYUN_SMS_*` / `ALIPAY_*` / `EASYPAY_*` | CAPTCHA, SMS and payment merchant settings, needed only when purchasing   |
| `MERCLINK_DEV_STUBS`                                           | Local development only: stub CAPTCHA, SMS and payments                    |

The app refuses to start when a required variable is missing or Redis / the bucket is unreachable. Logs never contain passwords, SMS codes, access or refresh tokens, payment private keys or object storage secrets.

## 🧱 Architecture

<p align="center">
  <img src="docs/images/architecture.png" alt="MercLink architecture: agents obtain a token through the device flow and call the HTTP API; people approve access and browse the storefront in a browser; one Next.js process uses PostgreSQL, Redis and RustFS, and talks to payment, CAPTCHA and SMS providers when purchasing is on" width="100%" />
</p>

- **One process**: pages, API, authorization and payment notifications live in a single Next.js app. No microservices, no queues.
- **Layers**: `app` → `app-services` → `domain`; the domain layer is plain TypeScript and external services plug in through `ports` / `adapters`, enforced by `pnpm run boundaries`.
- **One transaction per operation**: placing an order and decrementing stock, applying a payment notification, and breaking field changes each run in a single database transaction.

| Role             | Does                                                              | Does not                                                |
| ---------------- | ----------------------------------------------------------------- | ------------------------------------------------------- |
| Merchant agent   | Create catalogs and fields, create products and variants, publish | Open another store or mark orders as paid               |
| Buyer agent      | Query published products, order one variant line, check payment   | Edit products or send its own price                     |
| Storefront agent | Download, edit, upload and activate the human-facing storefront   | Override reserved paths such as `/api`, auth, or skills |
| Store owner      | Change password, approve agents and storefront resets             | Edit products in the admin page or open another store   |

The Mermaid overview, layering and key flows are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#系统总览图) (Chinese).

## 🤖 Agent Entry Points

| Path                   | Used by           | Purpose                                                         |
| ---------------------- | ----------------- | --------------------------------------------------------------- |
| `/llms.txt`            | Agents            | Discover every entry point below                                |
| `/skill.md`            | Buyer agents      | Query products; order and check orders when purchasing is on    |
| `/merchant/skill.md`   | Merchant agents   | Catalogs, fields, products, variants, covers, shelf, profile    |
| `/storefront/skill.md` | Storefront agents | Download, preview, accept, upload, activate and roll back pages |
| `/interfaces`          | Humans            | API reference: registered paths, fields, auth and scopes        |
| `/api/v1`              | Agents, scripts   | Machine API prefix, not a docs page                             |
| `/api/v1/store`        | Anyone            | Published store profile (JSON, no token)                        |
| `/`, `/products`       | Visitors          | Store landing page and product list                             |
| `/oauth/device/auth`   | Agents            | Request a device code                                           |
| `/authorize/buyer`     | Buyers            | Sign up, sign in, approve                                       |
| `/authorize/merchant`  | Store owner       | Sign in, approve (no sign-up)                                   |
| `/admin`               | Store owner       | Change owner password, approve storefront resets                |
| `/api/health`          | Deploy checks     | Health check                                                    |

Querying published products needs no sign-in; ordering and management endpoints use `Authorization: Bearer <access token>`. Every `/api/v1` JSON response has the shape `{ "code", "message", "data", "timestamp", "request_id" }`. [`src/shared/api-routes.ts`](src/shared/api-routes.ts) is the source of truth for paths.

API keys are not how agents sign in. They are only for server scripts without a browser, created on the account page after signing in.

## 📁 Project Structure

```text
MercLink/
├── src/
│   ├── app/              # Next.js pages and routes (/api/v1, /oauth, /authorize, /admin, ...)
│   ├── app-services/     # Use cases: one file per use case, owns transactions and orchestration
│   ├── domain/           # Pure business rules: identity, access, catalog, commerce, storefront
│   ├── ports/            # Port interfaces: payment, SMS, CAPTCHA, object storage, rate limit, clock
│   ├── adapters/         # Alipay, EasyPay, Aliyun, S3, Redis implementations
│   ├── agent-docs/       # The three skills; tests verify every path they mention
│   ├── public-discovery/ # llms.txt, Markdown pages, interface docs, starter storefront
│   ├── db/               # Drizzle schema and SQL migrations
│   └── shared/           # Route registry, env, error codes, response envelope
├── storefront/           # Starter storefront source shipped with each deployment
├── tests/                # Acceptance and API smoke tests
├── openspec/             # Behavior specs and change records
├── docs/                 # PRD, architecture, frontend API guide, case studies
├── scripts/              # One-command installer, starter page renderer
├── compose.yaml          # Production: app + PostgreSQL + Redis + RustFS (optional Caddy)
├── compose.dev.yaml      # Local dependencies
└── compose.build.yaml    # Build the app image locally only
```

## 🧪 Development

```bash
pnpm dev                  # run the app locally
pnpm run check            # format, lint, types, tests, boundaries, unused code
pnpm test                 # unit and integration tests (needs Postgres and DATABASE_URL)
pnpm run test:acceptance  # acceptance tests
pnpm run test:smoke       # API smoke tests
```

`pnpm run check` is the local gate before merging. Install dependencies with pnpm only; never run `npm install` or `yarn`. Humans and AI coding assistants should read [AGENTS.md](AGENTS.md) before changing code.

## 🚢 Deployment

<details>
<summary><strong>Production deployment with Docker Compose</strong></summary>

Production uses `compose.yaml`: the app, PostgreSQL, Redis and RustFS, plus Caddy when `COMPOSE_PROFILES=caddy` is set. The app runs a published image and is never compiled on the host. The database, Redis and object storage stay inside the Compose network with data in named volumes. Object storage is single-disk `rustfs/rustfs:1.0.1`; its console port `9001` is not published and images are served by the app's media route. The app listens on `3000` by default.

Prepare `.env` on the host and also provide:

- `MERCLINK_IMAGE`, e.g. `docker.io/<DOCKERHUB_USERNAME>/merclink:1.2.3`
- `POSTGRES_PASSWORD`
- `REDIS_PASSWORD`
- `RUSTFS_ACCESS_KEY`
- `RUSTFS_SECRET_KEY`

Use URL-safe characters in passwords. Set `APP_BASE_URL` to the public URL. Only when `MERCLINK_PURCHASE=1` do the payment notification URLs need to point at the same public address. Compose overrides the in-container database, Redis and storage addresses, so do not use `127.0.0.1` there.

```bash
docker compose pull && docker compose up -d
```

To build the app image locally when no remote image is available (not a production deployment):

```bash
docker compose -f compose.yaml -f compose.build.yaml up -d --build
```

**HTTPS**: set `COMPOSE_PROFILES=caddy`, `APP_DOMAIN` and `ACME_EMAIL` in `.env`, set `APP_BIND` to `127.0.0.1`, and make `APP_BASE_URL` `https://` plus the same host. Caddy obtains and renews Let's Encrypt certificates and stores them in the `caddy_data` volume. The optional `APEX_DOMAIN` also gets a certificate but only 301-redirects to `https://APP_DOMAIN`.

**Image releases**: pushing a version tag makes GitHub Actions build and push `docker.io/${DOCKERHUB_USERNAME}/merclink`. A stable tag `v1.2.3` pushes `1.2.3` and `latest`; a prerelease such as `v1.2.3-rc.1` pushes only `1.2.3-rc.1`. `latest` moves with each stable release, so roll back by setting `MERCLINK_IMAGE` to an older version tag.

**Migrating from MinIO**: rename `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` in `.env` to `RUSTFS_ACCESS_KEY` / `RUSTFS_SECRET_KEY`. Do not mount the old `minio_data` volume into `rustfs`; new deployments without images use the fresh `rustfs_data` volume.

**Installer behavior**: do not rerun the install command on an existing install; it stops on existing configuration so passwords are not overwritten. Pressing Ctrl+C before `.env` is written leaves nothing behind; cancelling later keeps configuration and data. An interrupted or cancelled upgrade restores `compose.yaml` and the version; containers already switched to the new image are not rolled back automatically.

</details>

## 📚 Documentation

All documents below are in Chinese.

- [Product requirements (PRD)](docs/PRD.md)
- [Technical architecture](docs/ARCHITECTURE.md)
- [Frontend API guide](docs/FRONTEND_API_GUIDE.md)
- [Storefront source notes](storefront/README.md)
- [AI development guidelines](AGENTS.md)
- [Case study: launching 童心珠宝](docs/cases/txpearl.md)
- On any running instance: `/llms.txt`, `/skill.md`, `/merchant/skill.md`, `/storefront/skill.md`, `/interfaces`

## 🤝 Contributing

Issues and pull requests are welcome.

1. Branch from the current `main`.
2. Keep changes within the scope of [docs/PRD.md](docs/PRD.md); changes to external behavior start with an OpenSpec change (see [AGENTS.md](AGENTS.md)).
3. Run `pnpm run check` before committing.
4. Open a pull request describing the behavior and how you verified it.

## 📄 License

[Apache License 2.0](LICENSE)

## 🙏 Acknowledgements

Thanks to the first merchants who tried MercLink and turned "open a store just by reading the skills" into real shops.

<!-- New merchants: append one row at the end of the table in this format: | [Store name](URL) | URL | One-line description | -->

| Merchant                                   | Website                      | Description                                                                                                  |
| ------------------------------------------ | ---------------------------- | ------------------------------------------------------------------------------------------------------------ |
| [童心珠宝](https://txpearl.cn)             | <https://txpearl.cn>         | Beihai pearl jewelry, Chinese storefront ([case study](docs/cases/txpearl.md))                               |
| [Chengdu Tour](https://www.eileenpeng.com) | <https://www.eileenpeng.com> | Local small-group tours of Chengdu for visitors, English storefront ([case notes](docs/cases/eileenpeng.md)) |

Running your own store on MercLink? Open a pull request and add a row to the table to join the list of trial merchants.
