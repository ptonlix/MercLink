# Tasks

## 1. 应用壳

- [ ] 1.1 按 `design.md` 创建 Next.js 16、TypeScript strict、ESLint、Prettier、Vitest、dependency-cruiser 和 Knip 配置，并验证 `npm run check` 在空领域上通过
- [ ] 1.2 声明 `design.md` 中的运行时依赖，不加入阿里云或支付宝 SDK，并验证 `npm install` 成功且 lockfile 只由本变更修改
- [ ] 1.3 添加 `Dockerfile`、`compose.yaml` 和 `.env.example`，并验证示例文件不含真实密钥
- [ ] 1.4 添加 CI 工作流，运行 `npm run check`、`npm audit --audit-level=high` 和 Gitleaks，并验证工作流文件存在且命令与 `docs/ARCHITECTURE.md` 第 10.5 节一致

## 2. 运行时

- [ ] 2.1 实现环境变量校验和启动拒绝，并验证缺少 `ALIPAY_PRIVATE_KEY` 时进程非零退出且输出不含该密钥
- [ ] 2.2 实现 `GET /api/health`，并验证无令牌时返回 200 且响应不含连接串或密钥
- [ ] 2.3 实现按文件名排序的 SQL 迁移运行器及 `010_platform.sql`，并验证重复启动不会再次执行已完成迁移
- [ ] 2.4 实现日志脱敏，并验证带 bearer token 的请求日志不包含令牌、密码或短信验证码

## 3. 共享合同

- [ ] 3.1 实现错误体、错误码、公开 ID 前缀和 `src/shared/api-routes.ts`，并验证购买侧与商家侧路径覆盖 PRD 第 10 节
- [ ] 3.2 实现四条失败关闭接缝和 Skill 重写，并验证未注册时锁规格失败、公开列表为空、默认目录返回 pending
- [ ] 3.3 添加领域层不得引用 `app`、`db`、`adapters` 的边界规则，并验证一条故意违规的测试导入会使 `npm run boundaries` 失败后被删除
