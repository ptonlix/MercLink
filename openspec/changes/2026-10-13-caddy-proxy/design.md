# Design

## 选择

Caddy 放在 `compose.yaml` 的 `caddy` profile 里，不单独再做一个 Compose 文件。部署机在 `.env` 写 `COMPOSE_PROFILES=caddy` 后，原来的 `docker compose pull && docker compose up -d` 会一起启动它。

不用 profile 的话，没配域名的本地 `compose.yaml` 也会尝试申请证书。变量插值发生在 profile 过滤之前，所以不能用 `${APP_DOMAIN:?}`，否则未启用 Caddy 的部署也会启动失败。缺变量时由 Caddy 入口脚本退出并写明原因。

## 反代

Caddy 通过 Compose 网络访问 `app:3000`，不走宿主机发布端口。部署应把 `APP_BIND` 设为 `127.0.0.1`，避免公网直接打到 3000。`APP_BASE_URL` 必须是 `https://APP_DOMAIN`。买入开启时，支付通知地址也必须是这个公网地址。

应用优先相信 `X-Real-IP`。Caddy 必须用当前连接地址覆盖它，不能透传调用方自己写的值。只发布 TCP 80 和 443，并关闭 HTTP/3，避免还要放行 UDP 443。

## 证书

镜像使用 `caddy:2.11.7-alpine`，不用 `latest`。证书和账号数据放在 `caddy_data` 与 `caddy_config`。容器重建不删除这两个卷，续期才能沿用已有证书。80 必须能从公网到达，供 HTTP-01 校验。

## 裸域名

`APEX_DOMAIN` 可选。设置后 Caddy 为它申请证书，并用 301 跳到 `https://APP_DOMAIN`，路径和查询保持不变。它不是第二个公开地址，授权和支付通知仍只用 `APP_BASE_URL`。不设置时只服务 `APP_DOMAIN`。

## 不做

- 不在仓库里写域名、邮箱、证书或私钥。
- 不改应用代码，不用这个地址猜测 `payment_channel`。
- 不发布 RustFS 控制台，也不把 3000 改成默认只监听本机。后者仍由部署机 `.env` 决定。
