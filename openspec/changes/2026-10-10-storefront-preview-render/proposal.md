# Proposal

## Why

本地预览不填事实槽位，商家无法在激活前确认店名、简介和商品是否按新版式排好。激活后再看，等于用线上页做第一次验收。

## What Changes

- 本地预览向 `STOREFRONT_ORIGIN` 读取已发布店铺、已上架商品，以及带买家 Authorization 的订单状态，并按源站同一套槽位规则填入本地静态页。
- 预览仍然不是激活。源站公开页在确认激活前不变。
- 公开接口不可用时返回 502，避免把空白页当成店里没有资料。
- 不把事实写回 HTML，也不另做一套价格或支付成功规则。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `storefront-preview`：预览必须在激活前渲染当前公开事实。
- `storefront-skill`：告诉 Agent 预览会填槽位，但上传和预览都不是激活。

## Impact

- `storefront/preview.mjs` 与随源码分发的槽位替换。不新增依赖，不改支付、授权或激活指针。
