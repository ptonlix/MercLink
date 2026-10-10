# Design

## Context

公开页原来由 `src/public-discovery` 直接填数。店面起始源码是另一份静态 HTML。两份会分叉。

## Goals / Non-Goals

**Goals:**

- 只改 `src/public-discovery` 的组件和 `public.css`，默认页和下载包一起变。
- 事实仍由 `renderDocument` 填槽位，不写进模板。
- 删除手写的 `storefront/static` 首页、商品页和样式。

**Non-Goals:**

- 不在模板里保留只在浏览器脚本里出现的复制按钮和横幅箭头。
- 不让下载包 import 服务端 TypeScript。

## Decisions

### 组件只描述槽位，请求时再填

`LandingTemplate`、`ProductListTemplate`、`ProductTemplate` 是默认页结构。页面请求用 `renderDocument` 填当前店铺和商品。源码包把同一次 `renderToStaticMarkup` 的结果包成 HTML，样式使用同一份 `public.css`。

部署地址用 `site.origin` 槽位，避免把当时的源站写进文件。

### 不再保留第二份静态首页

打包时跳过磁盘上的旧首页、商品页和样式，改写入生成结果。授权页和支付结果页仍在 `storefront/static`，因为它们不是默认公开商品页。

## Risks / Trade-offs

- [生成的 HTML 和激活后的填充不一致] → 两边都调用 `renderDocument`。
- [使用说明里的「不表示支付成功」被当成写死成功] → 验收把这句否定排除，仍拒绝肯定的支付成功文案。

## Migration Plan

已下载的旧源码不会自动变成新模板。重新下载后才是当前默认页。未激活的旧发布不受影响，直到重新上传。

## Open Questions

无。
