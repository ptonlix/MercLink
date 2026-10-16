# Tasks

## 1. 数据列和领域规则

- [x] 1.1 追加 `src/db/migrations/017_product_description.sql`：存在 `product_fields.key = 'description'` 时失败；否则给 `products` 和订单行各加可空描述列，不回填。用迁移测试或 SQL 检查确认冲突 key 会失败、空库会加上两列
- [x] 1.2 在领域层解析描述：去首尾空白、保留内部换行、空值和超长 2000 拒绝，`description` 进入系统字段名。用领域测试确认创建省略为空、`PATCH` 省略不改、`null` 清空、写入 `fields` 或新建同名字段为 `validation_error`

## 2. 商品读写和搜索

- [x] 2.1 创建、编辑、商家读取和公开读取都返回与 `title` 并列的 `description`，空值为 `null`，且不放进 `fields`。用目录测试确认上架不要求描述
- [x] 2.2 无目录关键词同时匹配 `products.description`、标题和文本字段。用查询测试确认只出现在描述里的词可以命中，目录字段过滤规则不变

## 3. 订单快照

- [x] 3.1 下单把当时的描述写入 `description_snapshot`，空描述写 `null`，不写入 `fields_snapshot`。用下单测试确认之后修改商品描述不改变该订单行

## 4. 公开页和店面槽位

- [x] 4.1 内置详情页在标题和价格下展示转义后的描述并保留换行；没有描述不留空块。列表和首页卡片不展示描述。用页面测试确认两行描述、空描述和卡片不含正文
- [x] 4.2 有描述时，meta description 和 JSON-LD `description` 先收起空白再截到 150 个字符；没有描述时仍用标题、价格和库存。用现有公开页测试确认两种结果
- [x] 4.3 商品 Markdown 保留描述换行，且不把它列成目录字段。用 Markdown 测试确认两行正文仍在，字段键列表不含 `description`
- [x] 4.4 起始商品页和内置模板声明 `product.description`。已发布且未声明该槽位的店面不改写、不自动插入描述。用店面渲染测试确认两种模板

## 5. Skill 和已锁住的响应

- [x] 5.1 更新商家 Skill、买家 Skill 和接口字段说明：描述可选、`null` 清空、不能放进 `fields`、上架不要求。用 `src/agent-docs/skills.test.ts` 确认路径仍一致，且正文含这些规则、不含真实商家描述
- [x] 5.2 已有冒烟或公开契约若锁住商品 JSON 的键，补上 `description`。运行相关单测；有冒烟进程时再跑对应冒烟，没有进程时只跑冒烟覆盖检查并写明完整冒烟未跑

## 6. 完成检查

- [x] 6.1 运行 `pnpm exec vitest run` 覆盖上述领域、目录、下单、公开页、店面和 Skill 测试，再运行 `pnpm run typecheck` 与 `pnpm run boundaries`，确认没有新增依赖、路由或错误码
