# Design

## Context

`downloadSource()` 在没有任何已接受发布时调用 `packShippedSource()`。它从 `process.cwd()/storefront` 读取 `accept.mjs` 等文件，再把当前默认页生成进压缩包。目录不存在时 `readdir` 抛错，`release.ts` 的 `catch` 返回「店面下载暂时不可用。」

`Dockerfile` 的 runner 只复制 `.next/standalone`、`.next/static` 和 `src/db/migrations`。构建阶段也没有复制 `storefront/`。`next.config.ts` 没有 `outputFileTracingIncludes`，`process.cwd()` 加整目录读取不会被 standalone 追踪。`.dockerignore` 目前没有排除 `storefront/`。

txpearl.cn 的首页是内置 Next 页面，店铺 JSON 和媒体对象都能读。未带令牌的下载接口返回 401。因此运行时、数据库和对象存储是通的，失败发生在鉴权之后的起始源码打包。

## Goals / Non-Goals

**Goals:**

- 运行镜像的工作目录里有仓库的 `storefront/`。
- 构建上下文继续包含这个目录。
- 用测试锁住 Dockerfile 的复制位置和 `.dockerignore`。

**Non-Goals:**

- 不改 `50301` 的文案，也不把被吞掉的异常写进日志。
- 不在缺少目录时改打包生成页充数。验收脚本必须来自这个目录。
- 不改已有发布的下载路径，不激活店面，不部署 txpearl.cn。
- 不加 `outputFileTracingIncludes`。构建阶段没有这个目录，追踪也覆盖不了 runner 里被单独复制的迁移文件那种运行时读取。

## Decisions

### 在 runner 从构建上下文复制

runner 在 `WORKDIR /app` 之后增加 `COPY storefront ./storefront`。`node server.js` 的工作目录是 `/app`，下载会读到 `/app/storefront`。

不从 build 阶段复制。build 阶段没有这个目录，而上下文里有。standalone 复制不会覆盖后写入的 `storefront/`，因为追踪结果里没有它。复制放在 standalone 复制之后，避免以后追踪把同名路径先写进来再被盖住时语义不清楚；当前就是直接补上缺失目录。

不把目录复制进 build 阶段。`pnpm run build` 不读取它。

### 忽略文件只加说明

`.dockerignore` 不增加排除规则。注释写明不要排除 `storefront/`，和现有的迁移目录说明放在一起。

## Risks / Trade-offs

- [镜像变大一个小目录] → 只有验收和预览脚本，没有 `node_modules`。
- [已部署的旧镜像不会变] → 需要按现有发版流程构建并拉取新镜像。这次不在部署机上执行。
- [已经有发布记录时下载不走这个目录] → 那是现有规格。对象缺失时的文案仍是「店面源码暂时无法读取。」

## Migration Plan

1. 合并后按现有 tag 流程发布镜像。
2. 部署机把 `MERCLINK_IMAGE` 改为该版本并 `docker compose pull && docker compose up -d`。
3. 用带 `storefront:write` 的商家令牌下载。还没有发布记录时，压缩包里应有 `accept.mjs`。

## Open Questions

无。
