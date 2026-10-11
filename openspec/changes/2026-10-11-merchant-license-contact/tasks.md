# Tasks

## 1. 资料形状

- [x] 1.1 追加 `016_merchant_profile_facts.sql`，为 `merchant_profiles` 增加执照和客服可空列及成组检查，并新增 `merchant_profile_images`。验证不修改 `011_merchant_profiles.sql`，也不回填现有行。
- [x] 1.2 扩展资料领域解析：九个顶层字段必须齐全，`license` 和 `contact` 可为 `null`，残缺执照、错误 GB 32100 校验位、身份证号形状、登录号和未知字段返回 `validation_error`。用虚构代码 `91310000MA1FL0000N` 验证通过，并用错误校验位验证拒绝。
- [x] 1.3 保存和读取整份资料，空草稿返回两组 `null`。验证发布不要求执照或客服，注册地址不覆盖 `address`，失败写入不改变已发布资料。

## 2. 资料图片

- [x] 2.1 实现 `POST /api/v1/merchant/profile/images`，只接受 `purpose` 为 `license` 或 `contact_qr` 的单文件，并把字节写入已配置对象存储。验证买家收到 `forbidden`，SVG 和超限文件不留下可公开对象。
- [x] 2.2 让资料上传计入现有商家 `image-upload` 窗口。验证第 30 次目录上传后再上传资料图返回 `rate_limited`，Redis 不可用时返回 `dependency_unavailable` 且不写字节。
- [x] 2.3 扩展 `GET /media/{id}` 读取资料图，并验证资料 URL 不能当封面、商品图 URL 不能当执照或二维码。验证上传不发布店铺介绍。
- [x] 2.4 把新路由登记到 `src/shared/api-routes.ts` 和 `tests/smoke/manifest.ts`。验证漏登记时冒烟覆盖测试失败。

## 3. 公开事实

- [x] 3.1 已发布 store seam 返回 `license` 和 `contact`，未保存时键存在且值为 `null`。验证未发布、撤回和商家停用时公开接口不回显草稿。
- [x] 3.2 默认落地页、`/index.md` 和 JSON-LD 展示同一份已发布事实，并在任一组存在时显示 `商家自行填写，本系统未核验。`。验证注册地址不进 `PostalAddress`，且没有认证类型；两组都为空时不显示通知。
- [x] 3.3 增加店面槽位 `store.contact_phone`、`store.contact_label`、`store.contact_qr`、`store.license_name`、`store.license_credit_code`、`store.license_legal_person`、`store.license_address`、`store.license_image`。验证旧发布缺少这些槽位仍可激活，写死信用代码或客服电话不能激活。
- [x] 3.4 确认 `llms.txt` 不内嵌执照或客服。验证已发布执照的信用代码不出现在该文件。

## 4. Skill 和说明

- [x] 4.1 更新 `/merchant/skill.md`：九字段示例两组均为 `null`，说明推荐录入、先展示四项并同意后再上传，以及资料图片路径和 `purpose`。验证 Skill 不含可通过校验的信用代码、真实执照或令牌，且路径测试通过。
- [x] 4.2 更新 `/storefront/skill.md` 和 `docs/FRONTEND_API_GUIDE.md`，列出新槽位与公开字段。在 PRD 第 9 节补一句：执照和客服是推荐事实，不是开通或上架条件。验证说明与路由表一致。

## 5. 门禁

- [x] 5.1 运行资料、图片、公开页和 Skill 相关测试，再运行 `pnpm run typecheck` 与 `pnpm run boundaries`。验证领域层没有为保存执照去查库或调用厂商 SDK。
- [x] 5.2 准备提交前运行 `pnpm run check`。若改动了公开发现或资料路由，再按仓库规范运行冒烟；没有 `merclink_smoke` 进程时只运行冒烟覆盖测试，并写明完整冒烟未跑。
