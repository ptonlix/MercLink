# Tasks

## 1. 表和领域规则

- [x] 1.1 追加 `src/db/migrations/018_merchant_faqs.sql`：创建 `merchant_faqs`，全店行 `product_id` 为空且每个商家唯一，商品行按 `product_id` 唯一，含 `published`、`items` 和 `updated_at`。不回填、不预置问题。用迁移测试或 SQL 检查确认空库能建表，且两个唯一约束生效
- [x] 1.2 在 `src/domain/identity/faqs.ts` 解析整份问答：换行、HTML 和 Markdown 拒绝；去首尾空白后问题 1 到 80、答案 1 到 400，长度用 `Array.from`；全店最多 12 条、商品最多 8 条；重复问题拒绝；空列表不能 `published: true`；登录手机号和账号邮箱拒绝。用领域测试确认这些失败不产生新值，以及 `published: false` 的空列表可以被接受

## 2. 商家接口

- [x] 2.1 实现 `GET` 和 `PUT /api/v1/merchant/faqs`。没有记录时返回 `published: false`、`items: []`、`updated_at: null`。`PUT` 整份替换，要求 `product:write`。用应用服务测试确认草稿不出现在公开页，买家和缺少 scope 得到 `403`，未知字段得到 `validation_error` 且不写库
- [x] 2.2 实现 `GET` 和 `PUT /api/v1/catalogs/{id}/products/{product_id}/faqs`。目录不拥有商品或商品已软删除时返回 `404`。软删除期间不删行，恢复后商家读到原来的条目和 `published`。用测试确认商品上架、下架和介绍发布都不改变问答行
- [x] 2.3 介绍 `PUT`、商品创建和 `PATCH` 提交 `faqs` 时返回 `validation_error` 且不写入目录 `fields`。用现有介绍和商品测试确认拒绝

## 3. 公开读取

- [x] 3.1 `GET /api/v1/store` 在介绍已发布时保留现有字段并附加 `faqs`；问答未公开时为 `[]`。介绍未发布但全店问答已公开且非空时返回只有 `faqs` 的 `200`。两者都不可见，或商家停用、删除时仍为 `404`。用介绍公开读取测试确认不泄露介绍草稿和未公开问答
- [x] 3.2 公开商品详情附加 `faqs`，未公开时为 `[]`。公开列表不带 `faqs`，商家商品 JSON 不带 `faqs`，关键词搜索不匹配问答。用商品查询测试确认下架后公开详情不含问答，重新上架后仍公开的问答回来

## 4. 页面、Markdown 和店面

- [x] 4.1 内置首页在商品货架正下方渲染全店问答，联系方式、执照和使用指南仍在问答之后：问题为 `h3`，答案为转义段落，且无脚本时已在 HTML 里。有可见条目时内置 HTML 用一个 `h2`「常见问题」作为独立区域的标题。没有可见条目时不渲染问答块，也不预置问题。用页面测试确认顺序、转义和空集
- [x] 4.2 内置商品详情在商品详情正文之后、用户 Skill 链接之前渲染该商品问答。正文包括名称、价格、描述、规格和商品信息。不渲染全店问答。列表和货架不渲染问答正文。下架地址不可收录且不含问答。用页面测试确认这三处
- [x] 4.3 有可见条目时另加 `FAQPage` JSON-LD，文字与可见条目一致，并保留现有 `OnlineStore` 或 `Product`。`/index.md` 和 `/products/{id}.md` 在有条目时包含同一节，没有则省略。`/llms.txt` 不嵌入问答，站点地图不增加 `/faq`。用现有公开页和 Markdown 测试确认
- [x] 4.4 起始模板和内置页声明 `store.faq` 与 `product.faq`，槽位为 `faq.question` 和 `faq.answer`。区域外使用这两个槽位的模板不能发布。有可见条目时在该区域条目前插入恰好一个 `h2`「常见问题」；空区域不留标题。起始模板源码不写死该标题。已发布且没有对应区域的店面不改写、不自动插入问答。用店面槽位测试确认展开、空区域和旧模板

## 5. 路由合同和 Skill

- [x] 5.1 把四条新路由登记进 `src/shared/api-routes.ts`、`tests/smoke/manifest.ts`、接口目录和接口字段说明。运行路由一致性测试和 `tests/smoke/coverage.test.ts`，确认没有未登记路由
- [x] 5.2 更新 `/merchant/skill.md` 和 `/storefront/skill.md`：独立发布、长度和条数、空列表不能公开、只保存商家明确给出的句子、两个重复区域和槽位。示例不含真实问答或令牌。用 `src/agent-docs/skills.test.ts` 确认新路径和槽位都在，买家 Skill 不出现管理路径

## 6. 完成检查

- [x] 6.1 运行 `pnpm exec vitest run` 覆盖上述领域、接口、公开页、店面和 Skill 测试，再运行 `pnpm run typecheck` 与 `pnpm run boundaries`。有冒烟进程时再跑受影响冒烟；没有进程时写明完整冒烟未跑
