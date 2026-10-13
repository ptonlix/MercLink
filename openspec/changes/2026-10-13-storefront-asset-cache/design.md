# Design

## 选择

静态资源的 URL 在两次发布之间不变，内容随 release 的对象键变。所以不能把 `/styles.css` 标成永久不变，只给 10 分钟新鲜期，之后用 `ETag` 做弱校验。对象键是 `storefront/releases/{releaseId}/static/...`，新发布会换键。

HTML 里的价格、库存和店铺资料是请求时填的。继续 `no-store`。压缩只减少传输，不让浏览器留住这份 HTML。

媒体 id 一旦写入就不会被覆盖。可以用 `immutable` 缓存一年。未知 id 必须先查库，查不到仍返回 404。

压缩放在两层，避免只改一层时现网仍然原样传输：

- 应用对可压缩的文本设置 `content-encoding: gzip`。图片字节保持原样，满足公开媒体“返回原始字节”的规格。
- Caddy 的 `encode` 匹配上游响应的 `Content-Type`，不看请求头。只压缩 `text/*`、JSON、XML 和 SVG。上游已经带 `content-encoding` 时 Caddy 不会再压一次。

不在进程内缓存对象字节。测试会改写同一个对象键；生产上对象键本身不可变，但多一层内存缓存不能让测试和线上行为分叉。

## 不做

- 不把店面搬到 CDN，也不改部署地区。新加坡出口慢仍然要靠机器和线路解决。
- 不改写主题里的资源 URL，不为了永久缓存去给 CSS 加指纹。
- 不缓存商品查询结果，不让 HTML 带 `max-age`。
- 不压缩 WebP、PNG、JPEG、GIF 或字体。
