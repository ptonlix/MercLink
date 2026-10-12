# Proposal

## Why

公开店面现在是暖纸加绿色按钮，看起来像通用商品模板，盖不住成都夜游线路的封面。店主要求整站更高级，并允许改页面规格。

## What Changes

- 公开页和共用色板改为深暖墨底、象牙文字、衬线店名，强调色只留一处黄铜，不再用绿色铺按钮。
- 首页商品横滑保留，封面成为卡片主视觉。商品页封面与标题并置。
- 不改路径、槽位、价格来源、页脚顺序，也不引入浏览器脚本或新依赖。
- **BREAKING**：只破坏把「暖纸背景 + 一种绿色强调」当成公开页外观契约的读取方。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `public-pages`：落地页商品架的外观从暖纸和绿色改为深暖墨、象牙文字和一种黄铜强调。

## Impact

- 改 `src/app/globals.css`、`src/public-discovery/public.css`、`src/app/authorize/authorize.css`。
- 不改接口、Skill 路径或店面槽位。
