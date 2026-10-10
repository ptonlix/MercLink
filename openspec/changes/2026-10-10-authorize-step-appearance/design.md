# Design

## Context

`/authorize/buyer` 与 `/authorize/merchant` 现在一进页就 `storefrontAuthorizeTarget()`，有声明就 `redirect` 到静态文件。提交路由仍回到这两个路径，下一步又被同一份文件换掉。人机验证组件只存在于内置 `BuyerAuthorizeView`，上传的 HTML 不会在服务端执行。

## Goals / Non-Goals

**Goals:**

- 服务端继续按现有页面规则选择步骤，只把当前步骤的模板外观嵌进授权页。
- phone 步没有 captcha 槽位，或整步模板缺失时，回退内置页，登录和批准不中断。
- 起始授权外壳从 `BuyerAuthorizeView` / `MerchantAuthorizeView` 生成全部步骤模板。

**Non-Goals:**

- 不改支付、退款、设备码完成、scope 或商家注册。
- 不改 `pay/result.html` 的订单槽位。
- 不恢复手写的 `storefront/static/account`。
- 不执行上传脚本，也不新增错误码或表。

## Decisions

### 授权页只取当前步骤模板

激活发布声明了入口且文件存在时，从 HTML 中取出固定名字的 `<template>`。买家是 `authorize.phone`、`authorize.code`、`authorize.password`、`authorize.approve`。商家是 `authorize.merchant.login`、`authorize.merchant.change-password`、`authorize.merchant.approve`。页面仍按会话和查询参数决定步骤。没有对应模板、模板里没有表单，或读取失败时，该步渲染内置 view。

`/account/buyer.html` 和 `/account/merchant.html` 仍按静态文件分发，不再取代 `/authorize/*`。

### 事实和人机验证只由服务端填入

模板用空槽位承接事实：`authorize.notice`、`authorize.phone`、`authorize.account.name`、`authorize.account.phone`。phone 步还必须有 `authorize.captcha`。服务端把现有 `BuyerCaptcha` 注入该槽位；开发桩则注入隐藏的 `captchaVerifyParam`。没有 captcha 槽位就整步回退，避免自定义表单绕过人机验证发短信。

模板必须能被严格解析成允许的片段，否则该步回退内置页。不允许先用正则删掉 `script`、事件或 `javascript:` 再把剩余文档插进页面。`svg/onload`、`img/onerror`、实体编码的 `javascript&#58;`、`iframe`、`base`、`object`、`embed`、刷新 `meta`，以及无法证明安全的外来标记，都整步回退。允许的标签和属性只覆盖内置授权模板实际用到的那些。

表单的 `action` 改回 `/authorize/buyer/submit` 或 `/authorize/merchant/submit`。`phone`、`code`、`intent`、`captchaVerifyParam` 由服务端写入将要提交的表单，注释、textarea、select 和 button 不算已绑定。模板不能把攻击者的手机号或 intent 放在服务端字段前面。人机验证挂载点必须在该表单内，重复或表单外的挂载点整步回退。验证码输入和模板里写死的验证码、成功文案不作为 notice 或短信码。code、password 步的手机号以服务端已知值为准。

密码步可以用 `<merclink-mode name="login|register">` 放两种外观，批准步可以用 `<merclink-pending>` 与 `<merclink-idle>`。服务端只留下当前状态。没有这些标记时，整段模板都用，并由服务端写入对应 intent。

### 起始外壳仍从授权组件生成

`renderStarterFragments` 对每个步骤调用同一套 view 的模板模式，包进对应 `<template>`。模板模式把 notice、手机号和 captcha 画成空槽位，不把当时的验证码或成功文案写进文件。不新增 `storefront/static/account`。

## Risks / Trade-offs

- [自定义外观漏了 notice 槽位，用户看不到失败原因] → 没有该槽位时，服务端把当前 notice 放在模板之前。
- [模板把表单指到别处，或夹带脚本和事件] → 能改写的 action 仍改回提交地址；无法严格证明安全的文档整步回退，不删一段后继续用。
- [静态授权文件带槽位，打开时被事实渲染器扫过] → 未知授权槽位保持原样，不改订单槽位规则。

## Migration Plan

已激活且声明了授权入口的发布，下次打开授权页即按步骤模板渲染。没有对应模板的旧文件会回退内置页，而不是整页跳转。要使用新外壳，需重新下载源码、上传并确认激活。不改已有发布指针。

## Open Questions

无。
