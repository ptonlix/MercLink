# Tasks

## 1. 公开页面

- [x] 1.1 实现服务端渲染的 `/`、`/products` 和 `/products/{id}`，并验证不执行脚本时正文仍包含服务说明和接缝返回的商品
- [x] 1.2 实现 JSON-LD，并验证商品页 Offer 的价格、货币和可售状态与 `publicProducts` 接缝一致
- [x] 1.3 实现 `robots.txt`、`sitemap.xml` 和 `llms.txt`，并验证接缝不再返回的商品离开站点地图，授权页、超管页和 `/api` 被禁止收录
- [x] 1.4 实现不可见商品的 noindex 响应，并验证接缝未注册时页面成功渲染且没有商品

## 2. Skill

- [x] 2.1 编写 `/skill.md` 对应的 Markdown，并验证包含路由表中的 buyer 路径、注册说明、规格下单、分单位和 `paid` 才算成功
- [x] 2.2 编写 `/merchant/skill.md` 对应的 Markdown，并验证包含 merchant 路径、无自助注册、字段预览确认，且不含商家私有商品和令牌
- [x] 2.3 添加 Skill 与 `src/shared/api-routes.ts` 的一致性测试，并验证删掉一个已列路径时测试失败

## 3. 切片验收

- [x] 3.1 运行 `pnpm exec vitest run src/public-discovery src/agent-docs`，并验证未修改 `next.config.ts` 和业务 API 实现
