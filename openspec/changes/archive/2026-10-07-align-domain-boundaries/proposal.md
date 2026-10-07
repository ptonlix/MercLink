# Proposal

## Why

领域边界和端口已经分开，但同一个业务概念仍有两套名字，跨上下文还会直接改别人的表。几条被测试锁住的规则并不是线上执行的函数，后续改动会改到测试通过、行为不变的死代码。

## What Changes

- **BREAKING**：自定义商品值只叫 `fields`。数据库列 `attrs` 改名为 `fields`，领域类型同步改名。API 本来就叫 `fields`。
- **BREAKING**：字段单选项只叫 `choices`。规格轴只叫 `axes`，创建路径改为 `/axes`。规格组合只叫 `option_values`。不再把这三件事都叫 `options`。
- 注册挑战使用 `chg_` 前缀，不再复用 grant id。
- API Key 仍是凭证名。运行时调用方只叫 `script`，不新增第二种 actor 类型。
- 停用商家、列出商家目录、判断账号能否登录，都改为调用对方上下文拥有的接缝。身份模块不再引用访问领域。
- 页面和提交路由不得直接引用领域模块。依赖检查要拦住 `app → domain`，以及一个应用服务引用另一个上下文的领域模块。
- 调用方传价格、图片大小、上传限流数字、短信限流文案，都只定义在领域函数里。应用层调用这些函数，不能再保留一份平行判断。
- 上传限流使用注入的时钟，不再直接 `new Date()`。

## Capabilities

### New Capabilities

- `context-seams`: 跨上下文只通过对方拥有的接缝，页面不直接引用领域模块。

### Modified Capabilities

- `catalog-schema`: 字段单选项改称 `choices`。
- `product-variants`: 自定义值、规格轴和规格组合使用唯一名字。
- `product-query`: 公开和商家 JSON 使用同一套名字。
- `order-placement`: 拒绝调用方价格的领域函数就是线上执行的函数。
- `buyer-registration`: 注册挑战有自己的 id；短信限流规则只保留一份活定义。
- `admin-merchant-accounts`: 停用商家通过访问接缝撤销授权。
- `shared-api-contract`: `script` 是 API Key 对应的唯一 actor 名，并补上挑战 id 前缀。
- `agent-skills`: 商家 Skill 改用新的规格轴路径和字段名。
- `app-runtime`: 依赖检查覆盖页面和跨上下文领域引用。

## Impact

- 商家和买家 Skill、路由表、商品 JSON 会变。旧的 `options` 请求体和 `/options` 路径不再接受。
- 需要一次列重命名迁移。已有订单快照继续可读，但新快照使用 `fields`。
- 不重做目录、订单或支付流程，只把已有规则挪回它所属的上下文。
