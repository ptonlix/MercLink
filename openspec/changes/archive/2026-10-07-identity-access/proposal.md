# Proposal

## Why

商家不能自助注册，买家必须先在授权页完成手机号注册，Agent 也不能持有长期密钥。没有这条身份闭环，商品和订单切片无法判断谁有权调用。

## What Changes

- 首次部署时用环境变量创建唯一超级管理员；首次登录必须改密后才能开通商家。
- 超级管理员开通、停用商家和重置密码。开通时请求创建该商家的默认目录。
- 买家授权页按验证码 2.0、短信核验、设置密码的顺序注册。商家授权页没有注册入口。
- Agent 通过 OAuth 2.1 授权码加 PKCE 或设备码取得短期访问令牌和可轮换刷新令牌。
- 脚本用的 API Key 只在登录后的页面创建，不进入 Agent 流程。
- 不实现目录字段、商品、订单支付或公开落地页。

## Capabilities

### New Capabilities

- `admin-merchant-accounts`: 超级管理员、商家开通停用、强制改密，以及开通时创建默认目录的请求。
- `buyer-registration`: 买家手机号注册、登录和短信发送前的人机验证与频率限制。
- `agent-authorization`: OAuth 2.1、Scope、令牌撤销、API Key 和未认证响应。

### Modified Capabilities

- 无。

## Impact

- 独占 `src/domain/identity`、`src/domain/access`、对应应用服务、阿里云验证码和短信适配器、`020_identity.sql`、超管页和授权页。
- 通过平台接缝注册认证实现；不修改平台根配置，也不写入商品或订单表。
- 默认目录的实际创建由目录切片的接缝完成。本切片在接缝未注册时仍能完成账号和令牌验收，并报告目录创建待合并。
