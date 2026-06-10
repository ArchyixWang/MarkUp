# MarkUp 前端移动端适配现状与方案

## MarkUp 前端移动端适配现状

### 已有移动端能力

- 全站顶部导航 `SiteNav` 已有移动菜单 Drawer，登录、注册、工作台入口在小屏不会完全消失。
- `AppShell` 在 `max-width: 820px` 下会隐藏工作台侧边栏，并显示横向滚动的工作台二级导航，避免 768px 平板竖屏继续被桌面侧边栏挤压。
- 首页、登录页、任务广场已有部分响应式 CSS，基础公开页面在手机端已经比工作台页面稳定。
- 工作台页面大量使用 Ant Design 的 Table、Modal、Drawer、Tabs、Steps、Form、Upload、Select、Dropdown，并有统一的 `WorkspaceApp.css` 视觉变量。
- 任务管理、数据集管理、AI 预审等页面已有 `table/card` 视图切换或卡片列表基础。
- 数据集多模态预览已抽象出 `WorkspaceMediaPreview`，图片、音频、视频可共用同一预览组件。
- 模板 Renderer 的图片 Mask 标注组件已使用 pointer/touch 友好的画布区域，具备移动端触摸绘制的基础。
- 模板搭建 AI 和任务发布 AI 已改用 Ant Design X/X Skill 相关对话组件，并有快捷指令、变更/预览、清除对话等结构。

### 最容易溢出的页面

- 模板 Designer：桌面三栏 `240px / canvas / 300px`，画布、物料库和属性面板依赖固定高度，不适合直接压缩到手机宽度。
- 新建任务向导：桌面使用步骤栏 + 主表单 + 右侧摘要，7 个步骤在手机端横向铺开会挤压。
- 数据集表格编辑：Ant Design Table 列可增删改，列宽和多模态单元格会产生横向需求，需要明确滚动容器和操作区。
- 数据集详情：元信息、Tabs、样本列表、媒体网格、字段管理和绑定未绑定素材都可能被固定高度或双栏布局挤压。
- 任务管理主页：桌面固定列 Table 已处理列宽和固定列，但手机端应优先展示任务卡片。
- 人工审核页面：当前为队列、详情、提交历史三栏，手机端需要列表到详情的两级结构或单列降级。
- AI 助手展开态：左右分栏在 390px 宽度不可用，未应用变更确认层级必须高于展开态。

### 最容易被遮挡的组件

- 新建任务向导底部上一步、手动保存、下一步/发布按钮，以及中间任务发布 AI 输入条。
- 模板 Designer 画布底部组件和模板 AI 浮窗。
- 人工审核页面右下角提交历史和审核动作区域。
- 数据集导入/字段管理 Modal 内容区和 footer。
- AI 助手展开态底部输入框、关闭按钮、清除对话按钮、未应用变更确认框。
- 表格编辑页的未保存标记、全屏按钮、保存按钮和表头选择框。

### 桌面端多栏结构

- 工作台 AppShell：顶部全站导航 + 左侧固定工作台侧边栏 + 内容区。
- 任务发布向导：步骤栏、主配置区、发布摘要侧栏。
- 模板 Designer：物料库、画布、属性面板三栏。
- Renderer 预览：渲染预览主区、运行检查侧栏。
- 数据集详情：样本列表与样本预览、上下文预览双栏、字段管理与变量构建双栏。
- 人工审核：审核队列、审核详情、提交历史/概览三栏。
- 任务管理/数据集管理/模板管理：固定高度表格区 + 顶部筛选区 + 摘要条。

### 需要卡片化的表格

- 任务管理列表：手机端展示任务名称、状态、分类、进度、奖励、AI/人工审核、更新时间和更多操作。
- 数据集管理列表：手机端展示数据集名称、格式、状态、行数、字段数、媒体摘要和更多操作。
- 模板管理列表：手机端展示模板名称、状态、版本、组件数、绑定数据集和更多操作。
- AI 预审任务列表：已有卡片模式，手机端默认卡片。
- 人工审核队列：手机端作为列表页展示，点击后进入详情。
- 操作日志、成员/资源配置等治理表格：必要时使用卡片或保留横向滚动 Table。

