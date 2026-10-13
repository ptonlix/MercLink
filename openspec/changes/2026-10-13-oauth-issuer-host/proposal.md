# Proposal

## Why

正式环境点设备码链接会离开公网域名，跳到 `https://0.0.0.0:3000/oauth/device`。容器为了监听所有网卡设置了 `HOSTNAME=0.0.0.0`，Next.js 用这个监听地址拼 `request.url`。授权库再按这个地址生成确认表单和发现文档，浏览器访问不到容器内部地址。

## What Changes

- 交给授权库的请求主机和协议改用已配置的 issuer，不再使用进入进程的请求主机。
- 设备码确认表单、`verification_uri` 和发现文档里的绝对地址都落在 issuer 源站。
- 忽略调用方或反向代理带来的 `X-Forwarded-Host` / `X-Forwarded-Proto`，避免再把监听地址写进授权链接。

## Capabilities

### New Capabilities

- 无

### Modified Capabilities

- `agent-authorization`: 设备码确认和发现文档的绝对地址必须使用配置的 issuer，不能使用进程监听地址。

## Impact

- 只影响经 `dispatchOidc` 进入授权库的绝对 URL。issuer 仍来自 `APP_BASE_URL`，不新增环境变量，不改路由。
- 不改 `HOSTNAME`。它仍是容器监听地址，不能改成公网域名。
- 不打开 Next.js 的 `trustHostHeader`。那个开关会把协议写死成 https，本地 http 授权会坏。
