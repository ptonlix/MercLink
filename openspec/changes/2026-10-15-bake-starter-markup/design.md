# Design

## Context

`packShippedSource()` 先读取 `/app/storefront`，再调用 `generatedStarterEntries()`。后者通过 `starterDocument()` 和 `starterStyles()` 生成 HTML 与 CSS。`starterDocument()` 用 `spawnSync` 执行 `scripts/render-starter.mjs`。该脚本用仓库里的 `typescript` 即时编译 `src/public-discovery/render-starter.tsx`。`starterStyles()` 读取三份 CSS。

首页 `LandingTemplate` 和商品列表 `ProductListTemplate` 在渲染时调用 `currentPurchaseEnabled()`。买入关闭和开启的 HTML 不一样。

v0.2.4 的 runner 已有 `/app/storefront` 和被追踪带进来的三份 CSS，没有 `scripts/render-starter.mjs`。`downloadSource()` 的 `catch` 仍返回「店面下载暂时不可用。」txpearl.cn 上 `storefront_releases` 是 0 行，所以每次下载都走这条路径。

发布工作流不传 build-args。`MERCLINK_PURCHASE`、支付密钥、`APP_BASE_URL` 和 `.env` 都不进入镜像构建。不能靠构建参数决定烤哪一种买入状态。

## Goals / Non-Goals

**Goals:**

- 生产镜像里的第一次下载不再启动渲染脚本。
- 同一份 JSON 同时包含买入关闭和开启的片段，运行时用现有的 `currentPurchaseEnabled()` 选择。
- 构建阶段用和本地相同的脚本生成片段，避免维护第二份页面。
- 三份 CSS 由 Dockerfile 显式复制。
- 本地有渲染脚本时继续渲染当前模板，残留 JSON 不能覆盖它。

**Non-Goals:**

- 不把 `typescript`、`src/**/*.tsx` 或 `scripts/render-starter.mjs` 放进 runner。
- 不新增 `MERCLINK_PURCHASE` 的 Docker `ARG` 或镜像 `ENV`。
- 不改 `50301` 的文案，也不把被吞掉的异常写进日志。
- 不改已有发布的下载路径，不激活店面。
- 不在仓库里提交生成后的 JSON。
- 不重写买入开关的 0/1 规则。

## Decisions

### 构建完成后再复制渲染脚本

`next build` 的 standalone 追踪可能带上构建时已经在目录里的文件。`COPY scripts/render-starter.mjs` 放在 `pnpm run build` 之后，追踪结果里就没有这个脚本。runner 只复制 standalone、静态资源、迁移、`storefront/`、`storefront-starter.json` 和三份 CSS，不复制脚本、编译器或 tsx。

### 同一次构建命令渲染两种买入状态

build 阶段执行：

`MERCLINK_PURCHASE=0 node scripts/render-starter.mjs`

`MERCLINK_PURCHASE=1 node scripts/render-starter.mjs`

赋值只属于对应命令。镜像没有这个 `ENV`，Dockerfile 也没有这个 `ARG`。两份 stdout 合并成 `/app/storefront-starter.json`，形状是 `{ "0": { 六个页面 }, "1": { 六个页面 } }`。任一份缺少非空字符串页面，该 `RUN` 失败，不把半份 JSON 放进 runner。

这里有源码、`typescript` 和 React。runner 只复制合并后的 JSON。

### 有脚本就渲染，没有脚本才读 JSON

`starterFragments()` 先看工作目录里有没有 `scripts/render-starter.mjs`。有就 `spawnSync`，和现在一样，不读 `storefront-starter.json`。这样本地开发和测试始终对着当前模板，误留的 JSON 不会生效。

脚本不存在时读取 JSON，用 `currentPurchaseEnabled()` 选择 `"1"` 或 `"0"`。不在这里再判断环境变量等于 `0` 还是 `1`。两份 payload 按开启值缓存。`resetPurchaseModeCache()` 之后环境变量变了，可以取到另一份，而不会一直返回第一次选中的 HTML。

解析时检查两份 payload 的六个页面都是非空字符串。不完整就抛错。`downloadSource()` 已有的 `catch` 仍返回「店面下载暂时不可用。」，也就是 `50301`，不会把缺页的压缩包发出去。

不在 runner 里执行渲染脚本。那样还要复制编译器、模板源码和可写缓存，镜像会带上构建工具。

### 样式继续读 CSS 文件

`starterStyles()` 的路径不变。runner 在 standalone 复制之后，显式复制：

- `src/app/globals.css`
- `src/public-discovery/public.css`
- `src/app/authorize/authorize.css`

standalone 追踪今天碰巧带上了这三份文件。下一次追踪漏掉时，下载会再次变成 `50301`。显式复制放在 standalone 之后，避免被另一份副本盖住。

## Risks / Trade-offs

- [页面模板改了但镜像没重建] → 和现在的应用代码一样，必须发新镜像。两份买入状态会一起更新。
- [本地误留 `storefront-starter.json`] → 仓库里有渲染脚本，下载和测试不读这份文件。它仍不提交，并写进 `.gitignore`。
- [只烤到构建机当时的买入状态] → 同一次命令渲染 0 和 1，不增加 build-arg。
- [已部署的 v0.2.4 不会变] → 需要新的版本镜像。这次不在部署机上热补文件。

## Migration Plan

1. 合并后按现有 tag 流程发布镜像。发布构建仍然不传 build-args。
2. 部署机把镜像改为该版本并 `docker compose pull && docker compose up -d`。
3. 还没有发布记录时，再请求 `GET /api/v1/storefront/source`。压缩包里应有 `accept.mjs` 和 `static/index.html`。买入关闭和开启的部署各自拿到对应片段。

## Open Questions

无。
