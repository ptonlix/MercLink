## 1. 基础呈现与样式边界

- [x] 1.1 复核本地 Next.js CSS、Server/Client Components 和相关表单指南；确认仅自有页面的呈现范围及 provider 错误页可配置边界。
- [x] 1.2 在 `src/app/globals.css` 添加 `--ml-` 设计变量、基础字体、focus 与 reduced-motion 规则，不扩展业务能力。
- [x] 1.3 将公开页内联样式迁到 `src/public-discovery/public.module.css`，给授权样式加根类隔离，验证路由间样式不互相覆盖。

## 2. 公开页面

- [x] 2.1 重排 `LandingView/StoreHeader/StoreFooter`；保持店铺优先和暖纸衬线绿色，首页改为 banner → 查看更多 → 平台分步介绍 → 简洁页脚，无资料不伪造店名。
- [x] 2.2 复用同一份商品事实，实现首页宽幅 banner 的标题、价格、库存和封面，以及列表商品卡；桌面约两张、手机一张露出下一张，保留手动滚动，禁用脚本仍可读。
- [x] 2.3 将 `ProductListView` 改为响应式网格，保留真实 cursor 下一页链接，不新增搜索、分类或商品总数。
- [x] 2.4 将 `ProductView` 改为封面/主信息两列及公开字段区域，完整呈现所有可售规格、真实 key、库存 null/0、SKU 和 id。
- [x] 2.5 为无商品、无图、查询异常及不可公开商品分别呈现恢复提示；不可公开商品保持已有 404/noindex 且无残留 offer。
- [x] 2.6 实现仅作用于展示层的多货币金额格式化，验证 CNY 15900 显示 `¥159.00`；seam/API 整数分与既有 JSON-LD 标准价格格式不变。
- [x] 2.7 在 banner 下方添加始终可用的“查看更多”普通 `/products` 链接，再用 `<ol>` 展示买家购买与店主上架的各四步使用介绍；API 和发现链接留在页脚。

## 3. 渐进增强

- [x] 3.1 用最小 Client Component 实现使用步骤中的 Skill 绝对地址复制与成功/失败反馈，及买家/店主指引切换；切换支持键盘，禁用脚本时两组步骤和普通链接仍可读。
- [x] 3.2 实现详情规格高亮和复制购买需求，保留样稿规定的重新查询/确认提示，不创建订单、付款或提交页面价格。
- [x] 3.3 确认缺货规格事实可读但不能用于购买辅助复制；剪贴板受限时给出可选中原文，无虚假成功提示。

## 4. 人工授权与账号页

- [x] 4.1 统一自有设备码页面的短码输入、用途与错误样式，保留 `/oauth/device` POST 和 `user_code`。
- [x] 4.2 统一买家 phone/code/password/approve 的展示，保留真实 captcha/SMS 顺序、input name、intent、pendingApproval 条件与邮箱可选规则。
- [x] 4.3 统一商家登录/首次改密/批准；首次改密前无可用批准动作，不显示注册、虚构 Agent 名称或申请权限。
- [x] 4.4 统一 `/admin` 登录/改密和 `/authorize/account` 脚本 Key 页面，不新增经营后台或将 Key 引入 Agent 流程。
- [x] 4.5 为现有 notice 设置 alert/live feedback，并在服务端已确认结果后呈现成功；不将点击、跳转或付款链接打开当成成功。

## 5. 验证与交付

- [x] 5.1 更新 `src/public-discovery/pages.test.ts`、`discovery.test.ts` 中受呈现影响的断言，保留 SSR、店铺顺序、可见范围、发现文件和 JSON-LD 一致性验证。
- [x] 5.2 更新 `src/app-services/identity/pages.test.ts` 的表单呈现断言，覆盖首次改密前批准不可用和无 pendingApproval 不出现批准，不改身份规则测试。
- [x] 5.3 用项目现有 harness 运行受影响测试；运行 `pnpm run typecheck`、`pnpm run boundaries`，最后在 Node.js 24 和测试数据库配置下运行 `pnpm run check`。
- [x] 5.4 验证 1440/768/390/320px，首页 banner 滚动及边界、查看更多跳转、步骤切换、分页、全部规格、图片失败、键盘 focus、颜色对比、reduced-motion 和禁用脚本，保存有代表性的截图。
- [x] 5.5 核对生产 bundle 不引用 `preview/` fixture 或演示授权 JS；给出与设计样稿的差异和部署/回退说明，不主动提交或推送。

本轮已获授权实施前端。仅完成的生产实施任务勾选，后端和 OAuth provider 的协议及其生成页面保持原实现。
