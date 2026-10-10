# 这一家店的店面源码

改页面只读当前部署的 `/storefront/skill.md`。不要修改服务端仓库，不要把部署密钥或管理页放进这个目录。

首页、商品列表、商品页、授权外壳和支付结果页都由服务端当前组件生成，不要在这个目录里另写一份。

本地预览：`STOREFRONT_ORIGIN=http://127.0.0.1:3000 node preview.mjs`

预览会向 `STOREFRONT_ORIGIN` 读取已发布店铺和已上架商品，并填入事实槽位。这不是激活。源站公开接口不可用时返回 502。`/products` 读取 `products/index.html`，找不到返回 404，不退出进程。

本地验收：`node accept.mjs`

验收失败时不要确认激活。上传也不是激活。
