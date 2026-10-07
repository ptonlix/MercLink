# Design

## Context

见 `proposal.md`。平台提供 ID、错误码、Actor 接缝和公开商品接缝。身份切片负责真实令牌。本变更用注入的 Actor 独立验收目录规则。

## Goals / Non-Goals

**Goals:**

- 两本目录的字段互不影响。
- 破坏性变更先预览，确认时在一个事务内下架不合法商品。
- 公开查询和可售锁定通过接缝提供给其他切片。

**Non-Goals:**

- 不搬移商品到另一本目录，不对齐不同目录的字段。
- 不实现支付、授权页或 Skill 正文。
- 不把 `attrs` 拆成每个值一行。

## Decisions

### 独占路径

- `src/domain/catalog/**`
- `src/app-services/catalog/**`
- `src/db/schema/catalog.ts`、`src/db/migrations/030_catalog.sql`
- `src/app/api/v1/catalogs/**`
- `src/app/api/v1/products/route.ts`、`src/app/api/v1/products/[id]/route.ts`

不得修改平台根配置、身份模块、交易模块或 `src/agent-docs`。

### 数据

表按 PRD：`catalogs`、`schema_revisions`、`product_fields`、`products`、`product_options`、`variants`。`attrs` 和选项值使用 `jsonb`。SKU 唯一索引带 `deleted_at is null`。本迁移不建指向 `merchants` 的外键，避免并行迁移顺序耦合；`merchant_id` 仍为非空文本。外键由集成变更的 `050_foreign_keys.sql` 补上。

商品和规格写入必须走领域函数。领域函数不 import Drizzle。应用服务负责事务。

### 字段变更

兼容变更直接写当前字段并追加 revision。破坏性变更第一次只计算影响。带 `confirm: true` 的第二次在一个事务里转换可安全转换的值、去掉停用 key、下架不合法的已上架商品、写 revision。文本 `"480"` 转数字 `480` 是必须支持的安全转换。不能转换则清空该值并下架。

购买过滤遇到停用 key 返回 `field_retired`。从未存在的 key 返回 `unknown_field`。

### 商品与规格

无轴商品把价格和库存放在创建请求上，系统创建默认可售规格，商品本身为 `off`。有轴之后，无轴默认规格不得可售，否则 `publish` 返回 409。同一商品的未删除规格组合不能重复。上架检查当前 required 字段和至少一条有价格的可售规格。

软删除写 `deleted_at`。恢复只清商品的 `deleted_at`，状态保持 `off`。规格恢复后保持不可售。管理列表默认隐藏已删除记录，`deleted=true` 才返回。

### 查询与接缝

公开列表和详情只含 `on` 且至少有一个可售规格的商品。跨目录只允许关键词和价格区间。`field.*` 没有 `catalog_id` 时 400。分页使用 `limit` 和 cursor，默认 `limit=20`，最大 50。

`register.ts` 注册：

- `publicProducts`：与 HTTP 公开查询同一用例。
- `sellableVariants.lock`：按 variant id 或唯一可售 product id 锁定行，返回价格、货币、快照和库存。多个可售规格却只给 product id 时返回 `variant_required`。
- `defaultCatalog.create`：为指定商家创建「默认目录」。

路由从 `authenticate` 取 Actor。测试注册一个假认证器，不启动 OAuth。

### 验收命令

`pnpm exec vitest run src/domain/catalog src/app-services/catalog`

领域覆盖率不低于 90%。库存锁测试使用真实测试事务和 `SELECT FOR UPDATE`，不用内存锁冒充。

## Risks / Trade-offs

- [无外键时脏 merchant id 可写入] → 应用层只接受已认证商家自己的 id；数据库外键在集成变更补上。
- [公开页面尚未存在] → 本切片只保证接缝和 HTTP 查询，不渲染 HTML。

## Migration Plan

追加 `030_catalog.sql`。已有订单快照不在本表中，字段停用不回写订单。

## Open Questions

无。数字过滤的表达式索引等出现慢查询再加，不在本变更预建。
