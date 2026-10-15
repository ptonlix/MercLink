# Proposal

## Why

还没有接受过店面发布时，`GET /api/v1/storefront/source` 要打包部署自带的 `storefront/`。生产镜像只复制 Next standalone、静态资源和数据库迁移，工作目录里没有这个目录。打包抛错后被收成 `dependency_unavailable` `50301`，正文是「店面下载暂时不可用。」首页仍走内置页，所以网站看起来正常，下载却每次都失败。

## What Changes

- 运行镜像把仓库里的 `storefront/` 放到进程工作目录 `/app/storefront`。
- `.dockerignore` 继续不排除这个目录。
- 不改下载协议、发布、激活或公开页面。已有发布仍下载该发布的源码包，不改回起始源码。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `storefront-release`：生产镜像必须带上起始店面源码目录，第一次下载才能打包它。

## Impact

- `Dockerfile`、`.dockerignore`、镜像内容测试。
- 不改 Skill、路由、数据库或对象存储。txpearl.cn 要重新构建并部署镜像后，下载才会恢复。
