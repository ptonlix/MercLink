# Proposal

## Why

激活发布若声明了 `authorize_buyer` 或 `authorize_merchant`，`/authorize/buyer` 和 `/authorize/merchant` 会 307 到同一份静态 HTML。提交仍跳回这两个授权路径，于是验证码、改初始密码和批准又被换成同一页。服务端不执行上传脚本，人机验证也不能靠商家页面自己补上。

## What Changes

- 授权页继续由服务端决定当前步骤，不再整页跳到 `account/buyer.html` 或 `account/merchant.html`。
- 声明的文件只提供对应步骤的 `<template data-merclink="...">` 外观。缺步骤、缺表单，或买家 phone 步没有 `authorize.captcha` 槽位时，该步用内置授权页。
- 服务端把现有人机验证注入 captcha 槽位，填入 notice 和手机号等事实，并把表单提交改回现有地址。不执行模板脚本，不把模板里的验证码或成功文案当成事实。无法严格解析成允许片段时整步回退内置页，不删掉脚本或事件后继续使用。
- 起始源码的授权外壳改为带齐步骤模板，并由同一套授权组件生成。`/account/buyer.html` 与 `/account/merchant.html` 仍可单独打开。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `storefront-release`：授权外观按步骤渲染，不再整页替换授权流程。
- `storefront-skill`：说明声明的是步骤外观，phone 步必须留 captcha 槽位。
- `agent-authorization`：授权页和提交回跳仍留在现有授权路径。

## Impact

- 授权页、店面渲染和起始源码生成。不改支付、退款、商家注册、设备码完成或 scope。不改表，不新增依赖。
