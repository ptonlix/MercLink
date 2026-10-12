# Proposal

## Why

`/llms.txt` 现在只给短链接标签。Agent 分不清每份文档给谁读、打开后有什么、不能拿它做什么，容易把落地页 Markdown 当成下单入口，或从目录里猜测缺了哪一项店铺事实。

## What Changes

- `/llms.txt` 固定为三个 H2：先读、页面、接口。每条链接说明受众、打开后的内容，以及不能用它做的事。说明不再缩短。
- 已发布店名和简介仍只出现在 H1 和 blockquote。没有已发布介绍时，H1 仍是 MercLink，摘要仍是现有 `storeExplanation`。
- 链接说明可以引用字段名，以及这句固定通知：「商家自行填写，本系统未核验。」这是在说明落地页 Markdown 何时出现这句话，不是嵌入已发布执照或客服。
- **BREAKING**：只破坏把「已发布执照时 `/llms.txt` 不得包含这句通知」当成契约的读取方。信用代码、电话、地址值、区域值、网站、标识、法人和商品行仍然不得出现。
- 不生成 `llms-full.txt`。不把商品目录列进目录。链接使用 `absoluteUrl`。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `public-pages`：`/llms.txt` 用固定三段说明每条链接的读者、内容和禁区；允许引用未核验通知句，仍禁止嵌入店铺值和商品行。

## Impact

- 只改 `src/public-discovery/site.ts` 的 `llmsText()`，以及 `src/public-discovery/discovery.test.ts` 里写死旧文案或旧禁令的断言。
- 不改 `/index.md`、`/products.md`、商品 Markdown、三份 Skill 正文、路由或店铺 JSON。
- 不新增依赖。不把真实商家资料写进 `llms.txt`。
- 未归档的 `2026-10-11-merchant-license-contact` 仍写着 `/llms.txt` 不得包含通知句。本变更只放宽这一句固定引用。归档时不要把那条禁令合并回来。
