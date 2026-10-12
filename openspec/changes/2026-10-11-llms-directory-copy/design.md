# Design

## Context

见 `proposal.md`。`llmsText()` 在 `src/public-discovery/site.ts` 生成 H1、blockquote 和两段短链接。路由只把已发布的展示名和简介传进去。已发布执照时，测试禁止正文出现「商家自行填写，本系统未核验。」

未归档的 `2026-10-11-merchant-license-contact` 也禁止这句通知出现在 `/llms.txt`。本变更不改那份提案，也不改主规格。归档时以本变更为准。

## Goals / Non-Goals

**Goals:**

- 目录固定为「先读」「页面」「接口」，每条链接写清给谁读、打开后有什么、不能拿它做什么。
- 链接继续用 `absoluteUrl`。店名和简介仍只进 H1 和 blockquote。
- 通知句只作为落地页 Markdown 行为的固定引用，用现有 `unverifiedProfileNotice`，避免和落地页文案分叉。

**Non-Goals:**

- 不改 `/index.md`、`/products.md`、商品 Markdown、三份 Skill、店铺 JSON 或路由。
- 不生成 `llms-full.txt`，不把商品目录或商品行列进目录。
- 不把真实商家的地址、电话、信用代码或商品行写进目录文案。
- 不把 `/products/{id}` 模板做成假的绝对链接。它留在说明文字里。

## Decisions

### 只改链接表，不改函数签名

`llmsText(origin, store)` 仍只接收展示名和简介。执照、客服和商品不进入这个函数，这样目录无法嵌入它们的值。说明文字是常量。

备选是按已发布字段动态缩短说明。那会让目录又变成一份资料，并重新禁止通知句。不采用。

### 沿用 Markdown 链接，标签保留路径

每条仍是 `- [标签（路径）](绝对 URL): 说明`。说明使用给定中文，不再缩短。分隔符沿用现有 ASCII 冒号，避免同一文件混用两套链接语法。路径模板 `/products/{id}` 和 `/products/{id}.md` 只出现在说明里。

### 通知句允许出现，值仍然禁止

说明里的「商家自行填写，本系统未核验。」引用 `unverifiedProfileNotice`。测试改为断言这句存在，并继续断言信用代码、电话、地址值、区域值、网站、标识、法人和商品标题不存在。字段名可以出现。

### 不新增目录项

九个链接是：`/index.md`、`/products.md`、`/skill.md`、`/`、`/products`、`/api/v1/store`、`/merchant/skill.md`、`/storefront/skill.md`、`/api/v1`。不加入 `/api/v1/catalogs` 或商品页。店铺 JSON 的受众标注在路由表里是为了 Skill 文档分组；公开读取本身不校验令牌，未发布返回 404。目录按这个事实写，不改路由。

## Risks / Trade-offs

- [未归档提案仍禁止通知句] → 不修改那份 delta。本变更的规格写明通知句可以出现，值不可以。归档时不要把旧禁令合并回来。
- [说明变长] → 仍然不内嵌商品或店铺值。不提供 `llms-full.txt`。
- [店名碰巧等于某个字段名] → 现有测试用不会撞车的店名。不为此改公开店名规则。

## Migration Plan

替换 `llmsText()` 的链接表，并改 `discovery.test.ts` 里写死的旧断言。没有数据迁移。回滚时恢复短链接表，并恢复「不得包含通知句」的断言。

不改已启动进程的路由、鉴权或响应信封。完整冒烟不在本次范围内；不要把未跑的冒烟说成通过。
