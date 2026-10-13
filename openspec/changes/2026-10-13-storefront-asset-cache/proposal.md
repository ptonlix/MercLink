# Proposal

## Why

已发布店面的 CSS、JS 和商品图每次打开都从应用重新读取，并且响应是 `no-store`、文本不压缩。访客网络一慢，首屏就会停在占位内容。商品事实仍必须每次现算，不能靠缓存 HTML 来提速。

## What Changes

- 已发布店面里的非 HTML 资源允许浏览器短时间复用，并用对象键做弱校验；对象键变了才算新文件。
- 这些文本资源在客户端接受 gzip 时压缩后再发出。图片和字体不压缩。
- 含商品或店铺事实的 HTML 继续 `no-store`，不因缓存变旧。
- 公开媒体按图片 id 长期缓存。id 不存在时仍是 404，不能用条件请求把缺失图片变成 304。
- 正式 Compose 的 Caddy 只压缩文本类响应，避免再把 WebP 压一遍。

## Capabilities

### New Capabilities

- `storefront-release`: 已发布店面资源的缓存和压缩。HTML 事实仍每次生成。

### Modified Capabilities

- `product-images`: 公开媒体响应可缓存，且条件请求不能绕过未知 id。

## Impact

- `src/app-services/storefront/serve.ts`、`src/app-services/catalog/images.ts`、`src/app/media/[id]/route.ts`、`compose.yaml`。
- 不新增依赖，不改价格、库存、下单或授权。
- 店主激活新店面后，已经打开过页面的浏览器在 10 分钟内可以继续使用旧 CSS/JS。之后最多再把旧文件当作过期响应使用 24 小时，同时在后台重新校验。新访客立即看到新文件。
