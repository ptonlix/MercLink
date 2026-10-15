## 1. 把两种买入状态的起始页烤进镜像

- [x] 1.1 在 `pnpm run build` 之后把 `scripts/render-starter.mjs` 复制进 build 阶段，runner 不复制脚本、TypeScript 或 tsx
- [x] 1.2 构建命令分别以 `MERCLINK_PURCHASE=0` 和 `MERCLINK_PURCHASE=1` 渲染，合并进 `storefront-starter.json`；缺页则构建失败。不使用 ARG 或 ENV
- [x] 1.3 运行时若渲染脚本存在则执行它并忽略 JSON；否则按 `currentPurchaseEnabled()` 选择 0 或 1，并按开启值缓存。不完整 payload 抛错
- [x] 1.4 runner 仍显式复制 `storefront-starter.json` 和三份 CSS，`storefront-starter.json` 仍在 `.gitignore`
- [x] 1.5 用测试锁住复制位置、两次渲染、买入选择，以及脚本优先于 JSON
