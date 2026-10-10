# Proposal

## Why

店面 Agent 被要求用 `node preview.mjs` 看改过的页面。这个预览把 `/products` 当成文件去读，目录读取抛出 `EISDIR` 后进程退出。Skill 又没写明本地预览不填事实槽位，Agent 就会把只剩一个链接的静态页说成店面已经改好，或把店名和价格写死来“修好”预览。

## What Changes

- 本地预览按源站的静态文件规则找页面：`/`、`/products`、`/products/{id}` 分别对应已有 HTML，目录不当文件读，找不到返回 404，进程不退出。
- 预览仍不替换槽位、不展开商品 template，也不回退商品地址到首页。
- 店面 Skill 写明：空槽位不是页面坏了；不要为了预览写死事实；不要把本地预览说成已经填好的店面。事实只在源站渲染已激活发布时出现。

## Capabilities

### New Capabilities

- `storefront-preview`：随源码分发的本地预览如何定位静态文件，以及它明确不做的渲染。

### Modified Capabilities

- `storefront-skill`：公开 Skill 必须教会 Agent 本地预览的边界，避免把空槽位当成故障或写死事实。

## Impact

- 只改 `storefront/preview.mjs`、店面 Skill、README 和对应测试。不新增依赖，不改支付、授权或激活指针。
- 不增加第二套槽位渲染器。未激活的发布仍然不会出现在源站公开页。
