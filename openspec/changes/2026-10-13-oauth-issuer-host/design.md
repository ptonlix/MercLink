# Design

## Context

`oidc-provider` 的发现端点和设备码 `urlFor` 使用 Koa 的 `ctx.href`，也就是当前请求的协议和 Host，不是构造 Provider 时传入的 issuer。`dispatchOidc` 现在把 Next 的 `request.url` 主机写进这个请求。独立容器里该 URL 是 `https://0.0.0.0:3000/...`，于是确认页自动提交到这个地址。

issuer 本身已经是 `APP_BASE_URL` 加 `/oauth`，线上发现文档里的 `issuer` 字段是对的，错的只是按请求主机拼出来的端点。

## Goals / Non-Goals

**Goals:**

- 授权库看到的主机、协议和转发头都来自 `provider.issuer`。
- 路径和查询串仍来自原请求，设备码短码不丢失。
- 用一次经 `dispatchOidc` 的设备码和发现请求锁住这个行为。

**Non-Goals:**

- 不改 Docker 的 `HOSTNAME` 或端口映射。
- 不让其他业务接口改用 Host 头拼公开地址。
- 不新增第二份 issuer 配置。

## Decisions

1. 在 `dispatchOidc` 里用 issuer 重建绝对 URL，再设置 `Host` 和 `socket.encrypted`。删除 `x-forwarded-host` 与 `x-forwarded-proto`。授权库默认不信任转发头；删掉是为了以后打开 proxy 时也不会退回监听地址。
2. 不在路由层读取 `APP_BASE_URL`。运行时已经把同一值写进 `provider.issuer`，调度层只认这个值。

## Risks / Trade-offs

- 若部署把 `APP_BASE_URL` 配成内网地址，授权链接会跟着错。这是既有配置约束，不在这次用请求 Host 兜底。
- 直接打到容器端口时，授权响应仍指向公网 issuer。这是要的结果，避免再把 `0.0.0.0` 交给浏览器。
