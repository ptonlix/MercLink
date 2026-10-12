## Tasks
- [x] 1. 更新设计及行为规格
- [x] 2. 实现弧形悬浮轮转，清理旧滚动和克隆逻辑
- [x] 3. 收拢详情返回路径，首页承接必要分页
- [x] 4. 浏览器复核、回归测试和 check、冒烟覆盖

## 验证
- `pnpm run check` 通过：52 文件、301 项测试，format/lint/typecheck/boundaries/Knip 均通过。
- 冒烟 coverage 1/1 通过；没有专用 merclink_smoke 进程，完整冒烟未运行。
- 浏览器确认：三个唯一商品链接的 matrix3d 随时间改变 x/y/z；暂停与前后浏览生效；悬浮阴影与透视可见；详情唯一返回首页并实际回到首页；320/390 宽度无页面溢出；键盘聚焦将商品移至正前方；无 console error。
- 分页回归覆盖首页第二组、Markdown canonical 与 HTTP alternate header 的游标一致性。
- finesse 按单 CSS 文件扫描仍报告缺引擎，实际引擎位于 interactions.tsx 的 requestAnimationFrame；已经通过浏览器验证，未将正则结果声称为全绿。
