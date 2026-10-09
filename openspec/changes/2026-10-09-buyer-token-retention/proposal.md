# Proposal

## Why

买家 Agent 换到访问令牌后只留在当次命令里。支付完成后查单时没有 `Authorization` 头，接口返回 `40100`。Agent 把这理解成必须重新走设备码，而不是带上已经拿到的令牌。

## What Changes

- 买家 Skill 要求换到令牌后自己保存 `access_token` 和 `refresh_token`，不给用户，也不写进对话。
- 下单和之后的查单使用同一个访问令牌。
- 请求没有 `Authorization` 头时的 `40100` 只表示这次没带令牌。手里还有令牌时不重新申请设备码。过期用刷新令牌换；刷新令牌也没有时才重新申请设备码。
- 不改变授权、下单或查单接口。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `agent-skills`：买家 Skill 必须教 Agent 保存并复用买家令牌，不能把缺头的 401 当成重新设备码授权。

## Impact

- 只改 `/skill.md` 和对应测试。商家 Skill、路由表和 OAuth 接口不变。
