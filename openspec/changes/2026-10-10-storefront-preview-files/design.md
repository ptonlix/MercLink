# Design

## Context

源站分发已激活发布时，`/products` 只读 `products/index.html`，`/products/{id}` 只读 `products/item.html`，其他路径按「原路径、`.html`、`/index.html`」找文件。事实槽位在这次请求里替换。`storefront/preview.mjs` 只把路径拼到静态根目录并直接读，读到 `products` 目录就退出。设计已规定预览不是第二套渲染器，只把协议路径代理到本部署。

## Goals / Non-Goals

**Goals:**

- 本地预览能打开首页、商品列表和商品页模板，且一次失败不关掉进程。
- 商品地址不会因为找不到文件而回到首页。
- Skill 让 Agent 知道预览里看不到店名、价格和商品卡片是预期，不得写死这些事实。

**Non-Goals:**

- 不在预览里调用公开缝或复制 `renderDocument`。
- 不让未激活发布出现在源站公开页。
- 不改 `accept.mjs` 的事实检查，也不允许 Agent 改服务端仓库来修预览。

## Decisions

### 预览只对齐文件查找，不对齐渲染

`/` 读 `index.html`。`/products` 与 `/products/` 只读 `products/index.html`。单段且不含点的 `/products/{id}` 只读 `products/item.html`。其余路径依次试原路径、`.html`、目录下的 `index.html`，且必须是文件。路径含 `..`、空字节或反斜杠时不读。解析结果必须留在静态根目录内。

不采用「目录一律回落到 index.html」。那会把 `/products` 送回首页，违反商品地址不得回退的规则。

### 读失败留在请求内

先 `stat` 确认是文件再读。读流的 `error` 必须被接住；尚未写出响应时返回 500，不得变成未处理异常。

### Skill 把看不见的事实写成预期

Skill 说明预览不替换 `merclink-slot`，不展开 `data-merclink="product"`。只看见写死链接不是槽位失效。店名、价格、库存和商品卡片只在源站渲染已激活发布时出现。Agent 不得为了截图写死这些事实，也不得把本地预览说成已经填好的店面。

## Risks / Trade-offs

- [Agent 仍把空首页当成失败] → Skill 和验收句子写明这是预期，测试锁住这些句子。
- [预览的商品页不检查该商品是否公开] → 预览只给版式，不产生可收录响应；公开与否仍由源站决定。
- [下载到的仍是旧预览] → 源码包每次从 `storefront/` 打包。修好后重新下载才带上这次查找规则。

## Migration Plan

随下一次部署生效。已上传、未激活的发布不用重传，除非那份静态页本身还要改。已下载旧源码的 Agent 需要重新下载后，本地预览才会停止因目录崩溃。

## Open Questions

无。