### 需要 Drawer 化或全屏化的配置面板

- 任务广场筛选区。
- 新建任务右侧发布摘要。
- 数据集新建/导入、字段管理、未绑定素材绑定。
- 任务结果导出配置。
- 模板 Designer 属性面板和 Renderer 预览。
- 模板搭建 AI、任务发布 AI 展开态。
- 人工审核直接修订、请求协助、批量审核确认。

## MarkUp 前端移动端适配方案

### 响应式断点

使用以下断点：

```txt
desktop: >= 1200px
tablet: 768px - 1199px
mobile: < 768px
small-mobile: < 430px
very-small-mobile: < 390px
```

工作台壳层建议把侧边栏切换点从 `720px` 提前到 `820px`。原因是工作台页面普遍包含表格、Tabs、操作按钮和固定摘要栏，720px 时才切换会导致 768px 平板竖屏和 800px 左右窄屏被桌面侧栏挤压。

### 全局布局策略

- 桌面端保留现有左侧侧边栏、多栏工作台、固定高度表格和密集视图。
- 820px 以下隐藏固定侧边栏，使用顶部横向工作台导航；后续可升级为 Drawer 菜单。
- 页面主容器统一补齐 `min-width: 0`、`max-width: 100%`、局部滚动，避免 flex/grid 子项撑出屏幕。
- 手机端页面标题区压缩高度，操作按钮允许换行；高频操作按钮保持至少 40px 触控高度。
- 固定底部操作栏统一考虑 `env(safe-area-inset-bottom)`。
- Modal 手机端使用 `calc(100vw - 24px)` 和 `calc(100dvh - 32px)`，内容区滚动，footer 固定。
- Drawer 手机端宽度使用 `100vw`，内容使用内部滚动。
- 复杂三栏页面手机端从“并排”改成“分步/分区”：物料、画布、属性、预览使用 Tabs/Segmented 或纵向堆叠。

### Ant Design 组件规则

- Table：管理列表手机端优先卡片化；必须保留 Table 时设置横向滚动并限制在局部容器，不让 body 横向滚动。
- Form：手机端统一 `layout="vertical"` 视觉，label 在上，输入在下，表单项间距 12-16px。
- Modal：手机端不顶屏，内容区可滚动，长表单优先改 Drawer。
- Drawer：表单型 Drawer 底部按钮固定，正文滚动；大型侧栏在手机端使用 100vw。
- Tabs：手机端横向滚动，不压缩 tab 文案；复杂区域可用 Segmented 切换。
- Steps：新建任务手机端不展示完整横向 7 步，改为紧凑当前步骤信息或纵向/滚动步骤。
- Upload：上传区高度压缩但保留可点击面积，多模态追加上传保留清晰失败反馈。
- AI 助手：展开态手机端使用全屏或近全屏布局，左右分栏改上下结构；未应用变更确认层级必须高于助手。

### 页面级策略

