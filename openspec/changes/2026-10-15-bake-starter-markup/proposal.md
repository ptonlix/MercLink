# Proposal

## Why

v0.2.4 把 `storefront/` 放进了运行镜像，但第一次下载仍返回 `50301`。还没有发布记录时，打包会生成当前默认页。生成过程要另起进程执行 `scripts/render-starter.mjs`，再用 TypeScript 编译页面模板。生产镜像没有这个脚本，也没有编译器。异常被收成「店面下载暂时不可用。」

只渲染一次还会把构建当时的买入状态冻进 JSON。首页和商品列表会调用 `currentPurchaseEnabled()`，关闭和开启的 HTML 不一样。发布构建不接收 `MERCLINK_PURCHASE`，也不增加 Docker build-arg。同一镜像要同时服务两种部署。

## What Changes

- `pnpm run build` 之后才把 `scripts/render-starter.mjs` 复制进构建阶段，避免 standalone 追踪把它带进运行镜像。
- 同一次构建命令分别以 `MERCLINK_PURCHASE=0` 和 `MERCLINK_PURCHASE=1` 渲染。这两个赋值只属于该命令，不写入镜像 `ENV` 或 `ARG`。
- 两份结果合并为 `storefront-starter.json`。任一份缺少六个非空页面，构建失败。
- 运行镜像显式带上这份 JSON 和店面样式要读的三份 CSS。不把渲染脚本、TypeScript 或模板源码放进 runner。
- 工作目录里有渲染脚本时，下载仍执行脚本，并忽略已有的 JSON。脚本不存在时，按 `currentPurchaseEnabled()` 选择 `0` 或 `1`。不另写一套 0/1 规则。按开启值缓存，清掉买入缓存并改环境变量后可以选择另一份。
- 任一 payload 不完整就抛错，下载仍返回 `50301`，不打包半份页面。
- 不改下载协议、发布、激活或公开页面。已有发布仍下载该发布的源码包。

## Capabilities

### New Capabilities

- 无。

## Modified Capabilities

- `storefront-release`：生产镜像必须带上买入关闭和开启两份已渲染起始页，第一次下载按进程的买入开关选择，并且不把渲染器放进运行镜像。

## Impact

- `Dockerfile`、`src/public-discovery/starter-markup.ts`、镜像内容测试、`tmp/v0.2.5.md`。
- 不改 Skill、路由、数据库或对象存储。不增加依赖，也不给发布构建增加 build-arg。txpearl.cn 要重新构建并部署镜像后，下载才会恢复。
