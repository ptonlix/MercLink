# Tasks

## 1. 应用壳

- [x] 1.1 按 `design.md` 创建 Next.js 16、TypeScript strict、ESLint、Prettier、Vitest、dependency-cruiser 和 Knip 配置，并验证 `pnpm run check` 在空领域上通过
- [x] 1.2 声明 `design.md` 中的运行时依赖，把 `packageManager` 固定为 `pnpm@12.9.1`，用本变更独占的 `pnpm-workspace.yaml` 批准构建脚本，不加入阿里云或支付宝 SDK，并验证裸 `pnpm install` 成功、锁文件只有 `pnpm-lock.yaml`，且该锁文件和 `pnpm-workspace.yaml` 只由本变更修改
- [x] 1.3 添加 `Dockerfile`、`compose.yaml` 和 `.env.example`，并验证示例文件不含真实密钥；镜像构建使用 Corepack 启用的 pnpm，不调用 `npm install`
- [x] 1.4 添加 CI 工作流，运行 `pnpm run check`、`pnpm audit --audit-level=high` 和 Gitleaks，并验证工作流文件存在且命令与 `docs/ARCHITECTURE.md` 第 10.5 节一致

## 2. 运行时

- [x] 2.1 实现环境变量校验和启动拒绝，并验证缺少 `ALIPAY_PRIVATE_KEY` 时进程非零退出且输出不含该密钥
- [x] 2.2 实现 `GET /api/health`，并验证无令牌时返回 200 且响应不含连接串或密钥
- [x] 2.3 实现按文件名排序的 SQL 迁移运行器及 `010_platform.sql`，并验证重复启动不会再次执行已完成迁移
- [x] 2.4 实现日志脱敏，并验证带 bearer token 的请求日志不包含令牌、密码或短信验证码

## 3. 共享合同

- [x] 3.1 实现错误体、错误码、公开 ID 前缀和 `src/shared/api-routes.ts`，并验证购买侧与商家侧路径覆盖 PRD 第 10 节
- [x] 3.2 实现四条失败关闭接缝和 Skill 重写，并验证未注册时锁规格失败、公开列表为空、默认目录返回 pending
- [x] 3.3 添加领域层不得引用 `app`、`db`、`adapters` 的边界规则，并验证一条故意违规的测试导入会使 `pnpm run boundaries` 失败后被删除