- 首页：保持第一屏清楚表达“数据标注平台”，CTA 垂直排列，模块单列，动效减少。
- 登录/注册：表单单列居中，验证码/OAuth/协议不溢出。
- 任务广场：筛选折叠为按钮 + Drawer，任务卡片单列。
- 工作台首页：指标卡 1-2 列，图表压缩高度，快捷入口不横向溢出。
- 任务管理：桌面 Table 保留，手机端默认任务卡片；更多菜单保留暂停、结束、导出、结果查看等操作。
- 新建任务向导：桌面左右分栏保留，手机端单列；发布摘要变折叠/底部 Drawer；底部操作栏固定并避开 AI 入口。
- 数据集管理：列表卡片化；新建/导入 Modal 留安全间距；详情 Tabs 横向滚动；字段管理、样本、多模态素材单列。
- 数据集表格编辑：继续使用 Ant Design Table，允许横向滚动；标题栏、保存、全屏、未保存标记始终可访问。
- 模板 Designer：桌面三栏；手机端切为物料、画布、属性、预览分区，拖拽可降级为点击添加。
- Renderer/标注页：题目单列；ShowItem 多模态宽度 100%；图片 Mask 标注工具栏不遮挡图片，保留 touch/pointer 绘制。
- 人工审核：桌面三栏；手机端队列和详情纵向堆叠，提交历史完整滚动，审核按钮固定底部。
- AI 助手：模板搭建 AI 和任务发布 AI 手机端全屏化，顶部紧凑，快捷指令竖排，变更/预览可切换，关闭和清除对话可见。

### 后端边界

本轮默认不改后端。只有前端无法稳定推导移动端卡片摘要、分页、媒体回放字段或轻量 AI 变更摘要时，才允许新增兼容字段。不得破坏现有 API shape。

### 测试计划

使用 Playwright 检查以下分辨率：

- 390 x 844
- 430 x 932
- 768 x 1024
- 1280 x 800
- 1440 x 900
- 1920 x 1080

每个分辨率至少检查首页、登录页、任务广场、工作台首页、任务管理、新建任务向导、数据集管理、数据集详情、表格编辑、多模态素材、模板 Designer、Renderer 预览、图片 Mask 标注、人工审核、AI 助手、控制台错误、横向溢出、底部遮挡和 Modal/Drawer 关闭。

## 当前实现与验证进展

### 已完成的移动端实现要点

- 全局 Ant Design Modal / Drawer / Form / Tabs / Table 增加移动端约束，手机端 Modal 保留安全边距，长内容进入内部滚动。
- 工作台侧边栏切换点提前到 `820px`，减少窄屏桌面侧栏挤压。
- 任务管理、数据集管理、模板管理在手机断点使用卡片列表，并保留桌面 Ant Design Table。
- 新建任务向导手机端改为单列，发布摘要下移，底部操作区内嵌任务发布 AI 入口，避免 AI 浮窗挡住主按钮。
- 模板 Designer 手机端改为纵向工作流，物料、画布、属性、Renderer 预览都可以访问；拖拽能力在手机端可通过点击添加降级。
- Template Renderer / 图片 Mask 标注组件补齐手机端表单单列和 touch / pointer 绘制约束。
- 数据集详情多模态素材支持图片、音频、视频预览，并在移动端采用更宽的单列卡片。
- 人工审核页面补齐审计时间线/提交历史滚动约束，Reviewer 队列作用域使用当前用户团队，避免手机端真实审核链路 403；直接修订弹窗的修订说明改为稳定受控输入，避免 Ant Design Form 脱离 DOM 时产生 `useForm` warning。
- 模板搭建 AI 和任务发布 AI 的移动端展开态增加 `100dvh` 高度约束，清除对话和关闭按钮保持可见，内容在助手内部滚动。

### 已完成的验证

