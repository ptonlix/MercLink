# Proposal

## Why

商家 Skill 已经要求先上传再写 `cover`，但下一句把外部 http(s) URL 写成同等选择。上传返回 `50301` 时，Agent 会改用私有生成图地址。页面能渲染 `img`，浏览器却得到 403，封面看起来是空的。

## What Changes

- 商家 Skill 把本店上传定为封面的正常路径。Agent 不直接写对象存储，只把上传返回的 `data.url` 写入商品或规格 `cover`。
- 上传返回 `dependency_unavailable` `50301` 或 `rate_limited` `42900` 时停止，不改 `cover`，也不改用外部地址、生成图地址或本地文件。
- 外部 http(s) URL 仍可写入，但只在用户明确给出、且匿名浏览器不带登录、签名或 Cookie 就能打开时。私有桶和 403 地址不能当封面。
- 不改变上传接口、对象存储或 `cover` 校验。接口仍接受外部绝对 http(s) URL。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `agent-skills`：商家 Skill 必须教 Agent 先上传、失败即停，并且不得把不可公开读取的地址当作封面退路。

## Impact

- 只改 `/merchant/skill.md` 和对应测试。买家 Skill、路由表和图片接口不变。
