# Tasks

## 1. 合同

- [x] 1.1 在 `src/shared/errors.ts` 定义成功码 `200`、现有错误种类的数字业务码，以及唯一 HTTP 状态表
- [x] 1.2 让 `/api/v1` JSON 返回 `code`、`message`、`data`、`timestamp`、`request_id`，并在日志和响应头带上同一个请求号
- [x] 1.3 确认通知、OAuth、元数据、健康检查、媒体字节和 303 不被外壳包裹
- [x] 1.4 固定目录侧 `variant_required` 为 HTTP 400 和业务码 `40004`，并更新测试、PRD 第 10 节和两份 Skill

## 2. 冒烟

- [x] 2.1 增加 `tests/smoke` 清单、客户端和覆盖检查，使每个 `route.ts` 导出都有登记
- [x] 2.2 按发现、认证门、目录、店面、支付、账号密钥和一条旅程拆分 HTTP 用例
- [x] 2.3 增加 `pnpm run test:smoke`。数据库不是 `merclink_smoke` 或缺少 `SMOKE_BASE_URL` 时失败，并且不把该命令加入 `pnpm run check`

## 3. 验证

- [x] 3.1 运行受影响的 Vitest、`pnpm run typecheck` 和 `pnpm run boundaries`
- [x] 3.2 在开发桩进程上运行 `pnpm run test:smoke`，确认主路径到 `paid`，且无效通知仍是纯文本 `fail`
