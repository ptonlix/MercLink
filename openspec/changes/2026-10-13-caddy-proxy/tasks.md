# Tasks

- [x] 1.1 在 `compose.yaml` 增加 `caddy` profile、固定镜像、80/443 和证书卷。入口脚本在缺少 `APP_DOMAIN` 或 `ACME_EMAIL` 时退出，并覆盖 `X-Real-IP`。
- [x] 1.2 更新 `.env.example`、README 和 `docs/ARCHITECTURE.md`。写明 profile、公网地址和本机绑定，不写入真实域名或证书。
- [x] 1.3 用占位变量渲染 Compose，确认未启用 profile 时没有 Caddy，启用后反代到 `app:3000` 且镜像不是 `latest`。