- `cd apps/web && npm run typecheck`：通过。
- `cd apps/web && npm run test -- WorkspaceApp`：执行完成，当前为 47 passed / 26 failed / 1 skipped。已知的 `taskTemplates.map` 未捕获异常已修复并未复现；剩余失败主要集中在既有测试期望与当前 UI 文案 / toast 呈现不一致，例如 `继续批注`、批量结束/追加标签 toast 文案等，需要后续单独对齐。
- Playwright 批量访问 6 组分辨率与 11 个关键路由：首页、登录入口、任务广场、工作台、任务管理、新建任务、数据集、模板、AI 预审、人工审核、资源配置。结果显示 body 横向溢出为 0-1px；超宽表格限制在内部滚动区域，没有造成 body 级横向滚动。
- Playwright 手机断点交互抽查：任务发布 AI 与模板搭建 AI 均可打开和关闭，展开态宽度在视口内，Modal 高度小于实际手机视口，清除对话和关闭按钮可见。
- 人工审核页专项回归：`cd apps/web && npm run test -- WorkspaceApp -t "loads manual review queue and submits an approval|uses a GUI form for manual revise|batch finishes published|batch appends tags" --testTimeout=30000 --reporter=verbose` 通过，4 passed / 70 skipped；`cd apps/web && npm run typecheck` 通过；`git diff --check` 通过。
- Playwright 人工审核专项复测：390x844、768x1024、1920x1080 均无 console error/warning、无本地请求失败、无 `useForm` warning，body 横向溢出 0-1px；390px 移动断点下 `.review-audit-timeline` 为 `overflow-y: auto` 的局部滚动区域，并保留底部安全内边距。
- 多模态数据集 / 模板 / AI 高风险回归：`cd apps/web && npm run typecheck` 通过；`cd apps/web && npm run test -- WorkspaceApp -t "imports and previews enterprise datasets|builds and publishes a multi-tab template" --testTimeout=30000 --reporter=verbose` 通过，2 passed / 72 skipped；`cd apps/web && npm run test -- WorkspaceApp -t "imports and previews enterprise datasets|keeps loaded dataset rows|builds and publishes a multi-tab template|loads rich designer presets|opens the template AI assistant|renders multimodal ShowItem bindings|publishes an enterprise task|opens the task publish AI assistant" --testTimeout=30000 --reporter=verbose` 通过，8 passed / 66 skipped；`cd apps/web && npm run test -- TemplateRenderer.mask --testTimeout=30000 --reporter=verbose` 通过，1 passed。
- 多模态预览兼容性：前端 `DatasetMediaRef` 类型补齐 `media_type`，`WorkspaceMediaPreview` 同时识别 `type`、`mime_type`、`media_type`、`kind`，保证数据集追加上传、行级媒体和未绑定素材在移动端预览路径使用同一解析口径。
- Playwright 公共页面复测：使用 Playwright CLI 检查 `/`、`/tasks`、`/login` 在 390x844、430x932、768x1024、1280x800、1440x900、1920x1080 下均无 body 级横向溢出、无 console error/warning、无 requestfailed。当前 `/login` 由首页登录弹层承载，直接访问会归一到首页。
- Playwright 工作台复测：登录 `owner@test.local` 后检查 `/workspace`、`task-management`、`publish-task`、`datasets`、`templates`、`ai-review`、`manual-review`、`resource-config`。390x844、430x932、768x1024、1280x800、1440x900、1920x1080 的核心路由未出现 body 级横向溢出或本地请求失败；任务管理、数据集、模板在手机断点进入卡片化路径。
- AI 助手移动端专项：任务发布 AI 和模板 Designer AI 在 390x844 下均可打开、清除对话按钮可见、关闭后弹窗标题消失、body 横向溢出为 0。两个 AI Modal 现在使用 Ant Design `focusable.focusTriggerAfterClose=false`，并将移动端 Modal 根高限制在 `calc(100dvh - 16px)`；实测 Modal rect 为 374 x 828，未超过 390 x 844 视口。
- 资源配置专项：移动端检测到多个 Ant Design force-render Drawer 根节点，但根节点 `pointer-events: none`，截图确认没有实际遮挡；资源配置内容在 390px 下可滚动访问。
- 数据集移动端链路：390x844 下从数据集列表点击“修改”进入详情，详情页包含数据预览、多模态 / 素材 / 图片 / 音频 / 视频文案和字段 / 列 / 映射相关内容，返回列表后点击“表格编辑”可进入 Ant Design Table 编辑视图，保存修改 / 全屏 / 保存表格 / 新增行 / 新增列等按钮可达，body 横向溢出为 0。表格编辑点击全屏后显示“退出全屏”，表格区域约 374 x 761，释放空间被表格占用而不是灰色空白。
- 模板 Designer / Renderer 图片 Mask 链路：390x844 下从模板列表进入 Designer，点击 `图片 Mask 标注`，打开 `Renderer 预览` 后可渲染 `.image-mask-board`。Mask 图片来源兼容行级 `media_type=image` 多模态素材；如果当前参考数据行没有图片字段，Designer 预览会使用本地 inline SVG 示例图而不是外部 `example.com` 图片，避免移动端预览请求被浏览器拦截。Playwright 实测画布 `touch-action: none`，拖动画布后出现 `1 个标注`，无 console warning/error、无 requestfailed。当前 1px overflow 读数来自工作台顶部 Ant Design Menu overflow 项裁剪，不是 Renderer/Mask 主体撑宽。
- 任务管理移动端操作链路：390x844 下任务卡片 `更多` 菜单可打开，包含 `查看结果 / 导出`、`暂停发放`、`结束任务` 等操作。`查看结果 / 导出` 会打开右侧结果导出 Drawer，`创建导出任务` 可见；`暂停发放` 会先读取统计并打开前景确认弹窗，文案说明只暂停未领取数据继续发放，不回收已领取或已完成数据。相关确认弹窗已改为优先使用 Ant Design `App.useApp().modal`，Playwright 复测无静态 Modal context warning。
- 任务广场公开接口复测：登录企业 owner 后访问 `/tasks`，`/api/v1/labels/tasks` 和通知接口均返回 200，无 console warning/error、无 requestfailed；之前记录的 403 在本轮没有复现。
- 工作台正确路由全量复测：登录 `owner@test.local` 后检查 `task-management`、`resource-config`、`publish-task`、`datasets`、`templates`、`manual-review`，覆盖 390x844、430x932、768x1024、1280x800、1440x900、1920x1080。所有页面 `overflowX=0`，无 console warning/error、无 requestfailed；任务管理、数据集、模板在手机断点卡片化，1280px 及以上恢复桌面表格 / 工作台布局。资源配置仍有 Ant Design 预渲染 Drawer 根节点，但不拦截页面操作。
- 新建任务向导专项：390x844 下步骤导航、发布摘要和底部 `上一步 / 任务发布 AI / 手动保存 / 下一步` 操作区可见且不横向溢出。`分发与奖励` 步骤可切换到 `指派链接`，链接有效期字段出现，发布摘要同步显示 `指派链接`；`人工复审` 步骤旧说明已移除，选择两个 Reviewer 后出现 `审核员百分比分配`，两个百分比输入可编辑，合计显示 `100%`，发布摘要同步为 `2 人 / 100%`。
- 人工审核提交历史专项：390x844、430x932、768x1024、1280x800、1920x1080 下 `.review-audit-timeline` 均存在，`overflow-y: auto`，带安全底部内边距，无 body 横向溢出、无 console warning/error、无 requestfailed。当前测试数据历史记录未超过容器高度；更多记录会在该区域内部滚动。
- 模板搭建 AI / Renderer 复测：390x844 下进入 Designer 后模板搭建 AI 可打开，`清除对话` 和关闭按钮可见，Modal rect 为 374x828，关闭后标题消失。Designer 可点击常用组合，属性区展示说明文字、绑定变量、答案字段和中文组件类型；Renderer 预览可渲染内容。图片 Mask 画板滚入视口后可绘制，工具栏显示 `1 个标注`，`touch-action: none` 保持生效。

### 当前仍需继续验证 / 优化

- `WorkspaceApp.test.tsx` 仍有历史性期望失败，需要按当前 UI 行为更新断言或补齐回归兼容。
- 资源配置的 force-render Drawer 根节点仍会被静态 DOM 计数识别，后续若做自动化视觉检查，应继续以 `pointer-events` 和可见遮挡为准。
