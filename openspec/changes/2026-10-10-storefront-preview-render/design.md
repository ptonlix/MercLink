# Design

## Context

源站用 `renderDocument` 替换槽位。上一份预览规格只吐静态字节，是为了避免第二套渲染器。结果是激活前看不到店名和商品，无法判断版式。

## Goals / Non-Goals

**Goals:**

- 预览在激活前展示与源站相同的店铺和商品事实。
- 槽位替换与 `renderDocument` 输出一致，并由测试锁住。
- 预览失败时明确返回 502，而不是空白页。

**Non-Goals:**

- 不激活发布，不改指针。
- 不在预览里注入 JSON-LD 或执行页面脚本。
- 不把当时的事实写进上传的 HTML。

## Decisions

### 预览读取公开接口，替换规则与源站对齐

`/` 和 `/products` 读取 `GET /api/v1/store` 与 `GET /api/v1/products?limit=20`。`/products/{id}` 读取该商品；公开接口没有该商品时返回 404，不回退首页。`order_id` 只有在请求带 `Authorization` 时才转给 `GET /api/v1/orders/{id}`。没有令牌时订单槽位为空。

替换实现放在随源码分发的 `render-slots.mjs`，语义复制 `renderDocument`。测试用同一份上下文比较两边输出。不让店面源码 import 服务端 TypeScript。

店铺接口 404 表示没有已发布介绍，槽位为空。商品列表接口失败或源站连不上，返回 502。

## Risks / Trade-offs

- [两边替换日后分叉] → 同一夹具必须产出相同 HTML。
- [预览成功被当成已经上线] → Skill 写明预览不是激活。

## Migration Plan

重新下载源码后，用新的 `preview.mjs` 重启本地预览。已上传未激活的发布不用重传。

## Open Questions

无。
