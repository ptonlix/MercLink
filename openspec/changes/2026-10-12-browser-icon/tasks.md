# Tasks

- [x] 1. 定义统一熊猫标识
- [x] 2. 更新首页 Logo、SVG 与 ICO
- [x] 3. 验证小尺寸、首页和浏览器图标，执行项目检查

## Validation
- 首页名称前 Logo 与 SVG 使用同一图形生成，ICO 由该 SVG 生成 16/32/48px。
- 浏览器验证首页 Logo、新图标声明和 SVG/ICO 资源成功；截图已保存。
- `pnpm run check` 通过（303 个测试），OpenSpec 严格验证和 `git diff --check` 通过。
- 冒烟覆盖通过；专用冒烟进程未运行，完整冒烟未执行。
