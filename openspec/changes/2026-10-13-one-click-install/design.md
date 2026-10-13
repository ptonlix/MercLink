# Design

## 入口

永久入口只用 GitHub 的 `/releases/latest/download/install.sh`。这个地址会跳过预发布，所以和现有镜像规则一致：只有正式 tag 才移动 Docker 的 `latest`。预发布 Release 必须标成 prerelease，避免占住这条地址。

一键安装把 `MERCLINK_IMAGE` 写成 `docker.io/<用户名>/merclink:latest`。操作员不用填版本号。`latest` 只在正式版发布时移动，所以这条命令装到的是当前正式版。它会被下一个正式版覆盖，不能当作回滚点。要回到旧版，再把镜像改成版本号标签后 pull。

仓库里的脚本保留占位符。`scripts/stamp-install.sh` 在正式版发布时写入 tag，并把镜像写成 `docker.io/${DOCKERHUB_USERNAME}/merclink:latest`。预发布不移动 Docker 的 `latest`，所以预发布资源仍写版本号镜像。用户名不进 git。盖过章的脚本忽略环境里的同名变量。

## 安装

默认目录是 `/opt/merclink`。脚本下载 `https://raw.githubusercontent.com/ptonlix/MercLink/<tag>/compose.yaml`，检查其中有 `name: merclink`，不改文件内容。然后写 `.env` 并执行：

```bash
docker compose pull && docker compose up -d
```

不带 `--build`。没有 Docker 或 Compose 插件就退出，不调用包管理器。

只询问或读取 `APP_DOMAIN`、`ACME_EMAIL` 和 `ADMIN_PHONE`。`APEX_DOMAIN` 不主动问，只有调用方已经导出时才写入。其余密钥在本机用 URL 安全字符生成，文件权限 `600`。管理员密码只在本次安装结束时打印一次。

固定写入 `COMPOSE_PROFILES=caddy`、`APP_BIND=127.0.0.1` 和 `APP_BASE_URL=https://APP_DOMAIN`。不写 `MERCLINK_PURCHASE` 或 `MERCLINK_DEV_STUBS`。

fresh install 若发现 TCP 80 或 443 已被占用，在写 `.env` 之前退出，不停掉别人的代理。升级不再做这个检查，因为本栈的 Caddy 已经占着这两个端口。

## 升级

`upgrade` 要求 `.env` 已存在。它重新下载同一 tag 的 `compose.yaml`，只替换 `MERCLINK_IMAGE` 和 `MERCLINK_RELEASE_TAG`，然后 pull。数据库密码、授权密钥，以及操作员后来写上的买入开关和厂商密钥都保留。

安装写到一半失败时，不要删 `.env` 再重跑安装。应执行 `upgrade`，或在目录里重新 `docker compose pull && docker compose up -d`。

## 不做

- 不在脚本里安装 Docker、Python 或 openssl。
- 不收集支付宝、短信或验证码密钥，不默认打开买入。
- 不把 Docker Hub 令牌或用户名写进仓库、Release 说明或测试快照。
- 不新增第二份 Compose。
