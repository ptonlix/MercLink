# Design

## Context

见 `proposal.md`。页脚链接写在 `src/public-discovery/views.tsx`。`src/app/api/v1/` 没有 `route.ts`。路径登记表是 `src/shared/api-routes.ts`。`audiences` 表示哪份 Skill 必须写到这条路径，不是登录要求。`/llms.txt` 已把 `/api/v1` 写成机器根，并禁止猜路径。店面保留路径在 `src/domain/storefront/paths.ts`。

## Goals / Non-Goals

**Goals:**

- 人从页脚进入一份名为「接口文档」的 HTML。
- 路径只来自 `src/shared/api-routes.ts`，不另写路径。页面展示字段、认证和权限。
- 店面激活后这条地址仍由本进程返回。

**Non-Goals:**

- 不把 `/api/v1` 做成 JSON 索引或 Swagger。
- 不改 `/llms.txt` 的九个链接。Agent 仍读 Skill。
- 不嵌入可试调的 Swagger UI，也不新增依赖。令牌示例仍不出现。
- 不把账号 Cookie 的 API Key 路由补进登记表。

## Decisions

- 路径用 `/interfaces`，文案用「接口文档」。不放在 `/api` 下，因为 `/api` 已被 robots 禁止，也是店面保留前缀。
- 分组按 `audiences`：买家、商家、店面各一组；空受众单独一组，标题是「独立调用」。同一路径可出现在多组。分组标题链到对应 Skill；`href` 为 null 的「独立调用」保持纯文本。
- 页脚不再链接 `/api/v1`。正文可以提到这个前缀，但不能把它做成文档链接。
- `/interfaces` 加入 `publicPagePaths`，从而进入站点地图和 robots allow。不提供 Markdown。
- 精确保留 `/interfaces`。店面 Skill 的保留地址清单同步加上这一条，否则 Agent 会以为可以覆盖。
- 字段页必须和序列化/Skill 一致，不能再手写一份会漂移的协议。请求和响应字段只维护一份字段表。示例从这张表生成，不另写 JSON。

## Risks / Trade-offs

- [未归档变更仍把页脚写成 API root] → 本变更的规格增量是归档时的依据。不要把那些旧句合并回来。
- [字段页和序列化或 Skill 各写一份] → 字段页必须和序列化/Skill 一致，不能再手写一份会漂移的协议。
- [已激活的旧店面页脚仍可能链到 `/api/v1`] → 不改已发布 HTML。新起始源码和内置页使用新页脚。`/interfaces` 仍可直接打开。

## Migration Plan

先改页脚和接口文档，再把路径标成保留。回滚时恢复页脚链接并去掉页面；`/api/v1` 的机器前缀不需要迁移。
