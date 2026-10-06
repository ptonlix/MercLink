# Tasks

## 1. 合并前检查

- [ ] 1.1 确认身份、目录、交易、公开页面和平台独占目录都已存在，并验证缺失任一目录时停止且不补写业务实现
- [ ] 1.2 检查五个切片没有并行修改同一根配置，并验证 `git diff` 中 `package.json` 的业务依赖只来自各 `slice-deps.json`，且没有新增 `package-lock.json` 或 `yarn.lock`

## 2. 组合

- [ ] 2.1 添加 `src/composition/register-all.ts` 并在 `src/instrumentation.ts` 启动它和每分钟 `runOnce`，并验证任一注册失败时进程不就绪
- [ ] 2.2 合并官方 SDK 依赖并添加 `050_foreign_keys.sql`，并验证孤立行存在时迁移失败且不删除业务行
- [ ] 2.3 核对共享路由表、实际路由文件和两份 Skill，并验证三者路径一致；支付动作形状不一致时只改 Skill

## 3. 最终验收

- [ ] 3.1 用测试数据库和端口假实现运行 `tests/acceptance`，并验证 PRD 第 12 节的 14 条跨模块场景通过
- [ ] 3.2 运行 `pnpm run check` 和 `pnpm run test:acceptance`，并验证领域覆盖率仍不低于 90% 且没有新增 PRD 之外的功能
