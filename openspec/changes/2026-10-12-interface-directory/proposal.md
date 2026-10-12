# Proposal

## Why

页脚把「API 根地址」链到 `/api/v1`。这个地址没有处理器，人点进去是 404。它只是机器接口的前缀，不是文档。给人看的入口如果是一份接口文档，就不能再叫 API 根地址。

## What Changes

- 页脚链接改为「接口文档」，指向 `/interfaces`。不再把 `/api/v1` 当作可点击的文档。
- `/interfaces` 是服务端渲染的接口文档。路径只来自 `src/shared/api-routes.ts`。页面展示字段、认证和权限，每条操作有自己的字段页。
- 字段页必须和序列化、Skill 一致，不能再手写一份会漂移的协议。
- `/api/v1` 仍是机器接口前缀和 OAuth 资源标识。不给它加文档响应，也不做 Swagger。
- `/llms.txt` 仍指向 `/api/v1`，并继续要求 Agent 不要猜路径。本页不是 Agent 的调用说明。
- 店面激活后不得替换 `/interfaces`。
- **BREAKING**：只破坏把页脚「API 根地址」或 `href="/api/v1"` 当成落地页契约的读取方。机器前缀不变。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `public-pages`：页脚改为接口文档；`/interfaces` 列出已登记路径，并展示字段、认证和权限；站点地图收录该页；激活中的店面不得替换它。

## Impact

- 改 `src/public-discovery` 的页脚和接口文档、`src/app/interfaces/page.tsx`、店面保留路径，以及店面 Skill 里的保留地址清单。
- 改 `docs/PRD.md` 第 9 节里把「API 根地址」写成给人看的入口的那一句。第 10 节的机器前缀不变。
- 不新增依赖。不改 `src/shared/api-routes.ts` 的路径。字段页与序列化一致，不另写一份会漂移的请求体。
