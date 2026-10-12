# Proposal

## Why

`/llms.txt` 把 `/api/v1` 写成 HTTP API 根地址，并叫 Agent 去三份 Skill 里找路径。给人看的接口文档在 `/interfaces`，目录里没有这条路径，Agent 和人都会停在一个没有处理器的前缀上。首页「如何使用」把「查看店面 Skill」塞在店主上架的第一步里，改页面没有自己的步骤，读者不知道店面和上架是两件事。

## What Changes

- `/llms.txt` 的「接口」一节增加绝对链接 `/interfaces`，标明它是给人看的已登记路径、字段、认证和权限，不是调用说明，也不能代替三份 Skill。
- `/api/v1` 仍保留为机器前缀。说明改为：它不是文档；已登记路径见接口文档；具体怎么调用仍以三份 Skill 为准，不要猜。
- 不把接口清单嵌进 `/llms.txt`，也不给 `/api/v1` 加文档响应。
- 首页使用介绍把店主上架和改店面收进同一个身份「我是店主，想配置」。面板内用「上架商品」和「修改店面」区分。改店面单独链接「查看店面 Skill」，并说明只改给人看的页面、事实用槽位、上传不等于上线。上架小节不再附带这条链接。
- 买入关闭时，这条工作流不引导下单或完成购买。
- **BREAKING**：只破坏把 `/llms.txt` 的「接口」链接清单固定为四条、或把店面 Skill 只放在上架步骤里的读取方。

未归档的 `2026-10-12-interface-directory` 曾写「`/llms.txt` 仍只指向 `/api/v1`」。本变更覆盖那一句：机器前缀保留，同时给出接口文档路径。`/interfaces` 仍不是 Agent 的调用说明。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `public-pages`：发现目录必须指向接口文档；落地页必须在「我是店主，想配置」里区分上架和改店面。

## Impact

- 改 `src/public-discovery/site.ts` 的目录正文、使用介绍组件和样式，以及对应单元测试。
- 冒烟里 `/llms.txt` 的正文断言要锁住 `/interfaces`。不改路由表，不改 Skill 正文，不新增依赖。
