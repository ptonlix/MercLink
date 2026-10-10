# Proposal

## Why

默认公开页和店面起始模板是两份页面。Agent 下载到的是薄模板，改完和用户看到的默认页不是一回事。以后改默认页也不会自动进入下载包。

## What Changes

- 默认公开页组件是唯一版式来源。它产出带槽位的 HTML。
- 未激活时，`/`、`/products`、`/products/{id}` 用这份 HTML，并由现有槽位渲染填入当前事实。
- 源码包里的首页、商品列表、商品页和样式由同一次生成写入，不再保留手写的第二份。
- 不保留旧薄模板，也不为旧 class 哈希做兼容。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `public-pages`：未激活时的公开页来自店面起始模板，而不是另一套 React 填数。
- `storefront-release`：下载的起始静态页由当前默认公开页生成。

## Impact

- `src/public-discovery` 仍是改版式的地方。`storefront/static` 不再手写首页和商品页。
- 不新增依赖，不改支付和授权协议。
