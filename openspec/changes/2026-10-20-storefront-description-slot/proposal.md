# Proposal

## Why

商品描述已经能写入、能搜索，也已经进入 JSON-LD。店面渲染器会填 `product.description`，但 `/storefront/skill.md` 的槽位清单没有这一条。照着 Skill 改页面的人会以为不能用它，于是把描述写死，或一直不声明槽位，商品页正文保持空白。

## What Changes

- 店面 Skill 列出可选槽位 `product.description`，并说明服务端填的是当前商品自己的纯文本描述。
- 未声明该槽位的模板仍然可以发布。已发布模板不会被改写成自动出现描述。
- 不把该槽位加进商品页的必填槽。首页和商品列表不必声明它。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `agent-skills`：店面 Skill 说明可选的商品描述槽，以及不声明时页面不出现描述。

## Impact

- 只改 `/storefront/skill.md` 和对应测试。
- 不改路由、槽位填充、发布校验、内置商品页或已激活的店面文件。
