# 前端实施记录

日期：2026-10-09。根据用户“只改动前端”的授权，实施店铺首页、商品列表、详情及现有人工授权/账号页面。后端 API、应用服务、领域、数据库、OAuth provider 与 Skill 正文均未修改；未提交或推送。

## 展示与接口接入

| 页面                  | 已实现                                                                        | 既有后端接入                                                                                     |
| --------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `/`                   | 店铺介绍、手动滚动商品 banner、查看更多、买家/店主各四步介绍及 Skill 地址复制 | `loadLanding` → `publicStore.get` / `publicProducts.list`；对应公开店铺和商品 API 的相同查询结果 |
| `/products`           | 封面网格、金额和库存、真实 cursor 下一页链接                                  | `loadProductList` → `publicProducts.list`；查询事实与 `GET /api/v1/products` 共用                |
| `/products/{id}`      | 封面、全部规格、属性、SKU/ID、规格高亮和购买需求复制                          | `loadProduct` → `publicProducts.get`；查询事实与 `GET /api/v1/products/{id}` 共用                |
| `/authorize/device`   | 完整短码输入及用途说明                                                        | 保留 `POST /oauth/device` 和 `user_code`                                                         |
| `/authorize/buyer`    | phone/code/password/approve 服务端阶段、步骤提示、通知和原表单                | 保留 `POST /authorize/buyer/submit`、各 intent 和真实人机验证组件；验证通过前短信按钮禁用        |
| `/authorize/merchant` | 店主登录、首次改密、批准、上架说明                                            | 保留 `POST /authorize/merchant/submit`；首次改密前没有批准动作                                   |
| `/admin`              | 登录与改密                                                                    | 保留 `POST /admin/submit`；没有经营后台                                                          |
| `/authorize/account`  | 脚本密钥前缀、撤销状态和一次性秘密展示                                        | 保留原创建/撤销表单；已撤销 Key 无可用撤销按钮                                                   |

公开页仍由 Server Components 渲染，通过已注册的 seam 调用现有应用服务，不从浏览器重复 HTTP 请求同一份数据。Client Components 仅负责滚动、指引切换、复制、图片失败和规格高亮，不创建商品、订单或支付。

金额只在展示层从整数分格式化：CNY 15900 → `¥159.00`，USD 259900 → `USD 2599.00`。API/seam 与既有 JSON-LD 的数值均保持原样。规格缺货仍可读但不可选；`stock=null` 显示“不限库存”。

商品异常由前端 error boundary 提示重试，和空列表区分；不可公开商品沿用 `notFound()` / noindex，并提供返回列表。无封面与加载失败保留封面尺寸和占位。主要正文、两组四步指引、所有规格及普通导航不依赖 JavaScript。

## 验证

- 实际生产 React 组件在隔离 Next.js 验证环境中通过 1440/768/390/320px 共 68 个页面/状态组合，无整页横向溢出。
- 15 项交互检查通过：banner 滚动及首尾边界、查看更多、cursor 分页、指引键盘切换、真实剪贴板与拒绝回退、全部规格、缺货禁用、图片失败、验证码未通过时禁用、首次改密、无待授权、脚本撤销状态、focus、reduced-motion、无脚本与查询失败恢复。
- 浏览器 JavaScript 错误为 0。
- 公开页、发现文件、身份呈现 3 个测试文件、25 项测试通过，保留 SSR、可公开范围、元数据与 JSON-LD 断言。
- 正文与按钮的颜色对比度检查通过。
- Node.js 24 下生产构建、typecheck、lint、boundaries、Knip 通过。
- 首次全量检查受缺失数据库配置阻塞。随后按用户要求启动本地开发环境，在 Node.js 24 和独立测试数据库配置下重新运行 `pnpm run check`，全部通过：39 个测试文件、203 项测试通过，format/lint/typecheck/boundaries/Knip 均通过。使用项目既有数据库测试 harness，测试数据与页面预览数据库隔离。任务 5.3 已完成。
- 实际开发应用连接 PostgreSQL、Redis 和 MinIO 后，`/api/health` 与公开商品接口返回 200；新建店铺尚未发布介绍，店铺接口按原协议返回 404。首页、商品列表、店主登录、管理登录在 1440/390px 共 8 个页面组合均返回 200，无横向溢出或浏览器 JavaScript 错误；四步店主指引切换、查看更多跳转和无脚本八步说明通过。未执行真实短信、支付或人工设备授权。
- 页面与服务端 JS bundle 无测试商品或预览逻辑。现有 `Dockerfile` 的构建阶段只复制依赖清单、构建配置和 `src`，不复制 `openspec`，因此设计附件不会进入正式 Docker 镜像。本地仓库直接构建时，instrumentation 的宽范围文件跟踪可能携带未被代码引用的设计附件；若直接分发本地 standalone 目录，需按部署流程移除这些附件。构建配置保持原实现。

截图使用明确标注的测试数据，仅用于验证实际组件的排版与交互。截图与逐项验证 JSON 已移到 Git 忽略的 `tmp/frontend-review-artifacts/`，不随源码提交。隔离验证环境已删除，生产代码不引用原 HTML 样稿或测试数据。

## 与样稿的差异与部署

生产页面使用真实 Next.js 路径和普通 form POST，没有预览工具栏、hash 路由、状态模拟器或演示授权按钮；没有发布资料时不补样例店名或商品。授权成功仍由后端确认，provider 自行生成的短码确认/成功/错误页面保留原实现，以遵守本轮只改前端的范围。

不需要数据迁移或新依赖。配置现有 `.env.example` 要求的开发环境并启动现有依赖后，按项目原流程 `pnpm run dev` 或构建部署即可。回退本轮前端文件即可恢复原呈现，不需回滚业务表或付款记录。主规格尚未同步，变更尚未归档。

开发联调地址为 `http://127.0.0.1:3000/`，页面与 API 由同一个 Next.js 开发进程提供。开发环境使用现有 `compose.dev.yaml` 的 PostgreSQL、Redis、MinIO 及开发模拟短信/支付，凭据仅在被 Git 忽略的本地配置中；后端源码未改动。初次联调未注入示例商品；后续实际商品通过商家 Agent 上架，与 HTML 样稿示例分开。
