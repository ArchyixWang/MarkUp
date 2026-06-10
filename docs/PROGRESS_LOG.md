# MarkUp（马克派） 需求变更与开发进度记录

**维护目的**：记录需求变化、架构调整、代码实现进度、测试结果和未决问题，确保后续开发过程可追溯。  
**维护规则**：任何需求改动、架构决策、接口变更、代码阶段完成、测试结果或偏差修正，都必须记录到本文或同步更新对应文档。

## 记录规范

每条记录建议包含：

- 日期：使用 `YYYY-MM-DD`。
- 类型：需求变更 / 架构决策 / 开发进度 / 测试结果 / 偏差修正 / 待确认问题。
- 关联文档：涉及 `docs/product/REQUIREMENTS_AND_NOTES.md`、`docs/planning/TODO.md`、`docs/architecture/SYSTEM_ARCHITECTURE.md` 或 API 文档时写明。
- 内容：说明发生了什么、为什么改、影响哪些模块。
- 后续动作：需要继续实现、测试或向用户确认的事项。

## 强制流程

- 写代码前：先查阅 `docs/README.md`、`docs/product/REQUIREMENTS_AND_NOTES.md`、`docs/planning/TODO.md`、`docs/architecture/SYSTEM_ARCHITECTURE.md`，确认当前任务对应的需求、API、状态机和架构边界。
- 改需求时：先记录原因和影响，再同步修改需求基线、TODO 或架构文档。
- 完成代码时：记录完成范围、涉及模块、测试结果和剩余风险。
- 发现偏差时：记录偏差点、影响范围、修正方案；如需求不明确，先与用户确认。
- 提交前：检查文档是否已反映本次需求变化或实现进度。

## 记录列表

### 2026-06-10

- Type: frontend/backend/docs content rewrite / public help operation manual
- Related docs: `docs/design/pages/public-help.md`
- Details: 按用户反馈再次重写 `/help` 公开手册内容，把正文从功能介绍改为可照着操作的使用指引。`helpContent.json` 保留 16 个主模块 + FAQ 和旧 hash alias，但内容改为覆盖真实流程：账号身份唯一与角色授权、任务广场领取、标注作答草稿/提交/打回、全部模板组件使用说明、图片 Mask 底图来源与绘制检查、CSV/Excel 普通数据导入、Manifest JSONL、多模态媒体和表格行关联、补上传按主值合并、ShowItem 映射、任务发布 readiness、Owner 发布待审、Team Admin 审批、AI Provider/LLMComponent/AI 预审、人工审核、导出审计、钱包会员资源和通知排查。移除 `planned/建设中`、错误身份切换表述和公开手册不应承载的内部后台描述。
- Test results: `npm.cmd --prefix apps/web run test -- src/pages/help/HelpPage.test.tsx --run --testTimeout=30000` 通过，8 passed；`npm.cmd --prefix apps/web run typecheck` 通过；`C:\Users\Archyix\AppData\Local\Programs\Python\Python312\python.exe -m pytest apps/api/tests/test_platform_agent.py` 通过，10 passed。
- Remaining risks: 本轮只重写公开帮助中心知识源和对应测试断言，不改变工作台业务 API、任务状态机、数据集导入实现、模板 Renderer 或审核导出逻辑；后续如果实际组件行为或字段命名变化，需要同步更新手册。

- Type: frontend visual bugfix / task square filter active buttons
- Related docs: `docs/design/FRONTEND_DESIGN_STYLE.md`
- Details: 修复任务广场搜索栏中筛选按钮激活/展开态对比度不足的问题。`CompactFilterButton` 与快捷筛选 `FilterChip` 不再使用 Ant Design `type="primary"`，避免 primary 白字覆盖浅蓝底；改为 `type="default" + active class` 承载状态，CSS 统一使用浅蓝底、蓝边和蓝字，确保“全部”等按钮文字清晰可读。
- Test results: `cd apps/web && npx.cmd eslint src/pages/tasks/TaskSquarePage.tsx` 通过；`git diff --check -- apps/web/src/pages/tasks/TaskSquarePage.tsx apps/web/src/pages/tasks/TaskSquarePage.css docs/PROGRESS_LOG.md` 通过，仅保留当前工作区 LF/CRLF 提示。
- Remaining risks: 本轮只调整任务广场筛选按钮视觉状态，不改变筛选参数、任务查询 API、分页或领取流程。

- Type: frontend rendering bugfix / Image Mask natural aspect ratio
- Related docs: `docs/design/pages/owner-template-designer.md`
- Details: 修复图片 Mask 标注底图在 Renderer 预览中被压扁的问题，并确认 Labeler 答题工作台复用同一个 `TemplateRenderer` / `ImageMaskAnnotator`，因此同一修复同时覆盖正式答题。根因是画板虽然读取图片自然宽高写入 `aspect-ratio`，但 CSS 又用 `max-height` 把容器高度压短，内部图片 `object-fit: fill` 随容器被拉伸。当前改为按图片自然比例计算画板最大宽度：高度受限时缩窄画板宽度而不是压缩高度，保证底图、overlay 和归一化 mask 坐标比例一致。
- Test results: `PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin npm --prefix apps/web run test -- src/pages/workspace/TemplateRenderer.mask.test.tsx --run --testTimeout=30000` 通过，4 passed；`PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin npm --prefix apps/web run typecheck` 通过；`git diff --check` 通过。
- Remaining risks: 本轮只调整共享 `TemplateRenderer` 中 Image Mask 底图比例和 CSS，不改变媒体来源解析、认证 object URL、答案结构、提交校验或后端 API。

- Type: frontend mobile bugfix / Template management header actions
- Related docs: `docs/design/pages/owner-template-designer.md`
- Details: 修复模板搭建列表页移动端页头按钮覆盖筛选区的问题。全局紧凑页头规则会把生产页标题区固定为 54px，移动端三个操作按钮换行后被挤出页头并压到搜索框；当前为模板管理页增加后置移动端覆盖，让页头自适应高度，`刷新 / 导入 schema` 两列展示，`新建模板` 独占下一行，保持按钮在页头内部排列。
- Test results: `PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin npm --prefix apps/web run test -- src/pages/workspace/WorkspaceApp.test.tsx -t "copies and deletes templates from the management list" --run --testTimeout=60000` 通过，1 passed / 99 skipped；`PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin npm --prefix apps/web run typecheck` 通过；`git diff --check` 通过。补充尝试运行 `PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin npm --prefix apps/web run test -- src/pages/workspace/WorkspaceApp.test.tsx --run --testTimeout=90000`，当前全文件长链路仍有 20 failed / 79 passed / 1 skipped，失败分布在账号、资源配置、人员管理、数据集导入、任务草稿等既有用例，未集中在本轮模板列表移动端 CSS。
- Remaining risks: 本轮只调整模板管理列表页移动端 CSS、模板管理行操作测试选择器与设计说明，不改变模板 Designer、Renderer、导入 schema、保存、发布检查或后端模板 API。

- Type: frontend visual bugfix / Dataset card action overflow
- Related docs: `docs/design/pages/owner-dataset-management.md`
- Details: 修复数据集管理卡片视图底部操作按钮溢出卡片的问题。卡片底部操作按设计稿收敛为 `修改 / 导出 / 删除` 三项，移除多余的 `表格编辑` 快捷按钮；表格编辑仍保留在数据集详情子页面的表格 Tab。数据集卡片操作区新增三列自适应布局和按钮宽度约束，避免按钮组横向撑出卡片边界。
- Test results: `PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin npm --prefix apps/web run test -- src/pages/workspace/WorkspaceApp.test.tsx -t "keeps dataset card actions inside the card|filters system and media-schema-backed fields" --run --testTimeout=30000` 通过，2 passed / 97 skipped；`PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin npm --prefix apps/web run typecheck` 通过。
- Remaining risks: 本轮只调整数据集列表卡片视图的前端操作布局，不改变数据集详情页、表格编辑能力、导入/导出 API 或删除权限规则。

- Type: frontend bugfix / Template Designer media data source candidates
- Related docs: `docs/design/pages/owner-template-designer.md`
- Details: 修复模板 Designer 智能展示块右侧属性面板中多模态数据源候选错乱的问题。ShowItem 的展示字段 Select、下方搜索候选和拖拽标签现在共用同一套 `buildDataSourceOptions` 候选；已经被 `media_schema` 声明为图片、音频或视频来源的原始字段不再作为普通列重复出现，只显示真正可渲染的媒体来源，例如 `图片 · primary · image_url`。图片 Mask 的图片来源候选继续继承同一去重逻辑，只保留图片类型普通列或图片 `media_schema` 来源。
- Test results: `PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin npm --prefix apps/web run test -- src/pages/workspace/WorkspaceApp.test.tsx -t "filters system and media-schema-backed fields" --run --testTimeout=30000` 通过，1 passed / 97 skipped；`PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin npm --prefix apps/web run typecheck` 通过。
- Remaining risks: 本轮只调整 Designer 前端候选展示与拖拽绑定，不改变数据集导入归一化、任务发布映射、Renderer 媒体解析或后端 API 形状。

- Type: frontend bugfix / ImageMask protected media playback
- Related docs: `docs/design/pages/owner-template-designer.md`
- Details: 修复图片 Mask 标注无法显示上传图片素材的问题。根因是 Mask 画布直接把 `/api/v1/uploads/{file_id}/download` 塞给 `<img src>`，浏览器图片请求无法携带 `Authorization` 和企业作用域 `X-Team-ID`，导致受保护上传文件在 Renderer / Labeler 工作台不可见。当前 `ImageMaskAnnotation` 复用 `WorkspaceMediaPreview` 的认证媒体 object URL hook：受保护上传图片先通过 `authenticatedFetch` 拉取 Blob 并生成临时 object URL 再渲染，画布、放大预览和绘制保护都使用该播放 URL；提交答案仍保存原始 `image_source` 媒体引用，避免把临时 blob 写入业务数据。同步补充 Mask 加载态样式和受保护上传图片回归测试。
- Test results: `PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin npm --prefix apps/web run test -- src/pages/workspace/TemplateRenderer.mask.test.tsx --run --testTimeout=30000` 通过，4 passed；`PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin npm --prefix apps/web run test -- src/pages/workspace/WorkspaceApp.test.tsx -t "filters system media context fields" --run --testTimeout=30000` 通过，1 passed / 97 skipped；`PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin npm --prefix apps/web run test -- src/pages/workspace/WorkspaceApp.test.tsx -t "renders multimodal ShowItem bindings" --run --testTimeout=40000` 通过，1 passed / 97 skipped；`PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin npm --prefix apps/web run test -- src/app/App.test.tsx --run -t "platform admins away from workspace|non-pending login|pending users" --testTimeout=40000` 通过，4 passed / 11 skipped；`PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin npm --prefix apps/web run typecheck` 通过；`/tmp/markup-api-test-venv-new/bin/python -m pytest apps/api/tests/test_task_production_guards.py -k "media_schema_binding_does_not_require_system_media_column or show_item_multi_display_mapping_rejects_stale_nested_column or show_item_multi_display_mapping_materializes_all_fields"` 通过，3 passed / 25 deselected；`/tmp/markup-api-test-venv-new/bin/python -m pytest apps/api/tests/test_auth_team_rbac.py -k "owner_can_import_dataset_build_template_and_publish_multimodal_task or template_readiness_accepts_all_designer_material_types"` 通过，2 passed / 131 deselected；`/tmp/markup-api-test-venv-new/bin/python -m pytest apps/api/tests/test_template_assistant_prompt.py` 通过，1 passed；`/tmp/markup-api-test-venv-new/bin/python -m compileall apps/api/app` 通过；`git diff --check` 通过。
- Remaining risks: 本轮只修复上传图片在 Mask 画布中的认证加载，不改变数据集导入、媒体绑定字段推断、任务发布映射、审核回放或后端上传下载接口。

### 2026-06-09

- Type: frontend/backend/docs content rewrite / public help center restructure
- Related docs: `docs/design/pages/public-help.md`
- Details: 根据用户反馈重新梳理 `/help`，不再把内容写成零散 bullet。`helpContent.json` 改为 16 个主功能模块 + 独立 FAQ，按公开入口与账号体系、身份角色权限、任务广场、标注作答工作台、资质积分信誉、企业工作台与 Dashboard、数据集、模板、任务发布、任务管理、AI、人工审核、导出文件审计、企业治理成员钱包资源、通知公告个人信箱、常见失败排查组织；正文改用连续段落说明功能位置、适用角色、入口、流程、限制和常见失败原因。同步修正快捷入口和模块图标旧 id，保留旧 hash alias，平台问答 Agent 继续从公开 `/help#...` 知识源读取新模型。参考 Gitea 文档站的阅读心智，左侧模块目录切换不再滚回整页顶部，而是定位到当前正文文章；右侧本页目录继续按小节锚点跳转。
- Details: 依据最新产品口径，公开手册不再把复杂联动、AI worker/Function Calling/schema 约束、死信队列、扣费封装、多轮 review_records、stage/round 和复杂 diff 写成未完成能力；移除 help 内容中的 `planned` 状态、相关提示和前端 warning 展示分支。
- Test results: `npm.cmd --prefix apps/web run test -- src/pages/help/HelpPage.test.tsx --run --testTimeout=30000` 通过，7 passed；`npm.cmd --prefix apps/web run typecheck` 通过；`C:\Users\Archyix\AppData\Local\Programs\Python\Python312\python.exe -m pytest apps/api/tests/test_platform_agent.py` 通过，10 passed。
- Remaining risks: 本轮只重构公开帮助中心内容、前端呈现和 Agent 文档读取测试，不改变业务 API、权限、任务状态机或后台功能；后续新能力落地后仍需同步更新 `helpContent.json`。

- Type: frontend bugfix / Renderer multimodal ShowItem layout
- Related docs: `docs/design/pages/owner-template-designer.md`
- Details: 修复 Renderer / Labeler 工作台中 ShowItem 多字段展示含音频等多模态素材时的排版溢出：多字段值容器增加稳定类名，Renderer 作用域内的音频预览改为卡片内列式自适应，播放器取消固定最小宽度，说明文字、素材标题和字段标签允许在当前字段卡片内换行，避免覆盖相邻字段或把说明文字挤成异常两列。
- Test results: `PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin npm --prefix apps/web run test -- src/pages/workspace/WorkspaceApp.test.tsx -t "renders multimodal ShowItem bindings" --run --testTimeout=40000` 通过，1 passed / 97 skipped；`PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin npm --prefix apps/web run typecheck` 通过；`git diff --check` 通过；浏览器打开 `http://127.0.0.1:5173/` 后确认运行中样式包含 `.renderer-show-grid-value`、Renderer 音频列式布局、音频播放器 `min-width: 0` 和说明文字换行规则，控制台无 error/warn。
- Remaining risks: 本轮只调整前端 Renderer 展示层布局，不改变数据集 `media/media_schema` 归一化、任务发布映射、题目 content 物化、审核回放或后端 API。

- Type: backend/frontend bugfix / dataset media binding source normalization
- Related docs: `docs/REQUIREMENTS_AND_NOTES.md`, `docs/api/production.md`, `docs/design/pages/owner-dataset-management.md`, `docs/design/pages/owner-template-designer.md`
- Details: 梳理并修复数据集 `media` 与原始媒体列、`media_schema` 的流转混乱：后端继续在 `rows/preview_rows` 保留行级 `media` 供 Renderer、AI 和审核上下文使用，但 `infer_columns` 不再把 `media/attachments/derived_context/_bindings` 系统上下文字段暴露为普通映射列；任务发布校验中 `source_type=media` 改为校验 `media_schema` 或图片/音频/视频列，而不是要求存在 `media` 普通列。前端模板 Designer 的数据源候选同步过滤系统字段，图片 Mask 的 `图片来源` 只展示图片列和图片类型 `media_schema`；Renderer 与 Reviewer diff 对历史数组型媒体来源增加第一张图片兜底。
- Test results: `PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin npm --prefix apps/web run test -- src/pages/workspace/TemplateRenderer.mask.test.tsx --run --testTimeout=30000` 通过，3 passed；`PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin npm --prefix apps/web run test -- src/pages/workspace/WorkspaceApp.test.tsx -t "filters system media context fields" --run --testTimeout=30000` 通过，1 passed / 97 skipped；`/tmp/markup-api-test-venv-new/bin/python -m pytest apps/api/tests/test_task_production_guards.py -k "media_schema_binding_does_not_require_system_media_column or show_item_multi_display_mapping_rejects_stale_nested_column or show_item_multi_display_mapping_materializes_all_fields"` 通过，3 passed / 25 deselected；`/tmp/markup-api-test-venv-new/bin/python -m pytest apps/api/tests/test_auth_team_rbac.py -k "owner_can_import_dataset_build_template_and_publish_multimodal_task"` 通过，1 passed / 132 deselected；`/tmp/markup-api-test-venv-new/bin/python -m compileall apps/api/app` 通过；`PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin npm --prefix apps/web run typecheck` 通过；`git diff --check` 通过。
- Remaining risks: 本轮不把本地样例文件夹中的相对路径自动发布为静态资源；如果数据行只包含 `media/xxx.jpg` 而没有通过 `media_files/media_assets` 上传绑定，浏览器仍无法访问该本地相对文件，导入演示数据时需同步上传媒体文件或使用可访问 URL。

- Type: frontend behavior / public help search highlighting
- Related docs: `docs/design/pages/public-help.md`, `docs/planning/TODO.md`
- Details: 修正 `/help` 帮助手册搜索体验：搜索输入继续按文档页级别筛选左侧目录，只保留包含关键词的章节或 FAQ 页；进入命中页面后不再裁剪正文卡片、列表项或 FAQ 内容，而是展示完整当前页，并在标题、摘要、段落、列表项、FAQ 问答和标签中用 MarkUp 蓝色高亮命中的关键词。搜索结果提示条、数字页码条和一次性堆叠全部章节的行为仍保持移除状态。
- Test results: `PATH=/opt/homebrew/bin:$PATH npm --prefix apps/web run test -- src/pages/help/HelpPage.test.tsx --run --testTimeout=30000` 通过，7 passed；`PATH=/opt/homebrew/bin:$PATH npm --prefix apps/web run typecheck` 通过。
- Remaining risks: 本轮只调整公开帮助手册前端搜索和高亮交互，不改变 `helpContent.json` 文案事实、平台问答 AI 知识源、权限、API 或后端接口。

- Type: frontend visual fix / platform workbench page density alignment
- Related docs: `docs/design/pages/platform-workbench.md`
- Details: Re-aligned the non-overview `/platform` pages with the operating overview page. Settlement ledger, verification review, AI Provider and platform settings now share the same white workbench surface rhythm: 8px page gaps, white Tabs/content containers, compact filter bars, bordered table shells, tighter Provider two-column layout, and white material/JSON/detail rows instead of broad gray fills.
- Test results: `npm.cmd --prefix apps/web run typecheck` passed; `npm.cmd --prefix apps/web run test -- src/pages/platform/PlatformApp.test.tsx --run` passed, 7 passed; `git diff --check` passed with existing LF/CRLF warnings only.
- Remaining risks: This is a CSS/layout alignment pass only; it does not change platform API calls, review behavior, Provider persistence, or settings save logic.

- Type: frontend/docs bug fix / task publish share link preview
- Related docs: `docs/api/production.md`, `docs/product/REQUIREMENTS_AND_NOTES.md`, `docs/design/pages/owner-task-management.md`, `docs/planning/TODO.md`
- Details: 修复新建任务页包大小分配下分享链接有效期默认值与校验不一致的问题：空值统一按 72 小时处理，发布向导不再显示 72 却按 0 小时阻塞下一步。发布结果中的分享链接、二维码文本和“预览分享链接”按钮改为同一个完整同源 URL；未登录用户打开 `/tasks/assigned/{code}` 会保存该链接为登录后返回地址，避免分享入口登录后丢失。按用户要求，本轮不修改企业会员活跃任务额度逻辑，`pending_review/published/paused` 计入口径保持不变。
- Test results: `PATH=/opt/homebrew/bin:$PATH npm --prefix apps/web run test -- src/pages/workspace/WorkspaceApp.test.tsx -t "publishes an enterprise task with ShowItem column mapping and assignment link" --testTimeout=50000` 通过，1 passed / 96 skipped；`PATH=/opt/homebrew/bin:$PATH npm --prefix apps/web run test -- src/app/App.test.tsx -t "keeps assigned task share links|assigned task link" --testTimeout=40000` 通过，3 passed / 11 skipped；`PATH=/opt/homebrew/bin:$PATH npm --prefix apps/web run typecheck` 通过；`git diff --check` 通过。
- Remaining risks: 本轮只收紧分享链接前端展示、二维码文本和登录回跳；真实浏览器端完整“发布任务 -> 打开预览链接 -> 登录/领取”仍需在本地服务重启后人工或 Playwright 端到端复测。

- Type: backend/environment fix / multimodal video preview tooling
- Related docs: `docs/api/review-ai-export.md`, `docs/operations/DEPLOYMENT.md`, `apps/api/README.md`
- Details: 为多模态视频承接链路配置本地 `apps/api/.env`：`FILE_STORAGE_ROOT=/Users/HIN/markup/.storage`、`FFMPEG_PATH=/opt/homebrew/bin/ffmpeg`、`FFPROBE_PATH=/opt/homebrew/bin/ffprobe`，并保留用户提供的 OAuth、SMTP 和飞书作用域配置。后端视频预览服务现在会同时校验 `ffmpeg` 与 `ffprobe` 可执行；非原生可播放视频转码前先用 `ffprobe` 探测源视频，缺少 `ffmpeg` 返回 `preview_error=ffmpeg_not_configured`，缺少 `ffprobe` 返回 `preview_error=ffprobe_not_configured`。同步更新 `.env.example`、API 上传说明、后端 README 和部署文档，明确 `.storage`、生成预览和本地 FFmpeg 二进制不得提交。
- Test results: `/opt/anaconda3/bin/conda run -n markup-api python -m pytest apps/api/tests/test_video_preview_playback.py` 通过，6 passed；`/opt/anaconda3/bin/conda run -n markup-api python -m compileall apps/api/app` 通过；真实命令冒烟通过：用 `/opt/homebrew/bin/ffmpeg` 生成 `/tmp/markup-video-smoke.avi`，用 `/opt/homebrew/bin/ffprobe` 探测 160x90 视频流，再转码生成 `.storage/video-previews/smoke/preview.mp4` 并再次探测成功。
- Remaining risks: 本轮仍使用本地文件系统 `.storage`，未接入对象存储、安全扫描、异步转码队列或自动关键帧/ASR 派生；`.storage/video-previews/smoke/preview.mp4` 是本地验证产物且已被 `.gitignore` 忽略。

- Type: product/backend/docs adjustment / notification noise reduction
- Related docs: `docs/api/review-ai-export.md`, `docs/architecture/SYSTEM_ARCHITECTURE.md`, `docs/product/REQUIREMENTS_AND_NOTES.md`, `docs/design/FRONTEND_DESIGN_STYLE.md`, `docs/planning/TODO.md`
- Details: 收敛系统主动通知口径，从“全链路成功状态都提醒”改为“只在重要节点提醒”。保留需要行动或高价值变化的通知：任务发布申请/发布成功/暂停/关闭、标注提交进入人工审核、AI 预审失败、人工审核结果、导出完成、成员加入、角色/权限变化、成员移除和安全提醒。移除确认型流水提醒：数据集导入完成、模板发布成功、领取成功、提交成功、AI 预审创建/成功、钱包充值/转入/提现成功、邀请创建和认证提交；这些状态继续通过业务页面与审计日志呈现。
- Test results: `python -m py_compile apps/api/app/services/notification_dispatcher.py apps/api/app/services/production_service.py apps/api/app/services/labels_service.py apps/api/app/services/ai_reviews_service.py apps/api/app/services/reviews_service.py apps/api/app/services/export_service.py apps/api/app/services/resource_service.py apps/api/app/services/team_service.py` passed；`python -m pytest apps/api/tests/test_auth_team_rbac.py -k "notification_dispatcher or claim_task_bundle_does_not_emit_confirmation_notification or personal_inbox"` 6 passed / 125 deselected。
- Remaining risks: 后续如果要做通知策略配置，应在 dispatcher 上增加事件级开关/优先级，而不是回到业务服务里零散判断。

- Type: backend/frontend/docs change / full-chain system notification dispatch
- Related docs: `docs/api/review-ai-export.md`, `docs/architecture/SYSTEM_ARCHITECTURE.md`, `docs/product/REQUIREMENTS_AND_NOTES.md`, `docs/design/FRONTEND_DESIGN_STYLE.md`, `docs/planning/TODO.md`
- Details: Added `Notification.event_key/action_url/metadata` and a partial unique `(team_id,event_key)` index, then introduced the internal `notification_dispatcher` so business services emit personal inbox messages through one team-isolated path. The dispatcher writes `system_notification_emitted` audit logs, resolves recipients through the existing notification visibility rules, skips empty/invalid recipient sets without breaking the main business flow, and prevents duplicate status notifications. Hooked current real success states across dataset import, template publish, task publish/status changes, task bundle claim, submission submit, AI review creation/processing, manual review result and points settlement, export completion, team points/AI wallet changes, team verification and member permission events. Personal inbox details now expose action context through `action_url` and lightweight `metadata`.
- Test results: Targeted backend validation passed: `python -m pytest apps/api/tests/test_auth_team_rbac.py -k "notification_dispatcher or claim_task_bundle_emits_personal_task_notification or personal_inbox"` 6 passed / 125 deselected. `py_compile` for touched backend services passed.
- Remaining risks: This round is REST personal-inbox persistence only. WebSocket, polling, email/SMS channels, async import/export progress streaming, durable outbox workers, platform-level `scope=platform` personal notifications, and synthetic failure notifications for synchronous validation errors remain future work.

- Type: content rewrite / public help manual factual alignment
- Related docs: `docs/MarkUp-说明文档/README.md`, `docs/MarkUp-说明文档/演示环境说明.md`, `docs/product/REQUIREMENTS_AND_NOTES.md`, `docs/design/FRONTEND_DESIGN_STYLE.md`, `docs/design/pages/public-help.md`, `docs/planning/TODO.md`
- Details: 按用户反馈修正 `/help` 帮助手册重做范围：不只模仿 Gitea 中文文档排版，也按当前已开发功能和 `docs/MarkUp-说明文档/` 重写全部 9 个章节与 14 个 FAQ 的事实内容。新版手册以终端用户操作路径组织，覆盖个人/企业 Labeler 分流、任务广场领取、企业内流转与多 Labeler 百分比分配、Owner 发布进入待审核、Team Admin 审批、数据集负责人最新修改人、Manifest JSONL 与多模态上下文、模板 Designer/Renderer/版本、LLMComponent Provider、AI worker 最小闭环、人工审核结论、导出同步生成但按异步模型展示、审计、企业会员/积分钱包/AI 钱包/Provider 和建设中能力限制。同步清理旧版“指派链接”活跃分发和“生产资源开关”等不适合公开手册的表述，继续保持 `/help` 不承载 API、部署、本地启动或内部实现说明。
- Test results: JSON 结构检查通过，输出 `2026-06-09 9 14 9 57 248`，确认 9 个章节、14 个 FAQ、9 个分页入口、57 个正文小节和 248 条条目；关键词检查确认 `企业内流转`、`分配百分比`、`Manifest JSONL`、`ShowItem`、`LLMComponent`、`AI worker`、`异步任务模型`、`企业积分钱包`、`AI 钱包`、`Function Calling` 和 `WebSocket 实时通知` 等当前/建设中口径均进入公开知识源。`PATH=/opt/homebrew/bin:$PATH npm --prefix apps/web run test -- src/pages/help/HelpPage.test.tsx --run --testTimeout=30000` 通过，6 passed；`PATH=/opt/homebrew/bin:$PATH npm --prefix apps/web run typecheck` 通过；`git diff --check` 通过。尝试用临时 Playwright 脚本做浏览器 DOM 验证时，当前 `apps/web/node_modules` 未安装 `playwright` 包，脚本因 `Cannot find module '/Users/HIN/markup/apps/web/node_modules/playwright'` 未执行页面检查，本轮未额外安装依赖。
- Remaining risks: 本轮只更新公开帮助手册知识源和相关文档记录，不改变页面布局、权限、API、状态机或后端接口；后续 Function Calling/schema 强约束、完整 `review_records` 多轮快照、真实导出 worker、WebSocket 自动提醒等能力落地后，需要再次同步 `/help` 公开口径。

- Type: documentation / delivery explanation and demo scripts
- Related docs: `docs/markup_requirements.md`, `docs/MarkUp-说明文档/README.md`, `docs/MarkUp-说明文档/演示环境说明.md`, `docs/MarkUp-说明文档/API文档/API文档.md`, `docs/MarkUp-说明文档/相关文档/架构图与关键技术点.md`, `docs/planning/TODO.md`
- Details: 对照核心交付要求和当前活跃产品/API/架构文档，完善 `MarkUp-说明文档`。主 README 新增交付要求对照表，说明任务负责人后台、标注员工作台、AI Agent、Reviewer 审核、多格式导出、权限审计和部署文档的当前实现状态与剩余风险；补充 `任务负责人后台 · 模板搭建（拖拽搭建器）`、`标注员工作台 · 任务广场与作答页`、`AI 自动预审与人工审核` 三条 Mermaid 操作逻辑流程图和对应录屏剧本。`演示环境说明.md` 新增 5-10 分钟总览版分镜和三条专项录屏分镜；同步把说明文档中的文件存储口径从过期 Mongo base64 改为 `FILE_STORAGE_ROOT` 本地文件系统 + MongoDB 元数据，生产建议对象存储。
- Test results: Markdown fence 静态检查通过，覆盖 `docs/MarkUp-说明文档/README.md`、`docs/MarkUp-说明文档/演示环境说明.md`、`docs/MarkUp-说明文档/API文档/API文档.md`、`docs/MarkUp-说明文档/相关文档/架构图与关键技术点.md`、`docs/planning/TODO.md` 和 `docs/planning/PROGRESS_LOG.md`；`git diff --check` 通过。
- Remaining risks: 原始交付 PDF 在当前环境下可读取页数但不可可靠抽取正文文本；本轮以完整保留的 `docs/markup_requirements.md` 作为可检索需求事实源。未生成真实演示截图或录屏文件，截图占位仍需正式演示环境补图。

- Type: frontend polish / public help result strip removal
- Related docs: `docs/design/pages/public-help.md`
- Details: 按截图反馈删除 `/help` 正文上方的搜索结果提示条，即红框中的 `全部文档 · 9 个文档页` 区块；搜索状态不再单独占用正文顶部空间，只通过搜索框内容、左侧文档目录和当前正文变化体现。页底上一页/下一页、左侧文档分页目录、右侧本页目录和 FAQ 分页结构保持不变。
- Test results: `PATH=/opt/homebrew/bin:$PATH /opt/homebrew/bin/npm --prefix apps/web run test -- src/pages/help/HelpPage.test.tsx --run --testTimeout=30000` 通过，6 passed；`PATH=/opt/homebrew/bin:$PATH /opt/homebrew/bin/npm --prefix apps/web run typecheck` 通过；`git diff --check` 通过。浏览器检查 `http://127.0.0.1:5173/help#quickstart`：`.help-result-line` 数量为 0，页面正文不再包含 `全部文档` 或 `N 个文档页` 文本，初始章节为 `快速开始`，1280 宽度无横向溢出。
- Remaining risks: 本轮只删除公开帮助手册的顶部结果提示条，不改变 `helpContent.json` 内容、搜索筛选逻辑、分页切换、权限、API 或后端接口。

- Type: content rewrite / public help manual voice
- Related docs: `docs/product/REQUIREMENTS_AND_NOTES.md`, `docs/design/FRONTEND_DESIGN_STYLE.md`, `docs/design/pages/public-help.md`, `docs/planning/TODO.md`
- Details: 参考 Gitea 中文文档页面的手册写法，重写 `apps/web/src/pages/help/helpContent.json` 全部 9 个章节和 14 个 FAQ 的公开帮助文字。每页保留一个主题，开头短段说明用途，后续用步骤、注意事项、限制条件和排查项组织；减少产品宣传式能力描述，改为直接说明“如何操作、为什么受限、遇到问题怎么排查”。本轮不引入平台运营、API、部署或内部实现说明，继续保持 helpContent 作为公开帮助页和平台问答 AI 的共同公开知识源。
- Test results: `PATH=/opt/homebrew/bin:$PATH /opt/homebrew/bin/npm --prefix apps/web run typecheck` 通过；`PATH=/opt/homebrew/bin:$PATH /opt/homebrew/bin/npm --prefix apps/web run test -- src/pages/help/HelpPage.test.tsx --run --testTimeout=30000` 通过，6 passed；JSON 结构检查通过，输出 `2026-06-09 9 14 51 221`；`git diff --check` 通过。浏览器检查 `http://127.0.0.1:5173/help`：初始页只渲染 1 个 `.help-article`，桌面左侧无角色筛选块，页底无 `.ant-pagination`，1280 宽度无横向溢出；`#quickstart/#account/#labeler-guide/#owner-guide/#dataset-template-guide/#task-ai-review/#export-audit/#resources/#troubleshooting/#faq` 均可直达对应单页，FAQ 页显示 14 个问题；搜索 `readiness`、`AI 钱包`、`onboarding` 均能返回匹配文档页，筛选后 FAQ 保持可见。
- Remaining risks: 本轮只重写公开帮助手册文字风格和 FAQ 回答，不改变页面组件结构、权限、API、状态机、AI 公开知识源边界或后端接口。

- Type: frontend polish / public help sidebar and pagination text
- Related docs: `docs/product/REQUIREMENTS_AND_NOTES.md`, `docs/design/FRONTEND_DESIGN_STYLE.md`, `docs/design/pages/public-help.md`, `docs/planning/TODO.md`
- Details: 按截图反馈删除 `/help` 桌面左侧栏中的 `角色筛选`块，左侧栏只保留文档分页目录；移动端顶部角色筛选继续保留。页底删除 Ant Design 数字页码条，只保留上一页/下一页两个文档跳转按钮；两侧按钮使用完整章节标题，避免 `企业与 Owner 手册`、`AI 预审与人工审核` 等文本被省略或分成两行。
- Test results: `PATH=/opt/homebrew/bin:$PATH /opt/homebrew/bin/npm --prefix apps/web run typecheck` 通过；`PATH=/opt/homebrew/bin:$PATH /opt/homebrew/bin/npm --prefix apps/web run test -- src/pages/help/HelpPage.test.tsx --run --testTimeout=30000` 通过，5 passed；`git diff --check` 通过。浏览器检查 `http://127.0.0.1:5173/help#dataset-template-guide`：页底 `.ant-pagination` 数量为 0，上一页 `企业与 Owner 手册` 和下一页 `AI 预审与人工审核` 的文本 `scrollWidth` 与 `clientWidth` 一致，标题完整显示且不换行；1280 宽度无横向溢出。
- Remaining risks: 本轮只调整公开帮助手册布局和按钮排版，不改变 `helpContent.json` 手册事实、搜索/筛选数据源、AI 公开知识源边界或后端接口。

- Type: frontend behavior / public help paginated docs layout
- Related docs: `docs/product/REQUIREMENTS_AND_NOTES.md`, `docs/design/FRONTEND_DESIGN_STYLE.md`, `docs/design/pages/public-help.md`, `docs/planning/TODO.md`
- Details: `/help` 帮助手册改为模仿 Gitea 中文文档的分页阅读结构：左侧为当前筛选/搜索后的文档分页目录，中间正文一次只渲染一个章节或 FAQ 页，右侧本页目录只展示当前页内部小节，底部提供上一页、Ant Design `Pagination` 页码和下一页。常用入口和 hash 切换改为切换文档页，不再把所有章节和 FAQ 一次性堆在同一长滚动页面。
- Test results: `PATH=/opt/homebrew/bin:$PATH /opt/homebrew/bin/npm --prefix apps/web run typecheck` 通过；`PATH=/opt/homebrew/bin:$PATH /opt/homebrew/bin/npm --prefix apps/web run test -- src/pages/help/HelpPage.test.tsx --run --testTimeout=30000` 通过，5 passed；`git diff --check` 通过。浏览器检查 `http://localhost:5173/help`：正文容器一次只渲染 1 个 `.help-article`，初始为 `快速开始`，点击 `数据与模板` 后切换为 `数据集与模板手册` 并更新 hash；390x844、768x1024、1280x800、1440x900 均无页面级横向溢出，移动端隐藏左右目录并保留页底翻页。
- Remaining risks: 本轮只调整公开帮助手册展示与分页交互，不改变 `helpContent.json` 内容事实、AI 公开知识源边界或 API。

- Type: frontend polish / public help copy density
- Related docs: `docs/design/FRONTEND_DESIGN_STYLE.md`, `docs/design/pages/public-help.md`
- Details: 按页面截图反馈删除 `/help` 首屏和侧栏中的说明性文字与提示框，包括 Hero 受众说明、`文档站布局`/`公开问答 AI 知识源` 标签、搜索框下方辅助说明、常用入口卡长描述、左侧重复章节目录块和右侧阅读建议 Alert。保留搜索、最后更新时间、常用入口标题/目标模块、角色筛选、正文文章和右侧本页目录，降低首屏噪音。
- Test results: `PATH=/opt/homebrew/bin:$PATH /opt/homebrew/bin/npm --prefix apps/web run typecheck` 通过；`PATH=/opt/homebrew/bin:$PATH /opt/homebrew/bin/npm --prefix apps/web run test -- src/pages/help/HelpPage.test.tsx --run --testTimeout=30000` 通过，5 passed；`git diff --check` 通过。浏览器检查 `http://localhost:5173/help` 确认被删除文案不再出现在 DOM 中，左侧只剩 1 个角色筛选块、右侧无阅读建议 Alert，1280 宽度无页面级横向溢出。
- Remaining risks: 本轮不改变 `helpContent.json` 的手册事实内容、FAQ、平台问答 AI 公开知识源边界或后端接口。

- Type: frontend redesign / public help documentation reading experience
- Related docs: `docs/product/REQUIREMENTS_AND_NOTES.md`, `docs/design/FRONTEND_DESIGN_STYLE.md`, `docs/design/pages/public-help.md`, `docs/planning/TODO.md`
- Details: 公开 `/help` 帮助手册参考 Gitea Docs 的文档站结构重做阅读体验，但保留 MarkUp 蓝色主色调和 Ant Design 组件基线。页面从同质卡片堆叠调整为浅色文档头、全文搜索、常用入口、桌面左侧章节目录、中间正文文章、右侧本页目录、步骤列表、普通列表、建设中 warning/callout 和 FAQ Collapse；移动端降为单列并保留顶部角色筛选。帮助内容仍由 `apps/web/src/pages/help/helpContent.json` 承载并作为平台问答 AI 公开知识源，本轮仅更新展示结构与更新时间，不引入平台运营、API、部署或开发者文档。
- Test results: `PATH=/opt/homebrew/bin:$PATH /opt/homebrew/bin/npm --prefix apps/web run typecheck` 通过；`PATH=/opt/homebrew/bin:$PATH /opt/homebrew/bin/npm --prefix apps/web run test -- src/pages/help/HelpPage.test.tsx --run --testTimeout=30000` 通过，5 passed；`git diff --check` 通过。本地前端 `http://localhost:5173/help` 返回 200，并用内置浏览器覆盖 390x844、768x1024、1280x800、1440x900：均无页面级横向溢出；390/768 隐藏侧栏和右侧本页目录并保留顶部角色筛选，1280/1440 显示桌面左目录、正文和右侧本页目录。
- Remaining risks: 本轮只改公开帮助手册的信息架构与阅读样式，不改变 `helpContent.json` 的事实内容、平台问答 AI 数据边界或后端接口。

### 2026-06-08

- Type: backend/frontend/docs change / single upload size limit
- Related docs: `docs/product/REQUIREMENTS_AND_NOTES.md`, `docs/api/review-ai-export.md`, `docs/api/team-profile.md`
- Details: Raised the common single-file upload limit from 10MB to 1GB for `/api/v1/uploads` and profile certification material uploads, while keeping dangerous extension/MIME rejection, category-specific format checks, the 50MB task question import limit, and the 2MB Agent avatar limit unchanged. Updated Labeler certification upload copy so visible guidance no longer conflicts with the backend limit. During upload regression validation, also fixed filesystem storage path generation for non-team scopes such as `profile:{user_id}` / `agent:{team_id}` by sanitizing path segments; this keeps persisted ownership and URLs unchanged while avoiding invalid local directories on Windows.
- Test results: `python -m pytest apps/api/tests/test_export_notification_upload_guards.py -k "upload"` passed, 21 passed / 2 warnings; `python -m compileall apps/api/app` passed; `npm.cmd --prefix apps/web run typecheck` passed; `git diff --check` passed with existing LF/CRLF warnings only.
- Remaining risks: The current FastAPI implementation still reads multipart upload content into memory before writing to local filesystem; the 1GB product limit is now enforced, but a future object-storage/streaming implementation is still needed for production-grade large uploads.

- Type: backend/frontend behavior / dataset owner column latest editor
- Related docs: `docs/product/REQUIREMENTS_AND_NOTES.md`, `docs/api/production.md`, `docs/architecture/SYSTEM_ARCHITECTURE.md`, `docs/design/pages/owner-dataset-management.md`, `docs/planning/TODO.md`
- Details: 数据集管理页负责人列从创建人改为最新修改人。后端 `Dataset` 新增 `updated_by`，导入时初始化为创建人，数据集基础信息、表格编辑、素材绑定和补上传合并保存时写入当前操作人；`DatasetPayload` 返回 `updated_by/updated_by_name`，旧数据缺字段时回退创建人。前端表格负责人列只显示最新修改人姓名 Tag，移除单元格内灰色“创建人”说明；卡片负责人区同步改为最新修改人。
- Test results: `cd apps/web && npm run typecheck` 通过；`cd apps/web && npm run test -- src/pages/workspace/WorkspaceApp.test.tsx -t "resource owners" --testTimeout=40000` 通过，1 passed / 93 skipped；`conda run -n markup-api python -m pytest apps/api/tests/test_auth_team_rbac.py -k "owner_can_import_dataset_build_template_and_publish_multimodal_task"` 通过，1 passed / 129 deselected；`conda run -n markup-api python -m compileall apps/api/app` 通过；`git diff --check` 通过。
- Remaining risks: 本轮只调整数据集负责人展示语义和兼容字段，不改变模板/任务负责人字段、数据集权限、审计动作或历史数据迁移脚本。

- Type: frontend/API docs alignment / production list owner labels
- Related docs: `docs/api/production.md`, `docs/design/pages/owner-dataset-management.md`, `docs/design/pages/owner-template-designer.md`, `docs/design/pages/owner-task-management.md`, `docs/planning/TODO.md`
- Details: 数据集管理、模板搭建和任务管理列表统一展示负责人列。数据集与模板列表用 `owner_id/owner_name` 展示创建人，任务管理列表用同一字段展示发布人；卡片视图同步展示对应创建人/发布人标签。任务表格列标题统一为 `负责人`，单元格内保留 `发布人` 语义，便于区分任务发布责任与后续审核员分配。
- Test results: `cd apps/web && npm run typecheck` passed; `cd apps/web && npm run test -- src/pages/workspace/WorkspaceApp.test.tsx -t "resource owners" --testTimeout=40000` passed, 1 passed / 92 skipped; `conda run -n markup-api python -m compileall apps/api/app` passed; `git diff --check` passed.
- Remaining risks: 本轮只补列表展示与契约记录，不改变负责人转交规则、任务权限、审核员分配或历史任务 owner 迁移逻辑。

- Type: frontend bugfix / platform workbench audit and navigation stability
- Related docs: `docs/design/pages/platform-workbench.md`
- Details: Tightened the `/platform` workbench interaction layer. Platform navigation is now URL-driven instead of eagerly mutating local page state before navigation, which removes the old-page/new-page flicker when switching sidebar entries. Platform pages now reuse the fixed workbench heading row shape, hide multi-line heading descriptions, stabilize page min-height and loading states, and disable Ant Design Tabs animation inside certification review. Certification and team verification detail Drawers are mounted only while a row is selected, so approving or rejecting immediately closes the detail view and returns to the table.
- Details: Realigned the platform overview to the enterprise dashboard baseline instead of keeping a separate platform visual system. The overview now uses the same dashboard scroll area, cockpit, KPI strip, chart grid, main grid, Ant Design Card panels, compact table rhythm, and fixed-page flex height model as the enterprise workbench; only small platform data bridge styles remain.
- Details: Fixed the follow-up platform layout regressions found during visual review: the overview summary card no longer uses the enterprise quota-card body model that clipped values, and the Provider list grid no longer stretches a single route card to fill the full column height.
- Details: Reworked platform audit material rendering to handle both string URLs and structured material objects. The material list now displays file name, MIME/category, size, and file id without dumping raw JSON; when a material only has `file_id`, the frontend derives the protected preview/download path for team verification or profile certification materials and opens authenticated blobs in a new tab.
- Test results: `npm.cmd --prefix apps/web run typecheck` passed; `npm.cmd --prefix apps/web run test -- src/pages/platform/PlatformApp.test.tsx --run` passed, 7 passed. Vitest still prints the existing jsdom pseudo-element `getComputedStyle()` warning.
- Remaining risks: This round is scoped to platform workbench frontend behavior. It does not change platform API response shapes or backend audit logic; visual verification in a real browser is still useful for final spacing polish.

- Type: backend seed alignment / unique seeded team admin
- Related docs: `docs/operations/DEPLOYMENT.md`, `docs/product/REQUIREMENTS_AND_NOTES.md`, `docs/architecture/SYSTEM_ARCHITECTURE.md`
- Details: Reworked `apps/api/scripts/dev_seed_accounts.py` to match the current team/global role split. The seed now keeps `teamadmin@test.local` as the seeded enterprise's sole active `team_admin`, maps seeded Owners to global `user` plus team role `owner`, ensures the team AI wallet exists, and removes the legacy human `agent@test.local` account in favor of the auto-created system `Agent`. Per the latest product clarification, the legacy `admin@test.local` test account has also been removed from the seed set.
- Test results: Added `apps/api/tests/test_dev_seed_accounts.py` to assert the unique `team_admin`, owner role mapping, AI wallet, and system Agent behavior. `python -m py_compile apps/api/scripts/dev_seed_accounts.py apps/api/tests/test_dev_seed_accounts.py` passed; `python -m pytest apps/api/tests/test_dev_seed_accounts.py` passed, 1 passed / 1 warning; `scripts/dev_seed_accounts.py --reset` completed successfully and reseeded team `24c1a57206762ada91df335c` with `teamadmin@test.local` as the only `team_admin`.
- Remaining risks: This only aligns local development seed data. If the team creation baseline changes again, the seed script and deployment account table must be updated together.

- Type: frontend behavior adjustment / personal inbox success feedback
- Related docs: `docs/planning/TODO.md`, `docs/architecture/SYSTEM_ARCHITECTURE.md`
- Details: Adjusted `apps/web/src/pages/workspace/PersonalInboxPage.tsx` so personal inbox operation success feedback uses Ant Design `notification` instead of an inline page `Alert`. This covers item-level and batch success actions such as delete, read/unread, handled, star, and mark-all-read. The inline error `Alert` with retry remains in place because it is an actionable page-level failure state rather than a transient success tip.
- Test results: `npm.cmd --prefix apps/web run typecheck` passed; `npm.cmd --prefix apps/web run test -- --run src/pages/workspace/WorkspaceApp.test.tsx -t "renders hidden personal inbox page and updates notification states"` passed, 1 passed / 90 skipped. Vitest output still includes the existing jsdom `getComputedStyle()` pseudo-element warning only.
- Remaining risks: This round only switches success feedback delivery. If later we also want page-load and batch failure feedback to fully migrate to `notification`, we should separately settle how retry actions are surfaced.

- Type: frontend cleanup / Ant Design feedback component sweep follow-up
- Related docs: `docs/planning/TODO.md`, `docs/architecture/SYSTEM_ARCHITECTURE.md`
- Details: Replaced the last two raw non-AntD inline error containers found in active business pages with Ant Design `Alert`. `apps/web/src/pages/onboarding/OnboardingPage.tsx` now renders onboarding submit errors through a shared `OnboardingErrorAlert`, and `apps/web/src/components/agent/PlatformAgentDrawer.tsx` now renders drawer request errors with Ant Design `Alert`. This sweep does not change behavior, copy, or request flow; it only aligns feedback UI with the current Ant Design baseline.
- Test results: `npm.cmd --prefix apps/web run typecheck` passed; `npm.cmd --prefix apps/web run test -- --run src/pages/onboarding/OnboardingPage.test.tsx` passed, 5 passed.
- Remaining risks: `apps/web/src/pages/workspace/PersonalInboxPage.tsx` "消息已删除" feedback was checked during this sweep and is already implemented with Ant Design `Alert`; inbox preview/detail panels remain intentional custom layouts built from Ant Design primitives.

### 2026-06-07

- Type: frontend/backend closure fix / Renderer preview LLM assist
- Related docs: `docs/api/labeling.md`, `docs/api/review-ai-export.md`, `docs/architecture/SYSTEM_ARCHITECTURE.md`, `docs/planning/TODO.md`
- Details: Renderer Preview and the Template AI assistant preview now pass a real AI handler into `TemplateRenderer`, so `LLMComponent` can run in preview instead of only opening the "formal labeling page" notice. The frontend sends current schema, sample content, local preview answers, and component `prompt_hint` to a new team-scoped `POST /api/v1/labels/llm-assist/preview` route, then merges returned `answers` back into local preview state. Backend preview assist reuses the same structured output schema, JSON parsing, answer normalization, field explanation normalization, image annotation normalization, Provider gateway path, and current-answer prompt context as question-level Labeler AI assist, but it does not require a real question, does not create/update submission, and returns `assist_usage: null`.
- Test results: `npm.cmd --prefix apps/web run typecheck` passed; `npm.cmd --prefix apps/web run test -- --run src/pages/workspace/WorkspaceApp.test.tsx -t "readonly preview|clickable preview LLM|labeling LLM assist"` passed, 4 passed / 84 skipped; `python -m py_compile apps/api/app/services/labels_service.py apps/api/app/api/v1/labels.py apps/api/app/schemas/labels.py apps/api/tests/test_labeling_ai_assist.py` passed; `python -m pytest apps/api/tests/test_labeling_ai_assist.py` passed, 5 passed. Backend test output still has the existing FastAPI `on_event` deprecation warnings only.
- Remaining risk: preview calls still depend on the selected Provider and team AI wallet readiness; this is a synchronous preview call, not a queued worker/outbox flow.

- Type: frontend/backend behavior change / LLMComponent Provider selection
- Related docs: `docs/api/labeling.md`, `docs/api/review-ai-export.md`, `docs/architecture/SYSTEM_ARCHITECTURE.md`, `docs/planning/TODO.md`
- Details: Template Designer now shows an AI Provider selector when an `LLMComponent` is selected and persists the choice to `component.config.provider_id`. Renderer Preview, Template AI assistant preview, and formal Labeler AI assist send `component_id`; backend resolves the Provider from the template/schema component and passes that `provider_id` into AI Resources. If the component has no Provider, frontend surfaces a "select Provider first" reminder and backend rejects direct API calls, so LLM components no longer silently fall back to the platform default Provider.
- Test results: `npm.cmd --prefix apps/web run typecheck` passed; `npm.cmd --prefix apps/web run test -- --run src/pages/workspace/WorkspaceApp.test.tsx -t "labeling LLM assist|Provider 未选择|readonly preview|clickable preview LLM"` passed, 4 passed / 85 skipped; `python -m py_compile apps/api/app/services/labels_service.py apps/api/app/api/v1/labels.py apps/api/app/schemas/labels.py apps/api/tests/test_labeling_ai_assist.py` passed; `python -m pytest apps/api/tests/test_labeling_ai_assist.py` passed, 6 passed.
- Remaining risk: existing templates with old `LLMComponent` configs need Owners to reopen the Designer and select a Provider before Labelers can use AI assist.

- 类型：前后端闭环修复 / Labeler AI 辅助标注
- 关联文档：`docs/api/labeling.md`、`docs/api/review-ai-export.md`、`docs/architecture/SYSTEM_ARCHITECTURE.md`、`docs/planning/TODO.md`
- 内容：本轮将模板内 `LLMComponent` 接入正式 Labeler 工作台，前端按模板位置展示 AI 入口并消费 `button_text/prompt_hint`，生成后在 AI 建议区展示中文字段名、字段 key、字段说明和图片标注建议，支持“应用此项/应用全部”写入当前答案并清理对应校验错误。后端新增 `/labels/questions/{question_id}/llm-assist` 文档契约兼容路由，保留 `/ai-assist` 旧别名；Labeler AI 辅助调用平台默认 Provider 时传入结构化输出 schema，并在服务端严格解析 `answers/explanation/field_explanations/image_annotations`，非法 JSON 或非法图片坐标不计入使用次数。统一 Provider 消息调用增加结构化输出参数，OpenAI/Azure 使用 `json_schema`，DeepSeek/OpenAI Compatible/OpenRouter 使用 `json_object` 并注入 schema，Gemini 使用 JSON MIME，其它 Provider 通过 prompt schema 兜底后统一校验。
- 测试结果：`npm.cmd --prefix apps/web run typecheck` passed；`npm.cmd --prefix apps/web run test -- --run src/pages/workspace/WorkspaceApp.test.tsx -t "labeling LLM assist"` 2 passed / 85 skipped；`npm.cmd --prefix apps/web run test -- --run src/pages/workspace/WorkspaceApp.test.tsx -t "renders multimodal ShowItem bindings and LLM assist"` 1 passed / 86 skipped；`python -m py_compile apps/api/app/services/production_service.py apps/api/app/services/labels_service.py apps/api/app/api/v1/labels.py apps/api/tests/test_labeling_ai_assist.py apps/api/tests/test_ai_resources_platform_wallet.py` passed；`python -m pytest apps/api/tests/test_labeling_ai_assist.py apps/api/tests/test_ai_resources_platform_wallet.py -k "labeling_ai_assist or platform_messages"` 6 passed / 8 deselected。
- 剩余风险：本轮保持题目级即时生成，不引入异步 job/outbox；AI 建议仍由 Labeler 人工确认应用，不自动覆盖答案；不同 Provider 对 `json_schema/json_object` 的兼容细节仍需随真实路由连通性继续回归。

- 类型：前端体验优化 / 公开套餐方案页视觉提质
- 关联文档：`docs/design/FRONTEND_DESIGN_STYLE.md`、`docs/design/pages/public-solutions.md`
- 内容：根据“页面太素、和其他公开页不匹配”以及后续“太生硬”的反馈，美化 `/solutions` 套餐方案页但保持 pricing-first 定位。顶部轻标题区增加柔和浅色品牌面板和套餐总览面板，套餐卡改用侧边轻提示、价格区、推荐高亮和更清晰的权益层级，文案从制度说明收敛为按团队阶段选择方案；未恢复流程画布、Choose 区、FAQ 或套餐对比表。
- 测试结果：`npm.cmd run typecheck` 通过；`npm.cmd run test -- src/components/layout/SiteNav.test.tsx --run` 通过，13 passed；`/solutions` 本地 HTTP 检查返回 200；`git diff --check` 通过，仅保留既有 LF/CRLF 提示。
- 后续动作：如继续打磨，可补 375px、768px、1440px 截图验收，重点检查五张套餐卡在桌面宽度下的密度和移动端按钮换行。

- 类型：前端缺陷修复 / Labeler 工作台降级响应与加载态边界
- 关联文档：`docs/design/FRONTEND_DESIGN_STYLE.md`、`docs/api/team-profile.md`、`docs/api/labeling.md`
- 内容：本轮按“前端工作台体验”方向一次修复 3 个可证明偏差。其一，企业内 Labeler 看板读取 `GET /teams/admin/overview` 后虽然设计了 `user.default_team_id/user.team_id` 回退，但直接访问 `overview.teams[0]`，当企业概览响应缺少 `teams` 数组时会在回退前抛错，导致有默认团队的会话也无法加载 `/teams/{team_id}/labeler-dashboard`；现在先把 `teams` 归一为空数组，再按概览、会话默认团队顺序选择团队。其二，企业 Labeler Dashboard 在 `recent_tasks/recent_records/notifications/shortcuts/todo_items` 等列表字段缺省时直接执行 `find/map/length`，首屏会因空 dashboard 或局部响应崩溃；现在 dashboard 入 state 前统一补齐列表、标注统计和质量统计默认值，并过滤缺少 `task_id` 的任务项。其三，个人 Labeler Dashboard 在 `points/certifications/recommended_tasks/shortcuts/todo_items` 等成长字段缺省时会在“成长与收益”面板读取 `points.wallet.available_points` 或推荐任务表格时崩溃；现在个人看板同样在边界归一化积分钱包、资质、推荐任务和待办入口，缺省时展示 0 值或空态。
- 测试结果：先新增并运行红测 `npm.cmd run test -- --run src/pages/workspace/LabelerDashboardPage.test.tsx`，修复前 3 项均失败，分别复现未调用 `getTeamLabelerDashboard('team-fallback')`、`recent_tasks.find` 读取 undefined、`shortcuts.map` 读取 undefined；修复后同一 targeted tests 3 passed。相关入口测试 `npm.cmd run test -- --run src/pages/workspace/WorkspaceApp.test.tsx -t "labeler dashboard"` 2 passed / 83 skipped，并把既有个人看板断言改为等待异步面板出现。Scoped lint `.\node_modules\.bin\eslint.cmd src/pages/workspace/LabelerDashboardPage.tsx src/pages/workspace/LabelerDashboardPage.test.tsx src/pages/workspace/WorkspaceApp.test.tsx` 无输出；`npm.cmd run typecheck` passed；`npm.cmd run build` passed，保留既有 `exceljs` direct eval 和 chunk size warning；`git diff --check` passed，仅有既有 LF/CRLF 提示。全量 `npm.cmd run lint` 仍被既有基线阻塞，当前 53 problems（27 errors / 26 warnings），分布在 `EnhancedTable.tsx`、`HomePage.tsx`、`PlatformApp.tsx`、`TaskSquarePage.tsx`、`AiReviewPage.tsx`、`OperationLogsPage.tsx`、`OwnerProductionPages.tsx`、`ResourceConfigPage.tsx`、`ReviewQueuePage.tsx`、`WorkspaceDashboardPage.tsx`、`WorkspaceMediaPreview.tsx` 等；本轮引入的 `LabelerDashboardPage.tsx useMemo` 未使用问题已修正。全量 `npm.cmd run test -- --run` 单独运行 10 分钟仍超时，未作为本轮通过证据。
- 剩余风险：本轮只收紧 Labeler Dashboard 的降级响应和加载边界，不改变后端 dashboard API shape、企业/个人 Labeler 权限分流、真实任务/提交统计计算或全量前端 lint/test 基线；后续前端体验轮次可单独治理 WorkspaceApp 长链路全量测试挂起与 React Compiler lint 基线。下一轮按 sweep 顺序回到认证与安全边界。

- 类型：后端缺陷修复 / 导出、上传、审计、通知生产开关与危险 MIME 边界
- 关联文档：`docs/api/review-ai-export.md`、`docs/api/team-profile.md`、`docs/product/REQUIREMENTS_AND_NOTES.md`
- 内容：本轮按“导出、上传、审计、通知”方向一次修复 3 个可证明偏差。其一，`data_export=false` 生产开关未拦截 `POST /api/v1/exports`，关闭开关后仍可创建正式结果导出并生成文件；现在导出创建前复用生产开关校验，关闭时返回 `42201 + detail.switch_key=data_export` 且不创建 `export_jobs`。其二，`upload=false` 生产开关未拦截 `POST /api/v1/uploads`，关闭开关后团队文件仍可上传并写入 `uploaded_files`；现在统一上传入口先校验 `upload` 开关，关闭时返回 `42201 + detail.switch_key=upload` 且不落库。其三，上传危险 MIME 校验在读取原始请求头前先把 `application/octet-stream` 按扩展名归一成 `application/pdf` 等安全类型，导致 `contract.pdf + application/octet-stream` 绕过“危险 MIME 先拒绝”要求；现在上传、个人资质材料和 Agent 头像入口都会先检查原始声明 MIME，再做扩展名推断和分类白名单校验。
- 测试结果：先运行红测 `python -m pytest apps/api/tests/test_export_notification_upload_guards.py -k "data_export_switch_blocks_export_creation or upload_switch_blocks_team_upload or document_upload_rejects_octet_stream_even_with_pdf_extension"`，修复前 3 项均失败，分别复现导出开关关闭返回 200、上传开关关闭返回 200、`application/octet-stream` PDF 上传返回 200；修复后同一 targeted tests 3 passed / 13 deselected。相关全量通过：`python -m pytest apps/api/tests/test_export_review_records.py apps/api/tests/test_export_notification_upload_guards.py apps/api/tests/test_audit_log_scope.py apps/api/tests/test_notification_management_permissions.py apps/api/tests/test_upload_avatar_validation.py` 33 passed / 2 warnings。默认后端门禁通过：`python -m pytest apps/api/tests/test_config_security.py` 23 passed；`python -m pytest apps/api/tests/test_auth_team_rbac.py` 116 passed / 16 warnings；`python -m compileall apps/api/app` passed；`git diff --check` passed，仅保留 Git LF/CRLF 提示和既有 FastAPI `on_event`、`datetime.utcnow()`、passlib/argon2 warning。
- 剩余风险：本轮只收紧导出/上传生产开关和上传原始 MIME 旁路，不改变导出异步队列、下载历史、自动通知、WebSocket 推送、企业通知策略或对象存储/安全扫描；多模态媒体仍保留既有安全媒体扩展名兼容口径，后续上传轮次继续细分 dataset/template/media 白名单和更完整的 MIME/内容扫描。

- 类型：后端缺陷修复 / 标注与审核链路草稿可见边界
- 关联文档：`docs/product/REQUIREMENTS_AND_NOTES.md`、`docs/api/labeling.md`、`docs/api/review-ai-export.md`
- 内容：本轮按“标注与审核链路”方向一次修复 3 个可证明偏差。其一，Reviewer 已分配任务后可通过 `GET /reviews/submissions/{submission_id}` 直接打开仍处于 `draft` 的未提交答案，绕过“标注提交后才进入人工审核”的边界；现在人工审核读取详情/历史/diff 前要求提交状态属于 `submitted/approved/rejected`，草稿按不存在处理。其二，`GET /reviews/stats` 使用宽松的可见提交集合，把未提交草稿计入 `total_visible` 和 `by_status`，导致 Reviewer 看板统计未进入审核的私有草稿；现在审核统计只统计已提交或已处理的提交。其三，`GET /ai-reviews/task-overviews/{task_id}/submissions` 会列出 AI 预审任务下的 `draft` 提交，且未强制校验 submission/question/task scope；现在 AI 预审提交列表同样只展示 `submitted/approved/rejected` 且题目归属匹配的提交。
- 测试结果：先运行红测 `python -m pytest apps/api/tests/test_review_queue_visibility.py apps/api/tests/test_ai_review_submission_state.py -k "review_detail_rejects_unsubmitted_draft_submission or review_stats_excludes_unsubmitted_draft_submission or ai_review_task_submissions_exclude_unsubmitted_drafts"`，修复前 3 项均失败，分别复现草稿详情返回 200、审核统计 `total_visible=2`、AI 预审提交列表包含草稿；修复后同一 targeted tests 3 passed / 5 deselected。相关全量通过：`python -m pytest apps/api/tests/test_review_queue_visibility.py apps/api/tests/test_review_history_scope.py apps/api/tests/test_ai_review_submission_state.py apps/api/tests/test_labeling_review_guards.py apps/api/tests/test_review_task_reward_points.py` 18 passed。默认后端门禁通过：`python -m pytest apps/api/tests/test_config_security.py` 23 passed；`python -m pytest apps/api/tests/test_auth_team_rbac.py` 116 passed / 16 warnings；`python -m compileall apps/api/app` passed；`git diff --check` passed，仅保留 Git LF/CRLF 提示和既有 FastAPI `on_event`、`datetime.utcnow()`、passlib/argon2 warning。
- 剩余风险：本轮只收紧草稿在 Reviewer 详情、审核统计和 AI 预审提交列表中的可见边界，不改变已提交/已处理记录的历史、diff、重试、积分结算或打回重提流程；下一轮标注/审核链路继续巡检领取并发、批量审核失败回滚语义和 AI 预审 worker 幂等。

- 类型：后端缺陷修复 / 生产链路状态机、额度与生产开关边界
- 关联文档：`docs/api/production.md`、`docs/api/review-ai-export.md`、`docs/api/team-profile.md`、`docs/product/REQUIREMENTS_AND_NOTES.md`
- 内容：本轮按“生产链路”方向一次修复 3 个可证明偏差。其一，`finish` 状态动作未阻断仍处于 `claimed/submitted/rejected` 的题目，导致待提交、待审核或返工中的任务可被直接结束；现在结束任务前统计阻断题目并返回 `409`，保留任务原状态。其二，`PUT /datasets/{dataset_id}/table` 重算 `Dataset.storage_bytes` 但没有按增长量校验会员存储额度，企业可通过表格编辑绕过数据集容量限制；现在表格保存前按旧快照计算增长量，增长为正时复用会员存储容量校验，超限时不落库。其三，`task_publish=false` 生产开关只应允许在重新开启后发布任务，但 `POST /tasks/{task_id}/status` 的 `approve` 路径未复用开关校验；现在直接发布和审批发布都复用 `task_publish` 开关，关闭时返回 `42201 + detail.switch_key=task_publish` 并保持原状态。
- 测试结果：先运行红测 `python -m pytest apps/api/tests/test_task_production_guards.py -k "finish_blocks_unfinished_review_or_rework_questions or table_edit_rejects_membership_storage_growth_over_limit or task_publish_switch_blocks_pending_review_approval"`，修复前 3 项均失败，分别复现 finish 返回 200、表格编辑超额度返回 200、开关关闭时审批发布返回 200；修复后同一 targeted tests 3 passed / 20 deselected。相关全量 `python -m pytest apps/api/tests/test_task_production_guards.py` 23 passed。默认后端门禁通过：`python -m pytest apps/api/tests/test_config_security.py` 23 passed；`python -m pytest apps/api/tests/test_auth_team_rbac.py` 116 passed / 16 warnings；`python -m compileall apps/api/app` passed；`git diff --check` passed，仅保留 Git LF/CRLF 提示和既有 FastAPI `on_event`、`datetime.utcnow()`、passlib/argon2 warning。
- 剩余风险：本轮只收紧生产任务完成、数据集表格编辑容量和任务发布开关，不改变题目导入/补上传/派发领取/积分结算流程；下一轮生产链路继续巡检积分预算预扣、发布后字段限制和任务复制/转交边界。

- 类型：后端缺陷修复 / 团队成员导入全局角色与权限摘要边界
- 关联文档：`docs/api/team-profile.md`、`docs/product/REQUIREMENTS_AND_NOTES.md`
- 内容：本轮按“团队作用域与权限”方向一次修复 3 个可证明权限偏差。其一，批量导入新 Owner 成员时会把企业内 `owner` 反写为用户全局 `owner`，绕过“用户全局身份与企业内角色需要区分”的基线；现在导入新 Owner 仅创建全局 `user`，企业权限只来自当前 `TeamMember`。其二，批量导入新 Team Admin 成员时会把企业内 `team_admin` 反写为全局 `admin`，与单个成员账号创建和邀请接受链路不一致；现在新 Team Admin 同样保持全局 `user`。其三，登录和无 `X-Team-ID` 的 `/auth/me` 默认企业权限摘要忽略 `permissions_customized`，把已显式收窄的成员权限重新与角色默认权限合并，导致前端能力判断看到超出运行时鉴权上限的权限；现在默认成员权限摘要尊重显式收窄。
- 测试结果：先新增并运行红测 `python -m pytest apps/api/tests/test_auth_team_rbac.py -k "import_new_owner_member_keeps_global_role_user or import_new_team_admin_member_keeps_global_role_user or login_and_me_payload_respect_default_team_customized_permissions"`，修复前 3 项均失败，分别复现导入 Owner 得到全局 `owner`、导入 Team Admin 得到全局 `admin`、登录权限摘要包含 reviewer 默认权限；修复后同一 targeted tests 3 passed / 113 deselected。
- 剩余风险：本轮只收紧批量导入新成员的全局身份映射和认证返回的默认权限摘要，不改变单个成员账号创建、邀请接受、成员更新、运行时 `X-Team-ID` 鉴权或系统 Agent 只读逻辑；后续团队权限轮次继续覆盖更多路径/header 一致性、成员状态变更和跨团队数据范围。

- 类型：后端缺陷修复 / 认证生产密钥空白占位边界
- 关联文档：`docs/api/auth.md`、`docs/operations/DEPLOYMENT.md`
- 内容：本轮按“认证与安全边界”方向一次修复 3 个可证明生产配置偏差。其一，生产环境 `SECRET_KEY` 只校验字节长度，`" " * 32` 这样的空白占位也能通过“强随机值”门禁；现在生产密钥必须在去除空白后仍达到 32 字节。其二，`PASSWORD_PEPPER` 存在同样问题，空白占位会参与密码哈希并造成部署安全假象；现在生产密码 pepper 复用非空强密钥校验。其三，`VERIFICATION_CODE_PEPPER` 也能用空白占位通过启动校验，削弱邮箱验证码摘要隔离；现在验证码 pepper 同样拒绝空白占位。
- 测试结果：先新增并运行红测 `python -m pytest apps/api/tests/test_config_security.py`，修复前新增 3 项失败，分别复现空白 `SECRET_KEY`、空白 `PASSWORD_PEPPER`、空白 `VERIFICATION_CODE_PEPPER` 未被拒绝，其余 20 项通过；修复后同一配置安全测试 23 passed。
- 剩余风险：本轮仅收紧生产认证密钥/pepper 配置，不改变本地开发默认值、SMTP 配置、OAuth provider 配置或会话状态机；后续认证轮次继续覆盖 OAuth ticket、验证码频率、cookie/CORS 与敏感信息泄露。

- 类型：前端缺陷修复 / 工作台多模态素材上传与预览边界
- 关联文档：`docs/design/FRONTEND_DESIGN_STYLE.md`、`docs/product/REQUIREMENTS_AND_NOTES.md`
- 内容：本轮按“前端工作台体验”方向一次修复 3 个可证明偏差。其一，数据集导入的多模态素材上传只依赖浏览器 `accept` 提示，若通过拖拽、脚本或测试绕过文件选择器，`manual.pdf` 等非图片/音频/视频文件仍会作为 `media_files` 提交；现在上传前校验安全媒体扩展名和 MIME，并显式拒绝 SVG。其二，数据集补上传合并入口存在同样边界，`notes.txt` 等非媒体文件可混入 patch-upload 的 `media_files`；现在补上传复用同一素材白名单。其三，工作台媒体预览在受保护下载 URL 无扩展名时仅按 URL 推断类型，`application/pdf` 等文档 MIME 会落到通用文件样式；现在 PDF、Office、文本、Markdown 与 JSON MIME 会规范为文档预览类型。
- 测试结果：新增并运行 targeted `npm.cmd run test -- --run src/pages/workspace/WorkspaceMediaPreview.test.tsx src/pages/workspace/WorkspaceApp.test.tsx -t "document MIME|non-media files as dataset media assets"`，3 passed / 85 skipped；组件全量 `npm.cmd run test -- --run src/pages/workspace/WorkspaceMediaPreview.test.tsx` 3 passed；`npm.cmd run typecheck` passed；`npm.cmd run build` passed，保留既有 `exceljs` direct eval 与 chunk size warning；`git diff --check` passed，仅有 Git LF/CRLF 提示。相关宽口径 `npm.cmd run test -- --run src/pages/workspace/WorkspaceApp.test.tsx -t "dataset"` 当前仍被既有长链路基线阻塞：`imports and previews enterprise datasets` 超时，以及两个草稿发布向导用例缺少 `模板已选中`；完整 `npm.cmd run lint` 仍被既有基线阻塞，当前 27 errors / 26 warnings，分布在多个工作台/首页/平台文件。
- 剩余风险：本轮只收紧前端选择与提交边界，不改变后端上传白名单、数据集解析逻辑或媒体资产存储策略；后续前端轮次继续覆盖工作台长链路 dataset 测试基线、React Compiler lint 基线和移动端布局。

- 类型：后端缺陷修复 / 通知站内可见与终态状态边界
- 关联文档：`docs/product/REQUIREMENTS_AND_NOTES.md`、`docs/api/review-ai-export.md`、`docs/design/pages/organization-announcements.md`
- 内容：本轮按“导出、上传、审计、通知”方向一次修复 3 个可证明通知边界偏差。其一，`in_app_enabled=false` 的邮件-only 通知仍会进入 `/notifications/my` 站内个人信箱，违背站内通知开关和“页面只展示后端真实站内消息”的口径；现在个人可见性统一排除非站内通知。其二，已过期通知虽然列表状态显示为 `expired`，但单条状态接口仍允许用户把它标为 `handled` 并隐式写入 `read_by`，与“已过期置灰、保留历史可见”的处理边界不一致；现在除个人软删除外，过期通知拒绝读/处理等状态写入。其三，已撤回通知仍允许个人状态更新，撤回后的企业通知可继续被用户标记处理；现在 `revoked` 与 `expired` 一样作为终态拒绝读/处理等状态变更，批量状态更新遇到终态通知时跳过并记录 `terminal_status`。
- 测试结果：先新增并运行红测 `python -m pytest apps/api/tests/test_export_notification_upload_guards.py -k "email_only_notifications or individual_state_update_rejects"`，修复前 3 项均失败，分别复现 email-only 通知出现在站内个人信箱、过期通知单条 handled 返回 200、撤回通知单条 handled 返回 200；修复后同一 targeted tests 通过：3 passed / 10 deselected。相关全量通过：`python -m pytest apps/api/tests/test_export_review_records.py apps/api/tests/test_export_notification_upload_guards.py apps/api/tests/test_audit_log_scope.py apps/api/tests/test_notification_management_permissions.py apps/api/tests/test_upload_avatar_validation.py` 30 passed；默认后端门禁通过：`python -m pytest apps/api/tests/test_config_security.py` 20 passed；`python -m pytest apps/api/tests/test_auth_team_rbac.py` 112 passed / 16 warnings；`python -m compileall apps/api/app` passed；`git diff --check` passed，仅保留 Git LF/CRLF 提示与既有 FastAPI `on_event`、`datetime.utcnow()`、passlib/argon2 warning。
- 剩余风险：本轮仅收紧通知站内可见性和终态状态写入；导出自动完成/失败提醒、WebSocket 实时推送、企业级强制通知策略、审计导出大规模异步化和更多上传白名单仍留给后续导出/上传/审计/通知轮次。

- 类型：后端缺陷修复 / 标注与审核回流状态边界
- 关联文档：`docs/api/labeling.md`、`docs/api/review-ai-export.md`、`docs/product/REQUIREMENTS_AND_NOTES.md`
- 内容：本轮按“标注与审核链路”方向一次修复 3 个可证明偏差。其一，`GET /labels/my-tasks` 只展示 `published/paused` 任务，导致已结束任务中仍需 Labeler 修改的 `rejected` 提交无法回到我的任务；现在 `finished` 任务仅在存在打回题目时进入 my-tasks，普通已结束任务仍隐藏。其二，`GET /labels/contributions` 的任务聚合同样提前过滤 `finished`，导致已经确认提交并进入结束态的贡献记录不出现在最近贡献；现在贡献列表保留 `finished` 任务并按既有 `labeler_review_task_status` 标记为 `finished`。其三，放弃题目接口持久化时已把题目释放为 `pending` 并清空 `assigned_to`，但响应 payload 又把题目状态覆盖成 `abandoned`，与“释放回任务广场、旧提交保留 abandoned”的状态边界不一致；现在响应返回题目真实 `pending` 状态，并在嵌套 submission 中保留 `abandoned`。
- 测试结果：先运行红测 `python -m pytest apps/api/tests/test_labeling_claim_deadline.py -k "rejected_task_can_be_edited_resubmitted_and_reconfirmed or finished_task_is_marked_finished_in_labeler_contributions or labeler_can_abandon_question_and_release_it_to_marketplace"`，修复前 3 项均失败，分别复现打回 finished 任务不回 my-tasks、finished 贡献缺失、abandon 响应把已释放题目显示为 abandoned；修复后同一 targeted tests 通过：3 passed / 18 deselected。相关验证通过：`python -m pytest apps/api/tests/test_labeling_claim_deadline.py apps/api/tests/test_labeling_review_round_guards.py apps/api/tests/test_review_queue_visibility.py apps/api/tests/test_review_history_scope.py apps/api/tests/test_labeling_review_guards.py` 33 passed；默认后端门禁通过：`python -m pytest apps/api/tests/test_config_security.py` 20 passed；`python -m pytest apps/api/tests/test_auth_team_rbac.py` 112 passed / 16 warnings；`python -m compileall apps/api/app` passed；`git diff --check` passed，仅保留 Git LF/CRLF 提示与既有 FastAPI `on_event`、`datetime.utcnow()`、passlib/argon2 warning。
- 剩余风险：本轮只收紧 Labeler my-tasks、贡献列表和 abandon 响应状态；打回重提的多轮审核 diff 展示、AI 预审重试持久化 worker、领取并发额度和 Reviewer assigned_only 的更深链路继续留给后续标注/审核轮次。

- 类型：后端缺陷修复 / 生产链路导出公式注入边界
- 关联文档：`docs/product/REQUIREMENTS_AND_NOTES.md`
- 内容：本轮按“生产链路”方向一次修复 3 个可证明偏差。其一，`GET /datasets/{dataset_id}/download?format=csv` 会直接写出数据集原始行中的用户可控字符串，`=HYPERLINK(...)` 等值下载后可能被表格软件解释为公式；现在数据集 CSV 写出前复用统一 `escape_csv_formula`。其二，`GET /tasks/export?format=csv` 任务清单导出同样直接写出任务标题、标签等生产字段，公式型任务标题或标签会进入 CSV；现在任务清单 CSV 对每个单元格做公式转义。其三，`GET /tasks/{task_id}/questions/export?format=csv/xlsx` 题目导出未转义题目内容，CSV 与 Excel 都可能写入公式型单元格；现在题目 CSV 和最小 XLSX 生成都会在写入单元格前转义公式前缀。
- 测试结果：先运行红测 `python -m pytest apps/api/tests/test_task_production_guards.py -k "csv_download_escapes_formula_like_values or task_list_csv_export_escapes_formula_like_values or task_question_exports_escape_formula_like_values"`，修复前 3 项均失败，分别复现数据集 CSV、任务清单 CSV、题目 CSV/XLSX 未转义公式型值。修复后同一 targeted 测试通过：3 passed / 18 deselected。相关与默认门禁通过：`python -m pytest apps/api/tests/test_task_production_guards.py` 21 passed；`python -m pytest apps/api/tests/test_task_question_team_scope.py` 1 passed；`python -m pytest apps/api/tests/test_auth_team_rbac.py` 112 passed / 16 warnings；`python -m pytest apps/api/tests/test_config_security.py` 20 passed；`python -m compileall apps/api/app` passed。顺手将 `test_task_question_team_scope.py` 的测试 session 过期时间从 2026-06-01 改为稳定未来日期，避免 2026-06-07 后相关门禁自然 401。
- 剩余风险：本轮只收紧生产服务内的数据集、任务清单和题目导出；正式结果导出、审计导出已有独立公式转义测试。后续生产链路仍需继续巡检发布审批状态机、题目导入字段映射、会员/积分预扣和任务复制/转交边界。

- 类型：后端缺陷修复 / 团队成员自编辑权限边界
- 关联文档：`docs/product/REQUIREMENTS_AND_NOTES.md`、`docs/api/team-profile.md`
- 内容：本轮按“团队作用域与权限”方向一次修复 3 个可证明偏差。其一，`PUT /teams/{team_id}/members/{user_id}` 对当前操作者自己的成员记录仍允许提交 `status=disabled`，与成员列表 `actions.can_disable=false`、删除接口禁止自删、批量改角色跳过自己的边界不一致；现在服务层拒绝编辑自己的成员关系。其二，同一接口允许当前操作者把自己的 `team_role` 改为低权限角色，可能让当前企业失去可维护的 Team Admin/Owner 主操作人；现在自我角色变更被拒绝。其三，同一接口允许当前操作者显式提交收窄 `permissions`，把自己的运行时企业权限降到不可继续管理的状态；现在自我权限收窄同样被拒绝，成员管理必须由其他有权限成员操作。
- 测试结果：先运行红测 `python -m pytest apps/api/tests/test_auth_team_rbac.py -k "member_update_rejects_self"`，修复前 3 项均失败，分别复现自我禁用、自我角色变更、自我权限收窄均返回 200。修复后同一 targeted 测试通过：3 passed / 109 deselected。门禁通过：`python -m pytest apps/api/tests/test_auth_team_rbac.py` 112 passed / 16 warnings；`python -m pytest apps/api/tests/test_config_security.py` 20 passed；`python -m compileall apps/api/app` passed；`git diff --check` passed，仅保留 Git LF/CRLF 提示与既有 FastAPI `on_event`、`datetime.utcnow()`、passlib/argon2 warning。
- 剩余风险：本轮仅收紧成员记录“自编辑”入口；Owner/Reviewer/Labeler 在其他业务 API 上的可见范围、以及系统 Agent 在资源治理链路中的只读边界继续留给后续团队权限 sweep。

- 类型：认证与安全边界缺陷修复 / refresh 重试头与生产数据库配置
- 关联文档：`docs/api/auth.md`、`docs/operations/DEPLOYMENT.md`
- 内容：本轮按“认证与安全边界”方向一次修复 3 个可证明偏差。其一，前端 `authenticatedApiRequest` 在 access token 过期后如果通过 `rebuildAfterRefresh` 重建 JSON 请求体，只重建了 body 和 Authorization，未重新补 `Content-Type: application/json`，会让 `revoke-others`、`logout` 等会话敏感 JSON 重试请求在部分后端/代理链路中被当作无类型请求；现在重建后的请求同样按 body 类型补默认 JSON 头，并继续跳过 `FormData`。其二，后端生产配置允许 `MONGODB_URL=mongomock://...` 启动，违背部署文档“测试环境可使用 mongomock，生产必须使用真实 MongoDB 服务”的要求；现在生产环境拒绝 mongomock URL。其三，后端生产配置没有拒绝空白 `MONGODB_DATABASE`，违背部署前检查中生产库名必须明确的要求；现在数据库 URL 和库名都会去除首尾空白，库名为空时在配置加载阶段失败。
- 测试结果：先运行红测 `npm.cmd run test -- --run src/services/apiClient.test.ts -t "rebuilds the request body"`，修复前 1 failed，复现 refresh 后重建请求缺少 JSON `Content-Type`；运行红测 `python -m pytest apps/api/tests/test_config_security.py -k "mongomock_database_url or non_empty_mongodb_database_name"`，修复前 2 failed，复现生产配置未拒绝 `mongomock://` 和空白数据库名。
- 门禁结果：修复后 targeted `npm.cmd run test -- --run src/services/apiClient.test.ts -t "rebuilds the request body"` 1 passed / 12 skipped；targeted `python -m pytest apps/api/tests/test_config_security.py -k "mongomock_database_url or non_empty_mongodb_database_name"` 2 passed / 18 deselected。相关全量 `npm.cmd run test -- --run src/services/apiClient.test.ts` 13 passed；`python -m pytest apps/api/tests/test_config_security.py` 20 passed；认证回归 `python -m pytest apps/api/tests/test_auth_team_rbac.py` 109 passed / 16 warnings。门禁 `npm.cmd exec eslint -- src/services/apiClient.ts src/services/apiClient.test.ts` 0 errors；`npm.cmd run typecheck` passed；`npm.cmd run build` passed，保留既有 `exceljs` direct eval 与大 chunk warning；`python -m compileall apps/api/app` passed；`git diff --check` passed，仅有 Git LF/CRLF 提示。完整 `npm.cmd run lint` 仍被既有 baseline 阻塞，当前 23 errors / 26 warnings，错误不在本轮触碰文件。
- 剩余风险：本轮仅收紧生产启动配置和前端认证重试请求头，不改变 MongoDB 本地开发默认值，也不调整完整 CORS/部署拓扑。

- 类型：前端缺陷修复 / 工作台上传请求与页面状态边界
- 关联文档：`docs/design/FRONTEND_DESIGN_STYLE.md`、`docs/product/REQUIREMENTS_AND_NOTES.md`
- 内容：本轮按“前端工作台体验”方向一次修复 3 个可证明偏差。其一，`authenticatedApiRequest` 对 `FormData` 请求仍默认补 `Content-Type: application/json`，会破坏浏览器为 `multipart/form-data` 自动生成的 boundary；现在仅在非 `FormData` 且调用方未显式设置时补 JSON 头，上传类认证 API 保留浏览器生成的 multipart 头。其二，`/tasks/assigned/:code` 指派任务落地页在校验中使用裸文本，在无效链接时使用裸 `<p>` 错误提示，违反工作台页面级加载使用 `WorkspaceLoading`、阻断性错误使用 `Alert` 的设计基线；现在校验中使用 `WorkspaceLoading`，无效链接使用 Ant Design `Alert`。其三，Reviewer 工作台公告通知具备只读降级能力，但导航权限集合未开放 `announcements`，导致 Reviewer 无法从侧栏进入公告通知页；现在 Reviewer 的只读企业管理导航包含公告通知，仍不开放操作日志以避免触碰当前后端 `team:manage` 审计边界。
- 测试结果：先运行红测 `npm.cmd run test -- --run src/services/apiClient.test.ts src/app/App.test.tsx src/app/workspaceNavigation.test.tsx -t "FormData authenticated API requests|assigned task link|reviewer navigation"`，修复前 4 failed，分别复现 FormData 被 JSON 头污染、指派链接加载/错误状态缺少语义组件、Reviewer 公告入口不可访问；修复后同一 targeted 测试 4 passed / 27 skipped。相关全量 `npm.cmd run test -- --run src/services/apiClient.test.ts src/app/App.test.tsx src/app/workspaceNavigation.test.tsx` 31 passed，仅保留既有 jsdom `getComputedStyle` / `canvas` 提示。
- 门禁结果：`npm.cmd run typecheck` passed；本轮文件限定 `npm.cmd exec eslint -- src/services/apiClient.ts src/services/apiClient.test.ts src/app/App.tsx src/app/App.test.tsx src/app/workspaceNavigation.tsx src/app/workspaceNavigation.test.tsx` 0 errors / 1 existing warning（`App.tsx` useEffect dependency）；`npm.cmd run build` passed，保留既有 `exceljs` direct eval 与大 chunk warning；`git diff --check` passed，仅有 Git LF/CRLF 提示。完整 `npm.cmd run lint` 仍被既有 23 errors / 26 warnings 阻塞；完整 `npm.cmd run test -- --run` 15 files passed / 2 failed，174 passed / 19 failed / 1 skipped，失败集中在既有 `PlatformApp.test.tsx` settlement filter、`WorkspaceApp.test.tsx` 历史长链路，以及 `LabelerDashboardPage` 对空 dashboard 响应的 `recent_tasks` undefined 异常。
- 剩余风险：工作日志入口文档与当前后端审计权限仍存在产品/安全取舍差异，本轮未放开 Reviewer 的 `operation-logs`；后续若确认 Reviewer 可读工作日志，需要同步调整后端 `audit-logs` 权限、前端导航和审计范围测试。

### 2026-06-07

- 类型：后端缺陷修复 / 导出、上传、审计、通知安全边界
- 关联文档：`docs/api/review-ai-export.md`、`docs/product/REQUIREMENTS_AND_NOTES.md`
- 内容：本轮导出、上传、审计、通知 sweep 一次修复 3 个可证明偏差。其一，Excel 结果导出只做 XML 转义，没有复用 CSV 的公式注入防护，`=HYPERLINK(...)`、`+SUM(...)` 等答案值会以可执行公式形态写入 `.xlsx` 单元格；现在 Excel 单元格写入前统一经过 `escape_csv_formula`，CSV 与 Excel 防护语义一致。其二，团队上传守卫未把 HTML/SVG/脚本 MIME 纳入危险类型，`category=other` 可上传 `text/html` 脚本文件；现在危险扩展补充 `.html/.xhtml/.svg`，危险 MIME 补充 `text/html`、`application/xhtml+xml`、`image/svg+xml`、`application/javascript`、`text/javascript` 等，并规范化带 charset 的 MIME 后再判断。其三，企业 Labeler 看板通知列表绕过统一个人信箱过滤，未排除 `deleted_at` 软删除通知，管理端删除后的成员定向通知仍会出现在 Labeler 看板；现在看板过滤同步排除软删除通知。
- 测试结果：先运行红测 `python -m pytest apps/api/tests/test_export_review_records.py apps/api/tests/test_export_notification_upload_guards.py apps/api/tests/test_auth_team_rbac.py -k "excel_escapes_formula or scriptable_html or soft_deleted_notifications"`，修复前 3 项均失败，分别复现 Excel 未转义、HTML 上传返回 200、软删除通知仍展示；修复后同一 targeted 测试通过，结果为 3 passed / 122 deselected。相关全量通过：`python -m pytest apps/api/tests/test_export_review_records.py apps/api/tests/test_export_notification_upload_guards.py apps/api/tests/test_audit_log_scope.py apps/api/tests/test_notification_management_permissions.py apps/api/tests/test_upload_avatar_validation.py` 27 passed。默认后端门禁通过：`python -m pytest apps/api/tests/test_config_security.py` 18 passed；`python -m pytest apps/api/tests/test_auth_team_rbac.py` 109 passed；`python -m compileall apps/api/app` passed；`git diff --check` passed。仅保留既有 FastAPI `on_event`、`datetime.utcnow()`、passlib/argon2 warning 与 Git LF/CRLF 提示。
- 后续动作：下一轮按 sweep 顺序进入前端工作台体验，优先覆盖 auth refresh retry、页面权限回退、Ant Design 表单/表格状态、错误提示、加载态、移动端布局，以及已知 jsdom/build warning 之外的真实回归。

- 类型：后端缺陷修复 / 标注任务广场分发可见性边界
- 关联文档：`docs/api/labeling.md`、`docs/product/REQUIREMENTS_AND_NOTES.md`
- 内容：本轮标注与审核链路 sweep 一次修复 3 个可证明偏差。其一，`GET /labels/tasks` 默认任务广场直接返回所有 `published` 任务，导致 `quota_grab` 企业内流转任务被公开 Labeler 看到；现在公开列表只展示 `first_come_all`，企业内 `quota_grab` 仅在当前企业 Labeler 携带对应 `X-Team-ID` 且请求 `team_scope=mine` 时返回。其二，`assigned_link` 指派链接任务同样会进入公开任务广场，绕过“只能通过指派链接详情曝光”的分发语义；现在指派链接任务不进入公开列表。其三，`GET /labels/tasks/{task_id}/qualification-check` 和 `POST /labels/tasks/{task_id}/claim` 未复用分发边界，外部 Labeler 可直接探测并领取企业内 `quota_grab` 任务；现在企业内流转任务要求当前 `X-Team-ID` 对应任务企业且企业角色为 `labeler`，不满足时按任务不存在处理，并保持题目和提交草稿不变。
- 测试结果：先运行红测 `python -m pytest apps/api/tests/test_labeling_claim_deadline.py -k "public_market_hides_internal_and_assigned_link_tasks or external_labeler_cannot_claim_quota_grab_team_task or external_labeler_qualification_check_rejects_quota_grab_team_task"`，3 项均失败，分别复现公开列表包含 `quota_grab`/`assigned_link`、外部 Labeler 领取企业内流转任务返回 200、领取前资质检查返回 200。修复后同一 targeted 测试通过，结果为 3 passed / 18 deselected。相关子集通过：`python -m pytest apps/api/tests/test_labeling_review_guards.py apps/api/tests/test_review_queue_visibility.py apps/api/tests/test_ai_review_submission_state.py` 8 passed；默认门禁通过：`python -m pytest apps/api/tests/test_config_security.py` 18 passed；`python -m pytest apps/api/tests/test_auth_team_rbac.py` 108 passed；`python -m compileall apps/api/app` passed。`python -m pytest apps/api/tests/test_labeling_claim_deadline.py` 全量当前 18 passed / 3 failed，剩余失败为既有基线：`test_rejected_task_can_be_edited_resubmitted_and_reconfirmed`、`test_finished_task_is_marked_finished_in_labeler_contributions`、`test_labeler_can_abandon_question_and_release_it_to_marketplace`，已按本轮“只修 3 个缺陷”规则记录为后续独立处理项。仅保留既有 FastAPI `on_event`、`datetime.utcnow()`、passlib/argon2 warning 和 Git LF/CRLF 提示。
- 后续动作：下一轮按 sweep 顺序进入导出、上传、审计、通知，优先覆盖导出授权/过滤/下载审计、上传大小/类型/权限、审计日志 team scope 与通知可见范围；若回到标注链路，可单独处理 `test_labeling_claim_deadline.py` 中 finished/abandon/retry 旧基线。
- 类型：后端缺陷修复 / 生产链路数据集快照与发布后源数据边界
- 关联文档：`docs/api/production.md`、`docs/product/REQUIREMENTS_AND_NOTES.md`
- 内容：本轮生产链路 sweep 一次修复 3 个可证明偏差。其一，`PUT /datasets/{dataset_id}` 的 `derived_columns` 会写回 `rows`、`preview_rows` 和 `columns`，但未检查非草稿任务引用，已发布任务绑定的数据集仍可被追加派生列，导致待审核、收集中、暂停或历史任务的题目源数据漂移；现在新增派生列前会拒绝被 `pending_review/published/paused/finished` 任务引用的数据集。其二，`POST /datasets/{dataset_id}/media-assets/bind` 会把未绑定素材移入行级 `media` 并改写多模态 schema，但同样未检查非草稿任务引用；现在媒体绑定复用同一发布后源数据保护，失败时保持原始行和未绑定素材不变。其三，派生列更新后未重算 `Dataset.storage_bytes`，会员数据集存储用量仍停留在旧快照；现在按最终 `rows + media_assets.size` 快照重算，并仅按净增长校验会员存储额度。
- 测试结果：先运行红测 `python -m pytest apps/api/tests/test_task_production_guards.py -k "derived_column_update_rejects_published_task_dataset_reference or media_asset_bind_rejects_published_task_dataset_reference or derived_column_update_recalculates_dataset_storage_snapshot"`，3 项均失败，分别复现派生列更新返回 200、媒体绑定返回 200、派生列后 `storage_bytes=32` 而快照应为 63。修复后同一 targeted 测试通过，结果为 3 passed / 15 deselected。相关全量与默认门禁均通过：`python -m pytest apps/api/tests/test_task_production_guards.py` 18 passed；`python -m pytest apps/api/tests/test_config_security.py` 18 passed；`python -m pytest apps/api/tests/test_auth_team_rbac.py` 108 passed；`python -m compileall apps/api/app` passed；`git diff --check` passed。仅保留既有 FastAPI `on_event`、`datetime.utcnow()`、passlib/argon2 warning 和 Git LF/CRLF 提示。
- 后续动作：下一轮按 sweep 顺序进入标注与审核链路，优先覆盖任务广场领取并发/额度、草稿、提交校验、打回重提、多轮审核、Reviewer assigned_only 和 AI 预审入队幂等。
- 类型：后端缺陷修复 / 团队作用域与权限边界
- 关联文档：`docs/api/team-profile.md`、`docs/api/review-ai-export.md`、`docs/product/REQUIREMENTS_AND_NOTES.md`
- 内容：本轮团队作用域与权限 sweep 一次修复 3 个可证明偏差。其一，`POST /teams/{team_id}/members/import` 对已有账号按邮箱加入企业时，会把目标企业角色反写到 `User.global_role`，导致普通用户被批量导入为 Reviewer 后获得全局 reviewer 身份；现在已有账号导入只创建企业成员关系，不改写既有全局角色。其二，`POST /teams/invitations/{invite_code}/respond` 接受企业邀请时同样会把企业角色映射到全局角色，既有普通账号接受 Owner 邀请后被改写为全局 `owner`；现在既有非 `pending` 账号接受邀请只变更企业成员关系，`pending` 用户在 onboarding 填码加入时仅激活为非特权全局身份（企业 Labeler 为 `labeler`，其他企业角色为 `user`），企业角色继续通过 `team_role` 表达。其三，`GET /ai-resources/configs?team_id=...` 与 `GET /ai-resources/calls?team_id=...` 只校验企业成员身份，普通企业 Labeler 可读取 AI Provider 配置列表和调用日志；现在企业作用域 AI 资源读取除 `Authorization` 与 `X-Team-ID`/`team_id` 一致外，还必须具备 `budget:view` 或 `ai_provider:manage` 权限。
- 测试结果：先运行红测 `python -m pytest apps/api/tests/test_auth_team_rbac.py -k "import_existing_member_preserves_global_role or invitation_accept_preserves_existing_user_global_role or team_labeler_cannot_read_ai_resource_configs_or_call_logs"`，3 项均失败，分别复现导入改写全局角色、邀请接受改写全局角色、Labeler 读取 AI 资源返回 200；修复后同一 targeted 通过：3 passed / 105 deselected。相关与默认门禁通过：`python -m pytest apps/api/tests/test_auth_team_rbac.py` 108 passed；`python -m pytest apps/api/tests/test_team_membership.py` 8 passed；`python -m pytest apps/api/tests/test_config_security.py` 18 passed；`python -m compileall apps/api/app` passed；`git diff --check` passed。仅保留既有 FastAPI `on_event`、`datetime.utcnow()`、passlib/argon2 warning 与 Git LF/CRLF 提示。
- 后续动作：下一轮按 sweep 顺序进入生产链路，优先覆盖数据集、模板版本、任务发布状态机、题目导入/导出、发布后字段限制，以及积分预算预扣与扣减。

- 类型：后端缺陷修复 / 认证会话与生产配置安全边界
- 关联文档：`docs/api/auth.md`、`docs/operations/DEPLOYMENT.md`
- 内容：本轮认证与安全边界 sweep 一次修复 3 个可证明缺陷。其一，生产配置声称 `FRONTEND_APP_URL` 与 `FRONTEND_OAUTH_CALLBACK_URL` 必须是公开 HTTPS 地址，但公网校验仍接受 `https://markup-intranet` 单标签内网主机和 `https://auth.local/...` 特殊用途域名；现在生产公网 URL 会拒绝单标签主机以及 `.local`、`.localhost`、`.internal`、`.lan`、`.test`、`.example`、`.invalid` 等特殊用途后缀，并保留既有私网/loopback/link-local/reserved/multicast/unspecified IP 拒绝规则。其二，禁用账号只要持有有效 `reset_password` 邮箱验证码，仍可通过忘记密码接口改写密码哈希；现在重置密码保持非枚举 200 语义，但仅 `status=active` 的账号会变更密码、撤销 refresh session 并写入审计，禁用或不存在账号只消费验证码后 no-op。其三，已签名但缺少 `jti` 的 refresh token 会在 refresh/logout/revoke-others 链路中触发 `KeyError` 500；现在 refresh token 解码统一要求 `typ=refresh` 且 `sub`、`jti` 均为非空字符串，结构异常时统一返回 `40101`。
- 测试结果：先运行红测 `python -m pytest apps/api/tests/test_config_security.py apps/api/tests/test_auth_team_rbac.py -k "internal_frontend_hostnames or disabled_user_password or structurally_invalid_refresh_tokens"`，修复前 3 项失败，修复后 3 passed / 120 deselected。后端默认门禁通过：`python -m pytest apps/api/tests/test_config_security.py` 18 passed；`python -m pytest apps/api/tests/test_auth_team_rbac.py` 105 passed；`python -m compileall apps/api/app` passed；`git diff --check` passed。仅保留既有 FastAPI `on_event`、`datetime.utcnow()`、passlib/argon2 warning 与 Git LF/CRLF 提示。
- 后续动作：下一轮按 sweep 顺序进入团队作用域与权限，优先覆盖 Authorization + `X-Team-ID`、路径 `team_id` 与 header 一致性、RBAC 权限、Team Admin/Owner/Reviewer/Labeler 边界，以及系统 Agent 只读约束。

- 类型：前端缺陷修复 / 工作台权限与上传体验边界
- 关联文档：`docs/design/FRONTEND_DESIGN_STYLE.md`、`docs/design/pages/organization-resource-config.md`
- 内容：本轮前端工作台体验 sweep 一次修复 3 个可证明偏差。其一，`authenticatedApiRequest` / `authenticatedFetch` 在传入 `Headers` 实例时会丢失原有请求头，导致带 `X-Team-ID` 的认证请求只剩 Bearer token，存在团队作用域请求被错误发送的风险；现在统一通过 `Headers` 读取任意输入，再转回兼容旧测试/调用方的普通对象，并规范 `Authorization`、`Content-Type`、`X-Team-ID` 常用头名。其二，企业工作台角色推断忽略登录态中的 `team_role`，全局 `user.role=user` 且团队角色为 `reviewer` 的成员会因为 `team:*` 权限被误判为 admin，同时 Team Labeler 复用只读企业导航而暴露资源配置和成员管理入口；现在优先按 `team_role` 映射 Owner/Reviewer/Agent/Admin，移除宽泛 team 权限升 admin 回退，并将 Team Labeler 的企业管理入口收窄为企业信息。其三，资源配置页 Agent 自定义头像上传未限制图片类型，PDF 等非图片文件会直接进入头像上传 API；现在 Upload 设置 JPG/PNG/GIF accept，并在 `beforeUpload` 与处理函数中本地拦截非图片文件，返回 `Upload.LIST_IGNORE`。
- 测试结果：先运行红测 `npm.cmd run test -- --run src/services/apiClient.test.ts src/app/workspaceNavigation.test.tsx src/pages/workspace/WorkspaceApp.test.tsx -t "Headers instance|team_role before|Agent avatar"`，3 项均失败，分别复现 Headers 值丢失、`team_role` reviewer 被判为 admin、Agent 头像 input `accept=""` 且会调用上传 API。修复后同一 targeted 通过：3 passed / 99 skipped。相关验证通过：`npm.cmd run test -- --run src/services/apiClient.test.ts src/app/workspaceNavigation.test.tsx` 2 files / 19 tests passed；`npm.cmd run test -- --run src/pages/workspace/WorkspaceApp.test.tsx -t "resource configuration|Agent avatar|team labeler|workspace access"` 4 passed / 79 skipped；`npm.cmd run test -- --run src/app/App.test.tsx -t "bind-current-user"` 2 passed / 7 skipped；`npm.cmd run typecheck` passed；`npm.cmd run build` passed，仅保留既有 `exceljs` direct eval 与大 chunk warning；`git diff --check` passed，仅有 LF/CRLF 提示。全量 `npm.cmd run lint` 仍被既有基线阻塞：49 problems（23 errors / 26 warnings），集中在 `EnhancedTable.tsx`、`HomePage.tsx`、`PlatformApp.tsx`、`TaskSquarePage.tsx`、`AiReviewPage.tsx`、`OperationLogsPage.tsx`、`OwnerProductionPages.tsx`、`ReviewQueuePage.tsx`、`WorkspaceDashboardPage.tsx` 等；全量 `npm.cmd run test -- --run` 当前 15 files passed / 2 failed，172 passed / 18 failed / 1 skipped，剩余失败集中在既有 `PlatformApp.test.tsx` 结算筛选、`WorkspaceApp.test.tsx` 历史长链路，以及 `LabelerDashboardPage` 对空 dashboard 响应的 `recent_tasks` undefined 异常，App/OAuth header 相关失败已通过兼容修正消除。
- 后续动作：下一轮按 sweep 顺序回到认证与安全边界，优先继续覆盖 session、refresh rotation、logout/revoke、OAuth ticket、生产 cookie/CORS 与敏感信息泄露；前端体验方向后续可独立拆轮处理全量 lint/test 基线，不夹带到本轮三项缺陷修复。

- 类型：后端缺陷修复 / 导出通知与上传安全边界
- 关联文档：`docs/api/review-ai-export.md`、`docs/product/REQUIREMENTS_AND_NOTES.md`
- 内容：本轮导出、上传、审计、通知 sweep 一次修复 3 个可证明边界偏差。其一，结果导出的 `filters.status` 在查询题目时直接使用 `Question.status`，当题目旧状态为 `approved` 但最新提交已被打回为 `rejected` 时，`status=approved` 仍会导出已打回答案；现在导出先取同企业同任务同题目的最新提交，存在提交时按 `Submission.status` 筛选，未提交题目才回落题目状态。其二，个人信箱 `POST /notifications/my/mark-all-read` 会把已过期通知也写入 `read_by` 并返回更新数，与过期通知保留历史可见性但状态为 `expired` 的口径不一致；现在个人和企业批量已读都只改写当前可见状态为 `unread` 的通知。其三，团队上传只在 `category=document/verification` 下拒绝可执行文件，`category=other` 仍可上传 `.exe` 与可执行 MIME；现在所有上传分类都会先按危险扩展名和危险 MIME 拒绝可执行/脚本类文件，再进入分类校验。
- 测试结果：先新增并运行红测 `python -m pytest apps/api/tests/test_export_notification_upload_guards.py -k "export_status_filter_uses_submission_status or mark_all_my_notifications_read_skips_expired_notifications or team_upload_rejects_executable_even_with_generic_category"`，3 项均失败，分别复现已打回提交仍进入 `approved` 导出、过期通知被批量已读、通用分类可执行文件上传返回 200。修复后同一 targeted 测试通过，结果为 3 passed / 6 deselected。相关全量通过：`python -m pytest apps/api/tests/test_export_notification_upload_guards.py` 9 passed；`python -m pytest apps/api/tests/test_export_review_records.py apps/api/tests/test_audit_log_scope.py apps/api/tests/test_notification_management_permissions.py apps/api/tests/test_upload_avatar_validation.py` 16 passed。默认后端门禁通过：`python -m pytest apps/api/tests/test_config_security.py` 17 passed；`python -m pytest apps/api/tests/test_auth_team_rbac.py` 103 passed；`python -m compileall apps/api/app` passed；`git diff --check` passed，仅保留既有 FastAPI `on_event`、`datetime.utcnow()`、passlib/argon2 warning 和 Git LF/CRLF 提示。
- 后续动作：下一轮按 sweep 顺序进入前端工作台体验，优先覆盖 auth refresh retry、页面权限回退、Ant Design 表单/表格状态、错误提示、加载态和移动端布局；导出/通知/上传后续仍可继续覆盖导出幂等与真实异步队列、dataset/template/media 细分白名单、review/export/system 自动通知触发和更完整的上传安全扫描。
- 类型：后端缺陷修复 / 标注领取超时与提交边界
- 关联文档：`docs/api/labeling.md`、`docs/product/REQUIREMENTS_AND_NOTES.md`
- 内容：本轮标注与审核链路 sweep 一次修复 3 个可证明偏差。其一，任务配置 `claim_config.completion_hours` 后，领取接口会写入 `Question.claim_due_at`，服务层也已有超时释放和信誉扣分逻辑，但 `GET /labels/my-tasks` 未触发该逻辑，超时未提交题目仍显示为待标注；现在我的任务入口会先释放超时题目、清空领取人和完成时限、同步统计并写入信誉扣分流水。其二，`PUT /labels/questions/{question_id}/draft` 未检查领取后完成时限，超时题目仍可覆盖草稿；现在单题入口会先处理超时，当前题目已释放时返回 `40902`。其三，`POST /labels/questions/{question_id}/submit` 同样未检查领取后完成时限，超时题目仍可提交进入审核；现在提交前同样执行超时释放，保持原答案不被覆盖。同步修正 `test_labeling_rejection_scope.py` 中固定到 2026-06-01 的 refresh session 夹具为相对有效期，避免日期滚动导致无关 401。
- 测试结果：先新增并运行红测 `python -m pytest apps/api/tests/test_labeling_claim_deadline.py -k "my_tasks_releases_overdue_claimed_questions or draft_rejects_overdue_claimed_question or submit_rejects_overdue_claimed_question"`，3 项均失败，分别复现超时题目仍出现在我的任务、超时保存草稿返回 200、超时提交返回 200。修复后同一 targeted 测试通过，结果为 3 passed / 15 deselected。相关验证通过：`python -m pytest apps/api/tests/test_labeling_review_round_guards.py` 5 passed；`python -m pytest apps/api/tests/test_labeling_review_guards.py apps/api/tests/test_labeling_rejection_scope.py` 4 passed；默认后端门禁通过：`python -m pytest apps/api/tests/test_config_security.py` 17 passed；`python -m pytest apps/api/tests/test_auth_team_rbac.py` 103 passed；`python -m compileall apps/api/app` passed；`git diff --check` passed，仅保留既有 FastAPI `on_event`、`datetime.utcnow()`、passlib/argon2 warning 和 Git LF/CRLF 提示。`python -m pytest apps/api/tests/test_labeling_claim_deadline.py` 全量当前仍有 3 个非本轮基线失败：`test_rejected_task_can_be_edited_resubmitted_and_reconfirmed`、`test_finished_task_is_marked_finished_in_labeler_contributions`、`test_labeler_can_abandon_question_and_release_it_to_marketplace`，分别涉及 finished 任务回显/贡献和 abandon payload 旧期望，需后续独立轮次处理或调整契约。
- 后续动作：下一轮按 sweep 顺序进入导出、上传、审计、通知，优先继续覆盖导出授权/过滤/下载审计、上传大小/类型/权限、审计日志 team scope 和通知可见范围；标注链路后续可单独清理 `test_labeling_claim_deadline.py` 中 finished/abandon 旧基线。
- 类型：后端缺陷修复 / 生产链路数据源与题目内容边界
- 关联文档：`docs/api/production.md`、`docs/product/REQUIREMENTS_AND_NOTES.md`
- 内容：本轮生产链路 sweep 一次修复 3 个可证明偏差。其一，草稿题目更新接口只在批量创建和导入路径校验题目内容非空，`PUT /tasks/{task_id}/questions/{question_id}` 仍可写入 `{}`，导致空题目污染发布前源数据；现在更新 `content` 时复用非空对象校验并保持原题目不变。其二，`PUT /datasets/{dataset_id}/table` 在数据集已被 `published` 等非草稿任务引用后仍能改写完整行列快照，破坏待审核、收集中、暂停或历史任务的题目源数据和回放语义；现在对 `pending_review/published/paused/finished` 引用统一返回 `40902`。其三，`POST /datasets/{dataset_id}/patch-upload` 同样可在非草稿任务引用后覆盖或追加行，绕过发布后字段限制；现在补上传合并复用同一引用检查，失败时保持原始行不变。删除数据集也改为复用该共享检查，避免同一生产边界分叉。
- 测试结果：先新增并运行红测 `python -m pytest apps/api/tests/test_task_production_guards.py -k "draft_question_update_rejects_empty_content or table_edit_rejects_published_task_dataset_reference or patch_upload_rejects_published_task_dataset_reference"`，3 项均失败，分别复现空内容更新返回 200、已发布任务引用数据集表格编辑返回 200、补上传合并返回 200。修复后同一 targeted 测试通过，结果为 3 passed / 12 deselected。相关全量与门禁均通过：`python -m pytest apps/api/tests/test_task_production_guards.py` 15 passed；`python -m pytest apps/api/tests/test_config_security.py` 17 passed；`python -m pytest apps/api/tests/test_auth_team_rbac.py` 103 passed；`python -m compileall apps/api/app` passed；`git diff --check` passed，仅保留既有 FastAPI `on_event`、`datetime.utcnow()`、passlib/argon2 warning 和 Git LF/CRLF 提示。
- 后续动作：下一轮按 sweep 顺序进入标注与审核链路，优先继续覆盖任务广场领取并发/额度、草稿提交校验、打回重提、多轮审核、Reviewer assigned_only 与 AI 预审入队幂等；生产链路后续再回看媒体素材绑定、发布/审核积分余额充足性和任务复制快照边界。
- 类型：前端缺陷修复 / 工作台通知与企业资料上传边界
- 关联文档：`docs/design/FRONTEND_DESIGN_STYLE.md`、`docs/design/pages/organization-announcements.md`、`docs/design/pages/organization-profile.md`
- 内容：本轮前端工作台体验 sweep 一次修复 3 个可证明偏差。其一，顶栏个人信箱概览只按 `is_read=false` 展示未读徽标和单条“已读”动作，导致后端保留历史可见性的 `status=expired` 通知仍被当作可处理未读项；现在概览仅在 `status=unread && !is_read` 时展示未读徽标和单条已读动作。其二，公告通知页单条标为已读/已处理后只替换列表项和详情抽屉，未重算顶部消息概览，导致未读数量保留旧值；现在单条状态更新与批量路径一样基于更新后的通知集合重算 summary。其三，企业信息页 Logo 上传控件未设置本地图片类型限制，PDF 等非图片文件会直接调用 `category=image` 上传接口；现在前端仅接受 JPG、PNG、GIF，并在发起上传前拦截非图片文件。
- 测试结果：先运行红测 `npm.cmd run test -- --run src/components/layout/SiteNav.test.tsx src/pages/workspace/WorkspaceApp.test.tsx -t "expired inbox preview|announcement summary|non-image organization logo|expired.*preview|summary after marking one|non-image"`，3 项均失败，分别复现过期通知仍显示“已读”、Logo input `accept=""`、公告概览仍显示 `未读消息1`。修复后同一 targeted 测试通过，结果为 3 passed / 92 skipped。相关验证通过：`npm.cmd run test -- --run src/components/layout/SiteNav.test.tsx` 13 passed；`npm.cmd run test -- --run src/pages/workspace/WorkspaceApp.test.tsx -t "announcements|organization profile|personal inbox|announcement summary|non-image organization logo"` 9 passed / 73 skipped；`npm.cmd run typecheck` 通过；本轮触碰文件 `npm.cmd exec eslint -- src/components/layout/SiteNav.tsx src/pages/workspace/AnnouncementsPage.tsx src/pages/workspace/OrganizationProfilePage.tsx src/components/layout/SiteNav.test.tsx src/pages/workspace/WorkspaceApp.test.tsx` 通过；`npm.cmd run build` 通过，仅保留既有 `exceljs` direct eval 与大 chunk 警告；`git diff --check` 通过，仅提示本次修改文件后续会按 Git 设置从 LF 转为 CRLF。全量 `npm.cmd run lint` 仍被既有基线阻塞，错误集中在未触碰文件如 `EnhancedTable.tsx`、`HomePage.tsx`、`PlatformApp.tsx`、`TaskSquarePage.tsx`、`OwnerProductionPages.tsx`、`ReviewQueuePage.tsx` 等；全量 `npm.cmd run test -- --run` 当前 15 files passed、2 failed，166 passed、21 failed、1 skipped，失败集中在既有 `PlatformApp.test.tsx` 结算筛选、`WorkspaceApp.test.tsx` 多个历史长链路和 `LabelerDashboardPage.tsx` `recent_tasks` undefined，与本轮新增 targeted/相关子集无交叉。
- 后续动作：下一轮按 sweep 顺序回到认证与安全边界，优先继续覆盖 session/refresh/logout/OAuth ticket 与生产 cookie/CORS 配置；前端体验方向后续单独处理全量 lint/test 既有基线时，应拆分为独立轮次，不夹带到本轮三项修复。

- 类型：后端缺陷修复 / 生产链路数据集与指派链接边界
- 关联文档：`docs/api/production.md`、`docs/product/REQUIREMENTS_AND_NOTES.md`、`docs/design/pages/owner-dataset-management.md`
- 内容：本轮生产链路 sweep 一次修复 3 个可证明偏差。其一，`DELETE /datasets/{dataset_id}` 未检查任务引用，已发布任务绑定的数据集仍可被删除，破坏发布检查、历史任务回放和后续复制链路；现在拒绝删除被 `pending_review/published/paused/finished` 任务引用的数据集，并返回引用任务状态。其二，`POST /datasets/{dataset_id}/patch-upload` 命中已有主键行时仍把整份补上传字节累加到 `Dataset.storage_bytes`，导致企业会员存储用量虚高并可能误阻断后续导入；现在按合并后的 `rows + media_assets.size` 快照重算，并仅用净增长校验会员存储额度。其三，`GET /tasks/assigned/{code}` 只校验指派链接开关和过期时间，`pending_review` 等非收集中任务也能通过链接打开任务详情；现在指派链接仅对 `published` 任务可见，其他状态按不存在处理。
- 测试结果：先运行红测 `python -m pytest apps/api/tests/test_task_production_guards.py -k "delete_dataset_rejects_published_task_reference or patch_upload_recalculates_dataset_storage_snapshot or assigned_link_hides_unpublished_tasks"`，3 项均失败，分别复现数据集删除返回 200、补上传后 `storage_bytes=68` 而快照应为 36、待审核指派链接返回 200。修复后同一 targeted 测试通过，结果为 3 passed / 9 deselected。相关全量与门禁均通过：`python -m pytest apps/api/tests/test_task_production_guards.py` 12 passed；`python -m pytest apps/api/tests/test_team_membership.py` 8 passed；`python -m pytest apps/api/tests/test_config_security.py` 17 passed；`python -m pytest apps/api/tests/test_auth_team_rbac.py` 97 passed；`python -m compileall apps/api/app` passed；`git diff --check` passed，仅保留既有 LF/CRLF 提示和已知 FastAPI `on_event`、`datetime.utcnow()`、passlib/argon2 warning。
- 后续动作：下一轮按 sweep 顺序进入标注与审核链路，优先覆盖任务广场领取并发/额度、草稿提交校验、打回重提、多轮审核、Reviewer assigned_only 和 AI 预审入队幂等；若继续回到生产链路，可再看任务复制对数据集/模板快照的长期兼容和发布后导出字段完整性。

- 类型：后端缺陷修复 / 生产链路发布检查收紧
- 关联文档：`docs/api/production.md`
- 内容：本轮生产链路 sweep 一次修复 3 个可证明发布检查缺陷。其一，任务草稿的 `dataset_id` 若异常指向其他企业数据集，`GET /tasks/{task_id}/readiness` 仍把该数据集当作有效绑定，`POST /tasks/{task_id}/publish` 可继续进入 `pending_review/published`，违背发布检查必须校验当前企业数据集的约束；现在 readiness 要求数据集存在且属于当前企业。其二，数据集列被后续编辑删除后，草稿任务旧的 `column_mapping` 或 `mapping_config` 指向不存在字段时，readiness 只统计 ShowItem 是否“有映射值”，未校验字段仍存在，导致陈旧映射可发布；现在 readiness 会复用映射字段有效性检查并把失效列作为 blocker。其三，AI 预审开启时只校验 `provider_id/model/prompt/review_matrix/matrix_confirmed` 字段非空，未校验 Provider 是否存在、启用或属于当前企业/平台共享；现在 AI readiness 会拒绝缺失、禁用或跨企业 Provider。
- 测试结果：先新增并运行红测 `python -m pytest apps/api/tests/test_task_production_guards.py -k "task_publish_rejects_dataset_from_another_team or task_publish_rejects_stale_column_mapping or task_publish_rejects_missing_ai_provider"`，3 项均失败，分别证明跨企业数据集、陈旧列映射和缺失 AI Provider 均可发布返回 200。修复后同一 targeted 测试通过，结果为 3 passed / 6 deselected。相关验证通过：`python -m pytest apps/api/tests/test_task_production_guards.py` 9 passed；`python -m pytest apps/api/tests/test_team_membership.py -k "active_task_publish"` 1 passed / 7 deselected。默认后端门禁通过：`python -m pytest apps/api/tests/test_config_security.py` 15 passed；`python -m pytest apps/api/tests/test_auth_team_rbac.py` 93 passed；`python -m compileall apps/api/app` passed；`git diff --check` passed，仅保留既有 LF/CRLF 提示和已知 FastAPI `on_event`、`datetime.utcnow()`、passlib/argon2 警告。
- 后续动作：下一轮按 sweep 顺序进入标注与审核链路，优先覆盖任务广场领取并发/额度、草稿提交校验、打回重提、多轮审核、Reviewer assigned_only 和 AI 预审入队幂等；生产链路后续可继续看题目导出字段完整性、复制任务对历史模板/数据集快照的长期兼容，以及发布后允许字段清单。

- 类型：后端缺陷修复 / 团队作用域与平台权限边界
- 关联文档：`docs/api/platform.md`、`docs/api/review-ai-export.md`
- 内容：本轮团队作用域与权限 sweep 一次修复 3 个可证明边界缺陷。其一，`POST /api/v1/ai-resources/estimate` 只按 `provider_id` 读取 Provider 并返回路由、模型和计费估算，未校验 Provider 是否属于当前 `X-Team-ID` 企业，导致团队成员可用其他企业 Provider ID 探测跨团队路由和费率；现在估算前会校验 Provider 归属，企业作用域仅允许当前企业自有路由或企业可见的平台共享路由，无企业作用域时仅全局 `platform:manage` 可估算平台路由。其二，平台运营接口使用 `require_permissions("platform:manage")`，会把团队成员自定义权限混入有效权限，导致被企业成员记录授予 `platform:manage` 的普通用户可携带 `X-Team-ID` 进入 `/platform/workbench`；现在平台运营接口统一改为全局权限校验。其三，平台资质审核聚合入口同样采信团队作用域的 `certification:review`，Team Admin 可通过成员自定义权限误授平台资质审核队列访问能力；现在 `/platform/certifications/*` 也只认可全局 `certification:review`。
- 测试结果：先新增并运行红测 `python -m pytest apps/api/tests/test_ai_resources_platform_permissions.py -k "team_user_cannot_estimate_another_team_provider or team_scoped_platform_manage_cannot_access_platform_workbench or team_scoped_certification_review_cannot_access_platform_review_queue"`，3 项均失败，分别证明跨团队 Provider 估算返回 200、团队自定义 `platform:manage` 可访问平台工作台、团队自定义 `certification:review` 可访问平台资质审核队列。修复后同一 targeted 测试通过，结果为 3 passed / 2 deselected。相关验证通过：`python -m pytest apps/api/tests/test_ai_resources_platform_permissions.py` 5 passed；`python -m pytest apps/api/tests/test_platform_workbench.py` 4 passed。默认后端门禁通过：`python -m pytest apps/api/tests/test_config_security.py` 15 passed；`python -m pytest apps/api/tests/test_auth_team_rbac.py` 93 passed；`python -m compileall apps/api/app` passed；`git diff --check` passed，仅保留既有 LF/CRLF 提示和已知 FastAPI `on_event`、`datetime.utcnow()`、passlib/argon2 警告。
- 后续动作：下一轮按 sweep 顺序进入生产链路，继续优先覆盖任务发布状态机、题目导入/导出、发布后字段限制和积分预算预扣/扣减；若团队权限方向再次轮转，重点检查团队自定义权限白名单、路径 `team_id` 与 `X-Team-ID` 一致性，以及系统 Agent 只读约束。

- 类型：后端安全修复 / 认证与 OAuth 边界收紧
- 关联文档：`docs/api/auth.md`
- 内容：本轮认证与安全边界 sweep 一次修复 3 个可证明缺陷。其一，公开 `POST /api/v1/auth/register` 仍允许请求体自提 `role=owner/reviewer`，可绕过企业成员或审核流程获得全局权限声明；现在普通注册仅接受 `pending` 和历史兼容的 `labeler`，旧的密码流程测试夹具同步改为公开注册允许的角色。其二，OAuth `redirect_after_login` 在后端原样写入 state/ticket 并回传 callback，外部 URL 虽会被当前前端清洗，但服务端仍形成开放回跳信任缺口；现在后端只保留 `/onboarding`、`/workspace`、`/platform`、`/tasks/assigned` 下的同源安全目标，其他值置空。其三，OAuth provider 返回 `email_verified=false` 时，后端仍把 provider email 当作 `suggested_email`、匹配已有用户并优先作为注册邮箱，违反“无可信邮箱必须补邮箱验证码”的基线；现在只有 `email_verified=true` 的 provider email 才参与可信邮箱逻辑，未验证邮箱必须使用用户提交并通过 `bind_email` 验证码的地址完成注册。
- 测试结果：先运行红测 `python -m pytest apps/api/tests/test_auth_team_rbac.py -k "oauth_callback_drops_external_redirect_after_login or oauth_unverified_provider_email_requires_verified_registration_email or register_rejects_privileged_global_roles"`，3 项均失败，分别证明外部回跳原样回传、未验证 provider 邮箱被信任、公开注册 `owner` 返回 200。修复后同一 targeted 测试通过，结果为 3 passed / 90 deselected。默认后端门禁通过：`python -m pytest apps/api/tests/test_config_security.py` 15 passed；`python -m pytest apps/api/tests/test_auth_team_rbac.py` 93 passed；`python -m compileall apps/api/app` passed；`git diff --check` passed，仅保留既有 LF/CRLF 提示和已知 FastAPI `on_event`、`datetime.utcnow()`、passlib/argon2 警告。
- 后续动作：下一轮按 sweep 顺序进入团队作用域与权限，优先覆盖 Authorization + `X-Team-ID`、路径 `team_id` 与 header 一致性、Team Admin/Owner/Reviewer/Labeler 边界，以及系统 Agent 只读约束。

### 2026-06-06

- 类型：后端缺陷修复 / 标注与审核链路守卫
- 关联文档：`docs/api/labeling.md`、`docs/api/review-ai-export.md`、`docs/product/REQUIREMENTS_AND_NOTES.md`
- 内容：本轮标注与审核链路 sweep 一次修复 3 个可证明偏差。其一，`PUT /labels/questions/{question_id}/draft` 成功保存草稿后引用未定义的 `ai_review_job`，导致正常草稿保存抛出 `NameError`；现在草稿保存稳定返回 `ai_review_job=null`。其二，人工审核详情/队列/统计只校验任务权限，未校验 `submission`、`task`、`question` 三者同企业同任务，异常关联数据会让 Reviewer 通过有权限任务读取跨企业题目内容；现在审核链路统一过滤或拒绝不一致的提交关联。其三，AI 预审手动触发可为 `ai_config.enabled=false` 的任务创建 job，和当前“禁用 AI 的任务从 AI 预审视图隐藏”的活跃基线不一致；现在禁用任务或不一致提交引用会按不存在处理，不创建预审任务，retry 也不会重新入队禁用任务的历史 job。
- 测试结果：先运行 `python -m pytest apps/api/tests/test_labeling_review_guards.py` 复现 3 个失败：草稿保存 `NameError`、跨企业题目审核详情返回 200、禁用 AI 任务手动触发返回 200 且建 job；修复后同一测试通过，结果为 3 passed。相关验证 `python -m pytest apps/api/tests/test_ai_review_submission_state.py` 通过，结果为 1 passed，并将该测试中过期的固定 session 时间对齐为相对有效期；`python -m pytest apps/api/tests/test_review_queue_visibility.py` 通过，结果为 1 passed；`python -m pytest apps/api/tests/test_review_task_reward_points.py` 通过，结果为 5 passed。默认门禁 `python -m pytest apps/api/tests/test_config_security.py` 通过，结果为 13 passed；`python -m pytest apps/api/tests/test_auth_team_rbac.py` 通过，结果为 86 passed；`python -m compileall apps/api/app` 通过；`git diff --check` 通过，仅提示本次修改文件后续会按 Git 设置从 LF 转为 CRLF。
- 后续动作：继续下一轮按 sweep 顺序进入导出、上传、审计、通知；优先覆盖导出下载授权、上传类型/大小边界和审计日志 team scope。

- 类型：后端缺陷修复 / 生产链路状态机与积分预扣
- 关联文档：`docs/api/production.md`、`docs/design/pages/owner-task-management.md`、`docs/product/REQUIREMENTS_AND_NOTES.md`
- 内容：本轮生产链路 sweep 一次修复 3 个可证明偏差。其一，任务状态接口虽然已有暂停守卫函数，但 `POST /tasks/{task_id}/status` 的 `pause` 动作未调用，导致存在 `claimed` 或 `rejected` 题目时仍可暂停任务，违背“暂停发放只停止未领取数据继续发放，仍存在已领取未完成或打回待修改数据时拒绝暂停”的文档约束；现在暂停前会统计阻塞题目并返回 `40902`，任务保持 `published`。其二，`finish` 动作同样未调用结束守卫，导致存在 `claimed/submitted/rejected` 题目时仍可直接结束任务；现在结束前会拒绝未提交、待审核或打回待修改数据未清空的任务，避免绕过审核和打回处理。其三，企业积分钱包对 `reward_rule.mode=task` 的总包任务只在任务结束后才释放已结算奖励预扣，标注员已获批并扣款后仍把整包奖励继续锁定；现在总包任务会按 `submission_review` 积分流水扣除已实际结算份额，预扣只保留未结算奖励和未结算平台服务费。
- 测试结果：先运行 `python -m pytest apps/api/tests/test_task_production_guards.py` 复现 3 个失败：暂停/结束均错误返回 200，总包任务部分结算后 `reserved_points=21`；修复后同一测试通过，结果为 3 passed。相关验证 `python -m pytest apps/api/tests/test_review_task_reward_points.py` 通过，结果为 5 passed，并同步将终审拒绝信誉分测试断言对齐到当前规则说明的每题扣 5 分；`python -m pytest apps/api/tests/test_team_membership.py` 通过，结果为 8 passed；默认门禁 `python -m pytest apps/api/tests/test_config_security.py` 通过，结果为 13 passed；`python -m pytest apps/api/tests/test_auth_team_rbac.py` 通过，结果为 86 passed；`python -m compileall apps/api/app` 通过；`git diff --check` 通过，仅提示本次修改文件后续会按 Git 设置从 LF 转为 CRLF。
- 后续动作：继续生产链路轮次时优先覆盖任务复制后的题目快照边界、导入/导出审计和发布后字段限制；下一轮按 sweep 顺序进入标注与审核链路，重点看领取并发、打回重提和 AI 预审入队幂等。

- 类型：后端缺陷修复 / 团队权限与标注领取回归
- 关联文档：`docs/api/labeling.md`、`docs/api/team-profile.md`、`docs/product/REQUIREMENTS_AND_NOTES.md`
- 内容：修复当前 `test_auth_team_rbac.py` 暴露的 3 个回归。其一，标注领取接口误把 Labeler 基础信息审核状态加入领取资质硬阻断，导致 `task_bundle_claimed` 审计日志路径在无基础信息档案的合法 Labeler 上直接返回 422；现在领取资质回到 `docs/api/labeling.md` 记录的领域资质、已通过标注数量、历史通过率和活跃领取检查，基础信息状态继续归属个人资料/资质页面展示。其二，团队成员 `team_role_label` 回退为英文，成员创建和 `/auth/me` 现在恢复 `企业管理员 / 任务发布者 / 审核员 / 标注员`，系统 `Agent` 仍保持 `Agent`。其三，历史 `agent` 旧数据缺少系统 Agent 档案时，`agent-settings` 错误消息和人工导入跳过原因现在明确提示“人工清洗历史数据”或“Agent 为系统角色，不支持人工创建、修改或邀请”，与系统 Agent 只读兼容策略一致。
- 测试结果：`python -m pytest apps/api/tests/test_auth_team_rbac.py -k "task_claim_audit_log_is_visible_in_team_scope or admin_register_create_team_and_create_member_account or historical_agent_data_requires_manual_cleanup"` 通过，3 passed / 83 deselected；`python -m pytest apps/api/tests/test_auth_team_rbac.py` 通过，86 passed；`python -m pytest apps/api/tests/test_config_security.py` 通过，13 passed；`python -m compileall apps/api/app` 通过；`git diff --check` 通过，仅保留既有 LF/CRLF 提示。
- 后续动作：下一轮按 sweep 顺序进入生产链路，优先覆盖任务发布状态机、发布后字段限制和预算预扣/扣减偏差；若认证安全继续轮转，重点检查 OAuth `redirect_after_login` 后端白名单与 ticket 失败重试语义。

- 类型：后端安全修复 / 生产认证配置兜底
- 关联文档：`docs/operations/DEPLOYMENT.md`
- 内容：本轮认证与安全边界 sweep 一次修复 3 个生产配置缺口：`COOKIE_SAMESITE=none` 现在必须同时启用 `COOKIE_SECURE=true`，避免 refresh cookie 在跨站语义下被浏览器拒收或形成错误安全预期；`ENVIRONMENT=production|prod` 时 `FRONTEND_APP_URL` 必须是公开 HTTPS 地址，避免企业邀请和站外深链继续使用本地或明文入口；`FRONTEND_OAUTH_CALLBACK_URL` 也必须是公开 HTTPS 地址，避免 OAuth 回调在生产环境回跳到本地或明文地址。部署文档同步补充生产必填示例和启动期校验说明。
- 测试结果：新增 3 条红测先确认当前实现未拦截上述组合，修复后 `python -m pytest apps/api/tests/test_config_security.py -k "samesite_none or frontend_app_url or frontend_oauth_callback_url"` 通过，3 passed / 10 deselected；`python -m pytest apps/api/tests/test_config_security.py` 通过，13 passed；`python -m compileall apps/api/app` 通过；`git diff --check` 通过。`python -m pytest apps/api/tests/test_auth_team_rbac.py` 当前 83 passed / 3 failed，失败集中在既有的领取审计 422、成员 `team_role_label` 期望中文、历史 Agent 缺少“人工清洗历史数据”提示，和本轮配置修复无直接交集。
- 后续动作：继续认证与安全边界轮次时，优先覆盖 OAuth `redirect_after_login` 后端白名单、OAuth ticket 失败重试语义和敏感错误细节回显。

- 类型：前后端实现 / 分角色 Labeler 看板
- 关联文档：`docs/product/REQUIREMENTS_AND_NOTES.md`、`docs/api/team-profile.md`、`docs/api/labeling.md`、`docs/design/FRONTEND_DESIGN_STYLE.md`、`docs/planning/TODO.md`
- 内容：工作台 Labeler 默认页从账号中心改为 `labeler-dashboard`，并明确拆分为企业内 Labeler 与个人 Labeler。企业内 Labeler 新增 `GET /api/v1/teams/{team_id}/labeler-dashboard`，只返回当前企业内当前 Labeler 的公司项目、提交质量和企业通知，不返回企业全局生产、钱包、成员治理或审计日志；个人 Labeler 新增 `GET /api/v1/profile/dashboard`，返回个人任务、公开任务推荐、积分收益、资质和信誉分摘要。前端新增 `LabelerDashboardPage`，复用 Ant Design `Statistic/Table/Progress/Tag/Button/Alert` 与 Ant Design Charts，从身份判断加载对应接口；表格操作列继续复用 `WorkspaceTableActions`，长 ID 降级为短编号/二级信息。
- 内容：根据最新口径，Agent 不新增独立看板页面；只保留企业 Dashboard 内的 AI/资源降级视角。企业内 Labeler 侧栏和首屏文案收口为“企业项目 / 我的项目 / 项目历史 / 企业项目工作台”，不展示自由接单、高收益任务或公开任务推荐作为首屏主模块；个人 Labeler 保留任务广场推荐、积分管理和资质成长入口。
- 测试结果：`npm.cmd --prefix apps/web run typecheck` 通过；`npm.cmd --prefix apps/web exec -- vitest run src/app/workspaceNavigation.test.tsx --run` 通过，6 passed；`python -m py_compile apps/api/app/services/labeler_dashboard_service.py apps/api/app/api/v1/profile.py apps/api/app/api/v1/teams.py` 已通过；`python -m pytest apps/api/tests/test_auth_team_rbac.py -q -k "labeler_dashboard"` 已通过，3 passed、81 deselected。`npm.cmd --prefix apps/web exec -- vitest run src/pages/workspace/WorkspaceApp.test.tsx -t "dashboard|labeler dashboard" --testTimeout=30000` 当前被 `@ant-design/x-markdown/lib/XMarkdown/DebugPanel/DebugPanel.js` 在 Vitest 环境中的 `Unexpected token '.'` 解析错误阻塞，未进入用例执行。
- 后续动作：后续需要修复或 mock `@ant-design/x-markdown` 的 Vitest 转译配置后，重跑 `WorkspaceApp.test.tsx -t "dashboard|labeler dashboard"`，确认个人/企业内 Labeler 看板渲染与接口调用断言。

### 2026-06-04

- 类型：前后端实现 / 数据集表格编辑与补上传合并
- 关联文档：`docs/product/REQUIREMENTS_AND_NOTES.md`、`docs/api/production.md`
- 内容：数据集详情页新增独立“表格编辑”视图，基于 Ant Design Table 支持新增行、删除选中行、新增列、删除列、单元格编辑和图片/音频/视频单元格上传预览；保存时调用新增 `PUT /datasets/{dataset_id}/table`，后端保存完整行列快照并重新归一化行级媒体、附件、派生上下文、字段结构、预览行和处理摘要。数据集详情页新增“补上传合并”入口，支持上传补充 CSV / Excel / JSON / JSONL / Manifest JSONL，并选择 `row_id`、`external_id` 等主值字段对齐；后端新增 `POST /datasets/{dataset_id}/patch-upload`，命中主值则更新原行，未命中则追加新行，且同样支持外部媒体 URL 和图片/音频/视频文件。
- 测试结果：`cd apps/web && npm run typecheck` 通过；`cd apps/api && conda run -n markup-api python -m compileall app` 通过。
- 后续动作：后续可继续为大数据量表格编辑接入虚拟滚动、批量粘贴和冲突预览；当前补上传合并为确定性主值匹配，不做模糊匹配或自动删除。

- 类型：产品定位调整 / 公开套餐方案页
- 关联文档：`docs/product/REQUIREMENTS_AND_NOTES.md`、`docs/design/FRONTEND_DESIGN_STYLE.md`、`docs/design/pages/public-solutions.md`、`docs/design/pages/README.md`、`docs/planning/TODO.md`
- 内容：根据最新讨论，`/solutions` 不再承担完整销售页和产品发布页叙事，收敛为公开套餐方案页。页面删除流程画布、生产工作流、方案对比表、FAQ 和额外选择指引，改为 `轻标题区 -> 套餐卡 -> 最终 CTA`；五档套餐卡直接展示 `Free / Basic / Pro / Enterprise / More` 的适合阶段、年费、成员上限、活跃生产任务和数据集存储，Pro 高亮推荐，More 仅作为定制入口展示。
- 测试结果：`npm.cmd run test -- src/components/layout/SiteNav.test.tsx --run` 通过，11 passed；`/solutions` 本地 HTTP 检查返回 200。`npm.cmd run typecheck` 当前被非本次改动范围内的既有未提交文件阻塞，报错集中在 `apps/web/src/pages/platform/PlatformApp.tsx` 缺失 `PlatformReputationAppeal/reviewPlatformReputationAppeal`，以及 `apps/web/src/pages/workspace/ResourceConfigPage.tsx` 缺失 `ProductionSwitchPayload/updateProductionSwitch/setSwitches` 等符号。
- 后续动作：待上述无关类型错误清理后重新跑全量 `npm.cmd run typecheck`；继续对 `/solutions` 做 375px、768px、1440px 视觉验收，重点检查套餐卡高度、按钮换行和页面级横向滚动。

- 类型：前端体验重做 / AI 预审队列控制台
- 关联文档：`docs/api/review-ai-export.md`、`docs/design/FRONTEND_DESIGN_STYLE.md`
- 内容：重做 `apps/web/src/pages/workspace/AiReviewPage.tsx`，将原来的指标卡片墙 + 松散表格改为固定视口 AI 预审队列控制台。页面保留现有 `GET /ai-reviews/tasks`、`GET /ai-reviews/tasks/{job_id}` 与 `POST /ai-reviews/submissions/{submission_id}/trigger` 接口，不改后端 shape；新增连续状态摘要条、单行任务/状态筛选、`submission_id` 手动触发、内部滚动 `EnhancedTable`、失败行弱红底和详情 Drawer，Drawer 展示 job 信息、AI 建议、评分、维度、Prompt、结构化结果与错误。
- 内容：同步压缩 `WorkspaceApp.css` 中 AI 预审页布局，使用白底、浅边框、6px 内圆角和 0/10px 级间距，禁用页面级横向滚动并让表格主体填满剩余高度；按钮补充明确 `aria-label`，避免图标污染测试和读屏可访问名。
- 测试结果：`npm.cmd --prefix apps/web run typecheck` 仍被既有无关 `src/pages/platform/PlatformApp.tsx` 中 `PlatformReputationAppeal` / `reviewPlatformReputationAppeal` 缺失阻塞；本轮 AI 预审页未新增 TS 报错。`cd apps/web && npx.cmd vitest run src/pages/workspace/WorkspaceApp.test.tsx -t "loads AI review jobs and triggers a manual review job" --testTimeout=30000` 通过，1 passed、72 skipped，仍有 jsdom `getComputedStyle()` pseudo-elements 已知提示。
- 后续动作：真实 AI worker、结构化输出、失败重试、成本日志和自动决策写回仍按 P1 后续推进；如果继续做视觉验收，建议补 Playwright 桌面/窄屏截图和页面级 `scrollWidth` 断言。

- 类型：前端视觉增强 / 任务广场背景层次
- 关联文档：`docs/design/FRONTEND_DESIGN_STYLE.md`
- 内容：根据“背景还是很素”的视觉反馈，任务广场从单色浅灰背景升级为浅色数据画布：`.task-square` 增加非交互背景层，叠加顶部轻量蓝/橙/绿数据色带与细网格纹理，Hero、任务主体和分页栏保持在内容层之上。调整不引入装饰球、纯营销渐变或额外图片资源，继续保持公开任务列表的工具型扫描体验。
- 测试结果：`cd apps/web && npx.cmd eslint src/pages/tasks/TaskSquarePage.tsx` 通过；`git diff --check -- apps/web/src/pages/tasks/TaskSquarePage.css docs/planning/PROGRESS_LOG.md` 通过，仅保留当前工作区 LF/CRLF 提示。

- 类型：前端体验修复 / 任务广场分页栏不覆盖公开页脚
- 关联文档：`docs/design/FRONTEND_DESIGN_STYLE.md`
- 内容：公开页脚接入后，任务广场分页栏原本使用 `position: fixed; bottom: 0`，滚动到页面底部时会覆盖 `PublicFooter`。本轮将 `.pagination-bar` 改为任务广场区块内的 `position: sticky` 底栏，并收回 `.task-square` 为 fixed 分页预留的超大底部 padding；分页栏仍与 1320px 内容版心对齐，但会随任务广场区域结束而离开，不再压住 footer。
- 测试结果：`cd apps/web && npx.cmd eslint src/pages/tasks/TaskSquarePage.tsx` 通过；`git diff --check -- apps/web/src/pages/tasks/TaskSquarePage.css docs/planning/PROGRESS_LOG.md` 通过，仅保留当前工作区 LF/CRLF 提示。

- 类型：前端体验补齐 / 公开外部页面共享页脚
- 关联文档：`docs/design/FRONTEND_DESIGN_STYLE.md`
- 内容：为网站外部四个公开页面 `/`、`/tasks`、`/solutions`、`/help` 增加共享 `PublicFooter`。页脚使用 Ant Design `Layout.Footer`，包含 MarkUp 品牌说明、首页/任务广场/解决方案/帮助文档导航和数据生产链路标签；通过 `PublicPage` wrapper 接入公开路由，`/workspace`、`/platform`、`/onboarding`、OAuth callback 和 `/tasks/assigned/:code` 不展示该页脚。
- 测试结果：`cd apps/web; npx.cmd eslint src/app/App.tsx src/components/layout/PublicFooter.tsx src/pages/tasks/TaskSquarePage.tsx` 通过；`npm.cmd --prefix apps/web run test -- src/app/App.test.tsx src/pages/home/HomePage.test.tsx src/pages/help/HelpPage.test.tsx src/pages/tasks/TaskSquarePage.test.tsx --run` 通过，4 files / 22 tests passed；`git diff --check -- apps/web/src/app/App.tsx apps/web/src/components/layout/PublicFooter.tsx apps/web/src/components/layout/PublicFooter.css docs/design/FRONTEND_DESIGN_STYLE.md docs/planning/PROGRESS_LOG.md` 通过，仅保留当前工作区 LF/CRLF 提示。首次在受限沙箱内运行 Vitest 时被绝对路径 setup 加载阻塞，按批准前缀在真实工作区重跑通过；Vitest 仍有 jsdom `getComputedStyle` pseudo-elements 与 `HTMLCanvasElement.getContext()` 已知提示，不影响结果。

- 类型：前端收敛 / 资源配置页移除资质类型页签
- 关联文档：`docs/design/pages/organization-resource-config.md`、`docs/design/pages/organization-management.md`、`docs/design/pages/README.md`、`docs/planning/TODO.md`
- 内容：按最新页面收敛口径，`apps/web/src/pages/workspace/ResourceConfigPage.tsx` 删除 `资质类型` Tab 及其本地筛选、懒加载、表格列定义和相关状态，资源配置页当前只保留 `会员与额度 / 积分管理 / AI 资源 / AI Provider / 生产开关`。资质类型能力未被后端删除，但不再作为当前资源配置页前端主路径。
- 测试结果：待本轮 `apps/web` typecheck 与 `WorkspaceApp.test.tsx` 回归确认。

- 类型：前后端实现 / 任务结果查看与多格式导出
- 关联文档：`docs/api/review-ai-export.md`、`docs/design/pages/owner-task-management.md`、`docs/planning/TODO.md`
- 内容：任务管理主页行内 `更多` 菜单新增 `查看结果 / 导出`。非草稿任务打开 Ant Design `Drawer`，展示任务结果统计、导出配置、字段映射和下载历史；草稿任务入口禁用。导出配置支持 JSON / JSONL / CSV / Excel、题目状态筛选、日期范围、是否包含审核记录、字段 include 和列名重命名。下载历史复用 `/exports` 异步任务模型，展示进度、文件大小、下载次数、创建时间和下载/取消操作。后端 `fields_config.include` 新增 `content.*`、`answers.*` 前缀通配，支持动态源数据列和动态答案列导出。
- 测试结果：`cd apps/web && npm run typecheck` 通过；`cd apps/web && npm run test -- src/pages/workspace/WorkspaceApp.test.tsx -t "result export drawer|batch creates export jobs" --testTimeout=30000` 通过；`conda run -n markup-api python -m compileall apps/api/app` 通过；`conda run -n markup-api pytest apps/api/tests/test_export_review_records.py` 通过。
- 后续动作：当前后端仍是创建任务后同步生成文件并落入 `completed + progress=100`，前端已经按异步任务/下载历史模型展示；后续接 worker 队列时可保持前端 API shape 不变。

### 2026-06-04

- 类型：前端体验修复 / 企业工作台 Dashboard 密铺与溢出
- 关联文档：`docs/design/FRONTEND_DESIGN_STYLE.md`
- 内容：根据企业工作台截图反馈继续收口 `/workspace` Dashboard，而不是平台 `/platform`。本轮重点修复“看起来没密铺、灰色缝隙大、组件溢出”：Dashboard 专属覆盖全局灰底和页面头部渐变，内容区改为白底 4px gap；KPI 从 6 个漂浮卡片收敛为连续指标条；图表行固定高度，生产漏斗、任务状态和资源额度在同一行稳定铺开；底部表格卡固定高度并在内部滚动。
- 内容：Dashboard 表格关闭 `EnhancedTable` 默认列拖拽宽度，避免小面板中无宽度列被补成 180px 后撑破容器；最近任务、导出、AI 预审、通知和审计表均改为受控内部滚动。
- 测试结果：`npm.cmd --prefix apps/web run typecheck` 通过；`npm.cmd --prefix apps/web run test -- src/pages/workspace/WorkspaceApp.test.tsx -t "dashboard" --run` 通过，5 passed、65 skipped。Vitest 仍有 jsdom 对伪元素 `getComputedStyle()` 未实现提示。
- 后续动作：继续用真实浏览器检查企业 Dashboard 首屏，如仍有低密度或溢出，优先从固定区域高度和右列内部滚动继续压缩，不新增后端字段。

- 类型：前后端缺陷修复 / 平台问答 Agent Embedding 设置
- 关联文档：`docs/api/platform.md`
- 内容：修复平台规则页 Embedding 配置“保存成功但配置不可用/回显像失效”的问题。后端 `PUT /platform/settings/agent-embedding` 现在会 trim `api_base/api_key/model`，首次配置或当前没有已保存/环境变量 Key 时必须提供 `api_key`，并且在校验失败前不创建半截 `platform_settings` 记录；空白模型会被拒绝。已有 Key 时前端留空保存不会发送空字符串覆盖旧 Key。
- 内容：前端 Embedding 表单增加动态 Key 必填和模型空白校验；保存成功后直接使用 PUT 返回值更新表单、Key 状态和回显，不再依赖整页 reload，避免其他设置请求抖动时覆盖刚保存的 Embedding 状态。
- 测试结果：`npm.cmd --prefix apps/web run test -- src/pages/platform/PlatformApp.test.tsx --run` 通过，6 passed；`npm.cmd --prefix apps/web run typecheck` 通过；`python -m pytest apps/api/tests/test_platform_agent.py -q` 通过，9 passed；`python -m compileall apps/api/app` 通过。Vitest 仍有 jsdom 对伪元素 `getComputedStyle()` 未实现提示，后端测试仍有 FastAPI `on_event` deprecation warning。
- 后续动作：后续如接真实 Embedding Provider 连通性检查，可在保存前增加“测试 Embedding”动作；当前先保证保存持久化与可用性校验稳定。

- 类型：前端体验修复 / 平台经营总览密铺化
- 关联文档：`docs/design/pages/platform-workbench.md`
- 内容：按平台运营后台口径重做 `/platform` 经营总览首屏，不新增 API、不改后端数据结构。总览根容器改为 12 栏密铺网格和统一 8px gap；KPI 收敛为单条紧凑指标带；中部固定为近 30 天服务费面积图 + 审核待办队列；底部固定为最近结算表 + 运营摘要，表格面板内部滚动，减少模块高度变化导致的位置跳动。
- 内容：总览继续只展示服务费、企业认证、资质审核等平台运营入口，不展示提现处理，不重复展示 `1 积分 = 1 元`；近 30 天趋势保留图表表达，不回退为逐日 `Progress` 条。
- 测试结果：`npm.cmd --prefix apps/web run test -- src/pages/platform/PlatformApp.test.tsx --run` 通过，5 passed；`npm.cmd --prefix apps/web run typecheck` 通过。Vitest 仍有 jsdom 对伪元素 `getComputedStyle()` 未实现提示，不影响测试结果。
- 后续动作：如继续视觉验收，建议补 Playwright 桌面/窄屏截图，重点检查首屏是否仍存在过大空隙、低密度模块或横向滚动。

- 类型：前端体验修复 / 公开解决方案页结构标识
- 关联文档：`docs/design/pages/public-solutions.md`
- 内容：根据 `/solutions` 视觉反馈，修复 `Workflow`、`Why MarkUp`、`Plans` 等 section 标识“小气”和被布局拉伸的问题。页面结构标识从 Ant Design 状态 Tag 收敛为自定义大号编号 marker，使用 44px 编号方块、短引导线和浅色语义底色；最终 CTA 的 `MarkUp Solutions` 也统一为更稳的浅色发布页标识。同步在页面设计稿中补充规则：结构标题不能使用显得小气或被布局拉伸的状态 Tag。
- 测试结果：`npm.cmd run typecheck` 通过；`npm.cmd run test -- src/components/layout/SiteNav.test.tsx --run` 通过，11 passed；`git diff --check` 通过，仅保留既有 LF/CRLF 提示。
- 后续动作：继续按用户圈选反馈检查 `/solutions` 其他部件的尺寸和气质，优先避免小号标签、后台卡片感和页面级深色块。

- 类型：前端体验修复 / 企业工作台 Dashboard 首屏与图表收口
- 关联文档：`docs/design/FRONTEND_DESIGN_STYLE.md`、`docs/planning/TODO.md`
- 内容：根据企业工作台视觉反馈修复 `/workspace` Dashboard 首屏体验，不改变 `GET /api/v1/teams/{team_id}/dashboard` API shape。生产漏斗从默认 `Funnel`/图表库自动横向轴改为稳定的自控横向阶段条，继续展示题目总量、已领取、已提交、已通过，并在副标题保留打回数，避免默认漏斗和 Bar 轴标签在小容器中失真。
- 内容：收口 Dashboard 布局与溢出边界：内容区只允许纵向滚动，Dashboard 容器、图表卡、表格 wrapper 和 chart canvas 增加 `min-width: 0`、`max-width: 100%` 与 overflow 约束；压缩固定标题栏、KPI 卡和图表卡高度，并将首屏改为统一 8px 间距的密铺网格。图表带内生产转化、任务状态和资源额度卡片同高填满网格单元，避免右侧短卡片产生大块空洞或数据加载后位置跳动。任务状态图过滤 0 值状态；资源额度从小 Gauge 改为成员、活跃任务、存储三条紧凑 quota progress，消除首屏空白仪表，存储继续格式化为 GB/TB。
- 内容：针对二次截图反馈继续收紧：首屏图表带从大图卡高度压到约 176px；生产漏斗改为顶齐的 4 行转化摘要条，不再在卡片中央悬空；任务状态图高度压到 112px 并收紧图内 padding；资源额度保持三行 quota meter，整体从“图表展示”转为“运营摘要带”，让最近任务表明显上移。
- 内容：根据最新截图反馈，删除首屏横贯全宽的待办/风险条组件及其移动端样式。后端 `todo_items` 响应结构不变，前端组织 Dashboard 不再把它渲染成独立 Alert/Chip 条；待人工审核、AI 队列、导出失败、余额和额度风险由 KPI 状态、图表摘要和角色主行动承载，避免标题区与指标区之间出现突兀红框类模块。
- 测试结果：`npm.cmd --prefix apps/web run typecheck` 通过；`cd apps/web && npx.cmd vitest run src/pages/workspace/WorkspaceApp.test.tsx -t "dashboard" --testTimeout=30000` 通过，5 passed、65 skipped，仍有 jsdom `getComputedStyle()` pseudo-elements 已知未实现提示；`python -m pytest apps/api/tests/test_auth_team_rbac.py -q -k "team_dashboard"` 使用本机 Python 3.12 路径在沙箱外执行通过，4 passed、83 deselected，仅有 FastAPI `on_event` deprecation warning；修复生产图标签和资源额度空白后再次运行 `npm.cmd --prefix apps/web run typecheck` 与 dashboard 定向 Vitest 通过；`git diff --check` 通过，仅保留既有 LF/CRLF 提示。
- 后续动作：后续如继续做视觉验收，可补 Playwright 桌面/窄屏截图和页面级横向滚动断言；当前仍不新增趋势、日期筛选或后端字段。

- 类型：偏差修正 / 平台工作台收口
- 关联文档：`docs/api/platform.md`、`docs/design/pages/platform-workbench.md`、`docs/product/REQUIREMENTS_AND_NOTES.md`、`docs/architecture/SYSTEM_ARCHITECTURE.md`、`docs/planning/TODO.md`
- 内容：按最新口径修正平台工作台：提现不再作为平台人工审核待办，`/platform` 移除“提现处理”一级页面、详情 Drawer 和审核 Modal；经营总览不再展示待处理提现 KPI，改为服务费、企业认证和资质审核待办。平台金额界面默认只展示积分，不再在总览、流水、详情和提示中反复展示 `1 积分 = 1 元`。
- 内容：标注员 `POST /api/v1/profile/points/withdraw` 改为余额足够即自动完成提现，立即扣减 `PointsWallet.available_points` 并写负向 `PointsLedger`；`platform_payment_requests` 仅保留已通过记录用于审计/历史兼容。历史 `pending` 支付单审核接口继续保留为运维兼容能力，不属于当前前端主路径。
- 内容：平台结算、企业认证和资质审核列表补齐受控筛选、分页、详情 Drawer 与统一审核 Form；Provider 页面改为更紧凑的左右工作区和 CSS class 样式，减少 inline style、装饰卡片和大圆角；经营总览近 30 天服务费趋势从逐日 `Progress` 条改为 `@ant-design/charts` 面积图，并补充近 30 天合计、最高单日和最近 7 天摘要。
- 测试结果：`npm.cmd --prefix apps/web run typecheck` 通过；`npm.cmd --prefix apps/web run test -- src/pages/platform/PlatformApp.test.tsx --run` 通过，5 passed；`python -m pytest apps/api/tests/test_platform_workbench.py -q` 通过，4 passed；`python -m compileall apps/api/app` 通过；`git diff --check` 通过，仅保留既有 LF/CRLF 提示。
- 后续动作：继续补全平台认证/结算的更多筛选边界测试；项目级仍需推进 AI 预审 worker、多轮审核、领取并发、异步导出进度、WebSocket 通知、Outbox/Event、幂等和乐观锁。

- 类型：前端体验重设计 / 企业工作台 Dashboard 图表化
- 关联文档：`docs/design/FRONTEND_DESIGN_STYLE.md`、`docs/planning/TODO.md`
- 内容：企业工作台 `/workspace` Dashboard 从第一版 `Statistic / Progress / List` 状态看板升级为 Ant Design Charts 图表化DASHBOARD。本轮不改变 `GET /api/v1/teams/{team_id}/dashboard` API shape，前端从现有 `TeamDashboardPayload` 派生生产漏斗、任务状态柱状图、审核结果饼图、AI/导出状态柱状图和资源额度仪表；最近任务、导出、AI job、通知和审计统一使用 `EnhancedTable`，减少视觉松散感。
- 内容：新增前端依赖 `@ant-design/charts`。Dashboard 顶栏固定为中文 `企业工作台`，展示企业名、角色 Tag、生成时间、刷新和角色主行动；内容区内部滚动，白底浅边框、8px 内圆角、蓝/绿/黄/红语义色。Reviewer 视图将审核图表和审核焦点前置且不展示任务生产管理主入口；Agent 视图将 AI/资源优先；Team Admin / Owner 保持生产、审核、AI、导出、资源和治理概览。
- 测试结果：`npm.cmd --prefix apps/web run typecheck` 通过；`cd apps/web && npx.cmd vitest run src/pages/workspace/WorkspaceApp.test.tsx -t "dashboard" --testTimeout=30000` 通过，5 passed、65 skipped；`python -m pytest apps/api/tests/test_auth_team_rbac.py -q -k "team_dashboard"` 通过，4 passed、83 deselected。Vitest 仍输出 jsdom `getComputedStyle()` pseudo-elements 未实现提示，不影响测试结果。
- 后续动作：后续如需要趋势分析，可在不破坏当前 Dashboard 响应的前提下新增日期筛选或趋势字段；当前图表口径保持当前企业全量累计 + 最近记录。

- 类型：产品体验 / 公开解决方案销售页
- 关联文档：`docs/product/REQUIREMENTS_AND_NOTES.md`、`docs/design/FRONTEND_DESIGN_STYLE.md`、`docs/design/pages/public-solutions.md`、`docs/planning/TODO.md`
- 内容：将公开导航中的 `发布任务` 销售入口改为 `解决方案`，新增 `/solutions` 企业数据标注解决方案页；历史 `/publish` 兼容跳转到 `/solutions`，不影响工作台内 `workspace?page=publish-task` 的真实任务发布向导、状态机、权限或 API。
- 内容：根据视觉反馈重做解决方案页，改为“明亮产品发布感 + 自助注册转化”：首屏固定为 `MarkUp Enterprise Data Workflow` 与 `从标注需求到训练数据交付，一条生产线跑完`，主 CTA 为 `创建企业账号`；右侧使用浅色流程画布展示输入层、生产层和交付层，包含导入数据集、配置模板、分发标注、AI 预审、人工复核、审核通过进度和导出格式，避免深色区块和后台卡片堆叠。
- 内容：删除用户可见的内部定位文案，移除问答区，改用 `临时表格协作 / 传统外包 / MarkUp` 对比表说明模板复用、质量控制、AI 预审、人工复核、权限审计、导出交付和套餐/成本透明度；套餐区保留五档紧凑卡片，Pro 高亮推荐，不再重复展示套餐表格。
- 测试结果：`npm.cmd run test -- src/components/layout/SiteNav.test.tsx --run` 通过，11 passed；`npm.cmd run typecheck` 通过。
- 后续动作：如后续继续商业化入口，可补充 `/solutions` 的 Playwright 视觉回归与移动端截图检查，并在真实运营联系方式确定后替换 More 套餐 CTA。

### 2026-06-03

- 类型：前端体验 / 终端用户帮助手册
- 关联文档：`docs/product/REQUIREMENTS_AND_NOTES.md`、`docs/design/FRONTEND_DESIGN_STYLE.md`、`docs/planning/TODO.md`
- 内容：将公开 `/help` 从轻量说明页升级为终端用户帮助手册，覆盖快速开始、账号与登录、标注员接任务与作答、企业/Owner 数据生产、Reviewer 人工审核、企业会员/积分/AI 资源和常见故障排查；明确不写平台运营工作台、API、部署或开发者文档。帮助内容继续由 `apps/web/src/pages/help/helpContent.json` 承载，并作为平台问答 AI 的公开知识源。
- 内容：帮助页改用 Ant Design `Input.Search`、`Tabs`、`Anchor`、`Tag`、`Collapse` 和 `Empty`，支持角色筛选、全文搜索、章节导航、FAQ 展开和 `建设中` 状态标签。
- 测试结果：`npm.cmd --prefix apps/web run test -- src/pages/help/HelpPage.test.tsx --run` 通过，4 passed；`npm.cmd --prefix apps/web run typecheck` 通过；`python -m pytest apps/api/tests/test_platform_agent.py` 通过，8 passed。

### 2026-06-03

- 类型：前后端缺陷修复 / 任务广场详情滚动与平台问答 AI 流式收口
- 关联文档：`docs/api/review-ai-export.md`、`docs/design/FRONTEND_DESIGN_STYLE.md`
- 内容：修复任务广场详情 Drawer 第一步信息无法完整滚动的问题。`TaskSquarePage.css` 去掉首屏详情容器多余的 `overflow: hidden` 限制，继续保持 `Drawer body` 外层固定、步骤面板内部滚动的固定视口模式，避免任务说明、交付说明、企业信息和标签被截断。
- 内容：继续收口 `PlatformAgentDrawer` 的悬浮态。前端改为把 floating frame 的 `left / top / width / height` 绑定到 Drawer 根层样式，补齐 `ant-drawer-wrapper-body / ant-drawer-body / panel` 的固定高度链路，并限制拖拽只从标题栏空白区域触发、缩放只从右下角 handle 触发；悬浮窗在消息增长时不再随内容自动撑高，消息区单独滚动。
- 内容：平台问答 AI `/api/v1/platform-agent/chat/stream` 现已改成真实流式。后端新增 Provider 流式请求与 SSE 解析辅助，覆盖 `OpenAI / OpenAI Compatible / DeepSeek / Azure OpenAI / Anthropic / Gemini` 文本流式分支；平台默认 Provider 可用时直接透传真实增量 `delta`，不可用或解析失败时继续回退为公开帮助文档摘要回答，并在事件中标记 `fallback=rag_summary`。AI 调用日志继续沿用 `AiCallLog`，在流结束后一次写成功日志，异常时写失败日志。
- 测试结果：`npm.cmd --prefix apps/web run test -- src/components/layout/SiteNav.test.tsx --run` 通过，11 passed；`npm.cmd --prefix apps/web run test -- src/pages/tasks/TaskSquarePage.test.tsx --run` 通过，6 passed；`cd apps/web && npm.cmd run typecheck` 通过；`python -m pytest apps/api/tests/test_platform_agent.py` 通过，8 passed；`python -m compileall apps/api/app` 通过；`git diff --check` 通过，仅保留既有 CRLF 换行提示。

### 2026-06-02

- 类型：前端体验调整 / 任务广场领取协议第二步
- 关联文档：`docs/api/labeling.md`、`docs/design/FRONTEND_DESIGN_STYLE.md`、`docs/product/REQUIREMENTS_AND_NOTES.md`、`docs/design/pages/owner-task-management.md`、`docs/planning/TODO.md`
- 内容：任务广场详情抽屉的领取流程从单屏确认调整为 Ant Design `Steps` 三步：`任务详情 -> 签署协议 -> 领取确认`。必签协议任务在第二步展示协议正文/文件名和 `我已阅读并同意该任务用户协议` 勾选，未勾选不能进入领取确认；非必签任务仍保留第二步并展示无需额外签署提示。最终领取请求继续沿用 `{ bundle_size, agreement_accepted }`，不改变后端 API shape；已领取任务继续显示 `已接取` 禁用态。
- 内容：根据视觉反馈继续压缩第二步布局空白：任务详情抽屉 body 从 grid 改为纵向 flex，避免步骤条和协议区被拉开；协议正文阅读区取消 132px 固定上限，改为占用第二步主要可用高度，底部操作区保持稳定。
- 内容：任务详情第一步底部移除 `稍后查看` 次按钮，保留抽屉右上角关闭入口；第一步底部只展示单个主按钮，第二步和第三步继续提供 `上一步`。
- 内容：任务详情 Drawer 增加根层 class 并复用全局 `--nav-height` 做浮层偏移，遮罩和抽屉主体从顶栏下方开始，不再覆盖固定顶栏。
- 内容：补齐任务详情 Drawer 的高度链路，Ant Design content、wrapper body 和 drawer body 统一使用 100% 高度 flex 布局，正文步骤面板单独内部滚动，避免顶栏下移后任务详情信息显示不全。
- 内容：任务广场列表加载态改为 Ant Design `Spin`，移除自绘 `Empty + Button loading` 加载按钮；加载区只保留 Spin 和简短 tip，不再展示额外说明文字。
- 内容：根据页面视觉反馈优化任务广场版式层次：新增 1320px 内容版心，Hero、搜索筛选工具带、任务主体和底部分页栏统一内收居中；搜索筛选区从左右贴边的全宽 sticky 条调整为浅白工具带，底部分页栏从全宽 fixed 条调整为与内容版心对齐的居中浮层，降低页面贴边拥挤感。
- 测试结果：`npm.cmd --prefix apps/web run test -- src/pages/tasks/TaskSquarePage.test.tsx --run` 通过，6 passed；`cd apps/web && npx.cmd eslint src/pages/tasks/TaskSquarePage.tsx` 通过；`git diff --check` 通过但继续提示当前工作区 CRLF 换行警告。`npm.cmd --prefix apps/web run typecheck` 被当前工作区无关文件 `apps/web/src/pages/workspace/ResourceConfigPage.tsx:2828` 的 `onClick` 参数类型不匹配阻塞，非本次任务广场改动引入。
- 后续动作：若后续继续收口任务广场，可补移动端 Drawer/Steps 的 Playwright 视觉回归；全量 typecheck 需先处理资源配置页现存类型错误。

- 类型：前端细节收口 / 任务广场 Ant Design 迁移
- 关联文档：`docs/api/labeling.md`、`docs/design/FRONTEND_DESIGN_STYLE.md`
- 内容：任务广场 `/tasks` 先完成 Ant Design 组件迁移收口。`TaskSquarePage.tsx` 现在使用 Ant Design `Input.Search`、`Select`、`Segmented`、`Popover`、`Button`、`Card`、`Tag`、`Empty`、`Pagination`、`Drawer`、`Checkbox` 和 `InputNumber` 承载搜索、筛选、视图切换、任务卡片、空态、分页、详情抽屉、协议勾选和领取数量输入；保留现有 `GET /labels/tasks`、资质检查、任务协议校验和领取后进入标注工作台的业务行为。`TaskSquarePage.css` 同步清理旧自绘输入框、筛选弹层、卡片、分页和抽屉样式，改为适配 Ant Design 内部结构。
- 内容：根据复查反馈继续统一搜索栏控件对齐：排序控件改为单行 `Select`，搜索框、排序、视图切换和更多筛选在首行统一 44px 高度；第二行筛选按钮保持 34px 紧凑高度，避免两排控件高低不齐。
- 内容：顺手修复 `HelpPage.tsx` 中帮助内容 JSON 的 card 类型收口问题，避免全量前端 typecheck 被无标题卡片的推断联合类型阻塞；不改变帮助页内容。
- 测试结果：`npm.cmd --prefix apps/web run test -- src/pages/tasks/TaskSquarePage.test.tsx --run` 通过，5 passed；迁移初次验证时 `npm.cmd --prefix apps/web run typecheck` 通过；`cd apps/web && npx.cmd eslint src/pages/tasks/TaskSquarePage.tsx src/pages/help/HelpPage.tsx` 通过；搜索栏对齐复查后，任务广场定向测试和 `cd apps/web && npx.cmd eslint src/pages/tasks/TaskSquarePage.tsx` 继续通过。`git diff --check` 通过但继续提示既有 CRLF 工作区换行警告。全量 `npm.cmd --prefix apps/web run lint -- ...` 仍会因仓库既有问题失败，包括 `SiteNav.test.tsx` 未用 `waitFor`、`OwnerProductionPages.tsx` 未用 `Table`、`PeopleManagementPage.tsx` render 中 `Date.now()`、`ResourceConfigPage.tsx` 未用函数/参数，以及若干 hooks dependency warning；搜索栏对齐复查时全量 typecheck 被当前工作区另一个未提交文件 `apps/web/src/features/ai/providerConfigShared.tsx` 的字符串语法错误阻塞，非任务广场改动引入。
- 后续动作：下一步可继续把任务广场视觉密度与工作台列表骨架对齐，并补充移动端 Popover/Drawer 的 Playwright 视觉回归。

- 类型：前端交互收口 / 模板搭建 AI 与任务发布 AI 展开态
- 关联文档：`docs/design/pages/owner-template-ai-assistant.md`、`docs/design/pages/owner-task-publish-ai-assistant.md`
- 内容：模板搭建 AI 与任务发布 AI 展开态顶部新增 `清除对话`，使用二次确认后清空对话历史、未应用 AI 变更、输入框、附件、错误和会话 ID，并恢复右侧初始引导态；清除时会递增请求版本，正在生成的旧响应返回后不会再写回状态，且不触发模板/任务表单保存。两处右侧初始快捷指令改为竖向单列按钮。任务发布 AI 入口从页面底部悬浮改为内嵌在新建任务底部操作栏 `上一步` 与 `手动保存` 之间，保持 provider 与发送逻辑不变。
- 测试结果：`cd apps/web && npm run typecheck` 通过；`cd apps/web && npm run lint` 通过，仅剩既有 6 个 hooks warning；`cd apps/web && npm run test -- src/pages/workspace/WorkspaceApp.test.tsx -t "template AI assistant" --testTimeout=30000` 通过；`cd apps/web && npm run test -- src/pages/workspace/WorkspaceApp.test.tsx -t "task publish AI assistant" --testTimeout=30000` 通过；`git diff --check` 通过。
- 后续动作：后续如继续收口 AI 浮窗，可把模板 AI 从 `@ant-design/x` Sender/Bubble 迁移为任务发布 AI 同款 Ant Design 原生消息面板，进一步降低测试环境差异。

- 类型：产品/技术设计 / 任务发布 AI 浮窗助手
- 关联文档：`docs/design/pages/owner-task-publish-ai-assistant.md`、`docs/api/review-ai-export.md`、`docs/product/REQUIREMENTS_AND_NOTES.md`、`docs/architecture/SYSTEM_ARCHITECTURE.md`
- 内容：根据最新需求设计并实现 `MarkUp 任务发布 AI`。该助手定位为任务发布向导内操作型 AI，复用平台问答 AI、AI Resources Provider、上传和模板搭建 AI 的浮窗交互模式；AI 只生成结构化待应用变更，用户确认后写入当前新建/修改任务本地表单，随后由现有自动保存、发布摘要、费用估算和 readiness 检查接管。后端新增 `/api/v1/ai/task-publish-assistant/chat`，前端新增 `TaskPublishAiAssistant` 并接入 `TaskPublishWorkspacePage`。任务发布 AI 第一版使用 Ant Design 原生 `Modal / Select / Upload / Input.TextArea / Segmented / Descriptions`，不在该浮窗内引入 `@ant-design/x` 消息或发送器组件；打字 placeholder 已按 12 秒完整停留、1.5 秒空白停顿实现。
- 偏差修正：浏览器验证时定位到工作台白屏/最大更新深度风险，已收口 `AppShell` / `SiteNav` 菜单与水印配置的稳定引用，关闭状态的 `PlatformAgentDrawer` 不再挂载内容；任务发布页面包屑 tail 更新改为只在组件真正卸载时清空，数据预览 `ResizeObserver` 只在尺寸真实变化时写状态，任务发布 AI 悬浮入口拆成子组件并避免 hover/focus 重复写入同一状态。
- 测试结果：已执行 `cd apps/web && npm run typecheck`、`cd apps/web && npm run lint`（仅剩既有 hooks warning）、`cd apps/web && npm run test -- src/pages/workspace/WorkspaceApp.test.tsx -t "task publish AI assistant" --testTimeout=30000`、`conda run -n markup-api python -m compileall apps/api/app`、`git diff --check`。聚焦测试已覆盖打开任务发布 AI、发送指令、展示结构化变更、点击应用并写入新建任务表单标题/描述/标签。Playwright 已登录 `owner@test.local` 进入 `http://127.0.0.1:5174/workspace?page=publish-task`，确认新建任务页、底部 AI 入口、`MarkUp 任务发布 AI` 弹窗、`你说 AI 做` 引导和快捷指令可渲染；控制台仍有既有 Ant Design deprecation warning 与本地缺失 `/teams/:id/dashboard`、`/ai-resources/teams/:id/wallet` 404。
- 后续动作：可继续用真实 Provider 做端到端联调，并补充附件内容解析、依赖变更冲突校验和更完整的费用/readiness 预览断言。

- 类型：产品/技术设计 / 模板搭建 AI 浮窗助手
- 关联文档：`docs/design/pages/owner-template-ai-assistant.md`、`docs/api/review-ai-export.md`、`docs/product/REQUIREMENTS_AND_NOTES.md`、`docs/architecture/SYSTEM_ARCHITECTURE.md`、`docs/planning/TODO.md`
- 内容：根据最新需求设计 `MarkUp 模版搭建 AI`。该助手定位为 Designer 内操作型 AI，不直接修改模板；用户自然语言指令先由后端转换为结构化待应用变更，前端展示变更确认、临时 Renderer 预览和应用按钮，应用后写入当前 Designer 本地 schema，再沿用现有模板自动保存/手动保存持久化。Provider、上传、鉴权和调用日志复用 AI Resources；第一版允许 Provider 不可用或解析失败时返回明确标记的结构化兜底方案。
- 测试结果：已执行 `cd apps/web && npm run typecheck`、`cd apps/web && npm run lint`（仅剩既有 hooks warning）、`cd apps/web && npm run test -- src/pages/workspace/WorkspaceApp.test.tsx -t "template AI assistant" --testTimeout=30000`、`conda run -n markup-api python -m compileall apps/api/app`、`git diff --check`。已用 Playwright CLI 登录 `owner@test.local` 进入 `http://127.0.0.1:5173/workspace?page=templates`，模板搭建主页、Designer 子页和底部 AI 浮窗均正常渲染；控制台仅保留既有工作台首页 `/api/v1/teams/:id/dashboard` 404，与模板 AI 助手无关。
- 后续动作：可继续接入真实 Provider 结构化输出、附件内容解析和更完整的变更冲突校验。

- 类型：前端细节收口 / AI Provider 页高密度布局压缩
- 关联文档：`docs/design/pages/organization-resource-config.md`
- 内容：继续只收口资源配置页的 `AI Provider`。页面改为连续白色壳体 + 粘性顶部操作条 + 窄配置列表 / 宽详情区布局，缩小左侧企业自配列表宽度，压紧平台共享卡片、详情卡片和费率统计块的留白，并去掉顶部操作条与内容区之间的灰色断缝，提升同屏信息密度。
- 测试结果：`cd apps/web && npm.cmd run typecheck` 通过；`cd apps/web && npm.cmd run build` 通过。

- 类型：后端缺陷修复 / 企业提现收款账号长度校验放宽
- 关联文档：`docs/api/team-profile.md`
- 内容：修复企业积分钱包提现在部分微信/支付宝模拟账号场景下返回 `String should have at least 2 characters` 的问题。企业提现与标注员提现请求模型里的 `account_no` 校验已从最少 2 个字符放宽到最少 1 个字符，避免短账号在接口校验阶段被拦截；企业提现回归用例也同步覆盖单字符账号。
- 测试结果：`& 'C:\Users\Archyix\AppData\Local\Programs\Python\Python312\python.exe' -m pytest apps/api/tests/test_auth_team_rbac.py -k "team_points_withdraw_uses_available_balance_only or team_points_wallet_ledger_and_withdraw or team_points_budget_recharge_and_alerts"` 通过，3 passed。

- 类型：前端细节收口 / 资源配置页紧凑数值缩写改为英文单位
- 关联文档：`docs/design/pages/organization-resource-config.md`
- 内容：资源配置页内部用于钱包摘要、AI 摘要和相关表格/抽屉的紧凑数值格式化已从中文单位 `万 / 亿 / 万亿` 收口为英文缩写 `K / M / B / T`，保留 Tooltip 中的完整千分位数字不变，避免大数值在同页出现中英文口径混杂。
- 测试结果：`cd apps/web && npm.cmd run typecheck` 通过；`cd apps/web && npm.cmd run build` 通过。

- 类型：前后端偏差修正 / 企业积分提现改为自动通过
- 关联文档：`docs/api/team-profile.md`、`docs/api/platform.md`、`docs/product/REQUIREMENTS_AND_NOTES.md`、`docs/planning/TODO.md`
- 内容：按最新产品决策，企业积分钱包提现不再进入平台审核队列。后端 `POST /api/v1/teams/{team_id}/points-budget/withdraw` 现改为在 `available_points` 足够且支付密码正确时立即扣减企业钱包余额、写入 `withdraw` 流水并记录 `points_budget_withdraw_completed` 审计；企业钱包可用余额口径同步去掉 `pending_payment_points` 对企业提现的额外占用，AI 钱包转入和会员购买也继续只按真实 `reserved_points` 判断可支配余额。前端资源配置页提现成功提示同步改为即时成功文案。
- 测试结果：`& 'C:\Users\Archyix\AppData\Local\Programs\Python\Python312\python.exe' -m pytest apps/api/tests/test_auth_team_rbac.py -k "team_points_withdraw_uses_available_balance_only or team_points_wallet_ledger_and_withdraw or team_points_budget_recharge_and_alerts"` 通过，3 passed；`cd apps/web && npm.cmd run typecheck` 通过；`cd apps/web && npm.cmd run build` 通过。

### 2026-06-02

- 类型：产品行为调整 / 前后端实现 / 新建任务人工复审配置
- 关联文档：`docs/product/REQUIREMENTS_AND_NOTES.md`、`docs/api/production.md`、`docs/architecture/SYSTEM_ARCHITECTURE.md`、`docs/design/pages/owner-task-management.md`
- 内容：重做任务管理新建/修改任务向导中的 `人工复审` 步骤。原先审核员需要手填 ID/邮箱文本框，本轮改为加载当前企业 active Reviewer，并使用 Ant Design `Select mode="multiple"` 多选；当选择多位 Reviewer 时，下方按每位 Reviewer 展示任务量 `InputNumber`，用于填写预计分配条数，留空表示不限制。后端 Task 模型、创建/更新请求和返回 payload 新增 `review_config.reviewer_allocations`，同时继续保留 `reviewer_ids` 作为审核队列权限、筛选和 Reviewer 工作台可见范围的核心字段。
- 测试结果：`cd apps/web && npm run typecheck` 通过；`cd apps/web && npm run lint` 通过，无 error，保留 6 条既有 `react-hooks/exhaustive-deps` warning；`cd apps/web && npm run test -- src/pages/workspace/WorkspaceApp.test.tsx -t "publishes an enterprise task" --testTimeout=30000` 通过，1 passed、65 skipped，保留 jsdom 对 localStorage 和 Ant Design pseudo-element 的既有提示；`conda run -n markup-api python -m compileall apps/api/app` 通过；`git diff --check` 通过。

### 2026-06-02

- 类型：前端缺陷修复 / 任务详情页标题统计无缝衔接
- 关联文档：`docs/design/pages/owner-task-management.md`
- 内容：修复 Task Detail 页面标题栏和任务准备度信息统计栏之间露出灰色缝隙的问题。根因是详情页固定标题实际高度约 98px，但内容区仍按默认 `--ws-page-heading-height=120px` 预留，导致标题栏下方固定露出约 24px 页面背景；后续又因 Tabs 保留 `margin-top`，灰色缝隙转移到统计栏下方。现在 `task-detail-page` 明确使用 98px 标题高度并同步内容区 padding，任务准备度概览改为与模板搭建/数据集管理等生产页一致的连续状态条：白底、无内部 gap、无圆角卡片，仅用中性分隔线分栏，状态值用语义色强调；Tabs 紧贴统计栏下方。本次仅调整前端 CSS，不改变 API shape。
- 测试结果：Playwright 打开本地 `http://127.0.0.1:5173/workspace?page=task-management`，以 `owner@test.local` 进入收集中任务 `人工审核演示任务` 的 Task Detail，确认 `.page-heading.bottom = 200`、`.task-readiness-strip.top = 200`、`.task-detail-tabs.top = 265`、`.task-readiness-strip.bottom = 265`，`headingToStripGap = 0`、`stripToTabsGap = 0`、`firstToSecondGap = 0`，且统计项为白底、中性右分隔线、状态值 18px 语义色。`cd apps/web && npm run typecheck` 通过；`git diff --check` 通过。

### 2026-06-02

- 类型：前端缺陷修复 / 生产页面最近更新时间校正
- 关联文档：`docs/design/FRONTEND_DESIGN_STYLE.md`、`docs/design/pages/owner-dataset-management.md`、`docs/design/pages/owner-template-designer.md`、`docs/design/pages/owner-task-management.md`
- 内容：修复数据集管理、模板搭建、任务管理三类 Owner 生产页面中 `最近更新` 与系统时间不一致的问题。后端生产链路当前可能返回无时区的 UTC ISO datetime 字符串，前端统一时间格式化函数现在会把这类字符串按 UTC 解析，再转换为浏览器系统时区展示；带 `Z` 或时区偏移的字符串仍按原时区解析。模板列表和版本历史也改为复用同一格式化函数。本次不改变 API shape，也不调整后端 schema。
- 测试结果：`cd apps/web && npm run typecheck` 通过；`git diff --check` 通过。

### 2026-06-02

- 类型：产品语义调整 / 任务分发策略命名
- 关联文档：`docs/product/REQUIREMENTS_AND_NOTES.md`、`docs/api/production.md`、`docs/architecture/SYSTEM_ARCHITECTURE.md`、`docs/design/pages/owner-task-management.md`
- 内容：任务管理新建/修改任务页的分发策略展示语义更新：底层 API 枚举仍保持 `first_come_all | quota_grab | assigned_link` 不变；前端将 `first_come_all` 展示为 `包大小分配`，并说明与 Labeler 任务广场 `bundle_size` 领取配置对齐；将 `quota_grab` 展示为 `企业内流转`，说明用于企业内 Labeler 范围流转分配；`assigned_link` 继续显示为指派链接。本次不改变 API shape。
- 测试结果：`cd apps/web && npm run typecheck` 通过；`cd apps/web && npm run test -- src/pages/workspace/WorkspaceApp.test.tsx -t "publishes an enterprise task" --testTimeout=30000` 通过，1 passed、65 skipped，保留 jsdom 对 localStorage 和 Ant Design pseudo-element 的既有提示；`git diff --check` 通过。

### 2026-06-02

- 类型：前端缺陷修复 / 模板与数据选择区固定
- 关联文档：`docs/design/pages/owner-task-management.md`
- 内容：修复任务管理新建/修改任务页 `模板与数据` 步骤中 `请选择模板`、`请选择数据集` 两个 Ant Design Select 跟随左侧步骤滚动区一起滚动的问题。选择区现在在该步骤内容区顶部使用 sticky 固定，滚动查看模板详情、数据集详情和 ShowItem 映射表时仍保持可见；继续沿用浅蓝模块渐变背景，不增加额外白色线框或 API 字段。
- 测试结果：`cd apps/web && npm run typecheck` 通过；`git diff --check` 通过。

### 2026-06-02

- 类型：前端体验调整 / 新建任务标签输入
- 关联文档：`docs/product/REQUIREMENTS_AND_NOTES.md`、`docs/design/pages/owner-task-management.md`
- 内容：任务管理新建任务基础信息中的标签输入从逗号分隔文本框改为单标签输入。发布者每次输入一个标签并点击 `添加`，已添加标签会在下一行以 Ant Design `Tag` 展示，支持点击叉号移除；内部仍同步为原有 `tags: string[]` 发布 payload，不改变 API shape。
- 测试结果：`cd apps/web && npm run typecheck` 通过；`cd apps/web && npm run test -- src/pages/workspace/WorkspaceApp.test.tsx -t "publishes an enterprise task" --testTimeout=30000` 通过，1 passed、65 skipped，保留 jsdom 对 localStorage 和 Ant Design pseudo-element 的既有提示；`git diff --check` 通过。

### 2026-06-02

- 类型：产品行为调整 / 前后端实现 / 任务分类多选
- 关联文档：`docs/product/REQUIREMENTS_AND_NOTES.md`、`docs/api/production.md`、`docs/design/pages/owner-task-management.md`
- 内容：任务管理新建任务基础信息中的任务分类不再展示单独的“多模态”选项，改为 Ant Design 多选 Select，仅提供文本、图片、音频、视频四个模态。前端单选时继续向旧 API `category` 写对应单值，多选时 `category` 写入兼容主分类 `multimodal`，同时在 `qualification_rules.category_tags` 保存实际多选明细；草稿重新打开时优先从 `category_tags` 恢复，旧 `category=multimodal` 任务兼容恢复为四个模态全选。任务管理列表分类筛选和旧详情基础信息下拉也移除“多模态”入口。
- 测试结果：`cd apps/web && npm run typecheck` 通过；`cd apps/web && npm run test -- src/pages/workspace/WorkspaceApp.test.tsx -t "publishes an enterprise task" --testTimeout=30000` 通过，1 passed、65 skipped，保留 jsdom 对 Ant Design pseudo-element 的既有 not implemented 提示；`conda run -n markup-api python -m compileall apps/api/app` 通过；`git diff --check` 通过。

### 2026-06-02

- 类型：前端缺陷修复 / 模板 schema 文件导入与任务数据进度口径
- 关联文档：`docs/design/pages/owner-template-designer.md`、`docs/design/pages/owner-task-management.md`
- 内容：模板搭建页 `导入 schema` 弹窗补齐 Ant Design `Upload` 文件导入能力，支持选择 `.json` 文件读取到现有 schema 校验流程，同时保留粘贴完整模板对象或裸 schema 的入口。任务管理主页表格和卡片的进度展示从旧的领取/提交/通过口径调整为生产看板口径：总数据条数、待人工审核、已入库和打回；卡片进度条按已入库 / 总数据展示，`submitted` 作为当前待人工审核题目数解释，`approved` 作为已入库题目数解释，`rejected` 作为已打回题目数解释。本次不改变 API shape。
- 测试结果：`cd apps/web && npm run typecheck` 通过；`cd apps/web && npm run test -- src/pages/workspace/WorkspaceApp.test.tsx -t "imports and exports template schema|task production progress" --testTimeout=30000` 通过，2 passed、64 skipped，保留 jsdom 对 Ant Design pseudo-element 样式和下载导航的既有 not implemented 提示；`git diff --check` 通过。

### 2026-06-01

- 类型：前端缺陷修复 / 数据集页面下载层级、AntD 预览与自动保存
- 关联文档：`docs/design/pages/owner-dataset-management.md`
- 内容：修复数据集管理页三个问题。1）列表页和详情页的下载 Dropdown 统一挂载到 `document.body`，避免被固定标题和滚动容器遮挡。2）数据预览区从原生 `<table>` 切换为 Ant Design `Table`，保留列宽拖拽与双击自动适配能力，保证与任务管理、模板搭建表格风格一致。3）数据集详情页新增与任务管理一致的 5 秒自动保存逻辑，覆盖名称、简介、字段备注和参与映射开关；导入数据集与新增渲染变量弹窗统一改为 Ant Design `Modal + Form + Upload`，页面成功/错误反馈 5 秒后自动消失。本次只做前端派生与交互收口，不改变 API shape。
- 测试结果：`cd apps/web && npm run typecheck` 通过；`cd apps/web && npm run lint` 通过，保留 4 条既有 `react-hooks/exhaustive-deps` warning，无 error；`git diff --check` 通过。`cd apps/web && npm run test -- src/pages/workspace/WorkspaceApp.test.tsx -t "imports and previews enterprise datasets" --testTimeout=30000` 在当前 jsdom 环境仍未通过，主要卡在 Ant Design `Modal` 动画残影和旧 dataset 用例 mock/断言不够收敛，不是本轮真实页面功能阻塞；同文件其他定向用例 `opens auto-saved task drafts` 通过。

- 类型：前端体验优化 / 浏览器标签页 Logo
- 关联文档：`docs/planning/PROGRESS_LOG.md`
- 内容：前端入口 `apps/web/index.html` 新增 SVG favicon 声明，浏览器标签页图标使用 `apps/web/public/logo.svg`，不改变运行时路由或 API shape。
- 测试结果：`cd apps/web && npm run build` 通过，保留 ExcelJS direct eval 与大 chunk 两类既有构建 warning；`git diff --check` 通过。

- 类型：前端偏差修正 / 人工审核字段差异标题精简
- 关联文档：`docs/design/pages/reviewer-manual-review.md`
- 内容：按最新反馈，Reviewer 人工审核详情中 `第 x 轮提交字段差异` 标题下方不再展示“草稿字段与当前提交字段一屏对照，变更字段优先高亮。”等说明性副文案，只保留标题、变化数量和下方 Ant Design 表格，减少中间审阅区冗余文字。
- 测试结果：`cd apps/web && npm run typecheck` 通过；`cd apps/web && npm run lint` 通过，保留 4 条既有 `react-hooks/exhaustive-deps` warning，无 error；`cd apps/web && npm run test -- src/pages/workspace/WorkspaceApp.test.tsx -t "manual review" --testTimeout=30000` 通过，4 passed、60 skipped；`git diff --check` 通过。

- 类型：前后端偏差修正 / Reviewer 人工审核直接修订与轮次文案
- 关联文档：`docs/design/pages/reviewer-manual-review.md`
- 内容：修复人工审核页三个体验偏差：`直接修订并入库` 不再暴露单个原始 JSON 文本框，改为根据审核详情中的模板 schema 渲染 Ant Design GUI 表单，单选、多选、数字、开关和文本字段可直接编辑，复杂对象字段才保留字段级 JSON 输入；审核详情接口同步返回当前任务绑定模板 schema 供前端渲染，不改变审核提交 API shape。无 AI 预审时详情区改为一行浅蓝提示 `无 AI 预审`，避免大面积空矩形占用审阅空间。字段差异标题改为按右侧审计时间线选中的轮次动态显示，第一轮初审视角只展示 `第一轮提交字段差异`，不再出现 `第一轮 / 第二轮字段差异`。
- 测试结果：`cd apps/web && npm run typecheck` 通过；`cd apps/web && npm run lint` 通过，保留 4 条既有 `react-hooks/exhaustive-deps` warning，无 error；`cd apps/web && npm run test -- src/pages/workspace/WorkspaceApp.test.tsx -t "manual review" --testTimeout=30000` 通过，3 passed、58 skipped；`conda run -n markup-api python -m compileall apps/api/app` 通过；`git diff --check` 通过。

- 类型：前端缺陷修复 / 数据集弹窗层级、AI 矩阵确认与发布整数 payload
- 关联文档：`docs/design/pages/owner-production.md`、`docs/design/pages/owner-task-management.md`、`docs/api/production.md`
- 内容：修复数据集管理导入弹窗被固定标题栏覆盖的问题，原因是自定义导入弹层 `z-index=80` 低于固定页面标题 `z-index=84`，本轮将工作台弹层提升到 Ant Design Modal 同级层级。新建任务 AI 预审评分矩阵在点击 `确认矩阵` 后切换为 `修改矩阵`，矩阵表格进入只读预览模式；点击 `修改矩阵` 后恢复可编辑并重新要求确认。发布前检查出现 `Input should be a valid integer got a number with a fractional part` 的根因是后端 `reward_rule.total_points / points_per_item`、领取完成时限、指派链接有效期和 `review_threshold` 等字段按当前 API schema 要求整数，但前端 `InputNumber` 允许小数并直接发送；本轮不改变 API shape，改为前端限制这些字段为整数并在 payload 中规整为整数。
- 测试结果：`cd apps/web && npm run typecheck` 通过；`cd apps/web && npm run lint` 通过，保留 4 条既有 `react-hooks/exhaustive-deps` warning，无 error；`cd apps/web && npm run test -- src/pages/workspace/WorkspaceApp.test.tsx -t "AI review matrix|publishes an enterprise task|manually saved task drafts|auto-saved task drafts|autosaved draft template" --testTimeout=30000` 通过，5 passed、55 skipped；`git diff --check` 通过。
- 后续动作：如产品后续明确奖励积分支持小数，需要同步改后端 schema、结算逻辑、API 文档和测试，而不是只在前端放开小数。

### 2026-06-02

- 类型：前后端缺陷修复 / 模板 Designer 参考数据集、自动保存与新建版本基线
- 关联文档：`docs/api/production.md`、`docs/design/FRONTEND_DESIGN_STYLE.md`、`docs/design/pages/owner-production.md`
- 内容：修复模板搭建页三个问题。1）Designer 顶部 `参考数据集` 不再把标签文案写进 Select placeholder，改为与 `模板名称` 一致的固定标签 + Select 结构，避免聚焦时文字上飘。2）模板草稿补齐与任务发布页一致的自动保存逻辑：Designer 有有效修改后防抖自动保存为 `draft + auto_saved=true`，手动保存使用 `auto_saved=false`，且手动保存后若未继续修改则不会再次触发自动保存；模板列表与 Designer 状态条同步区分 `草稿` 和 `自动保存`。3）已发布模板点击 `新建版本/修改` 后，新的草稿版本明确基于当前已发布 schema 快照继续编辑，不再回退为空白模板或旧 schema。
- 测试结果：待本轮前后端类型/编译与差异检查补充。

- 类型：前端交互统一 / 生产三页顶部 5 秒反馈提示
- 关联文档：`docs/design/FRONTEND_DESIGN_STYLE.md`、`docs/design/pages/owner-dataset-management.md`
- 内容：统一数据集管理、模板搭建、任务管理三类 Owner 生产页面的操作反馈行为。原先三页混用内联 `Alert` 成功/失败条，会插入固定标题、统计条和筛选条之间，导致布局跳动并与“固定骨架”规范冲突。本轮改为统一使用 Ant Design 顶部 `message` 展示 5 秒自动消失的成功/失败反馈；真正需要确认或承载表单的交互仍保留 `Modal`、`Drawer`、`Popconfirm`、`Dropdown` 等 Ant Design 原生组件，不改变现有流程和 API shape。
- 测试结果：`cd apps/web && npm run typecheck` 通过；`git diff --check` 通过。

- 类型：前端交互统一 / 生产三页说明提示分层
- 关联文档：`docs/design/FRONTEND_DESIGN_STYLE.md`
- 内容：继续收口数据集管理、模板搭建、任务管理三页中的说明型提示。页面权限不足和空态说明统一改为页面内 `Alert` 容器，不再复用原本用于浮层反馈的类名；模态中的导入说明、变量说明、JSON 题目格式说明统一使用模态内 `Alert` 风格。这样三页的提示被明确分成三层：顶部 5 秒 `message`、页面内 `Alert/Empty`、模态内 `Alert`。
- 测试结果：待本轮前端 `typecheck` 与 `git diff --check` 一并记录。

- 类型：前端缺陷修复 / 数据集详情完整行预览
- 关联文档：`docs/design/pages/owner-dataset-management.md`、`docs/api/production.md`
- 内容：明确数据集管理列表接口只返回 `preview_rows` 采样行，数据集修改页进入详情后必须调用 `GET /datasets/{dataset_id}` 获取完整 `rows`，并由 Ant Design Table 通过固定表头、内部滚动和底部分页展示全部数据。此前点击列表行“修改”直接使用列表项 payload，导致详情页只能看到前几行采样数据。
- 测试结果：`cd apps/web && npm run typecheck` 通过；`git diff --check` 通过。

- 类型：前端缺陷修复 / 手动保存草稿修改与人工审核错误提示
- 关联文档：`docs/design/pages/owner-task-management.md`、`docs/api/review-ai-export.md`
- 内容：修复任务管理中手动保存草稿点击修改后仍进入旧任务详情页，导致 `模板与数据` 只能查看摘要、无法修改的问题。现在所有 `draft` 草稿（含 `auto_saved=false` 的手动保存草稿和 `auto_saved=true` 的自动保存草稿）统一进入新建任务同款发布向导，因此标题栏、步骤统计栏和主体布局保持紧贴，右侧信息统计也与新建任务页一致；已发布、暂停和结束任务继续保留详情页只读/有限编辑能力。人工审核页补充 admin/企业账号无默认企业作用域时的明确错误提示，避免直接显示泛化的“审核队列加载失败”。本次不改变 API shape。
- 测试结果：`cd apps/web && npm run test -- src/pages/workspace/WorkspaceApp.test.tsx -t "manually saved task drafts|auto-saved task drafts|autosaved draft template" --testTimeout=30000` 通过，3 passed、55 skipped。人工审核本地排查中，`admin@test.local` 登录接口返回成功，但随后请求 `/api/v1/teams/admin/overview` 时出现连接中断，说明当前看到的“审核队列加载失败”还可能来自本地后端服务不可用/进程异常；待后端重启后继续用 Playwright 或 curl 复核完整链路。
- 后续动作：如后端重启后仍复现 admin 人工审核加载失败，继续检查 `X-Team-ID` 是否来自默认企业、admin 是否为该企业 active 成员，以及 `/reviews/queue` 是否返回权限或状态机错误。

- 类型：前端缺陷修复 / 自动保存草稿修改页模板与数据可编辑
- 关联文档：`docs/design/pages/owner-task-management.md`
- 内容：修复任务管理自动保存草稿进入修改页后，`模板与数据` 步骤因当前绑定模板不在已发布模板列表中而无法正常编辑的问题。发布向导现在会保留当前任务绑定模板作为可选项，即使该模板已归档或非已发布状态，也能继续查看和调整草稿配置，同时提示发布前需要切换到已发布模板版本。同步压紧修改页标题栏、步骤统计栏和主体之间的间距，并复用新建任务页的右侧发布摘要结构，保证信息统计与新建任务体验对齐。本次不改变 API shape。
- 测试结果：`cd apps/web && npm run test -- src/pages/workspace/WorkspaceApp.test.tsx -t "auto-saved task drafts|autosaved draft template" --testTimeout=30000` 通过，2 passed、55 skipped；Playwright MCP 登录 Owner 账号打开自动保存草稿修改页，确认标题栏到步骤栏、步骤栏到主体间距均为 0，且编辑页保留新建任务同款发布摘要结构。`cd apps/web && npm run typecheck` 通过；`cd apps/web && npm run lint` 通过，保留 4 条既有 `react-hooks/exhaustive-deps` warning，无 error。
- 后续动作：后续如后端增加模板版本冻结快照，应将当前绑定历史模板的展示文案从“当前绑定”进一步细分为“任务快照版本”和“可切换版本”。

- 类型：偏差修正 / AI 积分充值去除外部支付方式
- 关联文档：`docs/product/REQUIREMENTS_AND_NOTES.md`、`docs/api/review-ai-export.md`、`docs/design/pages/organization-resource-config.md`、`docs/planning/TODO.md`
- 内容：修正资源配置页 AI 积分充值仍展示微信、支付宝、对公转账的问题。AI 积分充值的真实语义固定为“企业积分钱包 -> AI 调用钱包”的内部划转，前端 Drawer 现在只展示企业钱包余额、转入积分、扣减账户、转入账户和企业钱包支付密码；提交 `POST /api/v1/ai-resources/teams/{team_id}/wallet/transfer-in` 时只发送 `amount` 与 `payment_password`。后端 `AiWalletTransferInRequest` 同步移除 `payment_method`，流水来源固定为 `team_points_wallet`，统一历史展示为“企业积分钱包”。
- 测试结果：`npm --prefix apps/web run typecheck` 通过；`cd apps/web && npx vitest run src/pages/workspace/WorkspaceApp.test.tsx -t "resource configuration wallet" --testTimeout=30000 --reporter=dot` 通过，1 passed、56 skipped；`python -m pytest apps/api/tests/test_ai_resources_platform_wallet.py -q` 通过，4 passed；`python -m compileall apps/api/app` 通过；`git diff --check` 通过，仅输出当前工作树既有 LF/CRLF 提示。
- 后续动作：旧 `/wallet/recharge` 兼容接口仍保留给非当前主路径消费方；若后续决定彻底下线，应单独清理 API 文档、路由和测试。

- 类型：前后端实现 / 企业会员等级与资源额度 V1
- 关联文档：`docs/product/REQUIREMENTS_AND_NOTES.md`、`docs/api/team-profile.md`、`docs/api/production.md`、`docs/architecture/SYSTEM_ARCHITECTURE.md`、`docs/design/pages/organization-resource-config.md`、`docs/design/pages/organization-profile.md`、`docs/planning/TODO.md`
- 内容：新增企业会员等级 `Free / Basic / Pro / Enterprise`，旧企业缺字段时按 `Free` 处理；`More` 仅作为“联系平台定制”展示入口，不进入普通企业套餐枚举。会员 V1 只限制真实企业成员上限、活跃生产任务数和数据集存储容量，企业内置系统 `Agent` 不计入成员用量或成员上限；套餐表固定为 Free 0/3/3/3GB、Basic 999/10/5/20GB、Pro 3,999/50/30/500GB、Enterprise 19,999/300/200/2TB。后端新增会员套餐读取、购买/续费/预约降级、取消预约接口，购买或续费从企业积分钱包扣费并写 `membership_fee` 流水和审计；成员新增、创建账号、批量导入、接受邀请、任务发布/审批/恢复、数据集导入已接入统一会员限制服务。前端资源配置页新增默认 `会员与额度` Tab，展示当前套餐、有效期、预约降级、三项用量和套餐卡片；Basic/Pro/Enterprise 通过 Drawer 输入企业钱包支付密码购买或续费；More 打开受控说明 Modal，不调用购买接口。企业信息页仅展示只读会员 Tag 和到期时间。
- 测试结果：`python -m compileall apps/api/app` 通过；`python -m pytest apps/api/tests/test_team_membership.py -q` 通过，8 passed；`npm --prefix apps/web run typecheck` 通过；`cd apps/web && npx vitest run src/pages/workspace/WorkspaceApp.test.tsx -t "membership|resource configuration wallet|organization profile" --testTimeout=30000 --reporter=dot` 通过，4 passed、54 skipped；`git diff --check` 通过，仅输出当前工作树既有 LF/CRLF 提示。
- 后续动作：后续如引入真实支付、自动续费、优惠折算、平台销售跟进或更细额度项，应先扩展产品基线和 API 文档，再调整会员服务；当前 V1 不限制 AI Provider、AI 调用、导出次数或模板数量。

- 类型：前后端实现 / 个人信箱管理、动态类型与企业隔离修正
- 关联文档：`docs/api/review-ai-export.md`、`docs/design/FRONTEND_DESIGN_STYLE.md`、`docs/product/REQUIREMENTS_AND_NOTES.md`、`docs/architecture/SYSTEM_ARCHITECTURE.md`、`docs/planning/TODO.md`
- 内容：个人信箱后端补齐用户级 `starred_by/deleted_for` 状态，`/notifications/my/{id}/state` 扩展为 `read/unread/handled/unhandled/star/unstar/delete`，新增 `/notifications/my/batch-state`，并让列表返回 `type_options` 供前端动态生成类型 Tab。通知可见性统一收敛到 active membership + 通知自身 `team_id` 校验；`target_type=team` 现在只面向通知所属企业内 active 的 `team_admin/owner/reviewer`，排除普通 Labeler 和系统 Agent；`target_type=member/role/task` 也不得因 `target_user_ids` 命中而跨企业可见。历史 `notification_type=team` 响应归一为 `organization`，新建企业公告写入 `organization`。前端完整个人信箱页改为动态类型 Tabs、未读/星标状态视图、Ant Design Table 多选批量工具条、星标列、个人删除和详情 Drawer 操作；顶栏概览保留唯一入口并新增轻量星标操作，不提供删除或批量管理。
- 测试结果：`npm.cmd run typecheck` 通过；`npm.cmd run test -- src/components/layout/SiteNav.test.tsx --testTimeout=25000` 通过，5 passed；`npm.cmd run test -- src/app/workspaceNavigation.test.tsx --testTimeout=25000` 通过，5 passed；`npm.cmd run test -- src/pages/workspace/WorkspaceApp.test.tsx -t "personal inbox" --testTimeout=25000` 通过，1 passed、55 skipped；`python -m pytest apps/api/tests/test_auth_team_rbac.py` 通过，83 passed；`python -m pytest apps/api/tests/test_notification_management_permissions.py` 通过，3 passed。尝试运行完整 `WorkspaceApp.test.tsx` 单文件与三文件合并命令时在当前环境持续超时，尚未拿到完整结果。
- 后续动作：继续拆分或排查 `WorkspaceApp.test.tsx` 全量超时原因；自动系统公告、审核提醒、导出提醒和 WebSocket 推送仍待后续接入。

- 类型：前端交互收口 / 平台共享 Provider 昵称展示与 DeepSeek 类型补充
- 关联文档：`docs/design/pages/organization-resource-config.md`
- 内容：根据资源配置页最新评审意见，企业侧平台共享 Provider 的主展示从底层 `model_id` 改为平台维护的 `route_name`，避免把共享路由昵称和实际调用模型名混在一起；平台共享卡片与只读详情均不再把模型名作为主标题暴露。同时在 `AI Provider` 的类型元数据中新增 `DeepSeek`，预置官方 `https://api.deepseek.com/v1` 接入口径与模型占位文案，继续复用现有单路由单模型专业配置表单。
- 测试结果：`cd apps/web && npx eslint src/pages/workspace/ResourceConfigPage.tsx` 通过。
- 后续动作：如后续任务发布页或平台 Provider 页也需要统一该昵称展示规则，应同步切换平台共享路由的主文案到 `route_name`。

- 类型：前端交互收口 / 平台共享 Provider 类型信息进一步降噪
- 关联文档：`docs/design/pages/organization-resource-config.md`
- 内容：继续收口企业侧平台共享 Provider 展示。平台共享卡片与只读详情除了继续隐藏底层模型名外，也不再展示 `OpenAI Compatible` 这类 Provider 类型文案；企业侧只保留平台配置昵称 `route_name`、价格摘要、模态能力和必要状态标识，避免把平台共享能力和底层接入实现混在一起。
- 测试结果：`cd apps/web && npx eslint src/pages/workspace/ResourceConfigPage.tsx` 通过；`cd apps/web && npx vitest run src/pages/workspace/WorkspaceApp.test.tsx -t "renders updated resource configuration wallet and ai overview flows" --reporter=verbose` 通过。
- 后续动作：如后续任务发布页或其他企业侧 Provider 选择器也需要统一该降噪规则，应同步切换为只展示 `route_name + 价格 + 模态能力`。

- 类型：前端交互收口 / AI Provider 页面信息密度提升
- 关联文档：`docs/design/pages/organization-resource-config.md`
- 内容：继续只围绕 `ResourceConfigPage.tsx` 提升 `AI Provider` 页的信息密度。顶部动作条补入共享路由、自配路由和启用数标签；平台共享卡片与企业自配列表卡片统一压缩为更短的扫描结构，减少留白并前置价格摘要；右侧详情区整体缩小卡片内边距，企业自配 Provider 的基础信息、接入信息和运行参数改为更紧凑的双列 `Descriptions`，在同屏内展示更多核心配置。
- 测试结果：`cd apps/web && npx eslint src/pages/workspace/ResourceConfigPage.tsx src/pages/workspace/WorkspaceApp.test.tsx` 通过；`cd apps/web && npx vitest run src/pages/workspace/WorkspaceApp.test.tsx -t "renders updated resource configuration wallet and ai overview flows" --reporter=verbose` 通过。
- 后续动作：后续可继续清理该页遗留的 antd 弃用 warning，并视需要把平台侧 `PlatformApp.tsx` 的 Provider 中心同步到同样的高密度布局。

- 类型：前端交互收口 / AI 调用历史列口径修正
- 关联文档：`docs/design/pages/organization-resource-config.md`
- 内容：资源配置页 `AI 资源` 调用历史表不再在“模型”列暴露底层 `model_name`。该列已改为展示 Provider 配置名，优先读取 `route_name`，没有时回退 `source_label`，避免在企业侧流水里继续暴露模型名。
- 测试结果：待本轮前端定向校验一并确认。
- 后续动作：如后端后续补充独立 `provider_name` 字段，可再把该列切换到明确字段而不是复用 `route_name`。

- 类型：前后端实现 / 资源配置页 AI 钱包划转与统一调用历史
- 关联文档：`docs/design/pages/organization-resource-config.md`、`docs/design/pages/organization-management.md`、`docs/product/REQUIREMENTS_AND_NOTES.md`、`docs/architecture/SYSTEM_ARCHITECTURE.md`、`docs/api/review-ai-export.md`、`docs/planning/TODO.md`
- 内容：继续收敛 `ResourceConfigPage.tsx` 的 AI 资源主视图。前端将 `AI 积分充值` 改为从企业积分钱包向 `AI 调用钱包` 的分步式原子划转，确认阶段必须输入企业现有支付密码；AI 积分充值 Drawer 不再展示微信、支付宝、对公转账或支付金额，请求体只提交 `amount` 与 `payment_password`；`AI 资源` 主表改为单一 `调用历史`，统一展示 `transfer_in / ai_call / adjustment`，不再保留单独的 AI 钱包流水或调用日志主路径入口；AI 钱包摘要旁删除常驻的 `1 积分 = 1 元` 与平台共享数量标签。企业侧 `AI Provider` 同步对平台共享路由降噪，只展示模型、价格与模态能力，右侧详细矩阵仅对企业自配 Provider 展开；资源配置页同步移除 `模型额度` Tab。后端新增 `/api/v1/ai-resources/teams/{team_id}/wallet/transfer-in` 和 `/api/v1/ai-resources/teams/{team_id}/history`，前者负责校验企业钱包支付密码并在同一事务内完成企业钱包扣减、AI 钱包入账和双边流水写入，后者归一化 AI 钱包转入流水与 AI 调用日志供前端单表渲染。
- 测试结果：`cd apps/web && npx vitest run src/pages/workspace/WorkspaceApp.test.tsx -t "renders resource configuration tabs and actions|renders updated resource configuration wallet and ai overview flows" --reporter=verbose` 通过；`pytest apps/api/tests/test_ai_resources_platform_wallet.py -q` 通过，结果为 4 passed；`npm --prefix apps/web run typecheck` 仍被既有 `src/pages/workspace/ReviewQueuePage.tsx` 中 `perspective` 未定义错误阻塞，与本轮资源配置改动无关。
- 后续动作：继续把统一 AI 历史接入更多真实 AI 调用入口，并视后续需求决定是否清理旧 `/wallet/recharge`、`/wallet/ledger` 与 `/calls` 的兼容消费方。

- 类型：前端缺陷修复 / 新建任务草稿编辑与映射下拉
- 关联文档：`docs/design/pages/owner-task-management.md`
- 内容：修复任务管理中新建/修改任务链路的三个问题：模板与数据步骤的 ShowItem 数据映射 Select 下拉改为挂载到 `document.body`，避免被固定表格滚动层盖住；`draft + auto_saved=true` 的自动保存草稿现在进入同一套发布向导并从已有任务 payload 恢复基础信息、模板、数据集、列映射、分发奖励、AI 预审、用户协议和领取配置，避免重新编辑时模板与数据不可修改；旧任务详情基础信息区补齐任务标题、截止日期、任务分类、难度、标签、任务描述的必填标识，与新建任务页保持一致。本次不改变 API shape。
- 测试结果：`cd apps/web && npm run test -- src/pages/workspace/WorkspaceApp.test.tsx -t "publishes an enterprise task|shows row-level question import errors|emits breadcrumb parentOnClick for task management|opens auto-saved task drafts" --testTimeout=30000` 通过，4 passed、52 skipped；`cd apps/web && npm run typecheck` 通过；`cd apps/web && npm run lint` 通过，保留 4 条既有 `react-hooks/exhaustive-deps` warning，无 error；`git diff --check` 通过。
- 后续动作：如后续要求所有普通草稿也统一进入发布向导，需要迁移任务详情中的题目管理、导出和日志能力，避免丢失已发布任务详情页功能。

### 2026-05-31

- 类型：前后端缺陷修复 / 模板选项回车与已发布模板删除
- 关联文档：`docs/product/REQUIREMENTS_AND_NOTES.md`、`docs/api/production.md`、`docs/design/pages/owner-production.md`、`docs/planning/TODO.md`
- 内容：修复模板 Designer 中单选、多选和标签选择的选项编辑框无法通过回车保留换行的问题。前端改为使用 Ant Design `Input.TextArea` 和独立编辑草稿值承载选项文本，schema 保存时仍过滤空行，避免受控 value 因空尾行被过滤而吞掉回车。同步调整模板删除规则：未被任务引用的草稿、已发布或已归档模板均可删除；已被任务引用的模板仍由后端拒绝删除，保障历史任务和提交回放。模板列表表格和卡片操作中，已发布模板同时提供归档和删除入口。
- 测试结果：`cd apps/web && npm run typecheck` 通过；`cd apps/web && npm run lint` 通过，保留 4 条既有 `react-hooks/exhaustive-deps` warning，无 error；`cd apps/web && npm run test -- src/pages/workspace/WorkspaceApp.test.tsx -t "template" --testTimeout=50000` 通过，7 passed、47 skipped；`conda run -n markup-api python -m pytest apps/api/tests/test_auth_team_rbac.py -k "delete_published_template_requires_no_task_references"` 通过，1 passed、78 deselected；`conda run -n markup-api python -m compileall apps/api/app` 通过；`git diff --check` 通过。曾尝试运行更长的 `owner_can_import_dataset_build_template_and_publish_multimodal_task`，该用例在既有标注完成链路 `labels_service.submissions_by_question` 参数错误处失败，非本次模板改动导致。
- 后续动作：如后续提供归档模板列表页，应沿用同一删除规则，并在删除前展示引用统计。

- 类型：前端交互调整 / 人工审核 AI 预审摘要紧凑化
- 关联文档：`docs/design/pages/reviewer-manual-review.md`
- 内容：人工审核详情区的 `AI 预审评分与结果` 从 3 个较大的统计块调整为浅蓝紧凑指标网格，首行展示 Provider、模型、AI job 状态、总分、风险数量和当前轮次；AI 原因改为轻量信息块，维度评分继续使用 Ant Design 小尺寸表格。Provider 名称通过任务 `ai_config.provider_id` 关联当前企业 AI Provider 配置解析，接口不可用或未匹配时回退显示任务配置中的 Provider 信息或未配置状态。本次不改变 API shape，只做前端派生展示。
- 测试结果：`cd apps/web && npm run typecheck` 通过；`cd apps/web && npm run lint` 通过，保留 4 条既有 `react-hooks/exhaustive-deps` warning，无 error；`cd apps/web && npm run test -- src/pages/workspace/WorkspaceApp.test.tsx -t "manual review" --testTimeout=30000` 通过，1 file passed、2 passed、52 skipped；`git diff --check` 通过。
- 后续动作：后端真实 AI Worker 写回 Provider 调用记录后，可进一步在审核详情中展示 request_id、调用成本和 Provider 健康状态。

- 类型：前端交互调整 / 人工审核轮次视角切换
- 关联文档：`docs/design/pages/reviewer-manual-review.md`
- 内容：按人工审核页最新交互设计，移除标题栏中的 `全部阶段 / 初审 / 复审 / 终审` 视角切换控件，改为通过右侧“当前提交审计时间线”的轮次分组切换审核视角。同一轮次内的标注员提交、AI Agent 预审和人工复核日志用浅色虚线框分组，点击分组后中间详情标题和 AI 区域同步显示第一轮初审、第二轮复审或第 N 轮审核视角。随后按验收示意图右侧时间线信息密度，删除轮次分组内的解释性提示小字，改为每条日志展示账号名、提交/操作时间和操作摘要。该调整保持 Ant Design 组件和任务管理浅蓝风格，不改变后端 API shape。
- 测试结果：`cd apps/web && npm run typecheck` 通过；`cd apps/web && npm run lint` 通过，保留 4 条既有 `react-hooks/exhaustive-deps` warning，无 error；`cd apps/web && npm run test -- src/pages/workspace/WorkspaceApp.test.tsx -t "manual review" --testTimeout=30000` 通过，2 passed、52 skipped；`git diff --check` 通过。
- 后续动作：后端后续补齐更完整的 `stage + round` 审计模型后，前端轮次分组可直接承接更多操作类型。

- 类型：前端偏差修正 / 数据生产侧栏顺序恢复
- 关联文档：`docs/design/pages/owner-task-management.md`
- 内容：检查发现此前要求的 Admin/Owner 工作台 `数据生产` 分组顺序在当前代码中回退为 `任务管理 -> 模板搭建 -> 数据集管理`。本轮按设计稿恢复为 `数据集管理 -> 模板搭建 -> 任务管理`，并同步修正动态侧栏定义与 App 内 legacy 导航构造，避免不同入口顺序不一致。新增 `workspaceNavigation` 单测断言 Admin 和 Owner 的数据生产分组顺序，防止后续再回退。
- 测试结果：`cd apps/web && npm run typecheck` 通过；`cd apps/web && npm run test -- src/app/workspaceNavigation.test.tsx --testTimeout=15000` 通过，5 passed；`git diff --check` 通过。
- 后续动作：后续如调整生产链路导航，必须同时更新 `workspaceNavigation.tsx`、相关测试和页面设计稿。

- 类型：协作流程更新 / 分支开发与 main 合并确认规则
- 关联文档：`docs/workflow/DEVELOPMENT_WORKFLOW.md`
- 内容：企业协作流程补充为默认使用个人分支开发，日常小功能、独立 debug 或可验证页面调整完成后及时提交到自己的分支；准备合并或推送到 `main` 前，若遇到同一功能、同一页面、同一 API shape、状态机、权限、设计规范或文档事实来源冲突，必须先总结冲突文件、双方实现、风险和可选方案，再询问负责人确认后处理，不直接替合作者做取舍。
- 测试结果：待执行 `git diff --check` 并随本次前端修复一起提交。
- 后续动作：后续所有 MarkUp 开发任务按该流程执行，小步提交到当前个人分支，合并 main 前遇到功能冲突先汇报确认。

- 类型：前端缺陷修复 / 任务管理多选表格表头层级
- 关联文档：`docs/design/pages/owner-task-management.md`
- 内容：修复任务管理页多选任务后，批量操作栏出现时 Ant Design 表格 body 高度计算失效，导致下方数据渲染区可能压盖固定表头的问题。根因是表格 `scroll.y` 使用了 `--task-batch-bar-height`，但页面未定义该 CSS 变量；本轮为任务管理页补齐默认与多选态批量栏高度，并显式固定批量栏高度，同时给 `workspace-fixed-table` 的表头和 body 设置稳定 flex 层级与 z-index，确保表头始终在数据滚动层上方。
- 测试结果：`cd apps/web && npm run typecheck` 通过；`cd apps/web && npm run lint` 通过，保留 `WorkspaceApp.tsx` 中 3 条既有 `react-hooks/exhaustive-deps` warning，无 error；`git diff --check` 通过。Playwright MCP 登录 Owner 账号后进入任务管理页，勾选 1 条任务，确认 `--task-batch-bar-height=48px`，表头 `z-index=2`、body `z-index=1`，body 顶部与表头底部相接且 `overlap=false`。
- 后续动作：继续保持任务管理列表的固定视口规则，后续若批量栏内容增加，需要同步调整批量栏固定高度或改为可预测的单行操作布局。

- 类型：偏差修正 / 恢复任务发布页面本地改动
- 关联文档：`docs/design/pages/owner-task-management.md`
- 内容：拉取远端和冲突处理后，发现此前任务管理与新建任务页面的部分调试改动被回退。本轮从本地 stash 中恢复任务发布相关前端与页面设计稿改动，包括基础信息必填标记与发布阻塞、模板与数据选择区固定展示、分发与奖励中的资质领域选项、积分奖励手续费派生展示、任务状态统计固定口径、批量操作表头遮挡修复、删除草稿确认框居中，以及任务详情标题栏与统计栏紧贴等页面细节。
- 测试结果：`cd apps/web && npm run typecheck` 通过；`cd apps/web && npm run lint` 通过，保留 `WorkspaceApp.tsx` 中 3 条既有 `react-hooks/exhaustive-deps` warning，无 error；`git diff --check` 通过。
- 后续动作：本次恢复内容提交到独立开发分支，后续通过分支合并回 `main`，避免继续直接在主分支叠加多人改动。

- Type: backend audit scope fix / hide global logs from organization detail
- Related docs: `docs/api/review-ai-export.md`
- Details: During the audit scope sweep, the organization-level audit detail route filtered list/export by team but returned any audit log whose `team_id` was empty. A team admin who knew a global/user audit log id could read sensitive teamless logs through `/api/v1/audit-logs/{log_id}`. The detail route now treats teamless logs as not found for organization-level access and still validates current `X-Team-ID` for team-scoped logs.
- Test results: First ran `python -m pytest apps/api/tests/test_audit_log_scope.py -q` and reproduced the leak with `200 OK`; after the fix, the targeted test passed with `404`.
- Follow-up: Continue the audit/export sweep around detail/export audit records and any platform-level audit surface separation; per user instruction, commit only and do not push.

- Type: backend notification visibility fix / personal state active membership
- Related docs: `docs/api/review-ai-export.md`
- Details: During the notification visibility sweep, personal notification state updates trusted `target_user_ids` before checking active team membership. A user who had been removed from a team but still knew a member-targeted notification id could call `/api/v1/notifications/my/{notification_id}/state` and mark that team notification as read or handled. Visibility now requires an active membership in the notification's team before member/role/team targeting is considered.
- Test results: First ran `python -m pytest apps/api/tests/test_notification_management_permissions.py -q` and reproduced the bug with the removed user receiving `200 OK`; after the fix, the targeted suite passed and the removed user received `404` without mutating `read_by`.
- Follow-up: Continue the notification sweep around task-target recipient aggregation, revoke/delete audit details, and automatic notification producers; per user instruction, commit only and do not push.

- Type: backend notification permission fix / management list visibility
- Related docs: `docs/api/review-ai-export.md`
- Details: During the export/upload/audit/notification sweep, the team notification management list used only `team:read`. Because reviewer and labeler team roles also have `team:read`, they could open `GET /api/v1/notifications?team_id=...` and see all team notifications, including member-targeted notices not addressed to them. The management list now requires `member:read`; ordinary recipients must use `/notifications/my`, which already filters by actual visibility.
- Test results: First ran `python -m pytest apps/api/tests/test_notification_management_permissions.py -q` and reproduced the leak with `200 OK`; after the fix, the same targeted test passed with `403`.
- Follow-up: Continue the notification sweep around revoke/delete/list audit details and task-target recipient aggregation; per user instruction, commit only and do not push.

- Type: backend review reward fix / task-total reward settlement
- Related docs: `docs/api/labeling.md`, `docs/api/production.md`, `docs/api/team-profile.md`
- Details: During the production and review-chain sweep, task-total rewards (`reward_rule.mode=task`, `total_points`) were not interpreted by the per-submission settlement path. Review approval succeeded but `review_reward_points` ignored `total_points`, so no labeler wallet or ledger entry was created for task-total reward configurations. Marketplace `unit_points` and review settlement now share the same reward-unit calculation: item rewards use `points_per_item`/`unit_points`, while task-total rewards divide `total_points` by the task question count.
- Test results: First ran `python -m pytest apps/api/tests/test_review_task_reward_points.py -q` and reproduced the missing wallet/ledger settlement; after the fix, the targeted test passed and verified a 20-point, 2-question task settles 10 points for the approved submission.
- Follow-up: Continue reviewing reward reservation and final task settlement semantics, especially non-divisible task-total rewards and finish-time reserved-point release; per user instruction, commit only and do not push.

- Type: backend AI resource permission fix / platform provider global-only management
- Related docs: `docs/api/review-ai-export.md`
- Details: During the global-vs-team permission sweep, AI Resources still used merged `current.permissions` to decide platform management. A normal team member with custom team-scoped `platform:manage` and `ai_provider:manage` permissions could receive `team_can_manage=true` for a platform shared Provider and mutate the platform Provider while sending `X-Team-ID`. Platform Provider management checks and `team_can_manage` now use global permissions only, preserving team-side read-only visibility for platform shared routes.
- Test results: First ran `python -m pytest apps/api/tests/test_ai_resources_platform_permissions.py -q` and reproduced the bug with the platform Provider mutation being allowed; after the fix, the same targeted test passed and the mutation returned `403`.
- Follow-up: Continue the sweep with any remaining platform-only surfaces that consume merged permissions; per user instruction, commit only and do not push.

- Type: backend platform/profile permission fix / global-only platform operations
- Related docs: `docs/api/team-profile.md`
- Details: During the security and permission sweep, profile-side platform operations still used merged `current.permissions`. A normal user with team-scoped custom `platform:manage` or `certification:review` permissions could send `X-Team-ID` and access platform-only profile actions such as manual point adjustments, certification review queue, or cross-user certification material download. Profile platform operations now use global role permissions only, so team membership permissions cannot elevate a user into platform operations.
- Test results: First ran `python -m pytest apps/api/tests/test_platform_profile_permissions.py -q` and reproduced the bug with `/api/v1/profile/points` returning `200 OK`; after the fix, the same targeted test passed.
- Follow-up: Continue the sweep with remaining global-vs-team permission boundaries, especially any platform-only surfaces that still consume merged permissions; per user instruction, commit only and do not push.

- Type: backend upload permission fix / team-scoped upload and download permissions
- Related docs: `docs/api/review-ai-export.md`, `docs/api/team-profile.md`
- Details: During the export/upload/audit/notification sweep, the team upload and download routes checked `current.permissions`, which merges global role permissions with the current team membership. A user with global `owner` permissions but only `labeler` membership in the current team could upload team files and download existing team files. The routes now check `current.team_permissions` so team files require permissions granted by the current `X-Team-ID` membership: `task:manage` for upload and `task:read` for download.
- Test results: First ran `python -m pytest apps/api/tests/test_auth_team_rbac.py -k "team_upload_uses_team_scoped_manage_permission"` and reproduced the bug with upload returning `200 OK`; after the fix, `python -m pytest apps/api/tests/test_auth_team_rbac.py -k "team_upload_download_requires_file_read_permission or team_upload_uses_team_scoped_manage_permission"` passed.
- Follow-up: Continue the sweep with any remaining upload type/size edge cases or move to frontend workbench experience if no more provable backend upload/audit deviations are found; per user instruction, commit only and do not push.

- Type: backend audit permission fix / organization audit log boundary
- Related docs: `docs/api/review-ai-export.md`, `docs/design/pages/organization-audit-logs.md`, `docs/design/pages/organization-management.md`
- Details: During the export/upload/audit/notification sweep, organization audit logs were documented as an Owner / Team Admin governance surface, while Reviewer access should be limited to reviewer-related audit scope. The `/api/v1/audit-logs` list/detail/export routes only required `task:read`, so a team Reviewer could read member/permission audit records and export organization logs. The routes now require `team:manage`, preserving existing team scoping and audit export logging for authorized users.
- Test results: First ran `python -m pytest apps/api/tests/test_auth_team_rbac.py -k "reviewer_cannot_access_organization_audit_logs"` and reproduced the bug with the list endpoint returning `200 OK`; after the fix, `python -m pytest apps/api/tests/test_auth_team_rbac.py -k "reviewer_cannot_access_organization_audit_logs or audit_log_list_defaults_to_current_team_scope"` passed.
- Follow-up: Continue the export/upload/audit/notification sweep with upload scope/type checks and any remaining audit download edge cases; per user instruction, commit only and do not push.

- Type: backend export permission fix / result export manage boundary
- Related docs: `docs/api/review-ai-export.md`, `docs/product/REQUIREMENTS_AND_NOTES.md`, `docs/design/pages/owner-task-management.md`
- Details: During the export/upload/audit/notification sweep, formal result export was documented and designed as an Owner / Team Admin task-management capability, but `/api/v1/exports` only required `task:read`. A team Reviewer has `task:read`, so they could create a result export and download a file containing submitted answers. The export routes now require `task:manage` for create/list/detail/download/cancel, preserving team scoping and existing export audit behavior.
- Test results: First ran `python -m pytest apps/api/tests/test_auth_team_rbac.py -k "reviewer_cannot_create_or_download_task_result_exports"` and reproduced the bug with reviewer export creation returning `200 OK`; after the fix the same test passed.
- Follow-up: Continue the export/upload/audit/notification sweep with audit-log export permissions and upload scope checks; per user instruction, commit only and do not push.

- Type: backend notification bug fix / team notification recipient visibility
- Related docs: `docs/api/review-ai-export.md`
- Details: During the export/upload/audit/notification sweep, `POST /api/v1/notifications/{notification_id}/state` already rejected cross-team notifications, but same-team notifications did not verify that the current user was an actual recipient. A reviewer could mark an owner-only or otherwise hidden notification as read/handled, mutating `read_by` / `handled_by` for a notification that was not visible in that user's mailbox. The route now keeps the existing cross-team permission check and then reuses notification visibility rules before applying per-user state.
- Test results: First ran `python -m pytest apps/api/tests/test_auth_team_rbac.py -k "team_notification_state_update_rejects_hidden_recipient_without_side_effect"` and reproduced the bug with `200 OK`; after the fix the same test passed. Also ran `python -m pytest apps/api/tests/test_auth_team_rbac.py -k "personal_inbox_filters_visible_notifications_and_updates_state or team_notification_state_update_rejects_cross_team_without_side_effect or team_notification_state_update_rejects_hidden_recipient_without_side_effect or team_mark_all_read_only_updates_visible_notifications"` with 4 passed.
- Follow-up: Continue the export/upload/audit/notification sweep, prioritizing export download audit details, upload scope checks, and notification list visibility. Per user instruction, continue to commit only and do not push.

- 类型：后端标注链路权限修复 / 非 Labeler 领取题包
- 关联文档：`docs/api/labeling.md`
- 内容：标注与审核链路巡检发现，`POST /api/v1/labels/tasks/{task_id}/claim` 文档要求 Labeler 登录后领取题包，但路由只使用 `get_current_user` 校验登录态，没有要求 `label:read`/Labeler 权限，导致企业 admin/user 等非标注账号也能领取公开任务并写入题目分配与 submission 草稿。现在领取接口改为 `require_permissions("label:read")`，非 Labeler 在进入领取逻辑前被拒绝，避免污染题目领取状态和标注提交链路。
- 测试结果：先运行 `python -m pytest apps/api/tests/test_auth_team_rbac.py -k "non_labeler_cannot_claim_public_task_bundle"` 复现失败，admin 领取公开题包返回 200；修复后运行 `python -m pytest apps/api/tests/test_auth_team_rbac.py -k "non_labeler_cannot_claim_public_task_bundle or task_claim_audit_log_is_visible_in_team_scope"` 通过，结果为 2 passed、72 deselected。继续运行 `python -m pytest apps/api/tests/test_config_security.py` 通过，结果为 10 passed；`python -m pytest apps/api/tests/test_auth_team_rbac.py` 通过，结果为 74 passed；`python -m compileall apps/api/app` 通过。
- 后续动作：下一轮继续轮转到导出、上传、审计、通知方向，优先看下载审计、上传权限和通知可见范围；本地仍按用户要求只 commit 不 push。

- 类型：后端生产链路修复 / 任务发布模板版本绑定
- 关联文档：`docs/api/production.md`
- 内容：生产链路巡检发现，任务发布 readiness 文案和文档都要求任务绑定“已发布模板版本”，用于发布后通过 `template_version_id` 回放历史 schema；但 `get_task_readiness` 在找不到任务绑定版本时会回退检查当前模板 `status=published`，导致缺失 `template_version_id` 的草稿任务仍可发布，发布后无法证明绑定到固定模板快照。现在发布检查只接受同企业已发布的绑定模板版本，不再用当前模板状态兜底。
- 测试结果：先运行 `python -m pytest apps/api/tests/test_auth_team_rbac.py -k "publish_task_requires_bound_published_template_version"` 复现失败，缺失 `template_version_id` 的任务发布返回 200；修复后运行 `python -m pytest apps/api/tests/test_auth_team_rbac.py -k "publish_task_requires_bound_published_template_version or publish_blocks_unmapped_show_item_readiness or approve_pending_review_task_rechecks_readiness"` 通过，结果为 3 passed、70 deselected。继续运行 `python -m pytest apps/api/tests/test_config_security.py` 通过，结果为 10 passed；`python -m compileall apps/api/app` 通过。按默认门禁运行 `python -m pytest apps/api/tests/test_auth_team_rbac.py` 时，当前脏工作区中的资源/平台钱包改动仍导致 6 个积分/资源相关用例失败（67 passed），与本次模板版本绑定修复无关。
- 后续动作：下一轮继续轮转到标注与审核链路，优先看领取并发/额度、提交校验和 AI 预审入队幂等；本地仍按用户要求只 commit 不 push。

- 类型：后端权限修复 / 审核队列全局 reviewer 权限回退
- 关联文档：`docs/api/review-ai-export.md`
- 内容：企业作用域与权限巡检发现，人工审核文档要求 `/reviews` 必须携带当前 `X-Team-ID`，且不能回退使用全局 reviewer 权限；但 `can_access_review_task(..., assigned_only=false)` 只检查合并后的 `current.permissions`，导致全局角色为 `reviewer`、但在当前企业只是 `labeler` 的用户可以看到该企业未分配审核提交。现在未分配审核队列只允许当前企业角色为 `reviewer` 且具备企业内 `submission:view` 权限的成员读取，Team Admin / Owner 仍走原有企业范围分支。
- 测试结果：先运行 `python -m pytest apps/api/tests/test_auth_team_rbac.py -k "review_queue_unassigned_view_requires_team_reviewer_role"` 复现失败，返回队列包含未授权 submission；修复后运行 `python -m pytest apps/api/tests/test_auth_team_rbac.py -k "review_queue_requires_team_scope_for_unassigned_view or review_queue_unassigned_view_requires_team_reviewer_role"` 通过，结果为 2 passed、70 deselected。继续运行 `python -m pytest apps/api/tests/test_config_security.py` 通过，结果为 10 passed；`python -m compileall apps/api/app` 通过。按默认门禁运行 `python -m pytest apps/api/tests/test_auth_team_rbac.py` 时，当前脏工作区中的资源/平台钱包改动仍导致 6 个积分/资源相关用例失败（66 passed），与本次审核队列权限修复无关。
- 后续动作：下一轮继续轮转到生产链路或标注审核链路，优先看发布状态机、提交校验和审核入队幂等；本地仍按用户要求只 commit 不 push。

- 类型：后端安全修复 / 生产 pepper 配置强校验
- 关联文档：`docs/operations/DEPLOYMENT.md`
- 内容：生产配置安全巡检发现，部署文档要求生产环境设置 `PASSWORD_PEPPER` 与 `VERIFICATION_CODE_PEPPER` 且至少 32 字节，但 `Settings` 在 `ENVIRONMENT=production|prod` 时只强制校验 `SECRET_KEY` 和 `COOKIE_SECURE`，缺失 pepper 仍可启动，削弱密码哈希和邮箱验证码 HMAC 的独立密钥边界。现在生产配置会同时拒绝缺失或短于 32 字节的 `PASSWORD_PEPPER` 与 `VERIFICATION_CODE_PEPPER`。
- 测试结果：先运行 `python -m pytest apps/api/tests/test_config_security.py -k "pepper"` 复现失败，缺失 pepper 未触发 `ValidationError`；修复后同一筛选用例通过，结果为 2 passed、8 deselected。继续运行 `python -m pytest apps/api/tests/test_config_security.py` 通过，结果为 10 passed；`python -m compileall apps/api/app` 通过；`git diff --check` 通过，仅提示既有 CRLF 转换。按后端默认门禁运行 `python -m pytest apps/api/tests/test_auth_team_rbac.py` 时，当前脏工作区中的资源/平台钱包改动导致 6 个积分/资源相关用例失败（65 passed），与本次配置校验修复无关。
- 后续动作：继续认证与安全边界轮次，优先覆盖 cookie/CORS 组合、敏感配置回显和 OAuth ticket 消费幂等；本地仍按用户要求只 commit 不 push。

- 类型：后端安全修复 / OAuth 补绑邮箱停用账号绕过
- 关联文档：`docs/api/auth.md`
- 内容：认证安全边界巡检发现，`POST /api/v1/auth/oauth/bind-email` 的 existing-user 分支在邮箱验证码通过后，会直接绑定第三方身份、将 `email_verified` 置为 true 并签发新会话，没有继续校验目标 MarkUp 用户是否仍为 `status=active`。停用账号只要能完成邮箱验证码，就可绕过普通登录和已绑定 OAuth 换票的停用校验重新登录。现在该分支在绑定前补齐 `status=active` 校验，停用账号返回 `40101`，且不创建 OAuthIdentity。
- 测试结果：先运行 `python -m pytest apps/api/tests/test_auth_team_rbac.py -k "oauth_bind_email_rejects_inactive_existing_user"` 复现失败，接口返回 `200 OK`；修复后同一用例通过。`python -m pytest apps/api/tests/test_auth_team_rbac.py -k "oauth_bind_email"` 通过，结果为 2 passed、69 deselected；`python -m pytest apps/api/tests/test_config_security.py` 通过，结果为 8 passed；`python -m compileall apps/api/app` 通过；`git diff --check` 通过，仅提示 CRLF。当前全量 `python -m pytest apps/api/tests/test_auth_team_rbac.py` 受工作区既有未提交的积分/资源钱包改动影响，仍有 5 个积分预扣、提现余额和审核扣款相关用例失败，与本轮 OAuth 补绑邮箱修复无关。
- 后续动作：继续认证与安全边界轮次，优先覆盖 OAuth ticket 消费幂等、邮箱验证码失败次数和 cookie/CORS 生产配置；本地仍按用户要求只 commit 不 push。

- 类型：后端安全修复 / OAuth 补绑邮箱静默建号
- 关联文档：`docs/product/REQUIREMENTS_AND_NOTES.md`、`docs/api/auth.md`
- 内容：认证安全边界巡检发现，`POST /api/v1/auth/oauth/bind-email` 在 OAuth ticket 尚未绑定 MarkUp 用户且邮箱不存在时，仍会自动创建 `labeler` 账号、绑定第三方身份并签发会话，违反“OAuth 首登不得自动创建新用户，必须显式选择绑定已有账号或注册新账号”的基线。现在补绑邮箱接口只允许绑定已有 MarkUp 用户；邮箱不存在时返回 `42201`，前端需走 `/auth/oauth/register-account` 显式注册流程。
- 测试结果：先运行 `python -m pytest apps/api/tests/test_auth_team_rbac.py -k "oauth_bind_email_does_not_auto_create_unlinked_account"` 复现失败，接口返回 `200 OK` 并创建账号；修复后同一用例通过。`python -m pytest apps/api/tests/test_config_security.py` 通过，结果为 8 passed；`python -m pytest apps/api/tests/test_auth_team_rbac.py` 通过，结果为 70 passed、10 warnings；`python -m compileall apps/api/app` 通过；`git diff --check` 通过，仅提示 CRLF。Warnings 为既有 FastAPI `on_event`、`datetime.utcnow()` 和 passlib/argon2 deprecation 提示。
- 后续动作：继续认证与安全边界轮次，优先覆盖 OAuth ticket 消费幂等、邮箱验证码失败次数与生产 cookie/CORS 配置；本地仍按用户要求只 commit 不 push。

- 类型：后端安全修复 / 撤销其他会话当前 session 绑定
- 关联文档：`docs/api/auth.md`
- 内容：认证安全边界巡检发现，`POST /api/v1/auth/sessions/revoke-others` 只校验请求里的 refresh token 属于当前用户且未失效，没有校验它是否与当前 bearer access token 的 `sid` 指向同一条 `RefreshSession`。同一用户若携带另一设备的 refresh token 调用，会保留另一设备会话并撤销真正的当前会话，和“撤销除当前会话外其他会话”的语义相反。现在接口将当前 access session id 传入服务层，并要求 refresh token session 与 access `sid` 完全一致，不匹配时返回 `40101` 且不撤销任何会话。
- 测试结果：先运行 `python -m pytest apps/api/tests/test_auth_team_rbac.py -k "revoke_other_sessions_rejects_same_user_refresh_token_from_other_session"` 复现失败，接口返回 `200 OK`；修复后同一用例通过。`python -m pytest apps/api/tests/test_auth_team_rbac.py -k "revoke_other_sessions"` 通过，结果为 3 passed、66 deselected；`python -m pytest apps/api/tests/test_config_security.py` 通过，结果为 8 passed；`python -m pytest apps/api/tests/test_auth_team_rbac.py` 通过，结果为 69 passed、10 warnings；`python -m compileall apps/api/app` 通过；`git diff --check` 通过，仅提示 CRLF。Warnings 为既有 FastAPI `on_event`、`datetime.utcnow()` 和 passlib/argon2 deprecation 提示。
- 后续动作：继续认证与安全边界轮次，优先覆盖 refresh rotation、OAuth ticket intent、密码/邮箱验证码与 cookie/CORS 生产配置；遇到已被未提交工作区改动覆盖的前端问题时，避免混入同一提交。

- 类型：前端缺陷修复 / refresh 网络异常连接状态
- 关联文档：`docs/api/auth.md`
- 内容：前端工作台体验巡检发现，认证请求收到 `40102` 后会自动调用 `/auth/refresh`，但 refresh 请求自身发生网络异常时，`refreshStoredSession` 只清理本地 session，没有调用连接状态追踪，导致断网状态仍显示为 `connected`。现在 refresh 的网络异常 catch 分支复用 `trackErrorConnectivity`，保持会话失效与离线状态同步。
- 测试结果：先运行 `npm.cmd run test -- --run src/services/apiClient.test.ts -t "marks connectivity as disconnected when the refresh request fails on the network"` 复现失败，`getConnectivityStatus()` 仍为 `connected`；修复后同一用例通过。`npm.cmd run test -- --run src/services/apiClient.test.ts` 通过，结果为 10 passed；`.\\node_modules\\.bin\\eslint.cmd src/services/apiClient.ts src/services/apiClient.test.ts` 通过；`npm.cmd run typecheck` 通过；`npm.cmd run build` 通过，保留既有 exceljs direct eval 与 chunk size warning；`git diff --check` 通过，仅提示 CRLF。全量 `npm.cmd run lint` 仍被既有 `ResourceConfigPage.tsx` 未使用符号挡住；全量 `npm.cmd run test -- --run` 仍有既有 `WorkspaceApp.test.tsx` 资源配置用例失败，与本轮 `apiClient` 修复无关。
- 后续动作：下一轮继续前端工作台体验方向，优先单独处理 `ResourceConfigPage.tsx` lint 残留或 `WorkspaceApp.test.tsx` 资源配置用例回归；涉及 Ant Design UI 组件时先阅读 Ant Design 文档。

- 类型：后端上传修复 / 个人头像上传 MIME 类型约束
- 关联文档：`docs/api/team-profile.md`
- 内容：导出、上传、审计、通知轮次巡检发现，无 `X-Team-ID` 且 `category=image` 的 `/api/v1/uploads` 头像上传窄口只按分类进入 `profile:{user_id}` 作用域，但未校验文件 MIME，导致 PDF 等非图片文件也可作为个人头像上传并生成下载 URL，违反头像上传应返回可直接展示 `data:image/*` 的边界。现在个人头像上传仅接受 JPG、PNG 或 GIF，非图片直接返回 `40003`，企业文件和个人资质材料上传规则不变。
- 测试结果：先运行 `python -m pytest apps/api/tests/test_auth_team_rbac.py -k "profile_avatar_upload_rejects_non_image_file"` 复现失败，PDF 头像上传返回 `200 OK`；修复后同一用例通过，结果为 1 passed、67 deselected。`python -m pytest apps/api/tests/test_config_security.py` 通过，结果为 8 passed；`python -m pytest apps/api/tests/test_auth_team_rbac.py` 通过，结果为 68 passed、10 warnings；`python -m compileall apps/api/app` 通过；`git diff --check` 通过，仅提示本次修改文件后续会按 Git 设置从 LF 转为 CRLF。Warnings 为既有 FastAPI `on_event`、`datetime.utcnow()` 和 passlib/argon2 deprecation 提示。
- 后续动作：下一轮按 sweep 顺序进入前端工作台体验，优先覆盖 auth refresh retry、权限回退、真实错误提示和加载态；涉及 UI/Ant Design 组件时先阅读 Ant Design 文档。

- 类型：后端通知修复 / 企业全部已读可见范围过滤
- 关联文档：`docs/api/review-ai-export.md`
- 内容：导出、上传、审计、通知轮次巡检发现，`POST /api/v1/notifications/mark-all-read?team_id=...` 会把当前用户加入该企业所有通知的 `read_by`，包括只分发给其他角色或成员的通知，污染未分发通知的阅读状态和统计。现在企业全部已读会复用通知可见性判断，仅更新当前用户在该企业内实际可见的通知，并忽略已删除通知。
- 测试结果：先运行 `python -m pytest apps/api/tests/test_auth_team_rbac.py -k "team_mark_all_read_only_updates_visible_notifications"` 复现失败，Reviewer 标记已读时更新了 owner-only 通知；修复后同一用例通过，结果为 1 passed、66 deselected。额外验证 `python -m pytest apps/api/tests/test_auth_team_rbac.py -k "personal_inbox_filters_visible_notifications"` 通过。`python -m pytest apps/api/tests/test_config_security.py` 通过，结果为 8 passed；`python -m pytest apps/api/tests/test_auth_team_rbac.py` 通过，结果为 67 passed、10 warnings；`python -m compileall apps/api/app` 通过；`git diff --check` 通过，仅提示本次修改文件后续会按 Git 设置从 LF 转为 CRLF。Warnings 为既有 FastAPI `on_event`、`datetime.utcnow()` 和 passlib/argon2 deprecation 提示。
- 后续动作：下一轮继续导出、上传、审计、通知，优先覆盖上传大小/类型、导出下载审计和通知列表可见范围；若暂时找不到可证明偏差，则按 sweep 顺序进入前端工作台体验。

- 类型：后端审计修复 / 任务领取审计日志企业作用域
- 关联文档：`docs/api/labeling.md`、`docs/api/review-ai-export.md`
- 内容：导出、上传、审计、通知轮次巡检发现，Labeler 领取任务成功后写入 `task_bundle_claimed` 审计日志时未携带 `team_id`，导致 Team Admin / Owner 使用当前 `X-Team-ID` 查询 `/audit-logs` 时看不到该关键任务操作。现在领取审计写入明确使用任务所属 `team_id`，企业作用域操作日志可追踪领取人、领取数量和协议勾选状态。
- 测试结果：先运行 `python -m pytest apps/api/tests/test_auth_team_rbac.py -k "task_claim_audit_log_is_visible_in_team_scope"` 复现失败，领取成功后企业审计列表返回 0 条；修复后同一用例通过，结果为 1 passed、65 deselected。`python -m pytest apps/api/tests/test_config_security.py` 通过，结果为 8 passed；`python -m pytest apps/api/tests/test_auth_team_rbac.py` 通过，结果为 66 passed、9 warnings；`python -m compileall apps/api/app` 通过；`git diff --check` 通过，仅提示本次修改文件后续会按 Git 设置从 LF 转为 CRLF。Warnings 为既有 FastAPI `on_event`、`datetime.utcnow()` 和 passlib/argon2 deprecation 提示。
- 后续动作：下一轮继续导出、上传、审计、通知，优先覆盖上传大小/类型、导出下载审计、通知可见范围；若暂时找不到可证明偏差，则按 sweep 顺序进入前端工作台体验。

- 类型：后端状态机修复 / 待审核草稿基线锁定
- 关联文档：`docs/api/labeling.md`、`docs/api/review-ai-export.md`
- 内容：标注与审核链路巡检发现，`PUT /api/v1/labels/questions/{question_id}/draft` 对已处于 `submitted` 待审核状态的题目仍会写入 `submissions.draft`。由于当前审核 diff 使用 `submission.draft -> submission.answers` 生成字段差异，标注员可在提交后改写审核对比基线，影响 Reviewer 判断。现在草稿保存入口会在写入前检查题目或既有提交是否已为 `submitted`，命中时返回 `40902`；`draft` 草稿保存和 `rejected` 后继续编辑重提仍保留。
- 测试结果：先运行 `python -m pytest apps/api/tests/test_auth_team_rbac.py -k "labeler_cannot_edit_draft_after_submission_before_review"` 复现失败，提交后保存草稿返回 `200 OK`；修复后同一用例通过，结果为 1 passed、64 deselected。额外验证 `python -m pytest apps/api/tests/test_auth_team_rbac.py -k "labeler_can_view_rejection_and_resubmit"` 通过。`python -m pytest apps/api/tests/test_config_security.py` 通过，结果为 8 passed；`python -m pytest apps/api/tests/test_auth_team_rbac.py` 通过，结果为 65 passed、9 warnings；`python -m compileall apps/api/app` 通过；`git diff --check` 通过，仅提示本次修改文件后续会按 Git 设置从 LF 转为 CRLF。Warnings 为既有 FastAPI `on_event`、`datetime.utcnow()` 和 passlib/argon2 deprecation 提示。
- 后续动作：下一轮继续标注与审核链路，优先覆盖领取并发/额度、AI 预审入队幂等；若暂时找不到可证明偏差，则按 sweep 顺序进入导出、上传、审计、通知。

- 类型：后端状态机修复 / 待审核答案重复提交覆盖保护
- 关联文档：`docs/api/labeling.md`
- 内容：标注与审核链路巡检发现，`POST /api/v1/labels/questions/{question_id}/submit` 对已处于 `submitted` 待审核状态的题目仍会再次写入 `answers/draft/submitted_at`，导致标注员可在 Reviewer 审核前覆盖待审核答案。现在提交入口会在校验和写入前检查题目或既有提交是否已为 `submitted`，命中时返回 `40902`，仅保留 `rejected -> submitted` 的打回重提路径。
- 测试结果：先运行 `python -m pytest apps/api/tests/test_auth_team_rbac.py -k "labeler_cannot_overwrite_submitted_answer_before_review"` 复现失败，重复提交返回 `200 OK`；修复后同一用例通过，结果为 1 passed、63 deselected。额外验证 `python -m pytest apps/api/tests/test_auth_team_rbac.py -k "labeler_can_view_rejection_and_resubmit"` 通过，确认打回重提未受影响。`python -m pytest apps/api/tests/test_config_security.py` 通过，结果为 8 passed；`python -m pytest apps/api/tests/test_auth_team_rbac.py` 通过，结果为 64 passed、9 warnings；`python -m compileall apps/api/app` 通过；`git diff --check` 通过，仅提示本次修改文件后续会按 Git 设置从 LF 转为 CRLF。Warnings 为既有 FastAPI `on_event`、`datetime.utcnow()` 和 passlib/argon2 deprecation 提示。
- 后续动作：下一轮继续标注与审核链路，优先覆盖领取并发/额度、草稿状态约束、AI 预审入队幂等；若暂时找不到可证明偏差，则按 sweep 顺序进入导出、上传、审计、通知。

- 类型：后端权限修复 / 人工审核队列企业作用域校验
- 关联文档：`docs/api/review-ai-export.md`
- 内容：标注与审核链路巡检发现，`GET /api/v1/reviews/queue?assigned_only=false` 在缺少 `X-Team-ID` 时会回退使用全局 reviewer 的 `submission:view` 权限，导致 reviewer 可能枚举跨企业待审核提交。现在人工审核队列、统计、详情、diff、历史和审核提交路径都会先要求当前企业作用域，且底层任务访问判断不再允许无企业上下文回退，确保 `assigned_only=false` 也只在当前企业内放宽分配范围。
- 测试结果：先运行 `python -m pytest apps/api/tests/test_auth_team_rbac.py -k "review_queue_requires_team_scope"` 复现失败，接口返回 `200 OK`；修复后同一用例通过，结果为 1 passed、62 deselected。`python -m pytest apps/api/tests/test_config_security.py` 通过，结果为 8 passed；`python -m pytest apps/api/tests/test_auth_team_rbac.py` 通过，结果为 63 passed、9 warnings；`python -m compileall apps/api/app` 通过；`git diff --check` 通过，仅提示本次修改文件后续会按 Git 设置从 LF 转为 CRLF。Warnings 为既有 FastAPI `on_event`、`datetime.utcnow()` 和 passlib/argon2 deprecation 提示。
- 后续动作：下一轮继续标注与审核链路，优先覆盖领取并发/额度、草稿提交状态约束、打回重提和 AI 预审入队幂等；若标注审核暂时找不到可证明偏差，则按 sweep 顺序进入导出、上传、审计、通知。

- 类型：后端安全修复 / 登出 refresh session 与当前 access sid 绑定校验
- 关联文档：`docs/api/auth.md`、`docs/product/REQUIREMENTS_AND_NOTES.md`
- 内容：修复 `POST /auth/logout` 显式携带 refresh token 时只校验同一用户、未校验该 refresh session 是否为当前 bearer access token 绑定 `sid` 的问题。此前同一用户打开两个会话后，可以用会话 A 的 access token 携带会话 B 的 refresh token 调用 logout，接口返回成功并撤销 B，但 A 的 access token 仍然有效，造成“登出成功但当前会话未失效”的安全边界偏差；现在显式 refresh token 必须匹配当前 access token 的 `sid`，否则返回 `40101` 且不撤销其他会话。
- 测试结果：先运行 `python -m pytest apps/api/tests/test_auth_team_rbac.py -k "logout_rejects_same_user_refresh_token_from_other_session"` 复现失败，接口返回 `200 OK`；修复后同一用例通过，结果为 1 passed、58 deselected；`python -m pytest apps/api/tests/test_config_security.py` 通过，结果为 8 passed；`python -m pytest apps/api/tests/test_auth_team_rbac.py` 通过，结果为 59 passed、9 warnings；`python -m compileall apps/api/app` 通过；`git diff --check` 通过，仅提示本次修改文件后续会按 Git 设置从 LF 转为 CRLF。warnings 为既有 FastAPI `on_event`、`datetime.utcnow()` 与 passlib/argon2 deprecation 提示。
- 后续动作：下一轮按 sweep 顺序进入企业作用域与权限，继续覆盖 `Authorization + X-Team-ID`、路径 team_id 与 header 一致性、RBAC 边界和系统 Agent 只读约束。

- 类型：前端缺陷修复 / 工作台非法 page query URL 回退修正
- 关联文档：`docs/product/REQUIREMENTS_AND_NOTES.md`、`docs/design/pages/owner-production.md`
- 内容：修复已登录用户访问 `/workspace?page=...` 且 `page` 为未知页面 ID 时只在内容层回退默认页、但地址栏仍保留非法 query 的问题。此前 `/workspace?page=not-real` 会渲染当前身份默认工作台页面，却不按基线要求用 `replace` 修正 URL，导致刷新、复制链接或后续导航仍携带不可访问页面参数；现在 query 解析会记录请求是否显式携带 `page`，无效或无权页面都会统一回退到当前身份默认页并生成规范 URL。
- 测试结果：先运行 `npm.cmd run test -- --run src/app/App.test.tsx -t "replaces invalid workspace page query"` 复现失败，地址栏仍为 `?page=not-real`；修复后同一用例通过，结果为 1 passed、8 skipped。`npm.cmd run typecheck` 通过；`npm.cmd run lint` 通过，保留既有 `WorkspaceApp.tsx` hook dependency warnings；`npm.cmd run test -- --run` 初次暴露两个既有 Ant Design 长流程用例在 10s 单测上限下超时，单独用 30s 上限验证通过，因此将 Vitest 全局 `testTimeout` 调整为 15s 后标准全量命令通过，结果为 10 files、122 passed、1 skipped；`npm.cmd run build` 通过，保留既有 `exceljs` eval 与 chunk size warning；`git diff --check` 通过，仅提示本次修改文件后续会按 Git 设置从 LF 转为 CRLF。jsdom `getComputedStyle`、canvas 与 navigation 提示为既有测试环境限制。
- 后续动作：下一轮按 sweep 顺序回到认证与安全边界，优先继续覆盖 refresh rotation、OAuth ticket、邮箱验证码、生产 cookie/CORS 与敏感信息泄露。

- 类型：前端偏差修正 / 工作台侧栏响应式阈值
- 关联文档：`docs/design/FRONTEND_DESIGN_STYLE.md`
- 内容：拉取远端后发现工作台侧栏在 `max-width: 900px` 时会切换为顶部横向导航，普通桌面分屏或较窄浏览器窗口下 Reviewer 人工审核侧栏会表现为“消失”。本轮将 AppShell 的移动端侧栏切换阈值收窄到 `720px`，保留桌面/平板宽度下的左侧工作台侧栏，真正移动宽度才使用顶部横向菜单。
- 测试结果：已执行 `cd apps/web && npm run typecheck`、`cd apps/web && npm run test -- src/app/workspaceNavigation.test.tsx --testTimeout=15000`、`git diff --check`，均通过。
- 后续动作：如果后续要重新设计移动端工作台，应为三栏审核页单独定义移动降级方案，而不是在桌面分屏宽度隐藏侧栏。

- 类型：后端权限修复 / 企业上传文件下载权限校验
- 关联文档：`docs/api/review-ai-export.md`、`docs/api/team-profile.md`
- 内容：修复 `GET /uploads/{file_id}/download` 只按 `X-Team-ID` 成员关系定位企业文件、未校验文件读取权限的问题。此前 Labeler 等仅具备企业基础身份的成员只要知道企业上传文件 ID，就可下载 Team Admin 上传的认证材料或生产文件；现在企业文件下载必须携带当前企业上下文并具备 `task:read` 权限，个人头像/资料文件仍按 `profile:{user_id}` 作用域限制本人访问。
- 测试结果：先运行 `python -m pytest apps/api/tests/test_auth_team_rbac.py -k "team_upload_download_requires_file_read_permission"` 复现失败，Labeler 下载企业认证 PDF 返回 `200 OK`；修复后同一用例通过，结果为 1 passed、57 deselected；`python -m pytest apps/api/tests/test_config_security.py` 通过，结果为 8 passed；`python -m pytest apps/api/tests/test_auth_team_rbac.py` 通过，结果为 58 passed、9 warnings；`python -m compileall apps/api/app` 通过；`git diff --check` 通过，仅提示本次修改文件后续会按 Git 设置从 LF 转为 CRLF。warnings 为既有 FastAPI `on_event`、`datetime.utcnow()` 与 passlib/argon2 deprecation 提示。
- 后续动作：下一轮按 sweep 顺序进入前端工作台体验，涉及 UI/Ant Design 时先阅读 Ant Design 文档，优先覆盖 auth refresh retry、权限回退、表单/表格状态和真实加载/错误提示回归。

- 类型：后端缺陷修复 / AI 预审开关关闭时提交无副作用
- 关联文档：`docs/api/labeling.md`、`docs/api/review-ai-export.md`
- 内容：修复 Labeler 提交答案时 `ai_review` 生产开关校验发生在 submission/question 写入之后的问题。此前任务开启 AI 预审且企业关闭 `ai_review` 开关时，接口会返回 `42201`，但题目已可能变为 `submitted` 且提交记录已写入，造成失败请求留下标注状态副作用；现在提交答案校验通过后、任何写入前先检查 `ai_review` 开关，开关关闭时直接拒绝，不创建提交、不更新题目状态、不入队 AI job。
- 测试结果：先运行 `python -m pytest apps/api/tests/test_auth_team_rbac.py -k "ai_review_switch_blocks_submission_enqueue"` 复现失败，接口返回 `42201` 但题目已变为 `submitted`；修复后同一用例通过，结果为 1 passed、56 deselected；`python -m pytest apps/api/tests/test_config_security.py` 通过，结果为 8 passed；`python -m pytest apps/api/tests/test_auth_team_rbac.py` 通过，结果为 57 passed、9 warnings；`python -m compileall apps/api/app` 通过；`git diff --check` 通过，仅提示本次修改文件后续会按 Git 设置从 LF 转为 CRLF。warnings 为既有 FastAPI `on_event`、`datetime.utcnow()` 与 passlib/argon2 deprecation 提示。
- 后续动作：下一轮继续标注与审核链路或按 sweep 顺序进入导出、上传、审计、通知，优先覆盖领取并发/额度、Reviewer assigned_only、AI 预审幂等和导出下载审计。

- 类型：后端缺陷修复 / pending_review 审批前 readiness 复检
- 关联文档：`docs/api/production.md`、`docs/architecture/SYSTEM_ARCHITECTURE.md`
- 内容：修复 `POST /tasks/{task_id}/status` 的 `approve` 动作未复用任务发布 readiness 检查的问题。此前 Owner 提交待审核后，如果绑定数据集、模板版本、题目、映射、AI 或分发配置因后续操作失效，Team Admin 审批仍会直接把任务写为 `published`；现在审批写状态前复用 `get_task_readiness`，存在阻塞项时返回 `42201` 并保持 `pending_review`，确保管理员审核发布和直接发布遵守同一生产链路门禁。
- 测试结果：先运行 `python -m pytest apps/api/tests/test_auth_team_rbac.py -k "approve_pending_review_task_rechecks_readiness"` 复现失败，缺失数据集的待审核任务错误返回 `200 OK` 并发布；修复后同一用例通过，结果为 1 passed、56 deselected；`python -m pytest apps/api/tests/test_config_security.py` 通过，结果为 8 passed；`python -m pytest apps/api/tests/test_auth_team_rbac.py` 通过，结果为 57 passed、9 warnings；`python -m compileall apps/api/app` 通过；`git diff --check` 通过，仅提示本次修改文件后续会按 Git 设置从 LF 转为 CRLF。warnings 为既有 FastAPI `on_event`、`datetime.utcnow()` 与 passlib/argon2 deprecation 提示。
- 后续动作：下一轮按 sweep 顺序进入标注与审核链路，优先继续覆盖任务广场、领取并发/额度、草稿、提交校验、打回重提、多轮审核和 Reviewer assigned_only。

- 类型：后端权限修复 / 通知状态更新企业作用域写前校验
- 关联文档：`docs/api/review-ai-export.md`、`docs/product/REQUIREMENTS_AND_NOTES.md`
- 内容：修复 `POST /notifications/{notification_id}/state` 在校验目标通知所属企业前先写入阅读/处理状态的问题。此前请求使用企业 A 的 `X-Team-ID` 访问企业 B 通知时最终会返回 `403`，但 `read_by/handled_by` 已经可能被写入，违反企业 API 必须以当前企业作用域隔离且拒绝请求不得产生跨企业副作用的边界；现在状态写入服务在变更前校验通知 `team_id` 与当前企业一致，不一致直接返回权限错误。
- 测试结果：先运行 `python -m pytest apps/api/tests/test_auth_team_rbac.py -k "team_notification_state_update_rejects_cross_team_without_side_effect"` 复现失败，响应为 `403` 但跨企业通知已写入 `read_by`；修复后同一用例通过，结果为 1 passed、55 deselected；`python -m pytest apps/api/tests/test_config_security.py` 通过，结果为 8 passed；`python -m pytest apps/api/tests/test_auth_team_rbac.py` 通过，结果为 56 passed、9 warnings；`python -m compileall apps/api/app` 通过；`git diff --check` 通过，仅提示本次修改文件后续会按 Git 设置从 LF 转为 CRLF。warnings 为既有 FastAPI `on_event`、`datetime.utcnow()` 与 passlib/argon2 deprecation 提示。
- 后续动作：下一轮按 sweep 顺序进入生产链路，优先继续覆盖数据集、模板版本、发布后字段限制、任务状态机和积分预算预扣/扣减。

- 类型：后端安全修复 / 撤销其他会话的当前 refresh session 过期校验
- 关联文档：`docs/api/auth.md`
- 内容：修复 `POST /auth/sessions/revoke-others` 只校验请求体或 cookie 中 refresh session 未撤销、未校验是否过期的问题。此前异常客户端可用同用户一条已过期但未撤销的 refresh session 作为“当前会话”凭证，触发撤销其他仍活跃会话；现在当前 refresh 凭证必须对应当前用户未撤销且未过期的 `RefreshSession`，否则返回 `40101` 并停止执行，不写入撤销副作用。认证 API 文档同步明确该凭证边界。
- 测试结果：先运行 `python -m pytest apps/api/tests/test_auth_team_rbac.py -k "revoke_other_sessions_rejects_expired_current_refresh_session"` 复现失败，接口错误返回 `200 OK`；修复后同一用例通过，结果为 1 passed、54 deselected；`python -m pytest apps/api/tests/test_config_security.py` 通过，结果为 8 passed；`python -m pytest apps/api/tests/test_auth_team_rbac.py` 通过，结果为 55 passed、9 warnings；`python -m compileall apps/api/app` 通过；`git diff --check` 通过，仅提示本次修改文件后续会按 Git 设置从 LF 转为 CRLF。warnings 为既有 FastAPI `on_event`、`datetime.utcnow()` 与 passlib/argon2 deprecation 提示。
- 后续动作：下一轮按 sweep 顺序进入企业作用域与权限，优先继续覆盖 `Authorization + X-Team-ID`、路径 team_id 与 header 一致性、RBAC 边界和系统 Agent 只读约束。

- 类型：前端缺陷修复 / 公告通知 Reviewer 只读权限回退
- 关联文档：`docs/design/FRONTEND_DESIGN_STYLE.md`、`docs/api/review-ai-export.md`
- 内容：修复 Reviewer 进入公告通知页时无条件加载成员列表的问题。Reviewer 导航允许查看公告通知且后端 `GET /notifications` 只需要企业读取权限，但页面初始化同时请求 `/teams/{team_id}/members`，缺少成员管理权限时会让通知列表一起加载失败，并错误展示“新建企业通知”等管理动作；现在公告页根据当前用户权限降级，只读成员仅加载通知列表、标为已读和通知设置，Team Admin/Owner 等管理角色才加载成员、预览接收人并显示新建/撤回/删除企业通知入口。
- 测试结果：先运行 `npm.cmd run test -- src/pages/workspace/WorkspaceApp.test.tsx -t "loads announcements for reviewers" --testTimeout=30000` 复现失败，页面看不到审核提醒且仍显示新建企业通知；修复后同一用例通过，结果为 1 passed、53 skipped；`npm.cmd run typecheck` 通过；`npm.cmd run lint` 通过；`npm.cmd run test -- --run` 通过，结果为 10 files、121 passed、1 skipped，仍有既有 jsdom `getComputedStyle`、canvas 和 navigation 提示；`npm.cmd run build` 通过，仍有既有 `exceljs` eval 与大 chunk 警告；`git diff --check` 通过，仅提示本次修改文件后续会按 Git 设置从 LF 转为 CRLF。
- 后续动作：下一轮重新回到认证与安全边界，优先继续巡检 refresh rotation、OAuth ticket、邮箱验证码和生产 cookie/CORS 组合。

- 类型：后端安全修复 / 审计日志默认企业作用域
- 关联文档：`docs/api/review-ai-export.md`、`docs/architecture/SYSTEM_ARCHITECTURE.md`
- 内容：修复 `GET /audit-logs` 在省略 `team_id` 查询参数时未回落到当前 `X-Team-ID` 企业上下文的问题。此前具备 `task:read` 的企业成员只要不传 `team_id` 就可能读取全量 `audit_logs`，造成跨企业审计日志泄露；现在列表接口显式 `team_id` 仍校验企业作用域，未传时仅查询当前企业，没有企业上下文则返回权限错误。
- 测试结果：先运行 `python -m pytest apps/api/tests/test_auth_team_rbac.py -k "audit_log_list_defaults_to_current_team_scope"` 复现失败，返回中包含其他企业日志；修复后同一用例通过，结果为 1 passed、53 deselected、2 warnings；`python -m pytest apps/api/tests/test_config_security.py` 通过，结果为 8 passed；`python -m pytest apps/api/tests/test_auth_team_rbac.py` 通过，结果为 54 passed、9 warnings；`python -m compileall apps/api/app` 通过；`git diff --check` 通过，仅提示本次修改文件后续会按 Git 设置从 LF 转为 CRLF。
- 后续动作：下一轮按 sweep 顺序进入前端工作台体验，优先覆盖 auth refresh retry、权限回退、Ant Design 表单/表格状态和真实错误提示回归。

- 类型：后端缺陷修复 / 标注审核任务统计状态同步
- 关联文档：`docs/api/labeling.md`、`docs/api/review-ai-export.md`、`docs/architecture/SYSTEM_ARCHITECTURE.md`
- 内容：修复标注提交、审核打回和打回后重提时 `tasks.stats` 只手工递增、不按题目当前状态迁移的问题。此前同一题从 `submitted` 打回到 `rejected` 后会同时保留 `submitted=1/rejected=1`，重提后还会继续累加，导致任务看板、导出元数据和积分预留口径读到漂移统计；现在提交和审核迁移后统一复用 `sync_task_question_stats`，按 `questions.status` 重建 `claimed/submitted/approved/rejected` 当前计数。
- 测试结果：先运行 `python -m pytest apps/api/tests/test_auth_team_rbac.py -k "labeler_can_view_rejection_and_resubmit"` 复现失败，打回后 `submitted` 仍为 1；修复后同一用例通过，结果为 1 passed、52 deselected、2 warnings；`python -m pytest apps/api/tests/test_config_security.py` 通过，结果为 8 passed；`python -m pytest apps/api/tests/test_auth_team_rbac.py` 通过，结果为 53 passed、9 warnings；`python -m compileall apps/api/app` 通过；`git diff --check` 通过，仅提示本次修改文件后续会按 Git 设置从 LF 转为 CRLF。
- 后续动作：下一轮继续标注与审核链路，优先查领取并发/额度、草稿提交状态约束、Reviewer assigned_only 和 AI 预审入队幂等。

- 类型：后端缺陷修复 / 任务发布 readiness 阻塞项
- 关联文档：`docs/api/production.md`、`docs/architecture/SYSTEM_ARCHITECTURE.md`
- 内容：修复 `POST /tasks/{task_id}/publish` 未复用 `GET /tasks/{task_id}/readiness` 检查的问题。此前草稿任务只要绑定模板、数据集并存在题目即可发布，即使模板 `ShowItem` 未完成列映射、AI 预审配置缺失或分发配置存在 readiness blocker 也会进入发布状态；现在发布前会调用同一 readiness 服务，存在阻塞项时返回 `42201` 和检查详情，并保持任务为 `draft`。
- 测试结果：先运行 `python -m pytest apps/api/tests/test_auth_team_rbac.py -k "publish_blocks_unmapped_show_item_readiness"` 复现失败，接口错误返回 `200 OK`；修复后同一用例通过，结果为 1 passed、52 deselected、2 warnings；`python -m pytest apps/api/tests/test_config_security.py` 通过，结果为 8 passed；`python -m pytest apps/api/tests/test_auth_team_rbac.py` 通过，结果为 53 passed、9 warnings；`python -m compileall apps/api/app` 通过；`git diff --check` 通过，仅提示本次修改文件后续会按 Git 设置从 LF 转为 CRLF。
- 后续动作：下一轮按 sweep 顺序进入标注与审核链路，优先查领取并发/额度、草稿提交校验、打回重提和 Reviewer assigned_only 边界。

- 类型：后端安全修复 / 无 refresh token 登出会话范围
- 关联文档：`docs/api/auth.md`、`docs/product/REQUIREMENTS_AND_NOTES.md`
- 内容：修复 `POST /auth/logout` 在请求体和 cookie 均未携带 refresh token 时回退撤销当前用户全部 refresh session 的问题。后端现在复用当前 bearer access token 中已校验通过的 `sid`，只撤销当前 `RefreshSession`，确保普通登出不会误踢同一用户的其他设备；若既没有 refresh token 也无法识别当前 session，则返回 `40101`。
- 测试结果：`python -m pytest apps/api/tests/test_auth_team_rbac.py -k "logout_without_refresh_token_only_revokes_current_session"` 通过，结果为 1 passed、49 deselected、3 warnings；`python -m pytest apps/api/tests/test_auth_team_rbac.py` 通过，结果为 50 passed、9 warnings，warnings 为既有 FastAPI `on_event`、`datetime.utcnow()` 和 passlib/argon2 deprecation 提示；`python -m compileall apps/api/app` 通过；`git diff --check` 通过，仅提示工作区文件后续会按 Git 设置从 LF 转为 CRLF。
- 后续动作：继续扫描 session 轮换、OAuth redirect 与企业作用域权限边界。

- 类型：后端安全修复 / 登出 refresh token 归属校验
- 关联文档：`docs/api/auth.md`、`docs/product/REQUIREMENTS_AND_NOTES.md`
- 内容：修复 `POST /auth/logout` 在传入 refresh token 时未校验其归属当前 bearer 用户的问题。现在登出只会撤销当前用户自己的 refresh session；若请求携带其他用户的 refresh token，会返回 `40101`，避免跨用户会话撤销副作用。认证 API 文档同步补充该边界。
- 测试结果：`python -m pytest apps/api/tests/test_auth_team_rbac.py -k "logout_rejects_refresh_token_from_another_user"` 通过，结果为 1 passed、48 deselected、3 warnings；`python -m pytest apps/api/tests/test_auth_team_rbac.py` 通过，结果为 49 passed、9 warnings，warnings 为既有 FastAPI `on_event`、`datetime.utcnow()` 和 passlib/argon2 deprecation 提示；`python -m compileall apps/api/app` 通过。
- 后续动作：继续扫描 CORS、OAuth redirect 与敏感配置回显等安全边界。

- 类型：后端安全修复 / 生产环境名归一化
- 关联文档：`docs/operations/DEPLOYMENT.md`、`docs/product/REQUIREMENTS_AND_NOTES.md`
- 内容：修复 `ENVIRONMENT` 带前后空格或大小写变化时可能绕过生产安全兜底的问题。`Settings` 现在会在配置加载阶段将环境名 `strip().lower()`，生产/Prod 等写法统一进入 `production|prod` 分支，继续强制校验强 `SECRET_KEY` 和 refresh cookie Secure。
- 测试结果：`python -m pytest apps/api/tests/test_config_security.py` 通过，结果为 8 passed；`python -m pytest apps/api/tests/test_auth_team_rbac.py` 通过，结果为 48 passed、9 warnings，warnings 为既有 FastAPI `on_event`、`datetime.utcnow()` 和 passlib/argon2 deprecation 提示；`python -m compileall apps/api/app` 通过。
- 后续动作：继续扫描 CORS、OAuth redirect 与敏感配置回显等安全边界。

- 类型：后端安全修复 / refresh cookie SameSite 配置校验
- 关联文档：`docs/operations/DEPLOYMENT.md`、`docs/api/auth.md`
- 内容：修复 `COOKIE_SAMESITE` 可配置为任意字符串的问题。非法 SameSite 值会在登录/刷新写入 HttpOnly `refresh_token` cookie 时触发运行时异常；现在 `Settings` 会在配置加载阶段仅允许 `lax|strict|none` 并归一化为小写，部署文档同步补充该约束。
- 测试结果：`python -m pytest apps/api/tests/test_config_security.py` 通过，结果为 7 passed；`python -m pytest apps/api/tests/test_auth_team_rbac.py` 通过，结果为 48 passed、9 warnings，warnings 为既有 FastAPI `on_event`、`datetime.utcnow()` 和 passlib/argon2 deprecation 提示；`python -m compileall apps/api/app` 通过。
- 后续动作：继续扫描 CORS、OAuth redirect 与敏感配置回显等安全边界。

- 类型：后端安全修复 / 生产 refresh cookie Secure 兜底
- 关联文档：`docs/operations/DEPLOYMENT.md`、`docs/api/auth.md`
- 内容：修复生产环境仍可能以 `COOKIE_SECURE=false` 启动的问题。后端会写入 HttpOnly `refresh_token` cookie；现在 `Settings` 在 `ENVIRONMENT=production|prod` 时要求 `COOKIE_SECURE=true`，防止生产 refresh cookie 缺少 Secure 标记。部署文档同步说明该启动兜底。
- 测试结果：`python -m pytest apps/api/tests/test_config_security.py` 通过，结果为 5 passed；`python -m pytest apps/api/tests/test_auth_team_rbac.py` 通过，结果为 48 passed、9 warnings，warnings 为既有 FastAPI `on_event`、`datetime.utcnow()` 和 passlib/argon2 deprecation 提示；`python -m compileall apps/api/app` 通过。
- 后续动作：继续扫描 CORS、OAuth redirect 与敏感配置回显等安全边界。

- 类型：后端安全修复 / 生产默认 SECRET_KEY 启动兜底
- 关联文档：`docs/operations/DEPLOYMENT.md`、`docs/product/REQUIREMENTS_AND_NOTES.md`
- 内容：修复生产环境可继续使用默认 `SECRET_KEY=change-me-in-production` 的配置风险。`Settings` 现在会在 `ENVIRONMENT=production|prod` 时拒绝默认密钥或短于 32 字节的密钥启动，本地/测试环境仍允许文档示例占位值，避免影响开发体验；部署文档同步说明该启动兜底。
- 测试结果：`python -m pytest apps/api/tests/test_config_security.py` 通过，结果为 3 passed；`python -m pytest apps/api/tests/test_auth_team_rbac.py` 通过，结果为 48 passed、9 warnings，warnings 为既有 FastAPI `on_event`、`datetime.utcnow()` 和 passlib/argon2 deprecation 提示；`python -m compileall apps/api/app` 通过。
- 后续动作：继续扫描其余部署期安全配置，如 cookie secure、CORS 和敏感信息回显。

- 类型：前端安全修复 / uuid 传递依赖漏洞
- 关联文档：`docs/operations/DEPLOYMENT.md`、`docs/planning/TODO.md`
- 内容：`npm audit --omit=dev` 发现生产依赖链 `exceljs -> uuid@7.0.3` 命中 GHSA-w5hq-g745-h8pq（uuid 在传入 buf 时缺少边界检查，moderate）。由于 `exceljs` 最新版仍依赖低版本 uuid，本轮在前端 `package.json` 增加 npm `overrides`，将传递依赖固定到 `uuid@11.1.1`，并更新 lockfile，保持现有流水导出功能不变。
- 测试结果：`npm.cmd install` 完成并报告 `found 0 vulnerabilities`；`npm.cmd audit --omit=dev` 通过，0 vulnerabilities；`npm.cmd ls exceljs uuid` 确认 `exceljs@3.10.0 -> uuid@11.1.1 overridden`；`npm.cmd run typecheck` 通过；`npm.cmd run build` 通过，仍有既有 `exceljs` eval 与大 chunk 警告；`npm.cmd run test -- src\pages\workspace\WorkspaceApp.test.tsx -t "resource configuration|resource config|resource" --testTimeout=30000` 通过，结果为 1 个测试文件、2 passed、51 skipped，仍有既有 jsdom getComputedStyle 提示。
- 后续动作：如后续升级或替换 `exceljs`，需复查 override 是否仍必要；继续观察构建中的 `exceljs` eval 警告是否需要通过服务端导出或动态导入拆分治理。

- 类型：后端缺陷修复 / 领取包大小超过可用题量返回码
- 关联文档：`docs/api/labeling.md`、`docs/product/REQUIREMENTS_AND_NOTES.md`
- 内容：修复 `POST /labels/tasks/{task_id}/claim` 在 `bundle_size` 超过当前可用题量时返回 `40003` 参数范围错误的问题。该场景属于任务可领取额度不足的业务限制，现改为返回 `42202 QUOTA_FULL`，并继续携带 `available_items`，便于前端按业务失败提示用户。
- 测试结果：`python -m compileall apps/api/app` 通过；`python -m pytest apps/api/tests/test_auth_team_rbac.py -k "owner_can_import_dataset_build_template_and_publish_multimodal_task"` 通过，结果为 1 passed、47 deselected；`python -m pytest apps/api/tests/test_auth_team_rbac.py` 全量通过，结果为 48 passed、9 warnings，warnings 为既有 FastAPI `on_event`、`datetime.utcnow()` 和 passlib/argon2 deprecation 提示。
- 后续动作：继续全站扫描，优先处理可由测试、构建或静态检查证明的缺陷。

- 类型：后端测试修复 / my-tasks 用例改用 session-bound access token
- 关联文档：`docs/api/auth.md`、`docs/product/REQUIREMENTS_AND_NOTES.md`
- 内容：修复 `test_labeler_my_tasks_hides_removed_or_finished_tasks` 仍手工签发无 `sid` access token 的过时夹具问题。当前认证基线要求受保护接口必须使用绑定有效 `RefreshSession` 的 access token，测试已改为复用 `create_session_bound_access_token`，继续验证 Labeler 我的任务列表会隐藏已结束任务。
- 测试结果：`python -m compileall apps/api/app` 通过；`python -m pytest apps/api/tests/test_auth_team_rbac.py -k "labeler_my_tasks_hides_removed_or_finished_tasks"` 通过，结果为 1 passed、47 deselected，仍有既有 FastAPI `on_event` deprecation warnings；`git diff --check` 通过，仅提示 LF/CRLF。
- 后续动作：继续单独修复后端 pytest 中剩余的 oversized claim 返回码偏差。

- 类型：前端缺陷修复 / 打回题重提交完成状态误判
- 关联文档：`docs/api/labeling.md`、`docs/product/REQUIREMENTS_AND_NOTES.md`
- 内容：修复标注工作台中打回题重新提交后被误判为“全部题目已提交”的问题。打回修订场景可能只加载当前打回题，不能仅凭当前 `questionItems` 全部 submitted 判断任务完成；现在只有题目列表覆盖 `workbench.progress.total` 时才显示“全部完成”。同时当前题已提交但未覆盖全任务时，主按钮显示并禁用为“已提交”，避免重复提交。
- 测试结果：`npm.cmd run test -- src\pages\workspace\WorkspaceApp.test.tsx -t "shows rejection detail|labeling workbench" --testTimeout=30000` 通过，结果为 1 个测试文件、4 passed、49 skipped；`.\node_modules\.bin\eslint.cmd src\pages\workspace\WorkspaceApp.tsx src\pages\workspace\WorkspaceApp.test.tsx` 通过；`npm.cmd run typecheck` 通过；`npm.cmd run test -- --run` 全量通过，结果为 10 个测试文件、120 passed、1 skipped，仍有既有 jsdom getComputedStyle/canvas/navigation 环境提示。
- 后续动作：继续用 lint/typecheck/build/全量测试扫描剩余前端问题，再补跑后端可用 Python 环境的 compileall/pytest。

- 类型：前端缺陷修复 / refresh 失败后的认证错误语义
- 关联文档：`docs/api/auth.md`、`docs/product/REQUIREMENTS_AND_NOTES.md`
- 内容：修复 `authenticatedApiRequest` 在 access token 返回 `40102 Token已过期` 后尝试 refresh、但 refresh 明确失败为 `40101 请先登录` 时，仍把最初的 `40102` 抛给调用方的问题。现在 refresh 失败会保留并返回 refresh 接口的认证错误响应，使调用方、全局会话失效事件和用户重新登录提示保持同一语义。
- 测试结果：`npm.cmd run test -- src\services\apiClient.test.ts src\app\App.test.tsx -t "refresh fails|invalidates the session" --testTimeout=30000` 通过，结果为 2 个测试文件、2 passed、15 skipped，仍有既有 jsdom canvas/getComputedStyle 环境提示；`.\node_modules\.bin\eslint.cmd src\services\apiClient.ts src\services\apiClient.test.ts src\app\App.test.tsx` 通过；`npm.cmd run typecheck` 通过。
- 后续动作：继续处理全量 Vitest 中剩余的标注打回重提交断言失败，单独修复、单独提交。

- 类型：前端偏差修复 / 个人信箱 Fast Refresh 导出收口
- 关联文档：`docs/design/FRONTEND_DESIGN_STYLE.md`、`docs/planning/TODO.md`
- 内容：修复 `PersonalInboxPage.tsx` 同时导出页面组件、标签常量和工具函数导致的 Fast Refresh lint warning。将信箱类型/状态/优先级标签、时间格式化和汇总计算迁移到 `personalInboxHelpers.ts`，页面文件仅保留组件导出，顶栏信箱预览改为从 helper 复用同一套展示映射。
- 测试结果：`.\node_modules\.bin\eslint.cmd src\pages\workspace\PersonalInboxPage.tsx src\pages\workspace\personalInboxHelpers.ts src\components\layout\SiteNav.tsx` 通过；`npm.cmd run typecheck` 通过；`npm.cmd run test -- src\components\layout\SiteNav.test.tsx src\pages\workspace\WorkspaceApp.test.tsx -t "个人信箱|personal inbox|Inbox" --testTimeout=30000` 通过，结果为 2 个测试文件、2 passed、56 skipped，仍有既有 jsdom `getComputedStyle` pseudo-elements 提示；`npm.cmd run lint` 全量通过且 0 warnings。
- 后续动作：继续保持页面组件文件只导出组件，跨组件复用的常量和纯函数放入 helper/service 文件。

- 类型：前端偏差修复 / 标注工作台题目列表依赖稳定
- 关联文档：`docs/planning/TODO.md`、`docs/architecture/SYSTEM_ARCHITECTURE.md`
- 内容：修复 `WorkspaceApp` 标注工作台中 `questionItems` 使用内联空数组兜底导致 `pendingQuestionIds` 的 `useMemo` 依赖每次渲染都可能变化的问题。现在题目列表通过 `useMemo` 基于 `workbench.questions` 派生，保持题目状态计算稳定，避免不必要重算和 eslint `react-hooks/exhaustive-deps` 警告。
- 测试结果：`.\node_modules\.bin\eslint.cmd src\pages\workspace\WorkspaceApp.tsx` 通过；`npm.cmd run typecheck` 通过；`npm.cmd run test -- src\pages\workspace\WorkspaceApp.test.tsx -t "labeling workbench" --testTimeout=30000` 通过，结果为 1 个测试文件、3 passed、50 skipped；`git diff --check` 通过，仅提示当前工作区文件后续会被 Git 转为 CRLF。
- 后续动作：继续清理剩余 lint warnings，并保持单个偏差单独验证、单独提交。

- 类型：前后端实现 / OAuth provider 内一一绑定与账号页绑定当前账号
- 关联文档：`docs/api/auth.md`、`docs/product/REQUIREMENTS_AND_NOTES.md`、`docs/architecture/SYSTEM_ARCHITECTURE.md`
- 内容：收紧 OAuth 绑定规则为“同一 provider 内一一对应”。后端新增并统一复用 provider 冲突校验，覆盖 OAuth 首登绑定已有账号、补邮箱绑定 existing-user 分支，以及企业账号管理页专用的 `POST /auth/oauth/link-current-user`。OAuth start/callback 现已支持 `intent=login | bind_current_user`，账号页发起授权时固定使用 `bind_current_user`，回调后前端若仍保持当前登录态则直接消费 ticket 绑定到当前账号；若命中“第三方身份已被其他账号绑定”或“当前账号已占用该 provider 其他身份”，只返回冲突错误并保持当前会话不变，不再切换账号或退化成普通第三方登录。
- 测试结果：已补后端 `apps/api/tests/test_auth_team_rbac.py` 场景，覆盖账号页成功绑定、第三方身份冲突、当前账号同 provider 已占位冲突，以及 bind-current-user ticket 不能用于登录 exchange；已补前端 `apps/web/src/app/App.test.tsx` 与 `apps/web/src/pages/workspace/WorkspaceApp.test.tsx`，覆盖账号页发起绑定 intent 和 callback 成功/冲突分支。当前后端 `pytest apps/api/tests/test_auth_team_rbac.py` 仍被既有 `delete_provider_config` 导入错误阻塞收集，与本次 OAuth 改造无关；本轮需继续以可执行环境补跑 compileall、前端测试与 typecheck。
- 后续动作：补跑 `npm.cmd run typecheck`、相关 Vitest、`python -m compileall apps/api/app` 和 `git diff --check`；若后续清库前发现历史脏数据存在“同一 provider 多绑到同一 MarkUp 账号”，按未上线阶段手工清理，不在运行时放宽校验。
- 类型：前端偏差修正 / Reviewer 人工审核页折叠与侧栏
- 关联文档：`docs/product/REQUIREMENTS_AND_NOTES.md`、`docs/design/pages/reviewer-manual-review.md`
- 内容：根据人工审核页设计稿复查实现并修正偏差：标题栏收起按钮迁移到搜索与批量处理工具栏最右侧，收起后标题栏完全隐藏，不再生成小浮框或额外控制条；Reviewer 工作台侧栏补齐 `主页面 / 审核质检 / 企业管理 / 个人工具` 四组，其中企业管理包含企业信息、资源配置、人员管理、公告通知和工作日志，审核质检只保留人工审核入口。
- 测试结果：已执行 `cd apps/web && npm run typecheck`、`cd apps/web && npm run lint`、`cd apps/web && npm run test -- src/app/workspaceNavigation.test.tsx --testTimeout=15000`、`cd apps/web && npm run test -- src/pages/workspace/WorkspaceApp.test.tsx -t "loads manual review queue" --testTimeout=25000`、`git diff --check`，均通过。人工审核专项测试仍输出 jsdom 对 `getComputedStyle` pseudo-elements 的既有未实现提示。
- 后续动作：提交级批量指派接口仍待后端补齐；Reviewer 企业管理页面的接口权限若需从只读扩展为细粒度写权限，应在后续 API/RBAC 文档中单独落地。

- 类型：前后端实现 / Reviewer 人工审核三栏工作台
- 关联文档：`docs/api/review-ai-export.md`、`docs/product/REQUIREMENTS_AND_NOTES.md`、`docs/design/pages/reviewer-manual-review.md`
- 内容：按人工审核设计稿和任务管理页风格重做 Reviewer 人工审核页。页面保留任务管理同款固定页头、Ant Design `Statistic` 数据统计栏和单行筛选处理栏；统计栏可点击筛选 `待审核 / AI建议通过 / AI建议打回 / 待人工审核 / 已处理`，筛选结果进入左侧队列。下方搜索栏与 `批量通过 / 批量打回 / 指派给其他 Reviewer` 合并一行，不再重复放置 AI 建议三段按钮。中间详情改为一图流展示 AI 预审评分与结果、第一轮/第二轮字段差异、原始数据和当前标注答案；右侧展示 4 个账号概览指标和当前选中提交审计时间线。标题栏右侧操作靠下，新增收起标题栏和审核阶段视图切换。阶段视图不是批次概念，而是面向 `全部阶段 / 初审 / 复审 / 终审` 的多级审核链路视角；后端 `/reviews/queue` 增加 `status`、`ai_suggestion`、`keyword` 查询，`revise` 改为审核员就地修订答案后直接入库并记录修订前后答案。
- 测试结果：已执行 `cd apps/web && npm run typecheck`、`cd apps/web && npm run lint`、`cd apps/web && npm run test -- src/pages/workspace/WorkspaceApp.test.tsx -t "loads manual review queue" --testTimeout=25000`、`conda run -n markup-api python -m compileall apps/api/app`、`git diff --check`，均通过。专项测试仍输出 jsdom 对 `getComputedStyle` pseudo-elements 的既有未实现提示。
- 后续动作：提交级指派给其他 Reviewer 的后端接口仍待实现，当前前端保留入口并说明不伪造转派结果；真实多级 stage/round 与 review_records 快照仍按 TODO 后续推进。

### 2026-05-30

- 类型：前端缺陷修复 / 会话撤销与登出在自动 refresh 后重试时同步刷新 body 内 refresh token
- 关联文档：`docs/api/auth.md`、`docs/product/REQUIREMENTS_AND_NOTES.md`
- 内容：修复企业账号安全页“退出全部其他会话”会错误踢掉当前会话的问题。根因是前端 `authenticatedFetch` 在 access token 过期后自动 refresh 并重试原请求时，只更新了 `Authorization` 头，没有同步重建请求体中的 `refresh_token`，导致 `revoke-others` 在重试分支里携带“新 access + 旧 refresh”的错配凭证。当前已为 `authenticatedApiRequest` 增加“refresh 后重建 RequestInit”能力，并让 `revokeOtherSessions` 与 `logout` 这类 session-sensitive 请求在重试时统一使用最新 refresh token；同时为主动登出补充了“auth 失败时不触发全局未登录广播、仅走本地退出”的前端保护，避免退出登录动作误弹登录态失效链路。
- 测试结果：已补充 `apps/web/src/services/apiClient.test.ts` 与 `apps/web/src/services/authService.test.ts`，覆盖 `revoke-others` 和 `logout` 在 access 过期后的 refresh + retry 场景。前端全量 `typecheck` 仍被既有 `apps/web/src/pages/workspace/PeopleManagementPage.tsx(264,18)` 的可选值报错阻塞，与本次修复无关。
- 后续动作：在具备稳定前端测试环境后补跑相关 Vitest；后续如新增任何 body 内携带 refresh token 的认证接口，统一复用同一重试重建能力。

- 类型：前后端实现 / 个人信箱
- 关联文档：`docs/api/review-ai-export.md`、`docs/design/FRONTEND_DESIGN_STYLE.md`、`docs/planning/TODO.md`
- 内容：新增个人信箱能力。后端补充 `/notifications/my`、`/notifications/my/mark-all-read` 和 `/notifications/my/{notification_id}/state`，按当前登录用户的指定成员、全企业和企业角色范围过滤可见通知，避免个人入口看到未分发给自己的企业通知。前端在顶栏 `工作台` 按钮左侧新增唯一信箱图标入口，展示未读角标和轻量概览 Popover；概览中的 `查看全部` 进入工作台隐藏完整页 `personal-inbox`，该页有 `工作台 / 个人信箱` 面包屑但不加入侧边栏。
- 测试结果：`npm.cmd run typecheck` 通过；`npm.cmd run test -- src/components/layout/SiteNav.test.tsx src/app/workspaceNavigation.test.tsx src/pages/workspace/WorkspaceApp.test.tsx --testTimeout=25000` 通过，结果为 3 个测试文件、61 passed、1 skipped；当前 PowerShell 中 `conda` 不可用，已改用 `C:\Users\Archyix\AppData\Local\Programs\Python\Python312\python.exe -m pytest apps/api/tests/test_auth_team_rbac.py` 验证通过，结果为 41 passed；`git diff --check` 通过。Vitest 仍输出 jsdom 对 `getComputedStyle` pseudo-elements、anchor navigation 和 canvas getContext 的已知环境提示；后端 pytest 仍有 FastAPI `on_event`、`datetime.utcnow()` 和 passlib/argon2 版本查询的 deprecation warnings；`git diff --check` 仅输出 LF/CRLF 换行提示。
- 后续动作：WebSocket 实时推送、系统/审核/导出事件自动通知生成、个人删除/归档和邮件通道策略仍不属于本轮。

- 类型：前后端实现 / access token 绑定 session 的即时失效改造
- 关联文档：`docs/api/auth.md`、`docs/product/REQUIREMENTS_AND_NOTES.md`、`docs/architecture/SYSTEM_ARCHITECTURE.md`
- 内容：认证链路升级为“access token 显式绑定 `RefreshSession`”。后端在签发 `LoginPayload` 时为 access token 固定写入 `sid=RefreshSession.id`；`get_current_user()` 现已在校验 JWT 的同时强制校验 `sid` 对应 session 仍存在、属于当前用户、未撤销且未过期。旧版不带 `sid` 的 access token 直接按未登录处理。`退出全部其他会话`、logout、修改密码、重置密码和 refresh 轮换现在都会通过撤销对应 `RefreshSession` 让旧 access token 在下一次受保护请求时立即返回 `40101`，不再等待 access token 自然过期。
- 测试结果：已补充 `apps/api/tests/test_auth_team_rbac.py` 的认证与会话失效测试，覆盖无 `sid` 旧 token、登录签发 `sid`、退出其他会话、logout、refresh 轮换、修改密码、重置密码等场景。当前 shell 原生 `conda` / `python` 不可用；需改用可用 Python 运行环境继续执行 pytest 与 compileall。
- 后续动作：使用可用解释器补跑 `apps/api/tests/test_auth_team_rbac.py`、`compileall` 与 `git diff --check`；若出现失败，优先检查其余测试或夹具里是否还存在直接签发未绑定 session 的 access token。

- 类型：前后端实现 / 人员管理邀请码纠偏为 onboarding 通用加入码
- 关联文档：`docs/api/auth.md`、`docs/api/team-profile.md`、`docs/product/REQUIREMENTS_AND_NOTES.md`、`docs/architecture/SYSTEM_ARCHITECTURE.md`、`docs/design/pages/team-member-management.md`、`docs/planning/TODO.md`
- 内容：将人员管理中的“邀请码邀请”从“邮箱绑定邀请码”纠偏为真正的企业加入码模式。后端企业邀请模型新增 `invite_mode=email|code`，历史缺失模式的旧邀请运行时按 `email` 兼容；`code` 模式创建邀请时不再要求邮箱，重发时只重新生成邀请码与 onboarding 链接、不发邮件，接收时跳过邮箱一致性校验。前端人员管理页同步调整为“邮箱邀请 + 邀请码邀请”并存，邀请码模式移除邮箱输入，生成后直接展示可复制的邀请码、链接和过期时间；onboarding 文案同步收口为“注册并登录后填写企业邀请码加入”，并支持从查询参数预填 `invite_code`。
- 测试结果：已补后端 pytest 场景与前端页面断言，但当前工作树上 `WorkspaceApp.test.tsx` 仍存在既有手改和编码混杂，需在本地实际执行后做一轮清理确认。
- 后续动作：定向运行 `apps/api/tests/test_auth_team_rbac.py`、`apps/web/src/pages/onboarding/OnboardingPage.test.tsx` 和 `apps/web/src/pages/workspace/WorkspaceApp.test.tsx`；如前端测试继续被历史乱码断言阻塞，按实际渲染文案统一整理该测试文件。

- 类型：前后端实现 / 资源配置页积分管理收口
- 关联文档：`docs/design/pages/organization-resource-config.md`、`docs/product/REQUIREMENTS_AND_NOTES.md`、`docs/api/team-profile.md`、`docs/planning/TODO.md`
- 内容：继续收敛资源配置页中的积分管理路径。后端新增企业积分钱包流水模型与接口 `GET /teams/{team_id}/points-budget/ledger`、`POST /teams/{team_id}/points-budget/withdraw`，充值、提现和审核通过后的奖励支出都会写入企业钱包流水；前端积分管理页底部表格从“任务占用分析”切换为“企业积分钱包流水表”，并补上积分提现入口与表单交互。文档同步澄清“钱包流水”与“积分审计”的职责差异：前者记录账户变动，后者记录操作日志。
- 测试结果：`npm.cmd run typecheck`（`apps/web`）通过；`npm.cmd run test -- WorkspaceApp.test.tsx -t "resource configuration|resource config|resource"`（`apps/web`）通过。后端测试已补到 `apps/api/tests/test_auth_team_rbac.py`，但本轮未在当前环境重新完整执行。
- 后续动作：继续清理 `ResourceConfigPage.tsx` 中残留的重复提现 Drawer 死代码与乱码文案；后端环境恢复后补跑企业钱包充值、提现、审核联动相关 pytest。

- 类型：前端偏差修正 / 企业账号页固定标签栏与无灰底工作台壳
- 关联文档：`docs/design/FRONTEND_DESIGN_STYLE.md`
- 内容：继续收敛企业端账号管理页的工作台布局。账号页改为 `workspace-fixed-page` 固定工作台壳，标题区固定，`Tabs` 标签栏固定在内容区顶部，子页内容改为在标签内容区内部滚动；同时为账号页移除全局工作台语义灰底/色带覆盖，恢复纯白背景与无缝 padding，避免灰底、顶端裁切和整页联动滚动再次出现。本轮按确认继续使用仓库现有 `apps/web/public/oauth-providers/huggingface.svg`。
- 测试结果：待执行 `npm.cmd run build` 与定向前端验证。
- 后续动作：继续观察长内容与窄屏下的标签栏固定和各子页独立滚动表现，避免回退为统一整页滚动。

- 类型：前端偏差修正 / 人员管理去除 2FA 占位并补邀请码邀请
- 关联文档：`docs/design/pages/team-member-management.md`、`docs/api/team-profile.md`
- 内容：人员管理页移除成员列表、筛选和详情中的 `2FA` 占位展示，避免继续呈现当前后端未维护的安全字段；`添加成员` Modal 同步扩展为 `创建账号 / 邮箱邀请 / 邀请码邀请` 三种方式。其中“邀请码邀请”现已改为 onboarding 通用加入码模式：复用 `POST /api/v1/teams/{team_id}/invite` 生成 `invite_code` 与 `invite_url`，前端在弹窗内直接展示并支持复制，供管理员手动转发给已注册用户在 `/onboarding` 填码加入；不再绑定受邀邮箱。
- 测试结果：待执行 `npm.cmd run typecheck`、`npm.cmd run test -- src/pages/workspace/WorkspaceApp.test.tsx --testTimeout=25000`、`git diff --check`。
- 后续动作：如产品后续希望支持真正“与邮箱解绑”的通用邀请码，需要单独调整邀请数据模型与接受邀请校验逻辑，不能仅靠前端放开。

- 类型：前端偏差修正 / 隐藏 AI 预审 Output 要求区域
- 关联文档：`docs/design/pages/owner-task-management.md`
- 内容：根据最新确认，发布者不需要看到 AI 预审 Output 要求。新建任务 AI 预审步骤删除前端可见的 `Output 要求` 配置块、function call 说明 Alert 和输出字段 Tag；后台 `output_schema`、`prompt` 兼容字段继续保留，由 Prompt Engine/function call 契约内部维护。
- 测试结果：已执行 `npm run typecheck`、`npm run lint`、`git diff --check`；已用 Playwright MCP 进入新建任务页的 `AI 预审` 步骤，确认页面不再出现 `Output 要求`、function call 说明、`decision: pass | reject | manual` 或 `dimension_scores` 等输出契约文案。
- 后续动作：后续如需调试 Output 契约，应放在后台/资源配置/开发调试工具中，不放回任务发布页面。

- 类型：前端偏差修正 / 任务管理更多菜单层级
- 关联文档：`docs/design/pages/owner-task-management.md`
- 内容：修复任务管理列表和卡片视图中，鼠标移动到行/卡片 `更多` 操作后弹出的候选菜单被下方任务遮挡的问题。`更多` Dropdown 现在挂载到 `document.body`，并使用专用 `workspace-action-dropdown` 高层级样式，避免被表格或卡片滚动容器裁切/压盖。
- 测试结果：已执行 `npm run typecheck`、`npm run lint`、`git diff --check`；已用 Playwright MCP 检查任务管理页首个 `更多` 菜单，弹层挂载父级为 `BODY`、class 包含 `workspace-action-dropdown`、`z-index=1200`。
- 后续动作：后续新增行级或卡片级低频操作菜单时复用同一顶层弹层策略，不再挂载到滚动行内容器。

- 类型：前端偏差修正 / 新建任务发布摘要换行
- 关联文档：`docs/design/pages/owner-task-management.md`
- 内容：发布摘要面板中的标题、模板、数据集、协议等长文本不再使用省略号截断，改为在摘要值区域自动换行并允许摘要面板内部滚动，避免用户无法看到完整预览信息。
- 测试结果：已执行 `npm run typecheck`、`npm run lint`、`git diff --check`；已用 Playwright MCP 登录 `owner@test.local` 进入新建任务页，确认发布摘要值区域计算样式为 `white-space: normal`、`overflow-wrap: anywhere`、`text-overflow: clip`。
- 后续动作：后续若摘要中出现极长连续字符，应继续以 `overflow-wrap:anywhere` 和面板内部滚动处理，不回退为省略号截断。

- 类型：前端偏差修正 / 新建任务 AI 预审 Provider 与生成流程
- 关联文档：`docs/product/REQUIREMENTS_AND_NOTES.md`、`docs/api/production.md`、`docs/architecture/SYSTEM_ARCHITECTURE.md`、`docs/design/pages/owner-task-management.md`、`docs/planning/TODO.md`
- 内容：按最新产品规则调整新建任务 AI 预审步骤：任务发布页只选择企业已配置 AI Provider，不再单独选择审核模型；Provider 作为 Base URL、API Key、Temperature、默认模型等参数的封装，并在多模态任务选择能力不明确的 Provider 时显示警告。Input 字段说明改为 AI 根据数据集、模板、字段样例和映射上下文推断字段语义的生成接口预留，不再自动把变量名直出为提示词。审核评分矩阵改为根据用户选择维度触发 AI 生成接口预留，生成定义、评分标准、扣分规则、打回条件和人工复核条件的可编辑草案。Output 要求改由后台 function call 契约维护，前端不再暴露可编辑 Prompt 或 JSON schema 正文。
- 测试结果：待执行 `npm run typecheck`、`npm run lint`、`conda run -n markup-api python -m compileall apps/api/app`、`git diff --check`。
- 后续动作：后续接入真实 AI Gateway/Prompt Engine 时，复用当前 `ai_config` 中的 `provider_id`、`input_prompt`、`review_matrix`、`output_schema` 和 `thresholds`；AI Provider 资源 schema 仍需补显式模态能力字段，替代当前前端基于模型名/备注的保守提醒。

- 类型：前后端实现 / 新建任务 AI 预审配置流程
- 关联文档：`docs/product/REQUIREMENTS_AND_NOTES.md`、`docs/api/production.md`、`docs/architecture/SYSTEM_ARCHITECTURE.md`、`docs/design/pages/owner-task-management.md`、`docs/planning/TODO.md`
- 内容：新建任务页的 AI 预审步骤从单一模型/阈值/Prompt 文本框升级为完整配置流。前端使用 Ant Design 保持浅蓝色任务管理风格，新增企业 AI Provider 选择、模型选择、预设审核维度、自定义维度、基于数据集字段和模板字段生成的 Input 字段说明、可编辑审核评分矩阵、矩阵确认、Output JSON schema 和通过/打回/人工复核阈值。草稿自动保存和发布 payload 现在保存 `provider_id`、`selected_dimensions`、`custom_dimensions`、`input_prompt`、`review_matrix`、`output_schema`、`thresholds`、`matrix_confirmed` 和最终合成 `prompt`；后端生产 schema 与发布 readiness 同步要求启用 AI 时确认矩阵。
- 测试结果：待执行 `npm run typecheck`、`npm run lint`、`conda run -n markup-api python -m compileall apps/api/app`、`git diff --check`。
- 后续动作：当前评分矩阵由前端按维度、数据集和模板结构生成可编辑规则；后续接入真实 AI Worker/AI Gateway 后，应复用同一 `ai_config` 字段生成调用 Prompt 并把结构化输出写回审核记录。
- 类型：前端偏差修正 / 企业账号页最终收口与会话撤销闭环补完
- 关联文档：`docs/product/REQUIREMENTS_AND_NOTES.md`、`docs/design/FRONTEND_DESIGN_STYLE.md`、`docs/api/auth.md`、`docs/planning/TODO.md`
- 内容：按最新确认完成企业端账号管理页最终收口。企业账号中心现在只保留 `账号概览 / 基本资料 / 账号安全 / 第三方账号` 四个分组，彻底移除 `通知偏好` 与重复的 `企业与角色` 子页；`账号概览` 中第三方绑定统计改为按 provider 去重后展示“已绑定第三方账号”；`第三方账号` 改用本地 GitHub / Google / Hugging Face SVG 品牌图标；页面容器改为白底全宽工作台画布，Tabs 横向铺满，资料表单改为更满的双列布局，减少灰底块感和局促留白。`退出全部其他会话` 保留并补齐前后端闭环：前端优先读取最新 refresh token，缺失时直接提示重新登录；后端只有在成功识别当前 refresh session 时才允许撤销其他会话，否则返回 `40101`，避免误撤销全部会话。
- 测试结果：待执行 `npm.cmd run typecheck`、`npm.cmd run build`、`conda run -n markup-api python -m pytest apps/api/tests/test_auth_team_rbac.py`、`git diff --check`。
- 后续动作：继续观察企业账号页在小屏宽度下的双列回退表现；如后续要补设备列表或登录历史，应继续归入 `账号安全`，不再回流独立子页。

- 类型：前端偏差修正 / 人员管理页 Agent 文案收口
- 关联文档：`docs/design/pages/team-member-management.md`、`docs/planning/TODO.md`
- 内容：按最新产品约束清理人员管理页中面向用户的 Agent 冗余提示。前端将工作台角色旧称谓 `AI资源管理员` 统一替换为 `Agent`，移除成员列表里的“系统 Agent”标签和“只读”标签，并把详情抽屉中的成员类型文案收敛为 `Agent`；Agent 仍然保持不可选择、不可编辑、不可删除、不可转交任务等行为限制，但不再额外显示系统/只读提示框。批量导入说明同步改为“Agent 会在企业创建时自动生成”，企业成员管理设计稿和 TODO 里的旧称谓也一并收口，避免后续实现回流。随后又补充了前端显示归一化：即使后端历史数据仍返回旧的 `team_role_label=AI资源管理员`，人员管理页、工作台身份卡和账号概览也会强制展示为 `Agent`。
- 测试结果：待执行 `npm.cmd run typecheck`、`npm.cmd run test -- src/pages/workspace/WorkspaceApp.test.tsx --testTimeout=25000`、`git diff --check`。
- 后续动作：继续检查其余前端页面、测试和设计稿中是否还有残留的旧称谓或显式只读提示，保持 Agent 的系统语义主要通过行为限制表达。

- 类型：前端实现 / 企业账号管理页收口与排版重做
- 关联文档：`docs/product/REQUIREMENTS_AND_NOTES.md`、`docs/design/FRONTEND_DESIGN_STYLE.md`
- 内容：继续收口企业端账号管理页。前端修正 `账号概览` 中第三方账号统计逻辑，改为按已绑定 provider 去重计数并使用“已绑定第三方账号”文案；移除冗余的 `企业与角色` 子页，将默认企业、企业身份和权限摘要并入概览页头部身份卡；同时重做账号页排版，采用“头部身份卡 + 两张摘要卡 + 分区表单/内嵌卡片”结构，改善原先信息块平铺、层级混乱的问题。通知偏好页同步拆为“通知渠道”和“提醒类型”两个内嵌卡片，保持 Ant Design `Tabs + Card + Descriptions + Form` 体系一致。
- 测试结果：待执行 `npm.cmd exec tsc -b --clean`、`npm.cmd run typecheck`、`npm.cmd run build`、`git diff --check`；`WorkspaceApp.test.tsx` 继续以定向断言验证企业账号页标签与文案收口。
- 后续动作：如后续需要恢复企业邀请处理，应优先放入企业管理或全局通知流，不再回流为企业账号中心独立子页。

- 类型：前端偏差修正 / 企业账号管理收敛为个人账号维护
- 关联文档：`docs/product/REQUIREMENTS_AND_NOTES.md`、`docs/design/FRONTEND_DESIGN_STYLE.md`
- 内容：按最新确认收敛企业端账号管理页维护内容。前端企业账号中心保留 `账号概览 / 基本资料 / 账号安全 / 第三方账号 / 通知偏好` 五个分组，但调整其语义边界：`账号概览` 不再展示积分、资质、学历摘要或领域标签，改为展示个人账号摘要、登录与验证状态、默认企业关系；`基本资料` 改为维护头像、显示名、真实姓名、手机号、职位/岗位、所在地和个人简介，不再维护学历或领域标签等 Labeler 字段；`通知偏好` 重组为“通知渠道 + 提醒类型”，覆盖站内、邮件、系统、企业、审核、导出和账号安全提醒；原 `企业与角色` 能力并入概览摘要，不再独立成页。
- 测试结果：待执行 `npm run typecheck`、`npm run test -- src/pages/workspace/WorkspaceApp.test.tsx --testTimeout=25000`、`npm run build` 与 `git diff --check`。
- 后续动作：如后续需要补企业账号中心的邮箱验证动作、默认企业偏好或设备管理，应继续沿“个人账号维护”边界扩展，不回流企业治理内容。

- 类型：前端实现 / 顶栏在线状态指示
- 关联文档：`docs/design/FRONTEND_DESIGN_STYLE.md`、`docs/planning/TODO.md`
- 内容：为登录态顶栏和移动端抽屉中的 `工作台` 入口新增网络连接状态图标。前端新增轻量 `connectivityStatus` 状态通道和 `ConnectionStatusIndicator` 展示组件，不使用轮询或 `/health` 主动探测，而是复用现有 `apiClient` 请求结果驱动状态：请求成功标记为 `connected`，网络错误、超时和服务端 `5xx` 标记为 `disconnected`，`401/403/404/409/422` 等 `4xx` 业务错误不影响当前状态。图标默认初始为绿色正常，断连后显示灰色断开，避免为静态提示引入持续资源开销。
- 测试结果：`npm run typecheck`、`npm run test -- src/services/apiClient.test.ts src/components/layout/SiteNav.test.tsx --testTimeout=25000`、`npm run build` 通过。Vitest 仍输出 jsdom 对 `getComputedStyle` pseudo-elements 的已知未实现提示；Vite build 仍有大 chunk 体积提示。
- 后续动作：如后续需要更强的“服务真实可达”判定，可再评估在页面回前台或显式用户操作时补一次 `/health` 探测，但当前版本保持零轮询、零额外探测开销。

- 类型：前端偏差修正 / 资源配置页 AI 预算收敛为预算治理
- 关联文档：`docs/design/pages/organization-resource-config.md`、`docs/product/REQUIREMENTS_AND_NOTES.md`、`docs/api/team-profile.md`、`docs/planning/TODO.md`
- 内容：资源配置页中的 `AI 预算` 从申请/审批型预算管理收敛为预算治理主线。前端移除预算申请 Drawer、申请列表和审批按钮，改为展示总额度、已用、剩余、使用率和预算健康状态；新增 `预算充值` Drawer，支持微信支付、支付宝、对公转账三种模拟充值方式，并在确认后将“本次充值额度”换算到新的 `total_limit`，复用现有 `/ai-resources/teams/{team_id}/budget/limit` 保存；新增 `预算预警设置` Drawer，直接配置 `enabled + threshold(1-100%)` 并复用现有 `/ai-resources/teams/{team_id}/budget/alerts`。概览状态栏中的 AI 预算指标支持切到预算 Tab，预算页同时补充预算审计入口和成本归因表只读视图。
- 测试结果：待执行 `npm run typecheck`、`npm run test -- src/pages/workspace/WorkspaceApp.test.tsx --testTimeout=25000`、`npm run build` 与 `git diff --check`。
- 后续动作：若后续需要真实预算充值，应先补支付订单、支付状态和充值流水接口，再从“模拟充值成功”切换为真实支付回调；预算申请/审批后续如恢复到前端主路径，需要以活跃文档重新确认交互归属。

- 类型：前端偏差修正 / 企业认证改为上传文件后提交
- 关联文档：`docs/api/team-profile.md`、`docs/design/pages/organization-profile.md`
- 内容：企业信息页的企业认证弹窗移除“认证材料 URL”文本输入，改为只允许先上传认证材料文件、再提交认证。前端复用现有 `/uploads` 上传接口维护已上传材料列表，用户只能查看或移除已上传文件；提交认证时再把上传结果中的材料地址组装进 `verification_materials` 发给现有后端接口，避免把 URL 录入动作暴露给用户。
- 测试结果：待执行 `npm run typecheck`、`npm run test -- src/pages/workspace/WorkspaceApp.test.tsx -t "organization profile|organization verification materials" --testTimeout=25000`、`npm run build` 与 `git diff --check`。
- 后续动作：后端后续如要继续收紧契约，可把 `verification_materials` 从纯字符串列表演进为带 `file_id/filename/url/content_type/size` 的结构化文件对象。

- 类型：前端偏差修正 / 移除工作台数据交付两项占位页
- 关联文档：`docs/design/FRONTEND_DESIGN_STYLE.md`
- 内容：按当前产品收敛范围，移除企业工作台中的 `数据交付` 分组及其两个占位子页 `数据看板`、`导出中心`。前端同步删除导航定义、页面类型、占位页分发、相关占位测试，以及积分管理页中指向已删除 `export-center` 的死链接；旧 query 访问会通过现有 `canAccessWorkspacePage` 回退到默认可访问页。当前导出能力仍保留在任务管理、数据集下载和后端 `/exports` 接口层，不再通过独立工作台页面暴露。
- 测试结果：待执行 `npm run typecheck`、`npm run test -- src/app/workspaceNavigation.test.tsx src/pages/workspace/WorkspaceApp.test.tsx --testTimeout=25000`、`npm run build` 与 `git diff --check`。
- 后续动作：如后续需要恢复企业端交付工作区，应先补齐真实页面设计与交付闭环，再重新引入导航入口，避免继续保留无业务承载的占位页。

- 类型：前端偏差修正 / 企业信息页只读展示与认证首屏可见
- 关联文档：`docs/design/pages/organization-profile.md`、`docs/planning/TODO.md`
- 内容：修复企业信息页默认查看态仍渲染灰色 disabled 表单、导致资料可展示性差的问题。基础资料、开票信息、邮寄信息改为默认静态资料展示，只有点击 `编辑资料` 后才切换为表单；取消编辑会回填后端值并退出编辑态，保存成功后也回到查看态。同步修复企业认证在固定滚动区内被长表单压到下方、首屏看起来“没显示”的问题，桌面端改为 `基本信息 + 企业认证` 首屏并列，移动窄宽度下回落为顺序单列。保留已有 `message.useMessage`、认证弹窗和材料抽屉，继续避免消息条挤压页面布局造成抖动。
- 测试结果：待执行 `npm run typecheck`、`npm run test -- src/pages/workspace/WorkspaceApp.test.tsx -t "organization profile|organization logo|organization verification materials" --testTimeout=25000`、`npm run build` 与 `git diff --check`。
- 后续动作：如后续需要继续提升查看态视觉质感，应在现有静态资料块基础上做信息密度和排版优化，不要回退为 disabled 表单。

- 类型：偏差修正 / 企业信息页从就绪中心收敛回资料维护子页
- 关联文档：`docs/design/pages/organization-profile.md`、`docs/api/team-profile.md`、`docs/product/REQUIREMENTS_AND_NOTES.md`、`docs/planning/TODO.md`
- 内容：根据最新产品确认，企业信息页不再承担“企业就绪中心”职责，改回企业面板下的资料维护子页面。页面主体收敛为四块：基本信息、开票信息、邮寄信息、企业认证；移除就绪度计算、阻塞项/推荐动作、成员/预算/日志快照、治理入口和首屏 Hero。前后端同步新增 `billing_info` 与 `mailing_info` 两组嵌套字段，继续复用 `PUT /teams/{team_id}` 保存企业资料，企业认证仍保持独立接口。
- 测试结果：已同步更新企业信息页前端测试断言和后端企业资料更新测试，待继续执行前后端完整验证命令。
- 后续动作：继续验证现有固定视口样式下四张资料卡片的窄宽度表现；如后续需要扩展多地址或多套开票资料，应另开独立需求，而不是在本页首版直接扩面。

- 类型：交互修正 / 企业信息页改为默认查看态
- 关联文档：`docs/design/pages/organization-profile.md`
- 内容：企业信息页不再默认保持可编辑状态。基础资料、开票信息和邮寄信息改为默认只读，只有显式点击 `编辑资料` 后才进入编辑态；编辑态显示 `取消编辑` 和 `保存修改`，保存成功或取消后退出编辑态。企业认证继续作为独立模块维护，不受主资料编辑态限制。
- 测试结果：待同步前端企业信息页交互测试断言并继续验证。
- 后续动作：继续观察默认查看态下的可读性，如后续需要优化只读字段视觉，可再补统一的 `Descriptions`/只读样式层。

- 类型：前端实现 / 企业信息页升级为企业就绪中心
- 关联文档：`docs/design/pages/organization-profile.md`、`docs/design/FRONTEND_DESIGN_STYLE.md`、`docs/planning/TODO.md`
- 内容：将企业信息页从单纯资料维护页升级为“企业就绪中心”。首屏新增企业身份卡、就绪度卡和主操作区；中段新增阻塞项/风险项/推荐动作面板，以及企业结构、AI 预算、审计活动三张摘要卡；工作区改为基础资料与认证状态双列布局；底部新增成员、资源、日志、认证记录四个治理入口。页面内部新增前端就绪判断层，基于现有企业概览数据组合出 `ready / partial / blocked`，同时把页内成功/失败反馈收敛到 Ant Design `message`，避免旧版内联提示挤压布局造成首屏抖动。
- 测试结果：已补齐 `WorkspaceApp.test.tsx` 中企业信息页的关键断言，覆盖新首屏结构和原有保存/认证成功反馈；本轮仍需继续执行 `npm run typecheck`、`npm run lint`、`npm run test -- src/pages/workspace/WorkspaceApp.test.tsx --testTimeout=25000`、`npm run build`、`git diff --check` 做最终验证。
- 后续动作：继续验证小屏折叠时的首屏层级稳定性与消息提示关闭行为；如后续需要把“最近活动”升级为真实审计预览，应优先补轻量 overview 数据，而不是把日志全模块嵌进本页。

- 类型：需求变更 / 新建任务步骤与领取协议
- 关联文档：`docs/product/REQUIREMENTS_AND_NOTES.md`、`docs/api/production.md`、`docs/api/labeling.md`、`docs/architecture/SYSTEM_ARCHITECTURE.md`、`docs/design/FRONTEND_DESIGN_STYLE.md`、`docs/design/pages/owner-task-management.md`、`docs/planning/TODO.md`
- 内容：新建任务步骤从 8 步收敛为 `基础信息 -> 模板与数据 -> 分发与奖励 -> AI 预审 -> 人工复审 -> 用户协议 -> 确认发布`；基础信息新增领取后完成时限和长期有效截止；用户协议步骤支持默认协议模板、自定义文本和文件选择。任务保存新增 `agreement_config` 与 `claim_config`，Labeler 领取接口新增 `agreement_accepted`，任务要求协议时前端必须勾选且后端拒绝未同意领取；领取后完成时限会写入题目 `claim_due_at`。
- 测试结果：`npm run typecheck`、`conda run -n markup-api python -m compileall apps/api/app` 通过。
- 后续动作：领取超时后的自动回收/提醒、协议附件真实对象存储和任务协议版本审计仍需后续接入。

- 类型：前端偏差修正 / 新建任务发布摘要细节
- 关联文档：`docs/design/FRONTEND_DESIGN_STYLE.md`、`docs/design/pages/owner-task-management.md`
- 内容：按新建任务页面反馈，移除步骤工作区底部操作栏上方重复灰色分割线；发布摘要和确认发布页的积分、资质门槛、AI 预审阈值文案改为业务含义更清楚的紧凑表达，积分为 0 或未填显示 `未填写`，AI 通过阈值和最低准确率统一带 `%`。
- 测试结果：`npm run typecheck`、`npm run lint`、`git diff --check` 通过。
- 后续动作：已用 Playwright 在本地页面检查底部操作栏分割线、右侧摘要积分/百分比文案和确认发布页 AI 阈值；后续如继续压缩摘要密度，可再按真实长模板/数据集名称微调截断策略。

- 类型：需求变更 / 任务管理待审核状态与新建任务自动保存
- 关联文档：`docs/product/REQUIREMENTS_AND_NOTES.md`、`docs/api/production.md`、`docs/architecture/SYSTEM_ARCHITECTURE.md`、`docs/design/FRONTEND_DESIGN_STYLE.md`、`docs/design/pages/owner-task-management.md`、`docs/planning/TODO.md`
- 内容：任务管理和新建任务子页面切换为浅蓝色模块主色，并覆盖发布页原橙色强调。新建任务页移除标题栏常驻保存草稿按钮，基础信息不再预填演示文案；填写任意有效配置后自动保存为 `draft + auto_saved=true`，离开新建任务页前立即保存未落库变更，手动保存/发布前保存会写回 `auto_saved=false`。步骤条将审核拆为 `AI 预审` 与 `人工复审`，资质要求归入 `分发策略`。任务状态机新增 `pending_review`：Owner 发布进入待审核，Team Admin 审核通过后进入 `published/收集中`，Team Admin 自建任务可直接发布；列表状态列调整为自动保存、草稿、待审核、收集中、已暂停、已结束。
- 测试结果：`npm run typecheck`、`npm run lint`、`npm run test -- src/pages/workspace/WorkspaceApp.test.tsx --testTimeout=25000`、`conda run -n markup-api python -m compileall apps/api/app`、`conda run -n markup-api python -m pytest apps/api/tests/test_auth_team_rbac.py` 通过。Vitest 仍输出 jsdom 对 `getComputedStyle`、canvas 和 navigation 的既有未实现提示；后端 pytest 仍有既有 deprecation warnings。
- 后续动作：后续可继续补 Team Admin 专门的发布审核队列和审核意见字段；当前先通过任务列表待审核筛选和行级“审核通过并发布”完成最小闭环。
- 类型：前端体验优化 / 数据集管理表格风格对齐
- 关联文档：`docs/design/pages/owner-dataset-management.md`
- 内容：按任务管理、模板搭建的生产列表表格风格收敛数据集管理页。数据集列表移除独立的 `dataset-ant-table` 外观和行选中高亮，改用统一 `workspace-fixed-table`；列结构调整为主名称单元格、格式/状态、数据规模、字段配置、最近更新和固定操作列；修改、导出、删除改为 Ant Design 图标按钮，导出继续使用 Dropdown，删除继续使用 Popconfirm。卡片视图和详情页字段表格保持原能力。
- 测试结果：`npm run typecheck`、`npm run lint`、`npm run test -- src/pages/workspace/WorkspaceApp.test.tsx --testTimeout=25000`、`git diff --check` 通过。Vitest 仍输出 jsdom 对 `getComputedStyle`、canvas 和 navigation 的既有未实现提示。
- 后续动作：继续用真实数据量检查长数据集名称、长简介、素材数量和多状态标签在 1280×800 下的截断与分页位置。

- 类型：前端偏差修正 / 面包屑二级返回与资源配置积分管理
- 关联文档：`docs/product/REQUIREMENTS_AND_NOTES.md`、`docs/architecture/SYSTEM_ARCHITECTURE.md`、`docs/api/team-profile.md`、`docs/design/pages/organization-resource-config.md`、`docs/design/pages/organization-management.md`、`docs/planning/TODO.md`
- 内容：修复工作台面包屑二级项在子页面/详情态点击无效的问题。`buildWorkspaceBreadcrumbs` 现在同时识别动态 tail 的 `key` 与 `parentKey`，二级面包屑默认可点击；数据集、模板 Designer/Renderer、任务管理新建/详情均补齐 `parentKey` 或 `parentOnClick`，点击二级面包屑可回到对应列表/父页面。资源配置页从单一 AI 额度视角调整为资源治理控制台，默认进入 `积分管理` Tab，概览新增奖励任务、已承诺积分、待结算积分，积分管理表格基于真实任务 `reward_rule` 聚合展示任务奖励预算、通过估算和结算口径；企业级积分池余额、冻结、扣减和冲正接口未接入时明确显示待接入，不伪造余额。AI 预算、Provider、模型额度、资质类型和生产开关原能力保留。
- 测试结果：`npm run typecheck`、`npm run lint`、`npm run test -- src/pages/workspace/WorkspaceApp.test.tsx --testTimeout=25000`、`npm run test -- src/components/layout/AppShell.test.tsx --testTimeout=15000`、`npm run build`、`git diff --check` 通过。Vitest 仍输出 jsdom 对 `getComputedStyle`、canvas 和 navigation 的既有未实现提示；Vite build 仍有大 chunk 提示。
- 后续动作：后端需要补企业作用域积分池余额、发布前冻结、审核后扣减、冲正和低余额预警接口；前端接入后再开放积分池保存能力和发布前余额校验。

- 类型：前端体验优化 / 模板搭建表格操作列图标化
- 关联文档：`docs/design/pages/owner-template-designer.md`
- 内容：按模板搭建页表格操作列反馈，将右侧“操作”列全部改为 Ant Design 图标按钮。修改、新建版本、Renderer 预览、版本历史、导出 schema、复制、发布、归档和删除均保留原有行为，图标按钮补充 Tooltip 或 `aria-label`，危险操作继续通过 `Popconfirm` 二次确认；同时约束行内 icon-only 按钮宽度，降低列内布局抖动。
- 测试结果：`npm run typecheck`、`npm run lint`、`npm run test -- src/pages/workspace/WorkspaceApp.test.tsx --testTimeout=25000`、`git diff --check` 通过。
- 后续动作：如后续继续压缩表格密度，可评估将低频操作收进 Ant Design `Dropdown`，但需以当前“图标化操作列”反馈为准。

- 类型：前端体验优化 / Owner 生产列表表格与卡片视图切换
- 关联文档：`docs/design/FRONTEND_DESIGN_STYLE.md`、`docs/design/pages/owner-production.md`、`docs/design/pages/owner-task-management.md`、`docs/design/pages/owner-dataset-management.md`、`docs/design/pages/owner-template-designer.md`
- 内容：任务管理、模板搭建、数据集管理列表页在既有固定视口和 Ant Design `Table` 默认视图基础上，新增筛选栏右侧 `Segmented` 表格/卡片展示切换。卡片视图统一参考任务广场的信息骨架，使用 Ant Design `Card`、`Tag`、`Progress`、`Checkbox`、`Dropdown`、`Pagination` 等组件；卡片区只在主体内部滚动，底部分页固定并支持每页条数与快速跳转。任务卡片复用表格多选和批量操作栏，模板和数据集卡片保留修改、预览/导出、更多操作与危险操作确认。
- 测试结果：`npm run typecheck` 已通过。后续仍需继续执行 `npm run lint`、专项测试、构建、`git diff --check`，并用 Playwright 在 1280×800 下检查三个页面切换卡片视图后的页面级宽高和分页位置。
- 后续动作：继续用真实数据量验证卡片网格密度、长标题/标签截断、Dropdown 弹层稳定性和批量选择体验。

- 类型：前端偏差修正 / Designer 末尾拖拽投放与释放动画
- 关联文档：`docs/design/FRONTEND_DESIGN_STYLE.md`、`docs/design/pages/owner-template-designer.md`
- 内容：修复模板 Designer 画布中物料无法拖到最后一个物料后方的问题。画布末尾现在有独立的底部分隔线热区，拖拽到该蓝色分隔线时才允许追加到最后；底部分隔线不复用最后一个组件的“前插入”状态，避免目标混淆。按最新交互要求移除拖拽悬停阶段的物料上下偏移动画，拖拽过程中只高亮蓝色分隔线；释放完成后，实际落位物料按来源方向使用 `transform + opacity` 滑入最终位置。
- 测试结果：`npm run typecheck`、`npm run lint`、`npm run test -- src/pages/workspace/WorkspaceApp.test.tsx --testTimeout=25000`、`npm run build`、`git diff --check` 均通过。Playwright 在 1280×800 下验证默认两物料画布中，第一题拖到最后分隔线后可追加到末尾；拖拽悬停时 `.canvas-end-divider.drop-after` 生效，组件块没有 `preview-shift-up/down`，释放后目标物料进入 `.settling.from-above`，页面保持 `scrollWidth=1280`、`scrollHeight=800`。Vitest 仍输出 happy-dom/jsdom 对 pseudo-elements、canvas 和 navigation 的既有未实现提示，Vite build 仍有大 chunk 提示，浏览器控制台仍有既有 Ant Design Drawer `width` deprecated 提示。
- 后续动作：继续在更多物料数量和较低高度视口下检查末尾分隔线命中范围、Dropdown 自动翻转和落位动画速度。

- 类型：前端体验优化 / Designer 拖拽让位与落位动画
- 关联文档：`docs/design/pages/owner-template-designer.md`
- 内容：为模板 Designer 画布拖拽移动和分隔线插入增加轻量让位与落位动画。拖拽悬停到分隔线时，受影响题块先通过 `preview-shift-up/down` 上下让位，避免直接切换成调整后顺序；拖拽完成后，目标物料块短暂进入 `settling` 状态，使用 `transform + opacity` 做 180ms 回落，不改变题块连续布局；保留拖动中物料的轻微缩放和透明度反馈，并对 `prefers-reduced-motion` 关闭动画。
- 测试结果：`npm run typecheck`、`npm run lint`、`npm run test -- src/pages/workspace/WorkspaceApp.test.tsx --testTimeout=25000`、`npm run build`、`git diff --check` 均通过。Playwright 在 1280×800 下验证拖拽悬停时受影响物料块进入 `preview-shift-down` 并产生 transform 过渡，放下后目标物料块短暂进入 `.settling`，动画名为 `designer-component-settle`，约 260ms 后自动清除，页面仍保持 `scrollWidth=1280`、`scrollHeight=800`。Vitest 仍输出 happy-dom/jsdom 对 pseudo-elements、canvas 和 navigation 的既有未实现提示，Vite build 仍有大 chunk 提示。
- 后续动作：继续在真实手动拖拽场景观察让位距离和动画速度是否需要微调。

- 类型：前端视觉调整 / Designer 考试问卷式连续题块
- 关联文档：`docs/design/FRONTEND_DESIGN_STYLE.md`、`docs/design/pages/owner-template-designer.md`
- 内容：按考试题目/问卷页面心智继续调整模板 Designer 画布。物料组件改为上下紧贴的连续题块，插入热区改为绝对定位覆盖在题块分割线上，不再占用组件之间的排版高度；题号视觉改为更接近题目编号的圆形编号，组件行保持白底、无圆角、无阴影。
- 测试结果：`npm run typecheck`、`npm run lint`、`npm run test -- src/pages/workspace/WorkspaceApp.test.tsx --testTimeout=25000`、`npm run build`、`git diff --check` 均通过。Playwright 在 1280×800 下验证页面级 `scrollWidth=1280`、`scrollHeight=800`，两个连续物料块之间的量测间距为 `0px`，插入热区为绝对定位覆盖在题块边界上，题号为圆形 30px 编号。Vitest 仍输出 happy-dom/jsdom 对 pseudo-elements、canvas 和 navigation 的既有未实现提示，Vite build 仍有大 chunk 提示。
- 后续动作：继续按真实长标题、长字段名和多题块场景检查题面密度、行内操作显隐和分割线热区命中。

- 类型：前端偏差修正 / Designer 发布按钮与顶部插入标签
- 关联文档：`docs/design/FRONTEND_DESIGN_STYLE.md`
- 内容：按当前交互反馈微调模板 Designer 标题栏与画布顶部插入入口。标题栏最右侧主操作 `发布模板` 改为图标 + 文字按钮，其余返回、Renderer 预览、导出 schema、保存草稿仍保持图标按钮；中间画布顶部增加安全内边距，避免最顶部蓝色分割线上的“插入物料”标签被画布上边界裁切。
- 测试结果：`npm run typecheck`、`npm run lint`、`npm run test -- src/pages/workspace/WorkspaceApp.test.tsx --testTimeout=25000`、`git diff --check` 均通过。Playwright 在 1280×800 下验证：发布按钮显示 `发布模板` 且宽 104px，其余标题栏按钮文本为空；最顶部插入标签完整显示在画布内，画布保持 `scrollWidth=1280`、`scrollHeight=800`。Vitest 仍输出 happy-dom/jsdom 对 pseudo-elements、canvas 和 navigation 的既有未实现提示。
- 后续动作：继续根据真实拖拽手感微调顶部/底部分隔线热区。

- 类型：前端偏差修正 / Designer 分隔线投放反馈收窄
- 关联文档：`docs/design/FRONTEND_DESIGN_STYLE.md`、`docs/design/pages/owner-template-designer.md`
- 内容：继续收窄模板 Designer 的拖拽投放反馈。拖拽组件接近蓝色分割线时，只允许蓝色分割线本身进入高亮状态，下方物料组件块保持常态白底，不再添加 `drop-target` 类、蓝色背景或顶部高亮线，避免误以为物料块本身是投放目标。
- 测试结果：`npm run typecheck`、`npm run lint`、`npm run test -- src/pages/workspace/WorkspaceApp.test.tsx --testTimeout=25000`、`git diff --check` 均通过。Playwright 在 1280×800 下用真实 `DataTransfer` 触发分隔线 `dragover`，确认 `.canvas-component-stack` 进入 `drop-before`、分隔线从 1px 变 2px 蓝色，而下方 `.component-card` 仍为白底、无背景图、无阴影、无圆角且无额外高亮类。Vitest 仍输出 happy-dom/jsdom 对 pseudo-elements、canvas 和 navigation 的既有未实现提示。
- 后续动作：继续在真实浏览器手动拖拽多组件时观察蓝线热区命中范围。

- 类型：前端偏差修正 / Designer 分隔线投放与 Renderer 预览收起
- 关联文档：`docs/design/FRONTEND_DESIGN_STYLE.md`、`docs/design/pages/owner-template-designer.md`
- 内容：按问卷式页面切片继续收敛模板 Designer 和 Renderer。Designer 标题栏操作改为常态图标按钮，通过 Tooltip 命名返回、Renderer 预览、导出 schema、保存草稿和发布模板；画布组件块不再常态 blue active，也不再作为两个组件之间的拖拽投放区，只有拖到独立蓝色分割线热区时才显示高亮并插入；“插入物料”标签与候选 Dropdown 改为以分割线中心对齐。Renderer 预览页迁移同款图标化操作和“收起标题与概览”模式，收起后隐藏标题与结构概览，扩大模拟标注页和运行检查工作区。
- 测试结果：`npm run typecheck`、`npm run lint`、`npm run test -- src/pages/workspace/WorkspaceApp.test.tsx --testTimeout=25000`、`npm run build`、`git diff --check` 均通过。Playwright 在 1280×800 下验证：Designer 标题栏 5 个操作按钮文本为空且宽 34px；组件 hover 不触发插入标签，分隔线 hover 后标签和 Dropdown 与蓝线中心对齐；组件 `.active` 数量为 0；Renderer 收起后页面仍为 `scrollWidth=1280`、`scrollHeight=800`，数据选择工具条上移到固定区顶部，预览工作区高度从 477px 增至 640px。Vitest 仍输出 happy-dom/jsdom 对 pseudo-elements、canvas 和 navigation 的既有未实现提示，Vite build 仍有大 chunk 提示。
- 后续动作：继续用真实多组件拖拽和低高度视口检查分隔线热区命中范围、Dropdown 自动翻转与 Renderer 右侧运行检查长列表滚动。

- 类型：前端视觉调整 / Designer 画布问卷式页面切片
- 关联文档：`docs/design/FRONTEND_DESIGN_STYLE.md`、`docs/design/pages/owner-template-designer.md`
- 内容：按问卷编辑器心智调整模板 Designer 中间画布。画布主体改为纯白页面，组件不再以圆角矩形卡片堆叠，而是作为页面连续分段展示；组件之间的插入入口改为蓝色分割线，悬停、聚焦或拖拽指向时高亮并显示小型“插入物料”标签，继续通过 Ant Design Dropdown 选择物料。
- 测试结果：`npm run typecheck`、`npm run lint`、`npm run test -- src/pages/workspace/WorkspaceApp.test.tsx --testTimeout=25000`、`npm run build`、`git diff --check` 均通过。Playwright 在 1280×800 下验证 Designer 页面级 `scrollWidth=1280`、`scrollHeight=800`；画布为纯白背景、`borderRadius=0`、`boxShadow=none`；组件行 `borderRadius=0`、`boxShadow=none`，选中态仅保留上下细线；插入入口高 18px，默认细蓝线、悬停后 2px 蓝线，Ant Design Dropdown 打开后不改变页面宽高且候选菜单未被画布裁切。Vitest 仍输出 happy-dom/jsdom 对 pseudo-elements、canvas 和 navigation 的既有未实现提示，Vite build 仍有大 chunk 提示。
- 后续动作：继续检查蓝色插入线在不同组件数量、空画布和折叠标题状态下的可点击区域与视觉密度。

- 类型：前端偏差修正 / Designer 画布插入与折叠工作区
- 关联文档：`docs/design/FRONTEND_DESIGN_STYLE.md`、`docs/design/pages/owner-template-designer.md`
- 内容：继续按 Ant Design 组件基线细化模板 Designer。中间画布插入入口从自绘横线 + 加号槽改为紧凑 Ant Design `Button + Dropdown`，物料候选菜单挂到页面稳定容器，避免被画布裁切；移除重复的“页签操作”按钮，保留每个页签标题上的更多菜单与新增页签按钮；画布顶部新增折叠按钮，可收起标题栏和结构概览以扩大三栏工作区；左侧物料栏与右侧属性面板标题改为 sticky 固定在栏顶部。
- 测试结果：`npm run typecheck`、`npm run lint`、`npm run test -- src/pages/workspace/WorkspaceApp.test.tsx --testTimeout=25000`、`npm run build`、`git diff --check` 均通过。Playwright 在 1280×800 下验证：插入入口为完整的 `插入物料` Ant Design Button；“页签操作”按钮数量为 0；物料候选 Dropdown 高度限制为 320px 且内部滚动，打开后页面 `scrollWidth=1280`、`scrollHeight=800`；收起标题与结构概览后三栏 shell 高度从 552px 增加到 698px，画布内部高度从 420px 增加到 566px；左右栏标题在滚动后仍 sticky 固定。
- 后续动作：继续观察真实长物料菜单和更低高度视口下的 Dropdown 自动翻转位置；当前构建仍有既有 Vite 大 chunk 提示。

- 类型：前端体验优化 / 模板 Designer 固定视口与图标操作
- 关联文档：`docs/design/FRONTEND_DESIGN_STYLE.md`、`docs/design/pages/owner-template-designer.md`、`docs/planning/TODO.md`
- 内容：按统一工作台风格优化模板 Designer 子页面。Designer 现在固定在单浏览器视口内，标题栏和结构状态条固定，左侧物料区、中间画布、右侧属性面板分别内部滚动；物料区改为图标化紧凑列表，模板名称与参考数据集压缩到同一行；页签操作在页签栏通过更多菜单完成，画布插入入口可直接选择物料，组件上移、下移、复制、删除改为 Ant Design 图标按钮并配 Tooltip。
- 测试结果：`npm run typecheck`、`npm run lint`、`npm run test -- src/pages/workspace/WorkspaceApp.test.tsx --testTimeout=25000`、`npm run build`、`git diff --check` 均通过。Playwright 在 1280×800 和 1920×1080 下验证 Designer 页面级 `scrollWidth` / `scrollHeight` 等于当前视口，左侧物料区、中间画布、右侧属性面板均为内部滚动；打开画布插入物料 Dropdown 与参考数据集 Select 前后页面宽高保持不变。
- 后续动作：继续按真实长字段、长页签名和更多数据集样例检查 Designer 的截断、Tooltip 与属性面板长表单细节；当前浏览器控制台仍可见既有 Ant Design Drawer `width` deprecated 提示，后续应统一改用 `size` 或组件级宽度规范。

- 类型：测试修正 / 浏览器验证
- 关联文档：`docs/design/FRONTEND_DESIGN_STYLE.md`
- 内容：修正 `WorkspaceApp.test.tsx` 中发布检查弹窗的定位方式，改为按 dialog role 定位，避免与页面内同名 `Alert` 标题冲突。随后重跑 `npm run test -- src/pages/workspace/WorkspaceApp.test.tsx --testTimeout=25000` 通过。使用 Playwright 在 1280×800 下实机复核任务管理、数据集管理、新建任务、人员管理、操作日志和企业信息页面，确认各页面 `scrollWidth` / `scrollHeight` 均固定为 1280 / 800，固定标题、统计、筛选和表格/配置区布局未出现页面级滚动。
- 后续动作：继续在资源配置、公告通知和模板搭建的真实数据场景下检查长文本、下拉菜单和抽屉打开后的边界表现。

- 类型：前端偏差修正 / 工作台固定列表样式与抖动修复
- 关联文档：`docs/design/FRONTEND_DESIGN_STYLE.md`
- 内容：修复工作台固定列表页的实际视觉偏差。任务管理新增任务子页面面包屑补齐 `parentKey=task-management`，进入新增任务后显示 `工作台 / 任务管理 / 新建任务`；任务清单导出 Dropdown、筛选 Select 和操作日志日期选择器改为稳定局部弹层，配合全局 `scrollbar-gutter` 与横向裁切，避免 hover 或点击筛选时页面右侧左右抖动。页面级成功/失败 Alert 改为可关闭浮层，不再挤占标题、统计、筛选和表格布局。人员管理、公告通知、操作日志复用 `production-list-page` 骨架，企业信息和资源配置复用 Ant Design `Statistic` 统计条，形成统一的固定标题、固定统计、固定筛选、内部滚动表格/配置区结构。
- 测试结果：`npm run typecheck`、`npm run lint` 通过。Playwright 在 1280×800 下验证任务管理、人员管理、公告通知、操作日志的 `scrollWidth=1280`、`scrollHeight=800`，标题/统计/筛选/表格连续贴合；任务管理 hover `导出任务清单` 和点击分类筛选后页面宽高保持不变；点击 `新建任务` 后面包屑显示新增子页面。
- 后续动作：继续按真实数据量检查各列表行操作下拉和高级筛选折叠策略；如操作日志筛选项继续增加，应改为高级筛选 Drawer。

### 2026-05-30

- 类型：设计系统 / 工作台固定视口布局统一
- 关联文档：`docs/design/FRONTEND_DESIGN_STYLE.md`
- 内容：确认并落地工作台页面统一固定视口规则。桌面端工作台页面不再依赖浏览器页面上下滚动承载主流程，统一采用固定页面标题、固定数据概览、固定搜索筛选和内部滚动 Ant Design `Table` / Tabs / 表单区域；任务管理、模板搭建、数据集管理进一步收敛为同一套 `production-list-page` 骨架，统计条统一使用 Ant Design `Statistic`，搜索和筛选统一使用单行 `Input.Search` / `Select`，表格容器填满筛选条下方剩余高度，分页器固定在右下角并保留每页条数与快速跳转。人员管理、公告通知、操作日志按列表页骨架收敛，企业信息和资源配置按固定摘要 + 内部滚动配置区收敛。表格统一补充固定 body、右下角分页、快速跳转和稳定列布局，减少横向滚动和页面抖动。
- 测试结果：`npm run typecheck`、`npm run lint`、`npm run test -- src/app/workspaceNavigation.test.tsx --testTimeout=15000`、`npm run test -- src/pages/workspace/WorkspaceApp.test.tsx --testTimeout=25000`、`npm run build`、`git diff --check` 均通过。Playwright 在 1280×800 与 1920×1080 下抽查 `templates`、`task-management`、`datasets`、`people-management`、`organization-info`、`resource-config`、`announcements`、`operation-logs`，浏览器级纵向/横向溢出均为 0；任务管理、模板搭建、数据集管理在 1280×800 下标题/统计/筛选连续贴合，表格容器底部为 800px，分页器底部为 798-799px；打开任务筛选下拉前后 `scrollWidth` / `scrollHeight` 保持 1280 / 800。Vitest 仍输出 happy-dom/jsdom 对 pseudo-elements、canvas 和 navigation 的既有未实现提示，Vite build 仍有大 chunk 体积提示。
- 后续动作：继续按真实数据量细化单页表格列宽、分页展示和高级筛选抽屉。

### 2026-05-29

- 类型：前后端迁移 / Labeler 账号中心迁入新 WorkspaceApp
- 关联文档：`docs/api/team-profile.md`、`docs/design/FRONTEND_DESIGN_STYLE.md`、`docs/planning/TODO.md`
- 内容：按 `docs/workflow/WORKSPACE_APP_MIGRATION_PROMPT.md` 将旧工作区的 Labeler 登录后账号中心迁入新克隆仓库。Labeler 账号管理保持独立页面，侧栏仍只暴露账号管理和标注页面；账号管理内分为基础信息、资质认证、积分管理。基础信息改为学历、院校、学信网/非学信网证明材料提交；资质认证补齐行业/职业两级选择、详细/模糊展示、材料上传删除、规则页、材料说明页和用户协议页；积分管理补等级规则页跳转。企业账号中心继续只承载个人账号维护，企业信息、人员管理、资源配置和管理员注册链路不回灌账号页。
- 后端：扩展 `UserProfile`、`ProfileUpdateRequest`、`profile_service`，支持 `education_school`、`education_report_mode`、`education_report_documents`，职业资质提交保存 `industry/display_type/registration_number/agreement_accepted/supplement_documents` 等字段；后端测试同步为新的基础信息完成度规则。
- 测试结果：`npm run typecheck` 通过；`npm run test -- WorkspaceApp -t "clears dynamic breadcrumb tail|enterprise account center|people management module|saves personal profile|professional certification guide|points income" --testTimeout=30000` 通过，WorkspaceApp 42 passed；`npm run test -- src/app/workspaceNavigation.test.tsx --testTimeout=15000` 通过，5 passed；`python -m compileall apps/api/app` 通过；`python -m pytest apps/api/tests/test_auth_team_rbac.py` 通过，26 passed。`conda run -n markup-api ...` 因本机 `D:\conda2\envs\markup-api` 不存在无法执行，已用系统 Python 完成后端验证。Vitest 仍输出 jsdom 对 `getComputedStyle` pseudo-elements、canvas 和 navigation 的既有未实现提示，不影响断言。
- 后续动作：平台运营端仍需继续完善真实资质审核工作台、等级门槛策略和个人认证材料预览权限体验。

### 2026-05-29

- 类型：迁移收尾 / 新窗口交接提示词
- 关联文档：`docs/workflow/NEW_WINDOW_PROMPT.md`、`docs/workflow/DEVELOPMENT_WORKFLOW.md`
- 内容：完成旧工作台备份目录迁移核对后的收尾。已确认任务管理、模板搭建、人员管理、企业信息、资源配置、公告通知、操作日志 7 个页面在当前新 WorkspaceApp 架构中保留更完整的新实现；差异主要为 Ant Design 加载/错误态、`WorkspaceLoading`、`Spin`、`Alert`、动态面包屑 `parentKey` 和权限兜底等新框架适配，不再依赖旧备份目录。`docs/workflow/NEW_WINDOW_PROMPT.md` 更新为新窗口通用交接提示词，强调现场确认仓库状态、活跃文档、动态工作台导航、账号分流、旧行为禁用项和验证命令。
- 测试结果：迁移核对阶段已执行 `npm run typecheck`、`npm run lint`、`npm run test -- src/app/workspaceNavigation.test.tsx --testTimeout=15000`、`npm run test -- src/pages/workspace/WorkspaceApp.test.tsx --testTimeout=25000`、`npm run test -- src/app/App.test.tsx src/components/layout/AppShell.test.tsx --testTimeout=15000`、`npm run build`、`git diff --check`，均通过。Vitest 仍输出 happy-dom/jsdom 对 pseudo-elements、canvas 和 navigation 的既有未实现提示；Vite build 仍有大 chunk 体积提示。
- 后续动作：新窗口继续开发时必须先看 `git status --short` 和本条记录后的最新 diff；不要恢复旧账号页企业管理、管理员注册链路或旧版静态侧栏。

### 2026-05-29

- 类型：文档更新 / 工作台两路分流与动态导航
- 关联文档：`docs/product/REQUIREMENTS_AND_NOTES.md`、`docs/architecture/SYSTEM_ARCHITECTURE.md`、`docs/design/FRONTEND_DESIGN_STYLE.md`、`docs/planning/TODO.md`
- 内容：同步最新工作台前端基线。企业用户和 Labeler 的账号管理明确为两套页面：企业端保留账号概览、基本资料、安全、OAuth、通知偏好，默认企业与权限摘要并入概览展示，企业信息、人员管理、资源配置和管理员注册链路归属企业管理模块；Labeler 端保留基础信息、资质管理、积分管理。工作台侧栏改为按 Team Admin / Owner / Reviewer / Agent / Labeler 动态生成，企业用户默认进入 Dashboard，Labeler 默认进入账号管理；不可访问的 `page` query 需要回退身份默认页并替换 URL。面包屑和功能页页头作为 Shell 级稳定导航，动态尾部通过 `parentKey` 绑定父页面，避免切页闪烁或串页。
- 测试结果：本轮相关实现已验证 `npm.cmd run typecheck`、`npm.cmd run test -- src/app/App.test.tsx src/components/layout/AppShell.test.tsx --testTimeout=15000`、`npm.cmd run test -- src/app/workspaceNavigation.test.tsx --testTimeout=15000`、`npm.cmd run test -- src/pages/workspace/WorkspaceApp.test.tsx -t "saves personal profile" --testTimeout=15000`、`git diff --check`。`npm.cmd run lint` 仍被既有 `react-hooks/set-state-in-effect` 问题阻断，位置在 `App.tsx` 和 `LoginPage.tsx`，不属于本次文档同步新增问题。
- 后续动作：后续新增工作台页面或账号入口时，必须同步更新 `workspaceNavigation` 的可访问页、默认页、面包屑父页面绑定和对应测试。

### 2026-05-29

- 类型：前后端实现 / Labeler 账号管理页重构
- 关联文档：`docs/api/team-profile.md`
- 内容：Labeler 工作台侧栏只保留“个人工具 / 账号管理”，账号管理页拆为“基础信息、资质管理、积分管理”。基础信息补齐真实姓名、性别、生日、职业、从业年限等字段；资质管理改为学历/领域材料上传后由平台运营方审核；积分管理只展示收益数据概览。
- 后端：`GET /profile/me` 增加 `labeler_account` 概览；`PUT /profile/me` 支持新增基础资料字段；新增 `POST /profile/certifications/materials` 和受权限保护的材料下载接口；`GET /profile/points` 增加 `overview`。
- 后续动作：平台运营端后续需要接入资质审核工作台的材料预览和审核操作流。

### 2026-05-29

- 类型：前端偏差修正 / 工作台全域水印
- 关联文档：`docs/design/FRONTEND_DESIGN_STYLE.md`、`docs/planning/TODO.md`
- 内容：修复工作台水印只覆盖主内容区、漏掉左侧菜单栏以下区域的问题。`AppShell` 的水印现在作为工作台 Shell 级固定层挂载，覆盖全局顶部导航以下的整个工作台区域（包含侧边栏、面包屑和主内容），`pointer-events: none` 保证不影响菜单、表格和表单操作；水印内容优先使用用户展示名/用户名，并显示邮箱，后续若会话只提供手机号也可回退显示手机号。根据视觉反馈，水印透明度从 `rgba(23, 32, 51, 0.18)` 调浅到 `rgba(23, 32, 51, 0.12)`，降低对表格和画布内容的干扰。
- 测试结果：`npm run typecheck`、`npm run lint`、`npm run test -- AppShell WorkspaceApp` 通过，AppShell / WorkspaceApp 46 passed；Playwright 登录本地工作台后确认水印外层从 `top=60` 覆盖至视口底部、宽度等于视口宽度并覆盖侧边栏，且 `pointer-events=none`；`git diff --check` 待最终提交前执行。Vitest 仍输出 jsdom 对 `getComputedStyle` pseudo-elements、`HTMLCanvasElement.getContext` 和 navigation 的既有未实现提示。
- 后续动作：如后续会话用户模型补充 `display_name`、`phone` 或 `mobile` 类型字段，应同步收紧 `ApiUser` 类型，避免继续用兼容扩展读取。

### 2026-05-29

- 类型：前端偏差修正 / 工作台顶部层级收尾
- 关联文档：`docs/design/FRONTEND_DESIGN_STYLE.md`、`docs/design/pages/owner-template-designer.md`、`docs/planning/TODO.md`
- 内容：修复工作台固定磨砂面包屑导航遮挡各页面标题栏的问题。`AppShell` 现在在存在工作台面包屑时统一生成 `app-shell--workspace-breadcrumbs` 状态类，并通过 `--workspace-top-offset` / `--workspace-available-height` 为主内容、水印、页面 sticky 标题、Designer/任务发布/数据集等满高工作区预留导航高度；没有面包屑的工作台状态仍按普通顶部导航计算。当前收尾只处理现有功能链路的布局稳定性，后续高级能力继续暂停。
- 测试结果：`npm run typecheck`、`npm run lint`、`npm run test -- AppShell WorkspaceApp` 和 `git diff --check` 通过，AppShell / WorkspaceApp 45 passed。Vitest 仍输出 jsdom 对 `getComputedStyle` pseudo-elements、`HTMLCanvasElement.getContext` 和 navigation 的既有未实现提示。
- 后续动作：如后续继续增加全屏工作区或新的固定工具条，必须复用 Shell 层工作台顶部偏移变量，避免各页面自行硬编码 `nav-height` 导致再次重叠。

### 2026-05-29

- 类型：前后端实现 / 模板版本预览与导出
- 关联文档：`docs/api/production.md`、`docs/product/REQUIREMENTS_AND_NOTES.md`、`docs/design/pages/owner-template-designer.md`、`docs/planning/TODO.md`
- 内容：补齐模板版本历史的历史 schema 使用闭环。后端 `GET /templates/{template_id}/versions` 现在返回每个版本的完整 `schema` 快照；前端版本历史抽屉新增历史版本 `预览` 与 `导出` 操作，预览进入完整 Renderer 子页面并使用对应版本 schema，导出下载对应版本 schema JSON。Renderer 预览页新增预览数据集和样例行选择器，按选中 `preview_rows[n]` 模拟 ShowItem content 与运行时校验，避免只能看第一行样例。
- 测试结果：`npm run typecheck`、`npm run lint`、`npm run test -- WorkspaceApp` 通过，WorkspaceApp 41 passed；`conda run -n markup-api python -m compileall apps/api/app` 通过；`conda run -n markup-api python -m pytest apps/api/tests/test_auth_team_rbac.py` 通过，16 passed。Vitest 仍输出 jsdom 对 `getComputedStyle` pseudo-elements、`HTMLCanvasElement.getContext` 和 navigation 的既有未实现提示；后端仍有既有 passlib/FastAPI/datetime deprecation warnings。
- 后续动作：模板搭建后续剩余高级能力为多条件联动、联动校验、自定义校验安全沙箱和 LLM 组件真实调用链路；如继续细化版本管理，可补“复制历史版本为新草稿版本”的显式行内入口。

### 2026-05-29

- 类型：前端测试 / 模板 Renderer 一致性验收
- 关联文档：`docs/api/labeling.md`、`docs/planning/TODO.md`
- 内容：补充 Labeler 工作台与模板 Designer Renderer 的同源 schema 验收。当前 Labeler 工作台读取 `GET /labels/workbench/{task_id}` 返回的任务绑定模板版本 schema，并直接复用共享 `TemplateRenderer`；新增前端测试覆盖 Labeler 工作台中的 `linkage_rules` 条件显示、隐藏组件字段错误过滤，以及切换答案后显示目标字段并成功提交。
- 测试结果：`npm run test -- WorkspaceApp` 通过，41 passed；Vitest 仍输出 jsdom 对 `getComputedStyle` pseudo-elements、canvas getContext 和 anchor navigation 的既有未实现提示。
- 后续动作：模板搭建后续继续补版本历史指定版本预览/导出、Renderer 预览数据选择、多条件联动和联动校验。

### 2026-05-29

- 类型：前端实现 / 模板搭建 schema 导入导出
- 关联文档：`docs/design/pages/owner-template-designer.md`、`docs/planning/TODO.md`
- 内容：补齐模板搭建页 schema 导入/导出闭环。模板列表页新增可用的 `导入 schema` Modal，支持粘贴完整模板对象或裸 schema，并在进入 Designer 前校验 `schema_version`、非空 `tabs`、物料类型、组件 ID 唯一性和非 ShowItem 答案字段唯一性；模板列表行和 Designer 头部新增 schema JSON 下载。删除包含物料的页签时改为二次确认，并同步移除引用页签内组件的联动规则；画布插入槽只在聚焦或拖拽指向时显性显示，减少组件 hover 与插入位置的选中混淆。
- 测试结果：`npm run test -- WorkspaceApp` 通过，40 passed；Vitest 仍输出 jsdom 对 `getComputedStyle` pseudo-elements、canvas getContext 和 anchor navigation 的既有未实现提示。
- 后续动作：继续补版本历史 Drawer 的指定历史版本导出/预览、Renderer 预览数据选择和多条件联动/联动校验；后续如接入真实 dnd-kit，可进一步增强键盘拖拽和无障碍排序。

### 2026-05-29

- 类型：前后端实现 / 导出日期范围与答案字段
- 关联文档：`docs/api/review-ai-export.md`、`docs/planning/TODO.md`
- 内容：补齐导出中心的日期范围过滤和审核通过数据导出口径。`POST /exports` 的 `filters` 现在支持 `start_date`、`end_date`，按提交记录最近更新时间过滤；导出行除题目源内容外包含 `submission_id`、`labeler_id`、`answers`、`submitted_at`、`submission_status` 和 `submission_updated_at`，Owner 可按已通过状态导出含答案的数据。任务管理页的单任务导出和批量导出弹窗新增日期范围选择，随状态筛选一并写入导出任务。
- 测试结果：`conda run -n markup-api python -m compileall apps/api/app` 通过；`conda run -n markup-api python -m pytest apps/api/tests/test_auth_team_rbac.py` 通过，16 passed；`npm run typecheck`、`npm run lint`、`npm run test -- WorkspaceApp` 通过，39 passed；`git diff --check` 通过。Vitest 仍输出既有 jsdom `getComputedStyle`、`HTMLCanvasElement.getContext` 和 navigation 未实现提示。
- 后续动作：继续把导出任务从同步生成替换为真实 worker 异步处理，并补完整导出中心页面。

### 2026-05-29

- 类型：前后端实现 / 人工审核展示 AI 预审
- 关联文档：`docs/api/review-ai-export.md`
- 内容：审核详情接口 `GET /reviews/submissions/{submission_id}` 现在会附带最近一条 AI 预审 job；人工审核 Drawer 新增 `AI 预审` 页签，展示 job 状态、Job ID、创建时间、Prompt 和结果 JSON。当前展示的是 pending job 和结果占位，后续 worker 写回结构化评分后可直接在此页签展示。
- 测试结果：`conda run -n markup-api python -m compileall apps/api/app`、`conda run -n markup-api python -m pytest apps/api/tests/test_auth_team_rbac.py` 通过，15 passed；`npm run typecheck`、`npm run test -- WorkspaceApp` 通过，39 passed。曾误在仓库根目录执行 `npm run test -- WorkspaceApp` 导致 ENOENT，已在 `apps/web` 下重跑通过。Vitest 仍输出既有 jsdom 未实现提示。
- 后续动作：AI worker 写回结果后继续补维度评分、AI 评语和人工审核决策建议展示。

### 2026-05-29

- 类型：前端实现 / AI 预审任务页
- 关联文档：`docs/api/review-ai-export.md`
- 内容：将工作台 `AI预审` 从占位页替换为真实任务列表页。前端新增 `aiReviewService` 和 `AiReviewPage`，接入 `GET /ai-reviews/tasks`、`GET /ai-reviews/tasks/{job_id}` 和 `POST /ai-reviews/submissions/{submission_id}/trigger`，展示状态摘要、pending/failed/completed 指标、任务表格、详情 Drawer 和按提交 ID 手动触发入口。当前页面明确提示 worker 和模型结果写回仍待后续阶段。
- 测试结果：`npm run typecheck` 通过；`npm run test -- WorkspaceApp` 通过，39 passed。Vitest 仍输出 jsdom 对 `getComputedStyle` pseudo-elements、canvas getContext 和页面跳转的既有未实现提示。
- 后续动作：后续接入 AI worker 执行状态、结构化评分结果、失败重试和审核工作台 AI 评语展示。

### 2026-05-29

- 类型：后端实现 / AI 预审最小入队
- 关联文档：`docs/api/review-ai-export.md`、`docs/planning/TODO.md`
- 内容：新增 `ai_review_jobs` 模型、索引、`/ai-reviews` 路由和服务。Labeler 提交答案时，如果任务开启 `ai_config.enabled`，后端自动创建 `pending` AI 预审 job；`POST /ai-reviews/submissions/{submission_id}/trigger` 和 `POST /ai-reviews/batch-trigger` 支持手动/批量触发并按 `submission:{submission_id}:ai-review` 幂等返回已有任务；`GET /ai-reviews/tasks` 和 `GET /ai-reviews/tasks/{job_id}` 支持按权限查看 job。`ai_review` 生产开关已接入自动入队和手动触发链路，关闭时返回 `42201 + detail.switch_key=ai_review`。
- 测试结果：`conda run -n markup-api python -m compileall apps/api/app` 通过；`conda run -n markup-api python -m pytest apps/api/tests/test_auth_team_rbac.py` 通过，15 passed。后端仍有既有 passlib/FastAPI/datetime deprecation warnings。
- 后续动作：继续实现 AI worker、AI Gateway 调用、结构化评分、失败重试、成本日志、结果写回和审核工作台 AI 评语展示。

### 2026-05-29

- 类型：后端实现 / 审核通过积分结算
- 关联文档：`docs/api/team-profile.md`、`docs/planning/TODO.md`
- 内容：补齐人工审核通过后的积分入账。`submit_review_decision` 在 `approved` 分支按任务 `reward_rule.points_per_item` / `unit_points` 结算标注员奖励，写入 `points_wallets` 和 `points_ledger`；流水使用 `source_type=submission_review` 与 `source_id=submission_id` 做幂等保护，批量审核逐条复用同一逻辑。审核审计日志同步记录 `points_settlement` 结果。
- 测试结果：`conda run -n markup-api python -m compileall apps/api/app` 通过；`conda run -n markup-api python -m pytest apps/api/tests/test_auth_team_rbac.py` 通过，14 passed。后端仍有既有 passlib/FastAPI/datetime deprecation warnings。
- 后续动作：后续可补积分撤销/冲正、任务总积分模式的更细分配规则，以及前端贡献中心的积分流水明细入口。

### 2026-05-29

- 类型：前后端实现 / Labeler 打回详情与重新提交
- 关联文档：`docs/api/labeling.md`、`docs/planning/TODO.md`
- 内容：补齐标注员打回处理小闭环。后端新增 `GET /labels/questions/{question_id}/rejection`，仅允许当前领取该题目的标注员查看，返回最近一次 `rejected/revise` 审核意见和历史打回记录，当前数据来自 `submission_reviewed` 审计日志；既有 `POST /labels/questions/{question_id}/submit` 已支持 `rejected` 题目重新提交。前端标注工作台在打回题目上展示上一轮审核意见、审核员和轮次信息，并将提交按钮文案切换为“重新提交”。
- 测试结果：`conda run -n markup-api python -m compileall apps/api/app` 通过；`conda run -n markup-api python -m pytest apps/api/tests/test_auth_team_rbac.py` 通过，14 passed；`npm run typecheck` 通过；`npm run test -- WorkspaceApp` 通过，38 passed。Vitest 仍输出 jsdom 对 `getComputedStyle` pseudo-elements、canvas getContext 和页面跳转的既有未实现提示；后端仍有既有 passlib/FastAPI/datetime deprecation warnings。
- 后续动作：后续在引入独立 `review_records` / submission 版本快照后，将打回详情从审计日志迁移到正式审核记录，并补 AI 预审意见展示。

### 2026-05-29

- 类型：前后端实现 / 人工审核批量与历史差异
- 关联文档：`docs/api/review-ai-export.md`、`docs/product/REQUIREMENTS_AND_NOTES.md`、`docs/planning/TODO.md`
- 内容：补齐人工审核页和 `/reviews` 模块的批量、统计、历史和字段差异小闭环。后端新增 `GET /reviews/stats`、`POST /reviews/submissions/batch`、`GET /reviews/submissions/{submission_id}/history`、`GET /reviews/submissions/{submission_id}/diff`；批量审核逐条复用单条审核逻辑并逐条写入 `submission_reviewed` 审计日志，历史当前来自 review 审计日志，diff 当前为 `submission.draft -> submission.answers` 字段差异。前端人工审核页新增统计指标、表格多选、批量审核 Modal、详情 Drawer 中的审核历史和字段差异 Tab。
- 测试结果：`conda run -n markup-api python -m pytest apps/api/tests/test_auth_team_rbac.py` 通过，13 passed；`npm run typecheck` 通过；`npm run test -- WorkspaceApp` 通过，37 passed。Vitest 仍输出 jsdom 对 `getComputedStyle` pseudo-elements、canvas getContext 和页面跳转的既有未实现提示；后端仍有既有 passlib/FastAPI/datetime deprecation warnings。
- 后续动作：继续补独立 `review_records` 或 submission 版本快照，以支持真正第 1/2 轮答案 diff；继续接入 AI 评语展示、多级 stage、Labeler 打回详情和重新提交入口。

### 2026-05-21

- 类型：文档整理
- 关联文档：`README.md`、`product/REQUIREMENTS_AND_NOTES.md`、`planning/TODO.md`、`architecture/SYSTEM_ARCHITECTURE.md`
- 内容：根据现有 API 文档与课题需求建立文档基线，覆盖需求注意事项、接口清单、状态机、架构设计、分阶段 TODO 和测试清单。
- 后续动作：后续所有前后端实现均需先对照文档；需求变更和实现进度需持续记录。

### 2026-05-21

- 类型：仓库整理
- 关联文档：`docs/README.md`、`docs/planning/PROGRESS_LOG.md`
- 内容：将项目文档、原始需求 PDF 和示意图统一移动到 `docs/` 目录，图片与 PDF 统一放入 `docs/assets/`。
- 后续动作：根目录后续仅保留代码、配置和必要入口文件；文档更新集中在 `docs/` 内维护。

### 2026-05-21

- 类型：需求变更
- 关联文档：`docs/README.md`、`docs/product/REQUIREMENTS_AND_NOTES.md`、`docs/planning/TODO.md`、`docs/architecture/SYSTEM_ARCHITECTURE.md`、`docs/markup_requirements.md`
- 内容：确认项目正式英文名为 MarkUp，中文名为马克派；清理文档中的旧项目名和双称表述，后续对外名称统一为 MarkUp（马克派）。
- 后续动作：代码包名、页面标题、产品 Logo、部署环境说明和演示材料均应使用 MarkUp（马克派）。

### 2026-05-22

- 类型：开发进度 / 架构决策
- 关联文档：`product/REQUIREMENTS_AND_NOTES.md`、`planning/TODO.md`、`architecture/SYSTEM_ARCHITECTURE.md`
- 内容：完成 P0 认证、用户、企业、权限后端骨架实现，新增邮箱验证码注册/绑定、GitHub 与飞书 OAuth 跳转认证、refresh token 轮换、HttpOnly cookie 兼容、RBAC 全局角色与企业角色分离、企业邀请与成员管理、审计日志基础写入。
- 后续动作：补数据库迁移、真实邮件服务、Redis 化 OAuth ticket、补全用户/企业/邀请的边界测试，并继续推进后续任务、模板、标注链路。

### 2026-05-22

- 类型：测试结果
- 关联文档：`planning/TODO.md`
- 内容：`python -m compileall apps/api/app apps/api/tests` 通过；当前环境未安装 pytest，已将 pytest 加入 `apps/api/requirements.txt`，但未执行完整单元测试。
- 后续动作：安装依赖后执行 `python -m pytest apps/api/tests`，验证注册、登录、企业注册、邀请与权限拦截流程。

### 2026-05-23

- 类型：开发进度
- 关联文档：旧认证企业 handoff（已合并到 docs/api 与产品文档）、`docs/architecture/SYSTEM_ARCHITECTURE.md`、`docs/planning/TODO.md`
- 内容：基于后端认证 API 和前端架构要求新增 `apps/web` React + TypeScript + Vite 应用，完成 MarkUp（马克派）登录页面、认证 API client、登录态持久化、OAuth 入口和登录页单元测试。
- 后续动作：执行 `npm run typecheck`、`npm run lint`、`npm run test`、`npm run build`，根据结果修复问题并更新测试记录。

### 2026-05-23

- 类型：测试结果 / 偏差修正
- 关联文档：`docs/planning/TODO.md`
- 内容：完成前端登录页代码 Review，修复“未勾选保持登录仍写入 localStorage”的存储语义问题；执行 `npm run typecheck`、`npm run lint`、`npm run test`、`npm run build` 均通过，单元测试覆盖登录成功、登录失败、表单校验和 sessionStorage 模式。
- 后续动作：后续接入真实后端联调时补充 E2E 验证；注册页、OAuth callback 补绑邮箱页和主工作台路由仍待实现。

### 2026-05-23

- 类型：开发进度 / 需求变更
- 关联文档：旧认证企业 handoff（已合并到 docs/api 与产品文档）、旧认证安全 handoff（已合并到 docs/api、docs/operations 与产品文档）、`docs/planning/TODO.md`
- 内容：确认后端已具备邮箱验证码注册接口，前端新增注册表单；OAuth provider 从旧第三方登录切换为飞书，后端新增飞书 Web SSO 授权地址、token 换取和用户信息获取逻辑，前端新增 OAuth callback ticket 兑换和邮箱绑定流程；GitHub 未配置错误信息改为明确提示需要配置的环境变量。
- 后续动作：配置真实 `GITHUB_CLIENT_ID/GITHUB_CLIENT_SECRET` 与 `FEISHU_CLIENT_ID/FEISHU_CLIENT_SECRET` 后，使用真实第三方账号做端到端回调验证。

### 2026-05-23

- 类型：测试结果 / 启动验证
- 关联文档：`docs/planning/TODO.md`
- 内容：前端 `npm run typecheck`、`npm run lint`、`npm run test`、`npm run build` 均通过；后端 `pytest apps/api/tests/test_auth_team_rbac.py` 通过；`GET /health` 返回 `{"status":"ok"}`；GitHub 与飞书 OAuth 启动入口在未配置环境变量时均返回 502 且带有明确的 `50002` 配置缺失提示。
- 后续动作：当前本地前端已由 Vite 提供服务，端口自动落到 `5174`（`5173` 已被其他进程占用）；后端 `8000` 端口已由现有进程提供服务。若后续需统一端口或重启服务，再按当前文档和环境变量重新启动。

### 2026-05-23

- 类型：偏差修正 / 启动验证 / 文档更新
- 关联文档：`docs/operations/DEPLOYMENT.md`、`docs/README.md`
- 内容：修复后端错误响应 `Content-Type`，显式声明 `application/json; charset=utf-8`，避免浏览器直接打开 OAuth 错误 JSON 时中文乱码；补齐 GitHub OAuth 启动前的 `GITHUB_CLIENT_SECRET` 配置校验；新增 `docs/operations/DEPLOYMENT.md`，记录本地启动、OAuth 本地配置、生产部署指令和上线前检查。
- 后续动作：真实 OAuth 登录仍需在 `apps/api/.env` 配置 GitHub / 飞书应用密钥，并在第三方平台后台配置与后端一致的 callback URL。

### 2026-05-23

- 类型：偏差修正 / 前端体验优化
- 关联文档：`docs/planning/TODO.md`
- 内容：注册页因字段增加导致桌面端需要下拉，已改为两列紧凑表单布局，并压缩认证卡片、输入框、分隔区和指标卡高度；移动端保留单列可滚动布局，避免小屏裁切内容。
- 后续动作：后续新增认证字段时优先复用 `field-block` / `register-form` 布局，避免再次把桌面登录页拉成长页面。

### 2026-05-23

- 类型：偏差修正 / 测试结果
- 关联文档：`docs/operations/DEPLOYMENT.md`、旧认证安全 handoff（已合并到 docs/api、docs/operations 与产品文档）
- 内容：飞书 OAuth 回调曾返回裸 `Internal Server Error`，原因是后端调用飞书 token/user_info 接口时未捕获 `httpx` 第三方异常；已将第三方网络和 HTTP 异常统一转换为 `50002` 结构化错误，并在飞书 token 请求中补充 `redirect_uri`。重启后验证飞书 callback 可生成前端 ticket，`POST /auth/oauth/exchange` 可进入预期的补绑邮箱流程。
- 后续动作：若希望飞书登录后免补绑邮箱，需要在飞书应用后台开通并授权返回用户邮箱的相关权限；否则继续使用 MarkUp 邮箱绑定兜底流程。

### 2026-05-23

- 类型：开发进度 / 安全加固 / 文档更新
- 关联文档：`docs/operations/DEPLOYMENT.md`、旧认证安全 handoff（已合并到 docs/api、docs/operations 与产品文档）
- 内容：飞书 OAuth 授权 URL 增加 `FEISHU_OAUTH_SCOPE`，默认请求 `contact:user.email:readonly`；新增 SMTP 邮件发送实现，可通过 `SMTP_ENABLED` 和 `SMTP_*` 环境变量开启真实验证码邮件；账号密码存储增强为生产级基线，Argon2 参数显式配置，支持 `PASSWORD_PEPPER`，验证码摘要改为 HMAC-SHA256 并支持 `VERIFICATION_CODE_PEPPER`，注册和改密增加密码强度校验。
- 测试结果：`python -m compileall apps/api/app` 通过；`pytest apps/api/tests/test_auth_team_rbac.py` 通过，6 passed；重启后验证飞书 OAuth start 返回 302，Location 已包含 `scope=contact%3Auser.email%3Areadonly`。
- 后续动作：生产启用前必须设置强随机 `SECRET_KEY`、`PASSWORD_PEPPER`、`VERIFICATION_CODE_PEPPER` 和真实 SMTP 参数；pepper 值上线后不可随意更换，否则既有密码/验证码校验会失效。

### 2026-05-23

- 类型：设计规范 / 文档更新
- 关联文档：`docs/design/FRONTEND_DESIGN_STYLE.md`、`docs/README.md`
- 内容：根据当前登录页前端风格、MarkUp 数据标注平台需求、Xpert Studio 等成熟数据平台的工作台思路，以及 Gitee 账号管理的信息企业方式，新增前端设计风格规范。规范明确登录页保留暖色品牌入口，登录后主界面采用简洁橙白蓝色调，账号管理页采用左侧设置导航与右侧分组表单布局。
- 后续动作：后续实现登录后 `AppShell`、Dashboard、任务列表、账号管理页和基础组件时，应优先对齐 `design/FRONTEND_DESIGN_STYLE.md`，若视觉方向发生变化需同步更新该文档。

### 2026-05-24

- 类型：需求变更 / 开发进度 / 文档更新
- 关联文档：旧认证企业 handoff（已合并到 docs/api 与产品文档）、`docs/api/README.md`、`docs/design/FRONTEND_DESIGN_STYLE.md`、`docs/planning/TODO.md`
- 内容：拉取最新代码后确认消息通知问题属于其他项目，本次不处理。注册入口按核心角色补齐 Owner / Labeler / Reviewer 三类账号角色；注册提交前必须勾选用户协议与隐私政策；新增忘记密码邮箱验证码重置流程，后端新增 `POST /api/v1/auth/password/reset`；认证页补充并实现移动端单列适配要求。
- 测试结果：前端 `npm run typecheck`、`npm run lint`、`npm run test`、`npm run build` 均通过；后端 `conda run -n markup-api python -m pytest apps/api/tests/test_auth_team_rbac.py` 通过，7 passed；`apps/api/.venv/bin/python -m compileall apps/api/app apps/api/tests` 通过。
- Review 修复：隐藏忘记密码页中的登录/注册 tab；忘记密码接口不再对不存在邮箱直接返回“用户不存在”，避免账号枚举风险；同步修正用户角色 schema 和 API 文档编号。
- 后续动作：若后续正式上线用户协议与隐私政策页面，需要将 `/terms`、`/privacy` 替换为真实内容页或文档路由。

### 2026-05-24

- 类型：开发进度 / 前端体验优化 / 文档更新
- 关联文档：`docs/design/FRONTEND_DESIGN_STYLE.md`、`docs/planning/TODO.md`
- 内容：注册页用户协议与隐私政策不再跳转外部路由，改为页面内弹窗阅读；弹窗内置 MarkUp 用户协议和隐私政策拟稿，内容参考成熟平台常见政策结构并按 MarkUp 数据标注、企业协作、AI 预审、审计和导出场景重新编写；关闭按钮放在正文底部，支持用户滚动阅读后关闭。
- 后续动作：正式上线前应由项目负责人或法务按实际运营主体、数据处理范围、第三方服务清单和适用地区法规复核协议与隐私政策内容。

### 2026-05-24

- 类型：架构决策 / 开发进度 / 文档更新 / 测试结果
- 关联文档：`docs/architecture/SYSTEM_ARCHITECTURE.md`、`docs/operations/DEPLOYMENT.md`、旧 MongoDB handoff（已合并到 docs/architecture 与 docs/operations）
- 内容：按用户要求将后端持久化从 SQLite/SQLAlchemy 迁移为 MongoDB/PyMongo；新增 MongoDB 文档模型基类和数据库适配层，认证、OAuth、企业、成员、RBAC、个人中心、资质、积分和审计服务均改用 MongoDB 集合操作；配置从 `DATABASE_URL` 改为 `MONGODB_URL` / `MONGODB_DATABASE`；测试环境使用 `mongomock://localhost`。
- 测试结果：`python -m compileall apps/api/app apps/api/tests` 通过；`python -m pytest apps/api/tests` 通过，10 passed。
- 后续动作：生产环境需准备真实 MongoDB 服务；后续结构变更应补显式数据迁移脚本，复杂强一致链路需要继续引入 MongoDB 事务、幂等键或补偿机制。

### 2026-05-25

- 类型：开发进度 / 前端体验优化 / 文档更新
- 关联文档：`docs/design/FRONTEND_DESIGN_STYLE.md`、`docs/planning/TODO.md`、旧登录后账号管理 handoff（已合并到 docs/api 与产品文档）
- 内容：按已文档化的橙白蓝工作台风格新增登录后 `WorkspaceApp`，包含顶部栏、侧边导航、主页面占位、账号管理页面和标注页面占位。账号管理按角色分流：企业管理员端提供“个人账号配置 -> 企业相关信息配置 -> 完成注册”的注册链路，以及企业信息页、企业成员页（Owner / Reviewer / Agent）；Labeler / Reviewer 端提供个人中心、资质管理（学历、领域）和积分管理。标注页面增加包含当前用户名和邮箱的水印层。
- 测试结果：新增前端 `WorkspaceApp` 单元测试，覆盖主页面占位、企业端账号管理、个人端账号管理和水印；`npm run typecheck`、`npm run lint`、`npm run test`、`npm run build` 均通过；`conda run -n markup-api python -m pytest apps/api/tests/test_auth_team_rbac.py` 通过，10 passed；`apps/api/.venv/bin/python -m compileall apps/api/app apps/api/tests` 通过；`git diff --check` 通过。测试前已按 `apps/api/requirements.txt` 同步 `pymongo` / `mongomock` 到 `markup-api` 环境。
- 后续动作：主页面任务列表、企业成员新增/编辑弹窗、资质材料上传和真实标注工作区仍需在后续任务中接入完整业务接口与交互。

### 2026-05-25

- 类型：开发进度 / 本地调试支持 / 文档更新
- 关联文档：`docs/operations/DEPLOYMENT.md`
- 内容：新增 `apps/api/scripts/dev_seed_accounts.py`，用于向当前配置的 MongoDB 幂等创建本地开发测试企业和账号：Admin、Owner、Reviewer、Agent、Labeler。脚本默认不清空数据库，仅显式传入 `--reset` 时重置当前开发库；Agent 按现有 RBAC 设计保留为全局 `user`、企业角色 `agent`。
- 测试结果：在真实本地 MongoDB `mongodb://localhost:27017/markup` 中执行脚本后，5 个测试账号均可通过 `/api/v1/auth/login` 登录；后端 `GET /health` 通过，前端 Vite 页面可访问。
- 后续动作：正式演示数据应继续拆成独立 seed 脚本，避免与生产数据初始化混用。

### 2026-05-26

- 类型：开发进度 / 前端账号管理偏差修正
- 关联文档：`docs/planning/PROGRESS_LOG.md`
- 内容：将登录后账号管理页从静态骨架推进为可操作页面。企业端拆为管理员注册链路、企业信息页、企业成员页；管理员注册链路支持“个人账号配置 -> 企业相关信息配置 -> 完成注册”三步状态机；企业成员页接入 Owner / Reviewer / Agent 搜索、角色筛选、成员账号创建、邀请和编辑接口。Labeler / Reviewer 端补齐个人资料保存、学历资质表单、领域资质表单、认证记录、积分钱包与流水筛选。
- 测试结果：新增 `WorkspaceApp` 单元测试覆盖三步注册链路、成员筛选/创建/邀请/编辑、个人资料保存、资质表单提交和积分流水筛选；专项执行 `npm run test -- WorkspaceApp` 通过，5 passed。
- 后续动作：企业成员删除、邀请接受页、真实文件上传、积分兑换规则和资质审核端页面仍需在后续任务继续补齐。

### 2026-05-26

- 类型：偏差修正 / 前端体验优化 / 权限修复
- 关联文档：`docs/planning/PROGRESS_LOG.md`
- 内容：Owner 注册成功后不再直接跳回登录页，改为展示与注册页一致风格的全屏管理员注册完成弹窗；顶部使用“管理员账号页 -> 企业页 -> 成功”三圆点进度条，圆点和连接线使用橙色完成态。修复 Owner 访问企业信息页和企业成员页的权限问题：企业概览接口改为已登录用户即可读取自己的企业 membership，Owner 企业角色补齐企业维护和成员创建/编辑权限，并在鉴权时合并角色默认权限，避免旧数据中成员权限快照过期导致被拒绝。
- 测试结果：`npm run typecheck`、`npm run lint`、`npm run test`、`npm run build` 均通过；`conda run -n markup-api python -m pytest apps/api/tests/test_auth_team_rbac.py` 通过，10 passed；`git diff --check` 通过。
- 后续动作：如本地后端服务已在运行，需要重启后端才能加载新的 RBAC 与接口鉴权代码。

### 2026-05-26

- 类型：偏差修正 / 前端体验优化
- 关联文档：`docs/planning/PROGRESS_LOG.md`
- 内容：注册页不再因为字段未填或未勾选协议而直接禁用“注册账号”按钮；用户点击后会在表单反馈区显示具体问题，包括用户名、邮箱、密码和用户协议/隐私政策缺失。注册验证码字段允许为空或任意值，注册验证码按钮也改为邮箱无效时可点击并提示“请先输入有效邮箱”，仅在请求发送中临时禁用以防重复提交。
- 测试结果：`npm run typecheck`、`npm run lint`、`npm run test -- LoginPage` 均通过，LoginPage 10 passed。
- 后续动作：登录、重置密码和 OAuth 绑定按钮当前仍保留原有禁用策略，若要统一为“点击后提示问题”，需要后续单独调整对应表单。

### 2026-05-26

- 类型：本地调试支持 / 后端认证偏差修正
- 关联文档：`docs/operations/DEPLOYMENT.md`
- 内容：在 `SMTP_ENABLED=false` 的开发配置下，注册接口跳过邮箱验证码真实性校验，`email_code` 为空或任意值都可完成注册；密码重置和 OAuth 邮箱绑定仍保留验证码校验，避免把开发便利扩大到敏感流程。注册请求 schema 同步放宽验证码字段，防止请求在进入业务逻辑前被 422 拦截。
- 测试结果：`conda run -n markup-api python -m pytest apps/api/tests/test_auth_team_rbac.py` 通过，10 passed；`npm run typecheck`、`npm run lint`、`npm run test -- LoginPage`、`npm run build` 均通过；`git diff --check` 通过。
- 后续动作：生产或联调真实邮件时应设置 `SMTP_ENABLED=true` 并配置完整 SMTP 参数。

### 2026-05-26

- 类型：偏差修正 / 前端错误展示
- 关联文档：`docs/api/README.md`
- 内容：注册页的“参数校验失败”实际来自后端 `40001` 校验响应，常见原因是密码强度或邮箱格式不满足后端规则。前端现在先按后端同等规则做本地提示，并在收到后端校验错误时优先展示 `detail` 里的具体字段消息，不再只展示通用标题。
- 测试结果：`npm run typecheck`、`npm run lint`、`npm run test -- LoginPage` 通过，12 passed。
- 后续动作：后端重启后该提示会直接生效；若后端继续返回 40001，可根据具体字段消息继续补前端约束。

### 2026-05-26

- 类型：偏差修正 / 后端错误响应
- 关联文档：`docs/api/README.md`
- 内容：后端 `RequestValidationError` 不再只返回通用 `message: 参数校验失败`，会把字段级错误合并进 message，例如 `参数校验失败：密码必须包含字母、数字和特殊字符中的至少三类`；同时保留 `detail` 数组并清理 Pydantic 的 `Value error, ` 前缀，方便前端直接展示。
- 测试结果：`conda run -n markup-api python -m pytest apps/api/tests/test_auth_team_rbac.py` 通过，10 passed；`conda run -n markup-api python -m compileall apps/api/app` 通过。
- 后续动作：重启后端后该响应格式生效。

### 2026-05-27

- 类型：前端收尾 / API 集成 / 文档更新
- 关联文档：`docs/api/README.md`
- 内容：注册链路调整为通用账号注册后进入 `/onboarding` 分流页；分流页覆盖标注员资料、需求方登记新公司/企业、需求方邀请码加入企业三条路径。任务广场移除前端静态 `taskMockData.ts`，改为调用 `GET /api/v1/labels/tasks`，接单改为调用 `POST /api/v1/labels/tasks/{task_id}/claim` 并提交所选 `bundle_size`。Onboarding 完成不再本地伪造角色，改为调用 `POST /api/v1/auth/onboarding/complete`，由后端返回新的 `LoginPayload` 后更新前端 session。
- 测试结果：前端新增/调整 LoginPage、OnboardingPage、WorkspaceApp 相关测试，覆盖无角色注册、自动登录、onboarding 三条分流、真实任务接口调用路径；本轮收尾执行 `npm run typecheck`、`npm run lint`、`npm run test`、`npm run build` 和 `git diff --check`。
- 后续动作：后端需实现 `POST /api/v1/auth/onboarding/complete`，并按本轮任务广场新模型补齐 `/labels/tasks` 查询参数、响应字段和 `bundle_size` 接单逻辑；注册接口后续应正式支持无角色注册或 pending onboarding 状态，前端当前为兼容后端 schema 仍提交 `role: "labeler"`。

### 2026-05-27

- 类型：流程规范 / 前端体验优化
- 关联文档：`docs/product/REQUIREMENTS_AND_NOTES.md`
- 内容：按最新文档入口重新阅读活跃文档，并将“每次拉取最新代码后必须读取合作者最新改动”写入偏差处理协议。验证码发送入口增加 60 秒倒计时，注册、重置密码和 OAuth 绑邮箱分别独立计时；发送成功或后端返回“验证码发送过于频繁”时都会显示剩余秒数并暂时禁用再次发送。
- 测试结果：`npm run typecheck`、`npm run lint`、`npm run test -- LoginPage` 通过，13 passed。
- 后续动作：如后端后续返回精确剩余秒数字段，可将前端固定 60 秒改为读取服务端剩余时间。

### 2026-05-28

- 类型：开发进度 / API 集成 / 文档更新
- 关联文档：`docs/markup_requirements.md`、`docs/product/REQUIREMENTS_AND_NOTES.md`、`docs/api/README.md`、`docs/architecture/SYSTEM_ARCHITECTURE.md`、`docs/planning/TODO.md`
- 内容：实现企业端工作台下数据集管理、模板搭建和发布任务主链路。后端新增 `/datasets`、`/templates`、`/tasks` API 与 MongoDB 文档模型：数据集导入支持 CSV、Excel(.xlsx)、JSON、JSONL，解析列名、数据类型、预览行和多模态 URL/路径素材，支持图片/音频/视频文件上传为内联 `data:` URL 并支持 JSON/JSONL/CSV 下载；模板 schema 支持多页签 `tabs`，Designer 中 `ShowItem` 与数据集解耦，前端新增独立 Renderer 在 Designer 预览和标注页渲染同一份 schema；发布任务支持选择模板和数据集、将 `ShowItem` 映射到数据集列、配置 `first_come_all` / `quota_grab` / `assigned_link` 分发策略和积分奖励，并在指派模式生成链接与可扫描 SVG 二维码。
- 测试结果：`conda run -n markup-api python -m compileall apps/api/app` 通过；`conda run -n markup-api python -m pytest apps/api/tests/test_auth_team_rbac.py` 通过，11 passed；`npm run typecheck`、`npm run lint`、`npm run test`、`npm run build` 通过，前端 25 passed；`git diff --check` 通过。
- 后续动作：继续补完整拖拽排序、任务详情/暂停/恢复/结束、Reviewer 与 AI 预审配置、Labeler 工作台按模板 Renderer 渲染、真实文件对象存储下载与图片/音频专用标注控件。

### 2026-05-28

- 类型：前端体验优化
- 关联文档：`docs/design/FRONTEND_DESIGN_STYLE.md`
- 内容：认证页登录、注册和重置密码表单的密码输入框新增“显示/隐藏”切换按钮，便于本地测试账号录入和用户确认密码输入。
- 测试结果：补充 `LoginPage` 单元测试覆盖登录表单密码显示/隐藏切换；`npm run typecheck`、`npm run lint`、`npm run test -- LoginPage` 通过，LoginPage 14 passed。
- 后续动作：如企业成员创建弹窗也需要同样交互，可继续抽成全局表单控件复用。

### 2026-05-28

- 类型：前端体验优化 / Designer 完善
- 关联文档：`docs/design/FRONTEND_DESIGN_STYLE.md`、`docs/planning/TODO.md`
- 内容：按企业生产后台风格重构 Owner/Admin 的数据集管理、模板搭建和发布任务三个子页面：数据集列表改为表格行选择，不再使用磁贴；发布任务改为左侧流程栏 + 右侧分区配置；Designer 调整为问卷类工具常见的左侧题型物料、中间问卷画布、右侧属性面板结构，并补齐画布内拖拽排序、上移/下移、复制、删除、页签标题编辑和属性编辑。
- 测试结果：补充 `WorkspaceApp` 单元测试覆盖 Designer 新增页签、页签改名、从物料区拖入画布、画布内拖拽排序、复制和删除；`npm run typecheck`、`npm run lint`、`npm run test -- WorkspaceApp` 通过。
- 后续动作：后续可继续接入更精细的鼠标悬停插入线、跨页签移动、撤销/重做和字段级校验配置。

### 2026-05-28

- 类型：前端体验优化 / UI 走查
- 关联文档：`docs/design/FRONTEND_DESIGN_STYLE.md`
- 内容：按 UI/UX 设计检查收紧企业端生产页视觉层级：生产页标题回到工具台字号，导入表单、属性面板和发布表单控件统一宽度与盒模型，避免横向溢出；Designer 画布组件行不再被网格拉伸，保持问卷搭建器常见的紧凑拖拽条目；数据集页继续保持表格列表，不恢复磁贴。
- 测试结果：`npm run typecheck`、`npm run lint`、`npm run test -- WorkspaceApp`、`npm run build`、`conda run -n markup-api python -m compileall apps/api/app`、`conda run -n markup-api python -m pytest apps/api/tests/test_auth_team_rbac.py`、`git diff --check` 通过；使用本地真实 MongoDB、8000 后端和 5173 前端生成并检查截图 `/private/tmp/markup-ui-datasets.png`、`/private/tmp/markup-ui-templates.png`、`/private/tmp/markup-ui-publish.png`。
- 后续动作：发布任务页后续可增加自动选择最新模板/数据集、映射完成度提示和发布前校验摘要。

### 2026-05-28

- 类型：开发进度 / 前端体验优化 / API 契约补齐
- 关联文档：`docs/api/README.md`、`docs/product/REQUIREMENTS_AND_NOTES.md`、`docs/architecture/SYSTEM_ARCHITECTURE.md`、`docs/planning/TODO.md`
- 内容：继续按 UI/UX 设计要求完善企业端三个生产子页面。Designer 属性面板新增文本长度、正则、选项选择数量、标签新建、LLM 提示词和输出字段配置，规则写入组件 `config`；发布任务页新增自动选择最新模板/数据集、ShowItem 自动列映射和完成度提示，并补齐审核员、AI 预审、资质门槛、截止日期、分类、难度、标签与发布摘要。后端任务模型和创建接口同步保存 `reviewer_ids`、`ai_config`、`qualification_rules`、`required_certs`。
- 测试结果：补充后端断言覆盖 `GET /templates` 列表返回 schema，保证发布页可从列表响应提取 ShowItem；`npm run typecheck`、`npm run lint`、`npm run test -- WorkspaceApp`、`npm run test`、`npm run build`、`conda run -n markup-api python -m compileall apps/api/app`、`conda run -n markup-api python -m pytest apps/api/tests/test_auth_team_rbac.py`、`git diff --check` 通过；使用本地真实 MongoDB、8000 后端和 5173 前端完成 Playwright 浏览器走查，截图保存为 `/private/tmp/markup-ui-datasets.png`、`/private/tmp/markup-ui-templates.png`、`/private/tmp/markup-ui-publish.png`。
- 后续动作：基础校验配置已进入 schema，但标注提交时的前后端执行校验仍需继续接入；AI 预审配置后续需要由 Worker 消费并写入审核记录。

### 2026-05-28

- 类型：前端体验优化 / API 契约补齐 / 设计流程规范
- 关联文档：`docs/api/README.md`、`docs/product/REQUIREMENTS_AND_NOTES.md`、`docs/architecture/SYSTEM_ARCHITECTURE.md`、`docs/planning/TODO.md`
- 内容：按用户指定的前端设计链路执行数据集管理页二次优化：使用 `ui-ux-pro-max` 规则确定数据生产工作台方向，使用 `hallmark` 检查避免模板化和磁贴化，最终以当前可用的 `ckm:ui-styling` 作为 `frontend-skill` 替代完成实现。数据集页升级为导入、数据集表格、字段账本、渲染变量构建器和预览区组合；Owner 可基于来源列、默认值或 `{value}` / `{列名}` 表达式新增派生变量，变量写回数据集 rows、preview_rows 和 columns，并可作为 Designer 预览与发布任务 ShowItem 映射候选。
- 测试结果：`npm run typecheck`、`npm run lint`、`npm run test`、`npm run build`、`conda run -n markup-api python -m compileall apps/api/app`、`conda run -n markup-api python -m pytest apps/api/tests/test_auth_team_rbac.py`、`git diff --check` 通过，前端 26 passed，后端 11 passed；使用本地真实 MongoDB、8000 后端和 5173 前端完成 Playwright 走查，确认数据集表格、字段账本、渲染变量构建器和预览区存在，无横向溢出，截图保存为 `/private/tmp/markup-ui-datasets-variables.png`。
- 后续动作：派生变量表达式当前只做占位替换，不执行计算函数；若后续需要算术、条件或清洗函数，应设计白名单表达式 DSL 和后端校验。

### 2026-05-28

- 类型：前端体验优化 / 设计流程规范
- 关联文档：`docs/design/FRONTEND_DESIGN_STYLE.md`、`docs/planning/PROGRESS_LOG.md`
- 内容：继续按 `ui-ux-pro-max -> hallmark -> ckm:ui-styling` 链路优化企业端生产三页。数据集管理页将“导入数据集”和“新增渲染变量”从常驻表单改为按钮触发弹窗，主页面保留数据集表格、字段账本、变量清单和预览工作区；模板搭建页和发布任务页改为剩余视口内的固定工作台，内部三栏/两栏区域自行滚动，减少页面级上下滚动；三个页面收紧标题和状态区，减少并排圆角矩形磁贴，优先使用表格、状态栏、侧栏摘要和工作区布局。
- 测试结果：`npm run typecheck`、`npm run lint`、`npm run test -- WorkspaceApp`、`npm run test`、`npm run build`、`git diff --check` 通过，前端 26 passed；使用本地真实 MongoDB、8000 后端和 5173 前端完成 Playwright 走查，确认 1440x900 下三页无横向溢出，数据集/模板/发布页外层 `documentDelta=0`，两个弹窗均可打开，截图保存为 `/private/tmp/markup-redesign-datasets-final4.png`、`/private/tmp/markup-redesign-templates-final4.png`、`/private/tmp/markup-redesign-publish-final4.png`、`/private/tmp/markup-redesign-import-modal-final4.png`、`/private/tmp/markup-redesign-variable-modal-final4.png`。
- 后续动作：若后续引入更多数据集行或模板组件，可继续把长列表改为虚拟滚动；当前先保持原生滚动区以减少实现复杂度。

### 2026-05-28

- 类型：前端体验优化 / Designer 稳定性修复 / 设计流程规范
- 关联文档：`docs/markup_requirements.md`、`docs/product/REQUIREMENTS_AND_NOTES.md`、`docs/design/FRONTEND_DESIGN_STYLE.md`、`docs/planning/TODO.md`
- 内容：按 `ui-ux-pro-max -> hallmark -> ckm:ui-styling` 链路继续完善模板搭建页，并参考问卷类编辑器的信息架构优化画布。模板页恢复为可自然纵向滚动的生产页：主三栏工作台承载高频搭建，已保存模板移到下方独立表格；Renderer 预览改为独立弹窗，不再挤在右侧属性面板；中间画布新增结构统计、序号、插入线、空画布恢复入口和行内复制/删除操作。修复删除当前页签全部物料后因空组件数组读取 `id` 导致页面白屏的问题。
- 测试结果：`npm run typecheck`、`npm run lint`、`npm run test -- WorkspaceApp`、`npm run test`、`npm run build`、`git diff --check` 通过，前端 27 passed；使用本地真实 MongoDB、8000 后端和 5173 前端完成 Playwright 走查，确认 Renderer 弹窗可打开、删除全部物料后空态可恢复、1440px 下无横向溢出，截图保存为 `/private/tmp/markup-template-designer-redesign.png`、`/private/tmp/markup-template-renderer-modal.png`、`/private/tmp/markup-template-empty-state.png`。
- 后续动作：继续接入 Designer 与 Labeler 工作台的一致性校验、提交时基础校验执行、字段联动规则编辑器和跨页签移动。

### 2026-05-28

- 类型：前端体验优化 / Designer 交互细节
- 关联文档：`docs/design/FRONTEND_DESIGN_STYLE.md`
- 内容：继续按 `ui-ux-pro-max -> hallmark -> ckm:ui-styling` 链路优化模板画布。调整“在此处插入字段”显示逻辑，组件 hover 时不再高亮插入入口，只显示当前组件操作；拖拽排序新增被拖动项、投放目标和投放插槽反馈；画布组件卡片重绘为序号、标题、字段说明、类型标记和行内操作分区，提升可读性并降低选中态混淆。
- 测试结果：`npm run typecheck`、`npm run lint`、`npm run test -- WorkspaceApp` 通过；Playwright 走查确认组件 hover 时插入槽不显示、操作按钮显示、1440px 下无横向溢出，截图保存为 `/private/tmp/markup-template-cards-refined.png`。
- 后续动作：如继续完善拖拽，可接入键盘排序、跨页签移动和撤销/重做。

### 2026-05-28

- 类型：文档重组 / 依赖同步 / 协作流程更新
- 关联文档：`docs/README.md`、`docs/api/README.md`、`docs/workflow/DEVELOPMENT_WORKFLOW.md`、`docs/design/FRONTEND_DESIGN_STYLE.md`
- 内容：拉取远端最新代码至 `f7d45d1`，确认前端已切换到 Ant Design，并执行 `npm install` 同步 `antd` 与 `@ant-design/icons` 依赖。重组文档中心：完整保留 `docs/markup_requirements.md`，新增 `product/`、`api/`、`architecture/`、`design/`、`operations/`、`planning/`、`workflow/` 分类；当前 API 契约拆分到 `docs/api/*.md`；删除已被活跃文档吸收的旧 handoff、旧 TODO、旧前端进度和旧单文件 API 文档。
- 测试结果：文档阶段已完成依赖安装检查，`npm install` 成功并显示 0 vulnerabilities；后续提交前继续执行前端 typecheck、lint、test、build、后端专项测试和 `git diff --check`。
- 后续动作：后续新增功能必须先更新对应分类文档；API 变更写入 `docs/api/*.md`，页面设计写入 `docs/design/pages/`。

### 2026-05-28

- 类型：文档清理 / 协作同步
- 关联文档：`docs/README.md`、`docs/api/README.md`、`docs/product/REQUIREMENTS_AND_NOTES.md`、`docs/workflow/NEW_WINDOW_PROMPT.md`
- 内容：按用户要求再次执行 `git pull --ff-only`，确认本地已与 `origin/main` 同步且前端保持远端最新 Ant Design 设计；随后彻底移除旧文档区和根层旧文档入口，保留当前干净文档结构、核心需求文档、模块化 API 文档、设计/运维/计划/工作流文档与 `docs/assets/` 素材。
- 测试结果：`git diff --check` 通过；文档内旧 archive 路径和旧 handoff 文件名检查无残留命中。
- 后续动作：后续不要重新引入旧归档文档；若旧材料仍有价值，应先吸收到当前活跃文档分类中。

### 2026-05-28

- 类型：前端体验优化 / Ant Design 对齐
- 关联文档：`docs/design/FRONTEND_DESIGN_STYLE.md`
- 内容：修复登录/注册入口浮层从自绘 backdrop + 内层认证卡片造成的“大框套小框”和关闭按钮层级问题，改为使用 Ant Design `Modal` 承载认证表单；工作台恢复 Ant Design `Watermark`，在登录后 shell 层按当前用户名和邮箱覆盖工作台内容；工作台侧栏支持收起，收起后隐藏 `Workspace / 工作台` 标题并保留图标菜单。
- 测试结果：`npm run typecheck`、`npm run lint`、`npm run test -- AppShell LoginPage`、`npm run test`、`npm run build`、`git diff --check` 通过；完整前端测试 31 passed。Vitest 仍输出 jsdom 对 canvas/getComputedStyle pseudo-elements 的已知未实现提示，不影响断言结果；Vite build 仍有大 chunk 体积提示。
- 后续动作：如后续需要在特定页面隐藏水印，可在 `AppShell` 增加页面级开关，当前默认覆盖全部工作台页面。

### 2026-05-29

- 类型：前端体验优化 / 工作台水印与侧栏
- 关联文档：`docs/design/FRONTEND_DESIGN_STYLE.md`
- 内容：按走查反馈调整工作台水印和侧栏头部。Ant Design `Watermark` 从内容区上移到整个工作台 shell 外层，使水印覆盖固定侧栏与主内容，并加深水印颜色；侧栏标题与收起按钮调整为同一行，标题使用浅蓝信息色块，收起按钮使用主蓝色块，收起后继续隐藏工作台标题。
- 测试结果：`npm run test -- AppShell`、`npm run typecheck`、`npm run lint`、`npm run build`、`git diff --check` 通过；Vite build 仍有大 chunk 体积提示。
- 后续动作：若水印在实际页面仍受特定容器遮挡，可继续降低对应固定容器背景不透明度或改用独立 overlay 层。

### 2026-05-29

- 类型：前端体验优化 / 工作台侧栏细节
- 关联文档：`docs/design/FRONTEND_DESIGN_STYLE.md`
- 内容：按反馈继续微调工作台水印与侧栏头部。`Watermark` 改为只包裹顶栏以下的工作台区域，不再覆盖顶部导航；侧栏标题与收起按钮保持同一行但去掉边框和色块，按钮恢复为无框图标按钮。
- 测试结果：`npm run test -- AppShell`、`npm run typecheck`、`npm run lint`、`npm run build`、`git diff --check` 通过；Vite build 仍有大 chunk 体积提示。
- 后续动作：继续按实际走查微调水印深浅与侧栏背景透出程度。

### 2026-05-29

- 类型：前端体验优化 / 工作台侧栏细节
- 关联文档：`docs/design/FRONTEND_DESIGN_STYLE.md`
- 内容：侧栏头部标题与收起按钮保持无框独立元素，同时给整行头部容器增加浅蓝到浅橙的轻量渐变底色，用于区分工作台标题区与导航菜单。
- 测试结果：`npm run test -- AppShell`、`npm run typecheck`、`npm run lint`、`git diff --check` 通过；首次并行执行专项测试时触发 sandbox 路径映射问题，单独重跑后通过。
- 后续动作：无。

### 2026-05-29

- 类型：前端体验优化 / 工作台布局修复
- 关联文档：`docs/design/FRONTEND_DESIGN_STYLE.md`
- 内容：修复 Ant Design `Watermark` 放在 fixed 顶栏之后仍从视口顶部绘制的问题。工作台水印 wrapper 增加 `margin-top: var(--nav-height)`，只覆盖顶栏以下区域；同时强制 `display: block`、`width: 100%` 和 `min-width: 0`，并取消水印内部内容区重复顶栏 padding，避免右侧内容区因 wrapper 尺寸异常只占据半屏。
- 测试结果：`npm run test -- AppShell`、`npm run typecheck`、`npm run lint`、`npm run build`、`git diff --check` 通过；Vite build 仍有大 chunk 体积提示。
- 后续动作：如实际浏览器仍出现内容宽度异常，应继续用 Playwright 截图和 DOM rect 检查具体页面容器。

### 2026-05-29

- 类型：前端体验优化 / 工作台导航
- 关联文档：`docs/design/FRONTEND_DESIGN_STYLE.md`
- 内容：实现工作台面包屑。`AppShell` 新增可选 `workspaceBreadcrumbs`，使用 Ant Design `Breadcrumb` 在顶栏下方、侧栏右侧、页面主体之前渲染；`App.tsx` 根据当前 `workspacePage` 生成 `工作台 / 当前页面` 基础路径；`WorkspaceApp` 预留 `onBreadcrumbTailChange` 动态第三级名称上报通道，并在页面切换时清空尾部，避免详情名称残留。
- 测试结果：`npm run typecheck`、`npm run lint`、`npm run test -- AppShell`、`npm run test -- WorkspaceApp`、`npm run test`、`npm run build`、`git diff --check` 通过；完整前端测试 34 passed。Vitest 仍输出 jsdom 对 canvas/getComputedStyle pseudo-elements 的已知未实现提示，不影响断言结果；Vite build 仍有大 chunk 体积提示。
- 后续动作：后续新增数据集/模板/任务详情页时，由页面通过 `onBreadcrumbTailChange` 上报 `{ key, label, loading, title }` 动态尾部，不由 `AppShell` 主动请求业务数据。

### 2026-05-29

- 类型：前端体验优化 / 工作台导航
- 关联文档：`docs/design/FRONTEND_DESIGN_STYLE.md`
- 内容：工作台面包屑增加图标能力。`AppShellBreadcrumbItem` 新增 `icon` 字段，Ant Design `Breadcrumb` 渲染时在文字前显示图标；基础页面路径沿用当前工作台导航图标，动态第三级也可由页面传入自定义图标。
- 测试结果：`npm run typecheck`、`npm run lint`、`npm run test -- AppShell`、`npm run build`、`git diff --check` 通过；Vite build 仍有大 chunk 体积提示。
- 后续动作：无。

### 2026-05-29

- 类型：前后端实现 / 任务发布检查与操作日志
- 关联文档：`docs/design/pages/owner-task-management.md`、`docs/api/production.md`、`docs/api/review-ai-export.md`
- 内容：继续收尾任务管理页面。后端新增 `GET /tasks/{task_id}/readiness`，统一返回发布前检查项、阻塞项、警告项以及题目数、ShowItem 映射数、审核员数和 AI 开启状态；新增 `/audit-logs` 列表与详情查询接口，支持按实体、动作、操作人和分页筛选。前端新建任务的发布前检查 Modal 在已有草稿时读取后端 readiness，避免只依赖本地表单状态；任务详情 `操作日志` Tab 接入真实 `/audit-logs?entity_type=task&entity_id=...` 表格，展示时间、动作、操作人、变更摘要和来源。
- 测试结果：`npm run typecheck`、`npm run lint`、`npm run test -- WorkspaceApp`、`npm run build`、`conda run -n markup-api python -m compileall apps/api/app`、`conda run -n markup-api python -m pytest apps/api/tests/test_auth_team_rbac.py` 通过。WorkspaceApp 专项测试 12 passed；后端 RBAC/生产链路测试 12 passed；Vitest 仍输出 jsdom 对 canvas/getComputedStyle pseudo-elements 的已知未实现提示，不影响断言；Vite build 仍有大 chunk 体积提示。
- 后续动作：任务管理剩余缺口主要是题目批量创建/导入/更新/删除/导出、导出中心异步任务，以及 readiness 更细的预算/资质/审核阶段规则。

### 2026-05-29

- 类型：前后端实现 / 任务题目管理
- 关联文档：`docs/design/pages/owner-task-management.md`、`docs/api/production.md`、`docs/product/REQUIREMENTS_AND_NOTES.md`
- 内容：继续收尾任务管理页面。后端实现 `GET /tasks/{task_id}/questions` 和 `GET /tasks/{task_id}/questions/{question_id}`，列表支持状态、领取人和分页筛选，题目 payload 返回题目 ID、序号、状态、领取人、content、创建和更新时间；测试覆盖创建任务后通过题目接口读取 ShowItem 映射内容。前端在任务详情 `题目管理` Tab 接入真实题目列表，支持状态筛选、刷新、题目状态 Tag、内容摘要、更新时间和题目预览 Modal；导入题目和导出题目按钮按设计预留为禁用状态，等待后续写接口。
- 测试结果：`npm run typecheck`、`npm run lint`、`npm run test -- WorkspaceApp`、`npm run build`、`conda run -n markup-api python -m compileall apps/api/app`、`conda run -n markup-api python -m pytest apps/api/tests/test_auth_team_rbac.py` 通过。WorkspaceApp 专项测试 12 passed；后端 RBAC/生产链路测试 12 passed；Vitest 仍输出 jsdom 对 canvas/getComputedStyle pseudo-elements 的已知未实现提示，不影响断言；Vite build 仍有大 chunk 体积提示。
- 后续动作：任务管理剩余后端缺口为题目批量创建/导入/更新/删除/导出、导出中心、操作日志过滤和 readiness 聚合；完成后进入第 2 项模板搭建页面重做。

### 2026-05-29

- 类型：前端实现 / 任务管理子页面
- 关联文档：`docs/design/pages/owner-task-management.md`、`docs/api/production.md`
- 内容：继续完善任务管理重做的子页面部分。新建任务子页面不再提交后立即发布，改为“保存草稿 + 发布前检查 + 确认发布”流程；右侧发布摘要提供草稿保存和发布两个动作，发布前检查 Modal 展示基础信息、模板、数据集、列映射和 AI 配置阻塞项。修改任务子页面从仅基础信息扩展为多 Tab：基础信息、模板与数据、发布配置、审核与 AI、资质与分发、题目管理、统计与导出、操作日志；草稿任务可保存分发、奖励、审核员、AI 和资质配置，非草稿任务继续只允许修改说明、富文本和标签。
- 测试结果：`npm run typecheck`、`npm run lint`、`npm run test -- WorkspaceApp`、`npm run build`、`conda run -n markup-api python -m compileall apps/api/app`、`conda run -n markup-api python -m pytest apps/api/tests/test_auth_team_rbac.py` 通过。WorkspaceApp 专项测试 12 passed；后端 RBAC/生产链路测试 12 passed；Vitest 仍输出 jsdom 对 canvas/getComputedStyle pseudo-elements 的已知未实现提示，不影响断言；Vite build 仍有大 chunk 体积提示。
- 后续动作：任务管理剩余工作主要是接入真实 questions 列表/导入、exports 创建与下载历史、audit-logs 过滤，以及发布前检查抽屉进一步接入后端 readiness 聚合。

### 2026-05-29

- 类型：前后端实现 / 任务管理
- 关联文档：`docs/design/pages/owner-task-management.md`、`docs/api/production.md`、`docs/product/REQUIREMENTS_AND_NOTES.md`、`docs/planning/TODO.md`
- 内容：按任务管理页面设计稿推进第 1 项重做。后端补齐 `GET /tasks/{task_id}`、`PUT /tasks/{task_id}`、`POST /tasks/{task_id}/status`、`DELETE /tasks/{task_id}`、`GET /tasks/{task_id}/stats`，并为 `GET /tasks` 增加状态、关键词、owner、reviewer、标签、分类和难度筛选；服务层实现草稿完整更新、发布后仅允许改 `description/rich_content/tags`、暂停/恢复/结束状态机、草稿删除和统计查询，关键操作写审计日志。前端新增任务管理列表页，`任务管理` 入口不再直接进入发布表单；列表页使用 Ant Design Table、状态概览、搜索筛选、行内修改和发布/暂停/恢复/结束/删除草稿操作；新建任务进入子页面并复用现有任务发布配置流程，修改子页面先覆盖基础信息、模板数据摘要、统计与导出占位和操作日志占位。
- 测试结果：`conda run -n markup-api python -m compileall apps/api/app`、`conda run -n markup-api python -m pytest apps/api/tests/test_auth_team_rbac.py`、`npm run typecheck`、`npm run lint`、`npm run test -- WorkspaceApp`、`npm run build` 通过。WorkspaceApp 专项测试 12 passed；后端 RBAC/生产链路测试 12 passed；Vite build 仍有大 chunk 体积提示。
- 后续动作：继续把新建/修改任务子页面从复用旧发布表单演进为设计稿中的多 Tab 完整配置页，并接入导出中心、操作日志和发布前检查抽屉；随后推进第 2 项模板搭建页面重做。

### 2026-05-29

- 类型：页面设计细化 / 企业管理
- 关联文档：`docs/design/pages/organization-profile.md`、`docs/design/pages/organization-resource-config.md`、`docs/design/pages/organization-announcements.md`、`docs/design/pages/organization-audit-logs.md`
- 内容：在已新增的企业管理四页设计稿基础上补齐可实现细节。企业信息页新增加载/空/错误态、认证提交流程、敏感字段确认、编辑脏状态和跳转关系；资源配置页新增预算申请与审批流程、Provider 编辑与测试连接、模型额度编辑、生产开关表格、高风险确认、权限矩阵和接口降级；公告通知页新增消息状态、批量操作、企业通知创建发送流程、消息详情、与人员管理结构的分发关系、WebSocket 降级、通知字段和权限矩阵；操作日志页新增加载/空/错误态、筛选工具条、表格交互、覆盖事件、可读摘要、diff 展示、风险等级、审计导出确认、API 字段建议和跨页面联动。
- 测试结果：文档变更，`git diff --check` 通过。
- 后续动作：前端实现企业管理页面时优先按这些设计稿拆出四个独立页面，并根据接口缺口采用只读、禁用或 `待接入接口` 降级，不伪造后端未返回的数据。

### 2026-05-29

- 类型：页面设计 / 企业管理
- 关联文档：`docs/design/pages/organization-profile.md`、`docs/design/pages/organization-resource-config.md`、`docs/design/pages/organization-announcements.md`、`docs/design/pages/organization-audit-logs.md`、`docs/design/pages/README.md`、`docs/api/team-profile.md`、`docs/api/review-ai-export.md`、`docs/architecture/SYSTEM_ARCHITECTURE.md`
- 内容：根据企业管理剩余四页讨论新增页面设计稿。企业信息页覆盖企业认证、企业资料展示与修改、成员/预算摘要和认证材料；资源配置页覆盖企业预算、AI provider、模型额度、资质类型和生产资源开关，并明确 AI 调用必须走 AI Resources / AI Gateway；公告通知页覆盖系统公告、企业通知、审核提醒和导出完成提醒，并按人员管理结构设计角色、成员、任务和审核队列分发；操作日志页覆盖状态流转、权限变更、审核、预算、导出和企业管理审计日志，强调筛选、详情 diff、敏感字段脱敏和审计导出。
- 测试结果：文档变更，`git diff --check` 通过。
- 后续动作：前端实现时先替换当前企业信息复用账号页和资源配置/公告通知/操作日志占位页，按四个独立页面分别接入企业、AI 资源、通知和审计接口；通知 REST API、企业认证接口、审计日志导出接口仍需后续补齐。

### 2026-05-29

- 类型：页面设计 / 人员管理
- 关联文档：`docs/design/pages/team-member-management.md`、`docs/design/pages/README.md`、`docs/api/team-profile.md`、`docs/product/REQUIREMENTS_AND_NOTES.md`
- 内容：根据人员管理页面讨论新增独立设计稿。文档参考 Gitee 企业成员管理的信息企业方式，明确 `人员管理` 主页面以 Ant Design Table 为核心，表格工具条从左到右包含成员列表名称、搜索、角色/状态/2FA 等筛选、排序、添加成员和最右侧省略号更多操作；表格列覆盖成员、角色、2FA、职位、手机号、邮箱、任务/审核、最近活跃和加入时间。添加成员、删除/移除、批量操作等高权限能力仅对 Owner 或后端权限允许者可见，并补充添加成员 Modal、成员详情 Drawer、编辑成员 Drawer、禁用/移除确认、邀请记录和后续 API 字段需求。
- 测试结果：文档变更，`git diff --check` 通过。
- 后续动作：前端实现时先把当前账号管理内的企业成员页拆成独立人员管理页，使用 Ant Design Table 和 Modal/Drawer 替代常驻表单。

### 2026-05-29

- 类型：页面设计 / 模板搭建
- 关联文档：`docs/design/pages/owner-template-designer.md`、`docs/design/pages/README.md`、`docs/markup_requirements.md`、`docs/product/REQUIREMENTS_AND_NOTES.md`、`docs/api/production.md`
- 内容：根据模板搭建页面讨论和交付文档第 4.2 节新增模板搭建页面独立设计稿。文档明确侧栏 `模板搭建` 进入模板管理列表页，新建模板进入 Designer 子页面，Renderer 预览进入完整子页面；模板迭代按版本号管理，已发布模板不可原地修改，任务发布绑定具体模板版本。Designer 设计覆盖左侧物料区、中间画布、右侧属性面板、ShowItem、基础输入、选择、上传、JSON、LLM 组件、字段校验、联动规则、多 Tab 布局、页签切换栏内重命名/删除/排序，以及发布检查和 schema 检查。
- 测试结果：文档变更，`git diff --check` 通过。
- 后续动作：前端实现时先把当前 `模板搭建` 从直接 Designer 入口拆成模板列表页，再将 Designer 和 Renderer 预览拆为独立子页面，优先补齐版本只读和新建版本流程。

### 2026-05-29

- 类型：前端体验修复 / 工作台固定标题
- 关联文档：`docs/design/FRONTEND_DESIGN_STYLE.md`
- 内容：修正工作台标题栏意外偏下的问题。`AppShell` 主内容区不再额外为固定面包屑重复预留高度，只避开全局顶栏；`page-heading` 的 sticky 偏移改为相对内容流的 `breadcrumb-height`，移动端同样只避开顶栏和二级导航。修复后页面标题从面包屑下方起始，并在滚动时保持贴合面包屑下方。
- 测试结果：Playwright CLI 复测任务管理页，面包屑底部 `102px`，滚动前后 `page-heading.top = 102px`，标题不再从 `204px` 才开始。
- 后续动作：提交前继续执行前端专项测试、构建和 `git diff --check`。

### 2026-05-29

- 类型：页面设计 / 任务管理
- 关联文档：`docs/design/pages/owner-task-management.md`、`docs/design/pages/README.md`、`docs/markup_requirements.md`、`docs/api/production.md`、`docs/api/review-ai-export.md`
- 内容：根据任务管理页面讨论和交付文档第 4.1 节新增任务管理页面独立设计稿。文档明确侧栏 `任务管理` 进入任务列表页，新建任务和修改任务进入独立子页面；列表页负责展示当前企业任务、筛选、状态控制、复制、删除草稿和异步导出入口；子页面覆盖基础信息、模板与数据、题目管理、发布配置、审核与 AI、资质与分发、统计与导出、操作日志，并把草稿/发布中/暂停/结束状态机、发布后可编辑字段限制和发布前检查抽屉写入页面约束。
- 测试结果：文档变更，`git diff --check` 通过。
- 后续动作：前端实现时先把当前 `任务管理` 从发布任务表单入口拆成列表页，再复用/迁移现有发布任务配置能力到新建/修改任务子页面。

### 2026-05-29

- 类型：前端体验优化 / 工作台侧栏导航
- 关联文档：`docs/design/FRONTEND_DESIGN_STYLE.md`
- 内容：工作台侧栏由扁平菜单调整为分组导航。分组包括主页面、数据生产、审核质检、数据交付、企业管理和个人工具；展开状态显示分组标题，收起状态隐藏标题并显示分隔线。数据生产下保留任务管理、模板搭建、数据集；审核质检、数据交付和企业管理新增对应占位页或复用现有企业信息/人员管理面板，面包屑同步支持新增页面。
- 测试结果：`npm run typecheck`、`npm run lint`、`npm run test -- AppShell WorkspaceApp`、`npm run test`、`npm run build`、`git diff --check` 通过；完整前端测试 35 passed。Vitest 仍输出 jsdom 对 canvas/getComputedStyle pseudo-elements 的已知未实现提示，不影响断言结果；Vite build 仍有大 chunk 体积提示。
- 后续动作：后续按 API 进度把任务管理、AI 预审、人工审核、数据看板、导出中心、公告通知和操作日志占位页替换为真实业务页面。

### 2026-05-29

- 类型：前端体验优化 / 工作台侧栏导航
- 关联文档：`docs/design/FRONTEND_DESIGN_STYLE.md`
- 内容：提高工作台侧栏空间利用率。Ant Design 当前没有独立滚动条组件，侧栏仍使用 `Layout.Sider` 和 `Menu`，通过压缩侧栏 padding、分组间距、小类标题字号、菜单项高度减少滚动概率；如内容仍超出，则使用 CSS 定制细窄滚动条，降低视觉干扰。
- 测试结果：`npm run test -- AppShell`、`npm run typecheck`、`npm run lint`、`npm run build`、`git diff --check` 通过；Vite build 仍有大 chunk 体积提示。
- 后续动作：如后续侧栏栏目继续增加，可考虑把低频栏目折叠为 Ant Design `Menu` 的 group/submenu 组合。

### 2026-05-29

- 类型：前端体验优化 / 全局滚动条
- 关联文档：`docs/design/FRONTEND_DESIGN_STYLE.md`
- 内容：将细窄滚动条样式提升到全局 `global.css`，覆盖页面、弹窗、抽屉和普通滚动容器；侧栏删除重复滚动条样式，继续继承全局规则。横向工作台子导航仍保留隐藏滚动条的特例。
- 测试结果：`npm run typecheck`、`npm run lint`、`npm run test -- AppShell`、`npm run build`、`git diff --check` 通过；Vite build 仍有大 chunk 体积提示。
- 后续动作：无。

### 2026-05-29

- 类型：前端体验优化 / 工作台面包屑
- 关联文档：`docs/design/FRONTEND_DESIGN_STYLE.md`
- 内容：工作台面包屑改为 sticky 固定。桌面端面包屑固定在顶栏下方的工作台内容顶部，页面主体滚动时不随下方内容离开视口；移动端避开横向二级导航高度，防止与子导航重叠。
- 测试结果：`npm run test -- AppShell`、`npm run typecheck`、`npm run lint`、`npm run build`、`git diff --check` 通过；Vite build 仍有大 chunk 体积提示。
- 后续动作：如实际页面有局部内部滚动容器，需按页面结构决定是否在该局部容器内增加二级 sticky 标题。

### 2026-05-29

- 类型：前端体验优化 / 工作台侧栏导航
- 关联文档：`docs/design/FRONTEND_DESIGN_STYLE.md`
- 内容：企业管理分组新增“资源配置”入口，使用 Ant Design 图标并接入工作台页面枚举、侧栏选中态、页面级面包屑和占位页。资源配置页先作为企业级配置容器，预留企业预算、AI provider、模型额度、资质类型和生产资源开关等后续模块入口。
- 测试结果：`npm run test -- AppShell WorkspaceApp`、`npm run typecheck`、`npm run lint`、`npm run build`、`git diff --check` 通过；专项测试 15 passed。Vitest 仍输出 jsdom 对 canvas/getComputedStyle pseudo-elements 的已知未实现提示，不影响断言结果；Vite build 仍有大 chunk 体积提示。
- 后续动作：后续按 API 进度将资源配置占位页替换为真实企业资源配置页面。

### 2026-05-29

- 类型：前端体验优化 / 工作台布局修复
- 关联文档：`docs/design/FRONTEND_DESIGN_STYLE.md`
- 内容：修复工作台面包屑和水印随内容滚动的问题。Ant Design `Watermark` 不再包裹工作台内容，改为顶栏以下的固定 shell 覆盖层；面包屑从 `Layout.Content` 内移到 shell 固定层，并通过内容区顶部 padding 预留空间，避免遮挡页面标题。企业工作台隐藏“标注页面”入口，同时企业首页不再显示跳转标注页的按钮。
- 测试结果：`npm run test -- AppShell WorkspaceApp`、`npm run typecheck`、`npm run lint`、`git diff --check` 通过；专项测试 16 passed。Vitest 仍输出 jsdom 对 canvas/getComputedStyle pseudo-elements 的已知未实现提示，不影响断言结果。
- 后续动作：本地浏览器走查时重点确认桌面/移动端固定层位置，尤其是顶栏、移动二级导航、面包屑和内容标题的垂直间距。

### 2026-05-29

- 类型：前端体验优化 / 认证页 Ant Design 重构 / 文档更新
- 关联文档：`docs/design/FRONTEND_DESIGN_STYLE.md`、`docs/design/pages/README.md`、`docs/design/pages/auth-entry.md`
- 内容：按认证页重构方案完成 `LoginPage` 的 Ant Design 化收口。认证页改为“品牌介绍区 + 认证工作区”双栏结构，登录/注册/忘记密码/OAuth 补绑邮箱统一进入 `Form` 体系，模式切换使用 `Tabs`，邮箱验证码组合使用 `Space.Compact`，注册区新增 pending onboarding `Steps` 说明，协议文案继续通过 antd `Modal` 承载。同步补充认证页页面级设计稿与全站设计规范中的认证页约束。
- 测试结果：`npm run typecheck` 通过；`npm run test -- src/pages/auth/LoginPage.test.tsx` 通过，15 passed。Vitest 仍输出 jsdom 对 pseudo-elements 的已知未实现提示，不影响断言结果。
- 后续动作：继续完成 `App.test.tsx` 与整套前端验证，重点确认会话失效后重新打开登录弹层、pending 用户重新登录进入 `/onboarding` 的回归行为未被本次 UI 重构破坏。

### 2026-05-29

- 类型：偏差修正 / GitHub OAuth 回调修复
- 关联文档：`docs/api/auth.md`、`docs/operations/DEPLOYMENT.md`
- 内容：定位并修复 GitHub OAuth 首次授权后的回调 500。根因是后端 `oauth_callback` 在“根据 GitHub 已验证邮箱自动创建新用户”分支里重复插入同一条 `oauth_identities` 记录，触发 MongoDB 唯一索引冲突并抛出未捕获的 `DuplicateKeyError`。修复后在自动建号后先复用已创建的 identity，再继续签发前端 ticket。
- 测试结果：离线复现 GitHub callback 链路后确认问题可稳定触发；新增后端回归测试覆盖 `GET /api/v1/auth/oauth/github/callback` 首次成功跳回前端场景；`apps/api/tests/test_auth_team_rbac.py` 通过，14 passed。
- 后续动作：如果本地后端服务已启动，需要重启后端进程后再重新走一次 GitHub 登录；同时建议立即轮换 GitHub、飞书和 SMTP 已暴露的密钥。

### 2026-05-29

- 类型：需求变更 / 偏差修正 / OAuth 首登流程重构
- 关联文档：`docs/product/REQUIREMENTS_AND_NOTES.md`、`docs/api/auth.md`
- 内容：根据最新产品要求，GitHub / 飞书首次授权不再自动创建 MarkUp 用户，也不再仅凭第三方已验证邮箱静默登录已有同邮箱账号。后端 OAuth 回调现在只为“已绑定身份”直接签发会话；对未绑定身份，`/api/v1/auth/oauth/exchange` 返回 `needs_account_link=true` 和一次性 `bind_ticket`，由前端显式引导用户选择“绑定已有账号”或“注册新的通用账号”。新增 `POST /api/v1/auth/oauth/link-account` 与 `POST /api/v1/auth/oauth/register-account`，前端 `LoginPage` 的 OAuth callback 视图同步改造成选择态、绑定态和注册态。
- 测试结果：已补充后端首登不自动建号、显式绑定已有账号、显式注册 pending 账号场景；已补充前端 OAuth callback 显示选择、绑定已有账号、注册新账号回归测试。完整命令结果以本次验证记录为准。
- 后续动作：联调时重点确认 pending 用户通过 OAuth 新注册后仍然进入 `/onboarding`，以及第三方未返回可信邮箱时的新账号注册补邮箱路径仍可用。

- 类型：页面设计 / 企业管理页面组
- 关联文档：`docs/design/pages/organization-management.md`、`docs/design/pages/organization-profile.md`、`docs/design/pages/organization-resource-config.md`、`docs/design/pages/organization-announcements.md`、`docs/design/pages/organization-audit-logs.md`、`docs/markup_requirements.md`
- 内容：根据用户对企业管理剩余四个页面的讨论，新增企业管理页面组总体设计稿。文档明确企业信息负责认证、展示和修改企业资料；资源配置承载企业预算、AI Provider、模型额度、资质类型和生产开关；公告通知承载系统公告、企业通知、审核提醒和导出提醒，并按人员管理结构进行分发；操作日志承载关键状态流转、权限变更、审核、导出和企业管理审计。同步统一四页的侧栏结构、固定标题栏、权限矩阵、跨页联动、接口缺口降级和 Hallmark 检查口径。
- 测试结果：文档变更，`git diff --check` 通过。
- 后续动作：前端实现或继续加固时以页面组总体设计稿确定企业管理边界，再分别按四个单页设计稿推进具体交互和 API 对接。

### 2026-05-29

- 类型：页面设计 / 数据集管理
- 关联文档：`docs/design/pages/owner-dataset-management.md`、`docs/design/pages/README.md`、`docs/markup_requirements.md`、`docs/api/production.md`
- 内容：根据用户对数据集页面框架的讨论，新增数据集管理页面独立设计稿。文档明确侧栏条目改名为“数据集管理”，列表页负责展示数据集、筛选、导入、导出和进入修改；修改子页面使用 `工作台 / 数据集 / [数据集名字]` 面包屑，承载数据预览、字段管理、渲染变量、多模态素材和原始下载；数据预览表格要求支持拖拽调整列宽，并区分原始字段名、展示名、备注和映射开关的前后端边界。
- 测试结果：文档变更，待提交前执行 `git diff --check`。
- 后续动作：前端实现时先拆列表页和修改子页面，再接入可拖拽列宽预览表格和字段保存逻辑。

### 2026-05-29

- 类型：前端实现 / 企业管理跨页筛选
- 关联文档：`docs/design/pages/organization-management.md`、`docs/design/pages/organization-resource-config.md`、`docs/design/pages/organization-audit-logs.md`
- 内容：补齐企业管理页面组的跨页联动。`企业信息` 点击“查看操作日志”会进入操作日志页并按当前企业 `entity_type=team`、`entity_id=current_team_id` 初始化筛选；`资源配置` 点击“查看操作日志”会进入操作日志页并按 `entity_type=ai_resource` 初始化筛选。操作日志页支持通过初始筛选状态加载列表，并修正实体类型/风险等级 Select 切换后使用旧筛选值的问题；WorkspaceApp 新增内部导航状态，避免后续从内部状态迁移到 URL 深链接时重写交互。
- 测试结果：`npm run test -- WorkspaceApp` 通过，20 passed；`npm run typecheck`、`npm run lint`、`npm run build`、`git diff --check` 通过。Vitest 仍输出 jsdom `getComputedStyle` 伪元素未实现提示，不影响断言；Vite build 仍有大 chunk 体积提示。
- 后续动作：继续补资源配置到操作日志页的 URL 查询参数深链接、人员管理到操作日志的成员筛选，以及审计日志异步导出接口。

### 2026-05-29

- 类型：前后端实现 / 模板 Renderer 运行时校验
- 关联文档：`docs/api/production.md`、`docs/product/REQUIREMENTS_AND_NOTES.md`、`docs/planning/TODO.md`
- 内容：继续推进模板搭建闭环。后端新增 `POST /templates/validate`，根据模板 schema 和 answers 执行运行时基础校验，覆盖必填、文本最小/最大长度、正则、单选合法性、多选/标签最少最多选择、JSON 格式和 ShowItem 预览数据绑定警告；前端 Renderer 预览页接入“运行校验”，可编辑答案并展示字段级错误、警告和运行检查结果。修复 Renderer 校验结果不完整时可能读取 `field_errors.length` 崩溃的问题，并补充页面内可见的 Ant Design Alert 校验反馈。
- 测试结果：`npm run test -- WorkspaceApp`、`npm run typecheck`、`npm run lint`、`npm run build`、`conda run -n markup-api python -m compileall apps/api/app`、`conda run -n markup-api python -m pytest apps/api/tests/test_auth_team_rbac.py`、`git diff --check` 通过。WorkspaceApp 19 passed，后端 RBAC/生产链路测试 12 passed。Vitest 仍输出 jsdom `getComputedStyle` 伪元素未实现提示，不影响断言；Vite build 仍有大 chunk 体积提示。
- 后续动作：继续将同一校验函数接入 Labeler 正式提交链路，补 Designer 与 Labeler Renderer 一致性验证。

### 2026-05-29

- 类型：设计文档 / 企业管理页面组
- 关联文档：`docs/design/pages/organization-management.md`、`docs/design/pages/organization-profile.md`、`docs/design/pages/organization-resource-config.md`、`docs/design/pages/organization-announcements.md`、`docs/design/pages/organization-audit-logs.md`
- 内容：根据企业管理剩余页面讨论和交付文档，整理企业信息、资源配置、公告通知、操作日志四个页面的设计规格。补充企业管理页面组的深链接参数、当前实现边界和降级规则；修正公告通知设计稿与当前通知 REST API 的对应关系；补充资源配置 Tab 深链接、刷新策略和操作日志当前实现边界，确保前端实现时区分已上线能力与后续目标，不伪造认证、成本、通知分发和审计事实。
- 测试结果：文档变更，未运行前后端测试。
- 后续动作：若继续实现细节，优先补资源配置到操作日志页的筛选深链接、通知设置 REST API、系统/审核/导出事件自动通知、异步审计导出和企业认证接口。

### 2026-05-29

- 类型：前端实现 / 数据集管理
- 关联文档：`docs/design/pages/owner-dataset-management.md`、`docs/design/FRONTEND_DESIGN_STYLE.md`
- 内容：按数据集管理页面设计稿重构 Owner 数据集页面。工作台侧栏文案由“数据集”改为“数据集管理”；列表页改为 Ant Design `Table` 展示数据集、筛选、导入、导出和删除，点击行内“修改”进入独立修改子页面；修改子页面通过动态面包屑呈现 `工作台 / 数据集 / [数据集名字]`，包含基础信息、数据预览、字段管理、渲染变量和多模态素材 Tab。数据预览表格支持拖拽表头调整列宽、双击自适应列宽，并按数据集记录本地列宽偏好。
- 测试结果：`npm run typecheck`、`npm run lint`、`npm run test -- WorkspaceApp AppShell`、`npm run test`、`npm run build`、`git diff --check` 通过；完整前端测试 36 passed。Vitest 仍输出 jsdom 对 canvas/getComputedStyle pseudo-elements 的已知未实现提示，不影响断言；Vite build 仍有大 chunk 体积提示。Playwright CLI 浏览器走查尝试受本机网络限制失败，原因是 wrapper 需要临时拉取 `@playwright/cli`，当前无法解析 `registry.npmjs.org`。
- 后续动作：网络可用或本地 Playwright CLI 可直接运行后，继续浏览器走查列表页、修改子页面、列宽拖拽和移动端表格横向滚动；如需要深链接，再把内部状态演进为 `/workspace/datasets/:datasetId` 路由。

### 2026-05-29

- 类型：前端体验修复 / 数据集管理与工作台 Shell
- 关联文档：`docs/design/pages/owner-dataset-management.md`、`docs/design/FRONTEND_DESIGN_STYLE.md`
- 内容：按最新反馈修正数据集详情面包屑和页面固定层。数据集详情面包屑调整为 `工作台 / 数据集管理 / [数据集名字]`，其中 `数据集管理` 可点击并调用详情页返回列表逻辑，保留未保存修改确认；工作台所有 `page-heading` 改为内容区 sticky 固定，避免 `Datasets / 数据集管理` 等页面标题随下方表格滚动离开视口；数据集详情页 Tabs 导航增加左侧缩进，减少贴边感。同步修复本地 Playwright skill wrapper，优先使用已安装的 `playwright-core` CLI client，避免每次通过 npx 联网拉取 `@playwright/cli`。
- 测试结果：`npm run typecheck`、`npm run lint`、`npm run test -- WorkspaceApp AppShell`、`npm run test`、`npm run build`、`git diff --check` 通过；完整前端测试 36 passed。修复后的 Playwright CLI 已完成浏览器走查：工作台进入数据集管理列表正常；点击“修改”进入详情后，面包屑显示 `工作台 / 数据集管理 / [数据集名字]`，`数据集管理` 可点击返回列表；滚动后页面标题保持 sticky 固定；数据集详情 Tabs 文本相对容器左边界右移 24px。
- 后续动作：如后续需要更强的详情深链接，再把内部详情状态演进为 `/workspace/datasets/:datasetId` 路由。

### 2026-05-29

- 类型：前端体验修复 / 工作台固定标题
- 关联文档：`docs/design/FRONTEND_DESIGN_STYLE.md`
- 内容：修正工作台 `page-heading` sticky 锚点。上一版使用 `top: 0`，滚动时标题会从全局面包屑下方滑到顶栏位置，视觉上仍在移动；现改为桌面端固定在 `nav-height + breadcrumb-height` 下方，移动端固定在 `nav-height + subnav-height + breadcrumb-height` 下方。
- 测试结果：Playwright CLI 复测数据集管理页，滚动前 `page-heading.top = 102`，滚动后 `page-heading.top = 102`，位移 `0`。
- 后续动作：无。

### 2026-05-29

- 类型：前端实现 / 模板搭建
- 关联文档：`docs/design/pages/owner-template-designer.md`、`docs/api/production.md`、`docs/product/REQUIREMENTS_AND_NOTES.md`
- 内容：按模板搭建页面设计稿推进第 2 项重做。前端 `模板搭建` 入口改为模板管理列表页，使用 Ant Design Table 展示模板名称、版本状态、结构概览、引用占位和最近更新；新建/修改模板进入独立 Designer 子页面，保留三栏物料区、画布和属性面板，并将页签重命名、复制、删除、左右移动放到页签切换栏完成，不再放在右侧属性栏；Renderer 预览改为完整子页面，展示预览数据、同一份 TemplateRenderer 渲染结果和运行检查，不再作为 Designer 内的 Modal；前端服务补齐模板详情、更新、版本历史和预览接口调用。
- 测试结果：`npm run typecheck` 通过；`npm run test -- WorkspaceApp` 通过，12 passed。Vitest 仍输出 jsdom 对 getComputedStyle pseudo-elements 的已知未实现提示，不影响断言。
- 后续动作：模板搭建剩余缺口包括后端删除/归档/复制模板接口、发布检查接口、schema lint/联动规则编辑器、版本对比和任务引用统计；后续进入人员管理页面前可继续补模板后端能力或先按目标顺序推进下一页。

### 2026-05-29

- 类型：前后端实现 / 操作日志服务端导出
- 关联文档：`docs/api/review-ai-export.md`、`docs/design/pages/organization-audit-logs.md`、`docs/design/pages/organization-management.md`、`docs/planning/TODO.md`
- 内容：补齐操作日志页的服务端导出闭环。后端新增 `GET /audit-logs/export?team_id=...&export_format=csv|json`，复用列表筛选条件，支持实体、动作、操作人、关键词、风险和时间范围过滤；接口校验企业作用域，返回 CSV / JSON 文件流，并写入 `audit_log_exported` 审计日志。前端操作日志页的“导出日志”改为调用后端下载，不再仅导出当前已加载表格数据；导出确认文案同步说明会记录审计导出动作。
- 测试结果：`conda run -n markup-api python -m pytest apps/api/tests/test_auth_team_rbac.py` 通过，12 passed；`npm run test -- WorkspaceApp` 通过，21 passed。Vitest 仍输出 jsdom 对 `getComputedStyle` pseudo-elements、锚点下载 navigation 的已知提示。
- 后续动作：操作日志剩余缺口为大范围异步导出、进度查询、下载历史、风险等级持久化、关联对象名称冗余和完整 request_id 历史回填。

### 2026-05-29

- 类型：前后端实现 / 公告通知治理操作
- 关联文档：`docs/api/review-ai-export.md`、`docs/design/pages/organization-announcements.md`、`docs/design/pages/organization-management.md`、`docs/planning/TODO.md`
- 内容：补齐公告通知页企业通知治理能力。后端通知模型新增撤回和软删除字段，新增 `POST /notifications/{notification_id}/revoke?team_id=...` 与 `DELETE /notifications/{notification_id}?team_id=...`，均校验企业作用域和 `member:invite` 权限；撤回后通知保留在列表并展示 `已撤回`，软删除后默认从列表隐藏但保留审计事实。撤回和删除分别写入 `notification_revoked` 与 `notification_deleted` 操作日志。前端公告通知表格新增企业通知行内撤回和删除 Popconfirm 操作，删除后同步更新列表和摘要统计。
- 测试结果：`conda run -n markup-api python -m pytest apps/api/tests/test_auth_team_rbac.py` 通过，12 passed；`npm run test -- WorkspaceApp` 通过，21 passed。Vitest 仍输出 jsdom 对 `getComputedStyle` pseudo-elements 的已知未实现提示。
- 后续动作：公告通知剩余缺口为系统/审核/导出事件自动通知、企业级通知策略、WebSocket 实时推送和任务相关人员精确聚合。

### 2026-05-29

- 类型：前端实现 / 公告通知设置接入
- 关联文档：`docs/design/pages/organization-announcements.md`、`docs/design/pages/organization-management.md`、`docs/api/team-profile.md`、`docs/api/review-ai-export.md`、`docs/planning/TODO.md`
- 内容：将公告通知页的“通知设置”从说明 Drawer 改为可保存的个人通知偏好表单。前端复用现有 `GET /profile/me` 和 `PUT /profile/me`，读写 `notification_settings` 中的站内通知、邮件通知、系统公告、企业通知、审核提醒和导出提醒偏好；不新增独立通知设置 API。文档同步区分个人偏好已接入与企业级强制通知、邮件策略、WebSocket 实时推送仍待后续实现。
- 测试结果：`npm run test -- WorkspaceApp` 通过，21 passed。Vitest 仍输出 jsdom 对 `getComputedStyle` pseudo-elements 的已知未实现提示，不影响断言。
- 后续动作：继续补系统/审核/导出事件自动通知、企业级通知策略、WebSocket 实时推送、企业通知撤回/删除和任务相关人员精确聚合。

### 2026-05-29

- 类型：前端实现 / 人员管理与企业信息
- 关联文档：`docs/design/pages/team-member-management.md`、`docs/design/pages/organization-profile.md`、`docs/api/team-profile.md`
- 内容：继续推进第 3、4 项页面实现。人员管理已作为独立 `PeopleManagementPage` 接入工作台 `people-management` 页面，主视图使用 Ant Design Table、搜索、角色/状态/2FA 筛选、排序、添加成员 Modal、成员详情 Drawer、编辑成员 Drawer 和移除成员确认，复用现有企业成员 API；修复 Ant Design 按钮可访问名称和 Select 测试交互导致的测试失败。企业信息不再复用账号管理里的 `企业信息页`，新增独立 `OrganizationProfilePage`，使用 `GET /teams/admin/overview` 展示企业状态、认证降级提示、成员角色统计和 AI 预算摘要，使用 `PUT /teams/{team_id}` 保存基础资料；企业认证、认证材料和 Logo 上传在接口未接入前明确 disabled/待接入，不伪造认证状态。
- 测试结果：`npm run test -- WorkspaceApp` 通过，14 passed；`npm run typecheck` 通过。Vitest 仍输出 jsdom 对 getComputedStyle pseudo-elements 的已知未实现提示，不影响断言。
- 后续动作：继续执行 `npm run lint`、`npm run build` 和 `git diff --check`；企业信息后续缺口为企业认证提交/状态接口、认证材料列表、Logo 文件上传和操作日志带筛选跳转。

### 2026-05-29

- 类型：前后端实现 / 资源配置、公告通知与操作日志
- 关联文档：`docs/design/pages/organization-resource-config.md`、`docs/design/pages/organization-announcements.md`、`docs/design/pages/organization-audit-logs.md`、`docs/api/review-ai-export.md`、`docs/api/team-profile.md`
- 内容：继续推进第 5、6、7 项企业管理页面。资源配置页接入真实企业预算、预算申请/审批、AI Provider、调用日志、成本估算、资质类型只读聚合和生产资源开关；后端新增 AI Resources 资源模型、服务、路由和 MongoDB 索引，并补齐企业预算申请接口。公告通知新增 `notifications` 后端模型、服务和路由，支持企业通知列表、创建、分发预览、全部已读、单条已读/处理；前端新增独立公告通知页，使用 Ant Design Tabs/Table/Modal/Drawer 展示系统公告、企业通知、审核提醒和导出提醒结构。操作日志页替换占位页，接入 `/audit-logs`，支持关键词、实体、风险、动作筛选、审计概览、风险 Tag、详情 Drawer 和字段 diff；审计接口补充 `keyword`、`risk_level`、`start_date`、`end_date` 查询与展示层风险等级/摘要返回。
- 测试结果：后端 `conda run -n markup-api python -m compileall apps/api/app` 通过；`conda run -n markup-api python -m pytest apps/api/tests/test_auth_team_rbac.py` 通过，12 passed。前端 `npm run typecheck`、`npm run lint`、`npm run test -- WorkspaceApp`、`npm run build`、`git diff --check` 通过；WorkspaceApp 17 passed。Vitest 仍输出 jsdom 对 getComputedStyle pseudo-elements 的已知未实现提示，不影响断言；Vite build 仍有大 chunk 体积提示。
- 后续动作：资源配置剩余缺口为统一 AI Gateway、真实 Provider 密钥加密/调用、批量 AI 调用和更细成本报表；公告通知剩余缺口为系统公告/审核/导出事件自动写入、WebSocket 实时推送、通知设置、撤回和删除；操作日志剩余缺口为审计导出、request_id 串联、关联对象名称冗余和风险等级写入字段。

### 2026-05-29

- 类型：前后端加固 / 企业管理审计与导出交互
- 关联文档：`docs/api/review-ai-export.md`、`docs/design/pages/team-member-management.md`、`docs/design/pages/organization-resource-config.md`、`docs/design/pages/organization-audit-logs.md`
- 内容：继续收口企业管理页面。审计日志模型新增 `team_id`，企业、成员、数据集、模板、任务、AI 资源和通知等关键写入显式记录企业作用域；`GET /audit-logs` 支持 `team_id` 查询并校验 `X-Team-ID`，避免企业级操作日志混入其他企业数据。人员管理页“导出成员清单”改为可用的本地 CSV 导出；资源配置页“查看调用日志”打开 AI 调用日志 Drawer，“查看操作日志”给出跳转/筛选说明；公告通知页“通知设置”改为说明 Drawer；操作日志页“导出日志”按当前筛选结果生成本地 CSV，后续大范围异步审计导出仍待后端接口。
- 测试结果：`conda run -n markup-api python -m compileall apps/api/app`、`conda run -n markup-api python -m pytest apps/api/tests/test_auth_team_rbac.py`、`npm run typecheck`、`npm run lint`、`npm run test -- WorkspaceApp` 通过；WorkspaceApp 17 passed，后端 RBAC 测试 12 passed。Vitest 仍输出 jsdom 对 getComputedStyle pseudo-elements 的已知未实现提示，不影响断言。
- 后续动作：继续补后端异步审计导出、request_id 贯穿、资源配置到操作日志页的深链接筛选、通知设置 REST API 和实时推送。

### 2026-05-29

- 类型：前后端加固 / 企业管理页面细节收口
- 关联文档：`docs/api/review-ai-export.md`、`docs/design/pages/organization-resource-config.md`、`docs/design/pages/organization-announcements.md`、`docs/design/pages/organization-audit-logs.md`
- 内容：根据企业信息、资源配置、公告通知和操作日志的页面讨论继续补齐交互细节。资源配置页“查看操作日志”改为直接进入企业管理操作日志页；公告通知创建 Modal 增加“指定任务相关成员”分发入口，按任务分发时要求填写任务 ID，并明确当前后端在任务参与者聚合未完成前暂按企业活跃成员预览/发送；紧急通知取消发送时不再悬挂提交流程。审计日志模型新增 `request_id` 字段，后端写审计日志时记录当前请求链路 ID，列表关键词搜索纳入 `request_id`，前端操作日志表格、详情 Drawer 和 CSV 导出均展示该字段。
- 测试结果：`conda run -n markup-api python -m compileall apps/api/app`、`conda run -n markup-api python -m pytest apps/api/tests/test_auth_team_rbac.py`、`npm run typecheck`、`npm run lint`、`npm run test -- WorkspaceApp`、`npm run build`、`git diff --check` 通过；后端 RBAC/生产链路测试 12 passed，WorkspaceApp 18 passed。Vitest 仍输出 jsdom 对 getComputedStyle pseudo-elements 的已知未实现提示，不影响断言；Vite build 仍有大 chunk 体积提示。
- 后续动作：继续补资源配置到操作日志页的筛选深链接、通知设置 REST API、系统/审核/导出事件自动通知、异步审计导出、关联对象名称冗余和审计风险等级持久化字段。

### 2026-05-29

- 类型：前后端实现 / 导出中心最小闭环
- 关联文档：`docs/api/review-ai-export.md`、`docs/design/pages/owner-task-management.md`、`docs/planning/TODO.md`
- 内容：继续收尾任务管理页面 `统计与导出` Tab。后端新增 `/exports` 路由、`ExportJob` 模型和导出服务，覆盖创建导出任务、列表、详情、下载和取消接口；当前创建后同步生成文件并以 `completed + progress=100` 记录，前端仍按异步任务和下载历史模型展示，后续可替换为 worker 队列。导出支持 JSON、JSONL、CSV、Excel，支持状态/标注员过滤、字段 include/exclude/rename 和 `include_review_records`；下载会增加下载次数并写 `export_downloaded` 审计日志。前端任务详情 `统计与导出` Tab 新增创建导出任务 Modal、导出历史表格、下载和取消入口，草稿任务提示仅可导出题目源数据。
- 测试结果：`conda run -n markup-api python -m compileall apps/api/app/api/v1/exports.py apps/api/app/services/export_service.py apps/api/app/models/export.py apps/api/app/schemas/export.py apps/api/app/api/v1/router.py apps/api/app/core/database.py`、`conda run -n markup-api python -m pytest apps/api/tests/test_auth_team_rbac.py`、`npm run typecheck`、`npm run lint` 通过；后端 RBAC/生产链路测试 12 passed。
- 后续动作：导出中心剩余缺口为真实 worker 异步队列、日期范围过滤、导出完成通知/WebSocket 推送，以及与人工审核通过数据的最终可导出口径接入。

### 2026-05-29

- 类型：前后端实现 / 任务题目管理补齐
- 关联文档：`docs/api/production.md`、`docs/design/pages/owner-task-management.md`、`docs/planning/TODO.md`
- 内容：补齐任务管理页面 `题目管理` Tab 的写接口和前端交互。后端新增题目批量创建、文件导入、更新、单条删除、批量删除和题目源数据导出；导入支持 JSON、JSONL、CSV、Excel(.xlsx)，最大 50MB，草稿任务可选择替换现有题目；导出支持 JSON、JSONL、CSV、Excel，正式标注结果导出仍归后续 `/exports` 异步导出中心。所有题目修改类操作限制为草稿任务，已发布任务禁止修改/删除题目以保护领取、提交和审核关系，并写入审计日志。前端题目管理 Tab 启用 JSON 新增、文件导入、批量删除、单条编辑/删除和多格式导出，发布后自动降级为预览和导出。
- 测试结果：`conda run -n markup-api python -m compileall apps/api/app/api/v1/tasks.py apps/api/app/services/production_service.py apps/api/app/schemas/production.py`、`conda run -n markup-api python -m pytest apps/api/tests/test_auth_team_rbac.py`、`npm run typecheck`、`npm run lint`、`npm run test -- WorkspaceApp` 通过。后端 RBAC/生产链路测试 12 passed，WorkspaceApp 18 passed；Vitest 仍输出 jsdom 对 getComputedStyle pseudo-elements 的已知未实现提示，不影响断言。
- 后续动作：任务管理剩余缺口集中在 `/exports` 异步导出中心、任务复制/批量操作深水区和 readiness 更细的预算/资质/审核阶段规则。

### 2026-05-29

- 类型：前后端实现 / 模板管理能力补齐
- 关联文档：`docs/api/production.md`、`docs/design/pages/owner-template-designer.md`、`docs/planning/TODO.md`
- 内容：继续推进模板搭建页面重做的剩余能力。后端模板模型新增归档时间，`GET /templates` 默认过滤归档模板；新增 `POST /templates/{template_id}/copy`、`POST /templates/{template_id}/archive` 和 `DELETE /templates/{template_id}`。复制模板会生成独立草稿和 `v1` 版本；归档模板不再作为任务发布候选，且不能继续修改或发布；删除仅允许未被任务引用的草稿模板，已发布模板必须归档以保留历史任务和 submission 回放。前端模板管理列表新增复制、归档和删除草稿操作，使用 Ant Design `Popconfirm` 保护归档和删除。
- 测试结果：后端 `test_auth_team_rbac.py` 已覆盖模板复制、草稿删除和已发布模板删除被拒绝；前端 `WorkspaceApp` 已覆盖模板列表复制、归档和删除草稿流程。
- 后续动作：模板搭建剩余缺口包括发布检查接口、schema lint/联动规则编辑器、版本对比和任务引用统计；任务管理剩余缺口仍包括题目批量导入/更新/删除/导出和导出中心。

### 2026-05-29

- 类型：测试结果 / 回归修复
- 关联文档：`docs/planning/TODO.md`、`docs/api/review-ai-export.md`
- 内容：修复 `WorkspaceApp` 全量测试中模板管理用例偶发空列表问题。根因是前序用例的异步 React effect 与 fetch mock 可能跨用例残留；测试文件增加显式 `cleanup()`，模板管理用例改为等待模板行真实渲染后再执行复制/归档/删除断言。同步确认企业管理四页、任务题目管理、模板管理复制/归档/删除和导出中心最小闭环在当前代码状态下可通过回归验证。
- 测试结果：`npm run test -- WorkspaceApp` 通过，18 passed；`npm run typecheck`、`npm run lint`、`npm run build`、`conda run -n markup-api python -m compileall apps/api/app`、`conda run -n markup-api python -m pytest apps/api/tests/test_auth_team_rbac.py`、`git diff --check` 通过；后端测试 12 passed。Vite build 仍有大 chunk 体积提示，属于当前单页应用打包体积警告。
- 后续动作：继续推进剩余核心链路：Labeler 工作台、人工审核流转、AI 预审 worker、真实异步导出队列、企业认证和通知实时推送。

### 2026-05-29

- 类型：前后端实现 / 模板发布检查
- 关联文档：`docs/api/production.md`、`docs/design/pages/owner-template-designer.md`、`docs/planning/TODO.md`
- 内容：补齐模板搭建页面的发布检查闭环。后端新增 `GET /templates/{template_id}/readiness`，检查页签、可提交字段、字段 key 唯一性、组件类型、长度/正则/选项数量校验规则、联动规则依赖字段和 LLM Prompt/输出字段；`POST /templates/{template_id}/publish` 复用检查结果，存在阻塞项时返回 `42201` 和检查详情。前端模板列表页和 Designer 子页面的发布按钮改为先打开 Ant Design 发布检查 Modal，展示结构摘要、通过项、阻塞项和警告项，检查通过后才允许确认发布。
- 测试结果：`conda run -n markup-api python -m compileall apps/api/app`、`conda run -n markup-api python -m pytest apps/api/tests/test_auth_team_rbac.py`、`npm run typecheck`、`npm run lint`、`npm run test -- WorkspaceApp`、`npm run build`、`git diff --check` 通过；后端测试 12 passed，WorkspaceApp 18 passed。Vite build 仍有大 chunk 体积提示。
- 后续动作：模板搭建剩余缺口为版本对比、任务引用统计、联动规则可视化编辑和 Labeler 提交时的 schema 运行时校验。

### 2026-05-29

- 类型：前后端实现 / 模板版本与任务引用
- 关联文档：`docs/api/production.md`、`docs/design/pages/owner-template-designer.md`、`docs/planning/TODO.md`
- 内容：补齐模板版本历史中的结构统计、任务引用统计和版本对比能力。后端 `GET /templates/{template_id}/versions` 返回 `component_stats` 与 `reference_stats`，新增 `GET /templates/{template_id}/versions/diff` 返回新增/删除/修改组件、字段 key 变化、校验/联动变化和高风险变化；模板列表返回引用任务数和进行中任务数。修复模板发布后继续生成新草稿版本导致既有任务 readiness 误判失败的问题：任务创建和草稿任务切换模板时绑定最新已发布版本，任务发布检查优先按 `template_version_id` 读取已发布版本快照和 ShowItem 映射，不受模板当前草稿状态影响。前端模板版本抽屉展示版本结构、引用情况和“对比上一版”结果。
- 测试结果：`conda run -n markup-api python -m compileall apps/api/app`、`conda run -n markup-api python -m pytest apps/api/tests/test_auth_team_rbac.py`、`npm run typecheck`、`npm run lint`、`npm run test -- WorkspaceApp`、`npm run build` 通过；后端测试 12 passed，WorkspaceApp 18 passed。Vitest 仍有 jsdom `getComputedStyle` 伪元素提示，Vite build 仍有大 chunk 体积提示。
- 后续动作：模板搭建剩余缺口集中在联动规则可视化编辑、Labeler 运行时 schema 校验、Designer 与 Labeler Renderer 一致性专项验证。

### 2026-05-29

- 类型：前后端体验优化 / 任务题目导入
- 关联文档：`docs/api/production.md`、`docs/design/pages/owner-task-management.md`、`docs/planning/TODO.md`
- 内容：补齐任务管理页题目导入失败的行级反馈。后端题目导入新增专用解析包装，JSON / JSONL 格式错误会返回 `detail.row_errors`，每项包含 `row` 与 `error`，并能汇总多行“非对象行”和 JSON 解析错误；前端导入题目 Modal 捕获 `ApiClientError.detail.row_errors` 后在弹窗内展示“第 N 行：错误原因”，避免只给出笼统失败提示。
- 测试结果：`conda run -n markup-api python -m compileall apps/api/app`、`conda run -n markup-api python -m pytest apps/api/tests/test_auth_team_rbac.py`、`npm run test -- WorkspaceApp` 通过；后端测试 12 passed，WorkspaceApp 19 passed。Vitest 仍有 jsdom `getComputedStyle` 伪元素提示。
- 后续动作：继续推进模板运行时必填/长度/正则校验、Designer 与 Labeler Renderer 一致性验证、人工审核流转和 Labeler 工作台。

### 2026-05-29

- 类型：前端实现 / 企业管理跨页筛选
- 关联文档：`docs/design/pages/organization-management.md`、`docs/design/pages/team-member-management.md`
- 内容：补齐人员管理到操作日志页的审计联动。人员管理页接收工作台级 `onOpenLogs` 回调，顶部更多菜单可打开成员类操作日志并筛选 `entity_type=team_member`；成员详情抽屉新增“查看成员操作日志”入口，跳转操作日志页时携带 `entity_type=team_member` 与当前成员 `entity_id`。同时增强 `WorkspaceApp` 测试中的 fetch URL 断言，避免 `Request/URL/string` 参数差异导致误判。
- 测试结果：`npm run test -- WorkspaceApp` 通过，21 passed；`npm run typecheck`、`npm run lint`、`npm run build` 通过。Vitest 仍输出 jsdom 对 `getComputedStyle` pseudo-elements 的已知未实现提示；Vite build 仍有大 chunk 体积提示。
- 后续动作：企业管理后续仍需把内部状态跳转迁移到 URL 查询参数，并继续补企业认证、通知实时推送、异步审计导出和关联对象跳转。

### 2026-05-29

- 类型：前后端实现 / 企业信息认证闭环
- 关联文档：`docs/api/team-profile.md`、`docs/design/pages/organization-profile.md`、`docs/design/pages/organization-management.md`、`docs/architecture/SYSTEM_ARCHITECTURE.md`、`docs/planning/TODO.md`
- 内容：补齐企业信息页的企业认证最小闭环。后端 `Team` 模型新增 `verification_status`、主体名称、统一社会信用代码、认证联系人、联系电话、材料 URL、审核意见和提交时间字段；新增 `POST /teams/{team_id}/verification`，Team Admin / Owner 可提交或重新提交企业认证，状态进入 `pending_review`，并写入 `team_verification_submitted` 审计日志。前端企业信息页不再展示认证接口缺口，改为显示真实认证状态、主体字段、材料 URL 和最近提交时间，并通过 Ant Design Modal 提交认证信息。平台审核回写、撤回认证和材料文件上传仍作为后续能力保留。
- 测试结果：`conda run -n markup-api python -m pytest apps/api/tests/test_auth_team_rbac.py` 通过，12 passed；`conda run -n markup-api python -m compileall apps/api/app` 通过；`npm run test -- WorkspaceApp` 通过，21 passed；`npm run typecheck`、`npm run lint`、`npm run build`、`git diff --check` 通过。Vitest 仍输出 jsdom 对 `getComputedStyle` pseudo-elements 的已知未实现提示；Vite build 仍有大 chunk 体积提示。
- 后续动作：企业信息后续剩余缺口为平台审核回写接口、认证撤回、Logo/认证材料真实上传和认证材料预览。

### 2026-05-29

- 类型：前后端实现 / 人员管理邀请记录
- 关联文档：`docs/api/team-profile.md`、`docs/design/pages/team-member-management.md`、`docs/planning/TODO.md`
- 内容：补齐人员管理页更多菜单中的邀请记录能力。后端新增 `GET /teams/{team_id}/invitations`，支持按 `status=all|pending|accepted|rejected|expired` 查询当前企业邀请记录，返回邀请邮箱、企业角色、状态、邀请人、过期时间、响应时间和创建时间；过期状态由后端按 `expire_at` 展示层计算。前端 `PeopleManagementPage` 将“查看邀请记录”从 disabled 改为可用，点击后打开 Ant Design Drawer，用表格展示邀请记录。
- 测试结果：`conda run -n markup-api python -m pytest apps/api/tests/test_auth_team_rbac.py` 通过，12 passed；`conda run -n markup-api python -m compileall apps/api/app` 通过；`npm run test -- WorkspaceApp` 通过，21 passed；`npm run typecheck`、`npm run lint`、`npm run build`、`git diff --check` 通过。Vitest 仍输出 jsdom 对 `getComputedStyle` pseudo-elements 的已知未实现提示；Vite build 仍有大 chunk 体积提示。
- 后续动作：人员管理后续剩余缺口为邀请重发/撤销、批量导入成员、批量删除成员和成员任务转交。

### 2026-05-29

- 类型：前端实现 / 企业信息认证材料查看
- 关联文档：`docs/design/pages/organization-profile.md`、`docs/planning/PROGRESS_LOG.md`
- 内容：补齐企业信息页 `查看材料` 能力。前端在企业认证区根据后端 `verification_materials` URL 列表启用按钮，打开 Ant Design Drawer 展示材料序号、文件名、可复制 URL 和 `打开链接`；当前只展示真实 URL，不伪造材料预览、上传状态或审核结果。材料上传、鉴权下载链接、文件类型识别和内嵌预览仍待 `/uploads` / 文件服务接口补齐。
- 测试结果：`npm run test -- WorkspaceApp` 通过，24 passed；`npm run typecheck`、`npm run lint`、`npm run build`、`git diff --check` 通过。Vitest 仍输出 jsdom 对 `getComputedStyle` pseudo-elements 和 anchor navigation 的已知未实现提示；Vite build 仍有大 chunk 体积提示。
- 后续动作：企业信息后续剩余缺口为认证材料真实上传、鉴权预览/下载、平台审核回写和认证撤回。

### 2026-05-29

- 类型：前端实现 / 人员管理批量移除
- 关联文档：`docs/design/pages/team-member-management.md`、`docs/planning/TODO.md`
- 内容：补齐人员管理页表格批量选择和批量移除能力。前端 Ant Design Table 增加 `rowSelection`，当前用户和不可移除成员的选择框禁用；选中成员后显示批量操作提示，说明可移除数量和跳过数量；批量移除使用二次确认，并复用现有 `DELETE /teams/{team_id}/members/{user_id}` 逐项执行，完成后清空选中项并更新列表。
- 测试结果：`npm run test -- WorkspaceApp` 通过，21 passed；`npm run typecheck`、`npm run lint`、`npm run build`、`git diff --check` 通过。Vitest 仍输出 jsdom 对 `getComputedStyle` pseudo-elements 的已知未实现提示；Vite build 仍有大 chunk 体积提示。
- 后续动作：人员管理后续剩余缺口为邀请重发/撤销、批量导入成员、批量改角色、安全提醒和成员任务转交。

### 2026-05-29

- 类型：前后端实现 / 人员管理邀请治理
- 关联文档：`docs/api/team-profile.md`、`docs/design/pages/team-member-management.md`、`docs/planning/TODO.md`
- 内容：补齐人员管理邀请记录的重发和撤销能力。后端新增 `POST /teams/{team_id}/invitations/{invitation_id}/resend` 与 `POST /teams/{team_id}/invitations/{invitation_id}/revoke`，均校验企业作用域和 `member:invite` 权限；重发仅允许待接受或已过期邀请，重新生成邀请码和链接并写入 `invitation_resent` 审计日志；撤销将邀请状态置为 `revoked`，记录撤销人和撤销时间，并写入 `invitation_revoked` 审计日志。前端邀请记录 Drawer 增加行内 `重发` 和 `撤销` 操作，已接受、已拒绝和已撤销邀请只读展示。
- 测试结果：`conda run -n markup-api python -m pytest apps/api/tests/test_auth_team_rbac.py` 通过，12 passed；`conda run -n markup-api python -m compileall apps/api/app` 通过；`npm run test -- WorkspaceApp` 通过，22 passed；`npm run typecheck`、`npm run lint`、`npm run build` 通过。Vitest 仍输出 jsdom 对 `getComputedStyle` pseudo-elements 和 anchor navigation 的已知未实现提示；Vite build 仍有大 chunk 体积提示。
- 后续动作：人员管理后续剩余缺口为批量导入成员、批量改角色、安全提醒和成员任务转交。

### 2026-05-29

- 类型：前后端实现 / 人员管理审核任务转交
- 关联文档：`docs/api/team-profile.md`、`docs/design/pages/team-member-management.md`、`docs/planning/TODO.md`
- 内容：补齐人员管理页单成员审核任务分配转交。后端新增 `POST /teams/{team_id}/members/{user_id}/transfer-tasks`，按企业作用域和 `member:update` 权限校验，将源成员 `assigned_review_tasks` 中选中的任务 ID 转移到目标 active 成员并去重，跳过源成员未持有的任务 ID，写入 `member_tasks_transferred` 审计日志。前端人员管理行内更多菜单和成员详情 Drawer 增加 `转交审核任务`，通过 Ant Design Modal 选择目标成员、任务 ID 和转交原因，成功后更新源/目标成员并展示转交/跳过数量。当前仅转交审核任务分配，不修改任务负责人、任务状态或生产任务 ownership。
- 测试结果：`conda run -n markup-api python -m pytest apps/api/tests/test_auth_team_rbac.py` 通过，12 passed；`conda run -n markup-api python -m compileall apps/api/app` 通过；`npm run test -- WorkspaceApp` 通过，23 passed；`npm run typecheck`、`npm run lint`、`npm run build`、`git diff --check` 通过。Vitest 仍输出 jsdom 对 `getComputedStyle` pseudo-elements 和 anchor navigation 的已知未实现提示；Vite build 仍有大 chunk 体积提示。
- 后续动作：人员管理的任务负责人 ownership 转交应在任务管理页单独设计；人员管理后续可继续补成员导入结果明细、文件导入和更细粒度权限编辑。

### 2026-05-29

- 类型：前后端实现 / 人员管理批量角色变更
- 关联文档：`docs/api/team-profile.md`、`docs/design/pages/team-member-management.md`、`docs/planning/TODO.md`
- 内容：补齐人员管理页批量改角色能力。后端新增 `POST /teams/{team_id}/members/batch-role`，按企业作用域和 `member:update` 权限校验，请求体包含 `user_ids` 与目标 `team_role`；当前用户、非本企业成员和已是目标角色的成员会跳过，成功成员重置为目标角色默认权限，逐项写入 `member_role_batch_updated` 审计日志，并写入企业级 `member_role_batch_update_completed` 汇总日志。前端人员管理表格选择成员后在批量操作条展示 `批量改角色`，通过 Ant Design Modal 选择目标角色并提交，完成后更新表格成员、清空选择并展示更新/跳过数量。
- 测试结果：`conda run -n markup-api python -m pytest apps/api/tests/test_auth_team_rbac.py` 通过，12 passed；`conda run -n markup-api python -m compileall apps/api/app` 通过；`npm run test -- WorkspaceApp` 通过，22 passed；`npm run typecheck`、`npm run lint`、`npm run build` 通过。Vitest 仍输出 jsdom 对 `getComputedStyle` pseudo-elements 和 anchor navigation 的已知未实现提示；Vite build 仍有大 chunk 体积提示。
- 后续动作：人员管理后续剩余缺口为批量导入成员、安全提醒和成员任务转交。

### 2026-05-29

- 类型：前后端实现 / 统一上传接口与上传开关
- 关联文档：`docs/api/review-ai-export.md`、`docs/design/pages/organization-resource-config.md`、`docs/design/pages/organization-profile.md`、`docs/planning/TODO.md`
- 内容：补齐 `/uploads` 最小后端接口，并把资源配置页 `upload` 生产开关接入服务端约束。新增 `UploadedFile` 模型、上传 schema、上传服务和 `/api/v1/uploads` 路由；`POST /uploads` 使用 `multipart/form-data` 接收 `file` 和 `category`，单文件最大 10MB。早期最小实现曾以内联内容保存上传文件；当前已调整为文件系统/后续对象存储保存真实文件，MongoDB 只保存 `file_id/url/filename/content_type/category/size/storage/path` 元数据，`GET /uploads/{file_id}/download` 支持鉴权下载。上传成功写入 `file_uploaded` 审计日志；关闭 `upload` 开关时上传返回 `42201` 和 `detail.switch_key=upload`。MIME 深度校验、安全扫描、短期签名 URL 和前端认证材料真实上传仍待后续接入。
- 测试结果：`conda run -n markup-api python -m pytest apps/api/tests/test_auth_team_rbac.py` 通过，12 passed；`conda run -n markup-api python -m compileall apps/api/app`、`npm run typecheck`、`npm run test -- WorkspaceApp`、`npm run build`、`git diff --check` 通过。Vitest 仍输出 jsdom 对 `getComputedStyle` pseudo-elements 和 anchor navigation 的已知未实现提示；Vite build 仍有大 chunk 体积提示。
- 后续动作：继续把企业信息认证材料上传从 URL 文本切到 `/uploads`，并在 AI 预审入队和 Labeler LLM 辅助链路落地后接入 `ai_review`、`llm_assist` 两个生产开关。

### 2026-05-29

- 类型：前端实现 / 任务管理批量打标签
- 关联文档：`docs/design/pages/owner-task-management.md`、`docs/planning/PROGRESS_LOG.md`
- 内容：补齐任务管理列表批量打标签能力。`TaskManagementPage` 在批量操作条新增 `批量打标签`，通过 Modal 输入逗号分隔标签；提交后对选中任务逐项调用现有 `PUT /tasks/{task_id}`，采用“追加标签并去重”策略，不覆盖原有标签。该实现继续复用后端发布后字段限制，发布中、暂停和已结束任务仍只会更新允许的 `tags` 字段。
- 测试结果：新增 `WorkspaceApp` 专项测试覆盖批量追加标签，断言对选中任务逐项调用 `PUT /tasks/{task_id}`，请求体保留原有标签并追加去重后的新标签；`npm run test -- WorkspaceApp` 通过，31 passed；`npm run typecheck` 和 `git diff --check` 通过。Vitest 仍输出 jsdom 对 `getComputedStyle` pseudo-elements、anchor navigation 和 canvas getContext 的已知未实现提示。
- 后续动作：任务管理后续仍需任务负责人 ownership 转交、列表导出任务清单、URL 深链接和更完整的发布准备筛选。

### 2026-05-29

- 类型：前端实现 / 任务管理批量导出
- 关联文档：`docs/design/pages/owner-task-management.md`、`docs/planning/PROGRESS_LOG.md`
- 内容：补齐任务管理列表批量导出能力。`TaskManagementPage` 在批量操作条新增 `批量导出`，选中任务后打开 `批量创建导出任务` Modal，可配置导出格式、数据状态过滤和是否包含审核记录；仅对 `published`、`paused`、`finished` 任务逐项调用现有 `/exports` 创建导出任务，草稿任务跳过，并在结果提示中说明创建/跳过/失败数量。该实现复用现有导出任务模型，后续异步 worker 接入后前端交互保持不变。
- 测试结果：新增 `WorkspaceApp` 专项测试覆盖混选发布中、暂停和草稿任务后批量导出，仅对可导出任务创建导出任务并提示跳过草稿；`npm run test -- WorkspaceApp` 通过，30 passed；`npm run typecheck` 和 `git diff --check` 通过。完整专项中两个人员管理长交互用例因 Ant Design Drawer/Dropdown 动画偶发超过默认 10 秒，已只放宽这两个用例超时到 20 秒；Vitest 仍输出 jsdom 对 `getComputedStyle` pseudo-elements、anchor navigation 和 canvas getContext 的已知未实现提示。
- 后续动作：任务管理后续仍需任务负责人 ownership 转交、列表导出任务清单、URL 深链接和更完整的发布准备筛选。

### 2026-05-29

- 类型：前端实现 / 任务管理批量结束
- 关联文档：`docs/design/pages/owner-task-management.md`、`docs/planning/PROGRESS_LOG.md`
- 内容：补齐任务管理列表批量结束能力。`TaskManagementPage` 表格新增多选，选中任务后显示批量操作条，展示已选择数量、可结束数量和跳过数量；点击 `批量结束` 二次确认后仅对 `published`、`paused` 任务逐项调用现有 `/tasks/{task_id}/status` 的 `finish` 动作，草稿和已结束任务跳过，并在结果提示中说明成功/跳过/失败数量。该实现复用后端单任务状态机和审计写入，不绕过状态约束。
- 测试结果：新增 `WorkspaceApp` 专项测试覆盖选择发布中、暂停和草稿任务后批量结束，仅对可结束任务调用状态接口并提示跳过草稿；`npm run test -- WorkspaceApp` 通过，29 passed；`npm run typecheck` 和 `git diff --check` 通过。Vitest 仍输出 jsdom 对 `getComputedStyle` pseudo-elements、anchor navigation 和 canvas getContext 的已知未实现提示。
- 后续动作：任务管理后续仍需批量导出、批量打标签、任务负责人 ownership 转交、列表导出任务清单、URL 深链接和更完整的发布准备筛选。

### 2026-05-29

- 类型：前端实现 / 操作日志详情接口接入
- 关联文档：`docs/api/review-ai-export.md`、`docs/design/pages/organization-audit-logs.md`、`docs/planning/PROGRESS_LOG.md`
- 内容：补齐操作日志详情 Drawer 的真实详情加载。前端新增 `getAuditLog(teamId, logId)` service，点击 `查看详情` 时先用列表行快照打开 Drawer，再调用 `GET /audit-logs/{log_id}` 拉取完整日志，按详情返回刷新 `request_id`、字段 diff、请求上下文和摘要；详情加载失败时 Drawer 保持打开并展示错误，避免丢失列表上下文。
- 测试结果：`npm run test -- WorkspaceApp` 通过，28 passed；`npm run typecheck`、`conda run -n markup-api python -m compileall apps/api/app` 和 `git diff --check` 通过。Vitest 仍输出 jsdom 对 `getComputedStyle` pseudo-elements、anchor navigation 和 canvas getContext 的已知未实现提示。
- 后续动作：操作日志后续仍需保存筛选、大范围异步导出、进度查询、下载历史、关联对象名称冗余和更完整的关联对象跳转。

### 2026-05-29

- 类型：前端实现 / 操作日志 URL 深链接
- 关联文档：`docs/design/pages/organization-audit-logs.md`、`docs/planning/PROGRESS_LOG.md`
- 内容：补齐操作日志页 URL query 深链接。工作台支持 `/workspace?page=operation-logs&keyword=...&entity_type=...&entity_id=...&operator_id=...&risk_level=...&action=...&start_date=...&end_date=...` 直接进入操作日志并恢复筛选；从人员管理、企业信息、资源配置等页面跳转操作日志时会把来源筛选写入 URL。操作日志页查询、重置和清除来源筛选后会同步更新 URL，便于刷新和复制链接复盘。
- 测试结果：`npm run test -- WorkspaceApp` 通过，28 passed；`npm run typecheck` 和 `git diff --check` 通过。Vitest 仍输出 jsdom 对 `getComputedStyle` pseudo-elements、anchor navigation 和 canvas getContext 的已知未实现提示。实现期间曾因筛选回写循环导致 Vitest OOM，已通过限制回写边界修复：只有外层路由场景同步 URL，普通受控页面测试不触发父级重初始化。
- 后续动作：操作日志后续仍需保存筛选、大范围异步导出、进度查询、下载历史和关联对象名称冗余。

### 2026-05-29

- 类型：前端实现 / 操作日志时间范围筛选
- 关联文档：`docs/design/pages/organization-audit-logs.md`、`docs/planning/PROGRESS_LOG.md`
- 内容：补齐操作日志页时间范围筛选。`OperationLogsPage` 默认按最近 7 天查询审计日志，筛选工具条新增 Ant Design `DatePicker.RangePicker` 和最近 7/30/90 天快捷项；切换时间范围后列表请求会携带 `start_date`、`end_date`，当前筛选导出 CSV 时复用同一时间范围，重置筛选恢复最近 7 天。
- 测试结果：`npm run test -- WorkspaceApp` 通过，27 passed；`npm run typecheck` 和 `git diff --check` 通过。Vitest 仍输出 jsdom 对 `getComputedStyle` pseudo-elements 和 anchor navigation 的已知未实现提示。
- 后续动作：操作日志后续仍需保存筛选、大范围异步导出、进度查询、下载历史和关联对象名称冗余。

### 2026-05-29

- 类型：前后端实现 / 任务清单导出
- 关联文档：`docs/api/production.md`、`docs/design/pages/owner-task-management.md`、`docs/planning/TODO.md`
- 内容：补齐任务管理列表页 `导出任务清单` 能力。后端新增 `GET /tasks/export`，复用任务列表筛选参数并支持 `format=csv|json`，导出任务 ID、标题、状态、分类、难度、负责人、模板/数据集、题量、领取/提交/通过/打回统计、审核员、AI 开关、分发、奖励、截止时间、标签和创建/更新时间等元数据；该接口不导出提交答案、审核记录或正式标注结果。前端任务管理页标题区新增 `导出任务清单` 下拉按钮，支持导出当前筛选条件下的 CSV/JSON 文件并显示下载提示。
- 测试结果：新增后端任务清单导出测试和 `WorkspaceApp` 前端交互测试；`conda run -n markup-api python -m compileall apps/api/app` 通过；`conda run -n markup-api python -m pytest apps/api/tests/test_auth_team_rbac.py` 通过，12 passed；`npm run typecheck`、`npm run lint`、`npm run test -- WorkspaceApp` 通过，34 passed；`git diff --check` 通过。Vitest 仍输出 jsdom 对 `getComputedStyle` pseudo-elements、anchor navigation 和 canvas context 的已知未实现提示。
- 后续动作：后续可将导出清单扩展为包含 Owner/Reviewer 名称、模板/数据集名称和准备度检查结果，并支持日期范围筛选。

### 2026-05-29

- 类型：前后端实现 / 任务复制
- 关联文档：`docs/api/production.md`、`docs/design/pages/owner-task-management.md`、`docs/planning/TODO.md`
- 内容：补齐任务管理页 `复制任务` 能力。后端新增 `POST /tasks/{task_id}/copy`，按 `task:create` 和企业上下文校验，复制源任务基础信息、已绑定模板版本、数据集、列映射、审核员、AI、资质和题目内容快照，生成新的 `draft` 任务；副本不复制领取、提交、审核记录或导出历史，并写入 `task_copied` 审计日志。前端任务列表行级 `更多` 菜单新增 `复制任务`，成功后提示并直接打开副本修改子页面继续编辑。
- 测试结果：新增后端任务复制测试和 `WorkspaceApp` 前端交互测试；`conda run -n markup-api python -m compileall apps/api/app` 通过；`conda run -n markup-api python -m pytest apps/api/tests/test_auth_team_rbac.py` 通过，12 passed；`npm run typecheck`、`npm run lint`、`npm run test -- WorkspaceApp` 通过，33 passed；`git diff --check` 通过。Vitest 仍输出 jsdom 对 `getComputedStyle` pseudo-elements、anchor navigation 和 canvas context 的已知未实现提示。
- 后续动作：后续可补复制任务 Modal，允许在复制前改标题、选择是否复制题目快照、是否清空审核/AI 配置。

### 2026-05-29

- 类型：前后端实现 / 任务负责人转交
- 关联文档：`docs/api/production.md`、`docs/design/pages/owner-task-management.md`、`docs/planning/TODO.md`
- 内容：补齐任务管理页生产任务负责人 ownership 转交。后端新增 `POST /tasks/{task_id}/owner-transfer`，按 `task:manage` 和企业上下文校验，目标成员必须是当前企业 active 的 Team Admin 或 Owner；成功后更新任务 `owner_id`，不改变题目领取、审核员分配或任务状态，并写入 `task_owner_transferred` 审计日志。前端任务列表行级 `更多` 菜单新增 `转交负责人`，通过 Ant Design Modal 收集目标负责人用户 ID 和原因，提交成功后刷新任务列表。
- 测试结果：新增后端 RBAC 测试和 `WorkspaceApp` 前端交互测试；`conda run -n markup-api python -m pytest apps/api/tests/test_auth_team_rbac.py` 通过，12 passed；`conda run -n markup-api python -m compileall apps/api/app` 通过；`npm run test -- WorkspaceApp` 通过，32 passed；`npm run typecheck` 和 `git diff --check` 通过。Vitest 仍输出 jsdom 对 `getComputedStyle` pseudo-elements、anchor navigation 和 canvas context 的已知未实现提示。
- 后续动作：后续可将目标负责人输入升级为成员选择器，复用人员管理成员列表并展示角色、状态和可转交原因。

### 2026-05-29

- 类型：前后端实现 / 人工审核最小闭环
- 关联文档：`docs/api/review-ai-export.md`、`docs/product/REQUIREMENTS_AND_NOTES.md`、`docs/planning/TODO.md`
- 内容：新增 `/reviews` 后端模块，接入 `GET /reviews/queue`、`GET /reviews/submissions/{submission_id}` 和 `POST /reviews/submissions/{submission_id}`。队列默认只展示当前 Reviewer 分配范围内的 `submitted` 提交，Team Admin / Owner 可查看当前企业范围；单条审核支持 `approved/rejected/revise`，打回或要求修改必须填写原因，审核结果会更新 submission/question 状态和任务统计，并写入 `submission_reviewed` 审计日志。前端人工审核页从占位页升级为真实队列表格、摘要指标、详情 Drawer 和单条审核表单。
- 测试结果：`conda run -n markup-api python -m compileall apps/api/app`、`conda run -n markup-api python -m pytest apps/api/tests/test_auth_team_rbac.py`、`npm run typecheck`、`npm run lint`、`npm run test -- WorkspaceApp` 通过。后端 12 passed；WorkspaceApp 37 passed。Vitest 仍输出 jsdom 对 `getComputedStyle` pseudo-elements、anchor navigation 和 canvas getContext 的已知未实现提示；后端仍有既有 passlib/FastAPI/datetime deprecation warnings。
- 后续动作：继续补人工审核批量操作、审核历史、字段级 diff、AI 预审结果展示、打回后 Labeler 查看原因和重新提交。

### 2026-05-29

- 类型：前后端实现 / Labeler 贡献统计
- 关联文档：`docs/api/labeling.md`、`docs/product/REQUIREMENTS_AND_NOTES.md`、`docs/planning/TODO.md`
- 内容：补齐 `GET /labels/contributions`，返回当前标注员已领取题目、待处理题目、提交/通过/打回数量、历史通过率、已确认积分估算、待确认积分估算和最近提交列表。Labeler 工作台主页面用该接口替换原占位指标，展示待标注题目、已提交和预计积分；正式积分入账仍以后续审核通过后的积分流水为准。
- 测试结果：`conda run -n markup-api python -m compileall apps/api/app`、`conda run -n markup-api python -m pytest apps/api/tests/test_auth_team_rbac.py`、`npm run typecheck`、`npm run lint`、`npm run test -- WorkspaceApp` 通过。后端 12 passed；WorkspaceApp 36 passed。Vitest 仍输出 jsdom 对 `getComputedStyle` pseudo-elements、anchor navigation 和 canvas getContext 的已知未实现提示；后端仍有既有 passlib/FastAPI/datetime deprecation warnings。
- 后续动作：后续需在审核通过时真实写入积分流水，并补贡献中心明细、打回详情和重提入口。

### 2026-05-29

- 类型：前后端实现 / 领取前资质检查
- 关联文档：`docs/api/labeling.md`、`docs/product/REQUIREMENTS_AND_NOTES.md`、`docs/planning/TODO.md`
- 内容：补齐 `GET /labels/tasks/{task_id}/qualification-check`，返回 `eligible`、领域资质、已通过标注数量、历史通过率和失败检查项。`POST /labels/tasks/{task_id}/claim` 复用同一资质检查，不满足时返回 `42201` 并在 `detail` 中给出结构化原因。任务广场详情抽屉在登录态下自动调用检查接口，展示可领取或不满足原因，并在不满足时禁用接单主按钮。
- 测试结果：`conda run -n markup-api python -m compileall apps/api/app` 通过；`conda run -n markup-api python -m pytest apps/api/tests/test_auth_team_rbac.py` 通过，12 passed；`npm run typecheck` 通过；`npm run test -- TaskSquarePage` 通过，1 file / 2 tests passed。Vitest 仍输出 jsdom 对 `getComputedStyle` pseudo-elements 的已知未实现提示；后端仍有既有 passlib/FastAPI/datetime deprecation warnings。
- 后续动作：后续需把平台资质类型管理、资质过期提示、准确率口径和任务级自定义资质规则进一步细化；继续推进提交后的 AI 预审入队、Reviewer 队列、打回重提和贡献统计。

### 2026-05-29

- 类型：前端实现 / 任务广场到标注工作台链路
- 关联文档：`docs/api/labeling.md`、`docs/product/REQUIREMENTS_AND_NOTES.md`、`docs/planning/TODO.md`
- 内容：补齐任务广场领取成功后的真实入口。`TaskSquarePage` 在 `POST /labels/tasks/{task_id}/claim` 成功后关闭详情抽屉，并通过顶层路由进入 `/workspace?page=labeling&task_id={task_id}`；`WorkspaceApp` 解析 `task_id` 并传给 `LabelingPage`，标注工作台自动调用 `GET /labels/workbench/{task_id}`，同时继续保留最近一次任务 ID 兜底，避免用户复制或手输任务 ID 作为主路径。
- 测试结果：`npm run typecheck` 通过；`npm run test -- TaskSquarePage WorkspaceApp` 通过，2 files / 38 tests passed。Vitest 仍输出 jsdom 对 `getComputedStyle` pseudo-elements、anchor navigation 和 canvas getContext 的已知未实现提示。
- 后续动作：继续补领取前资质检查和不满足资质提示；提交后的 AI 预审入队、Reviewer 队列、打回重提和贡献统计仍待闭环。

### 2026-05-29

- 类型：前后端实现 / 资源配置生产开关约束
- 关联文档：`docs/api/review-ai-export.md`、`docs/design/pages/organization-resource-config.md`、`docs/planning/TODO.md`
- 内容：补齐资源配置页生产开关对核心业务链路的服务端约束。后端新增生产开关共享校验函数，`task_publish=false` 时 `POST /tasks/{task_id}/publish` 返回 `42201` 并携带 `detail.switch_key=task_publish`；`data_export=false` 时 `POST /exports` 返回 `42201` 并携带 `detail.switch_key=data_export`；`public_market=false` 时任务广场不展示该企业公开任务，公开领取接口返回 `42201` 并携带 `detail.switch_key=public_market`。测试覆盖关闭、拦截、重新开启后原流程继续可用。
- 测试结果：`conda run -n markup-api python -m pytest apps/api/tests/test_auth_team_rbac.py` 通过，12 passed；`conda run -n markup-api python -m compileall apps/api/app`、`npm run typecheck`、`npm run test -- WorkspaceApp`、`npm run build`、`git diff --check` 通过。Vitest 仍输出 jsdom 对 `getComputedStyle` pseudo-elements 和 anchor navigation 的已知未实现提示；Vite build 仍有大 chunk 体积提示。
- 后续动作：继续在 AI 预审入队、Labeler LLM 辅助和统一上传接口落地时接入 `ai_review`、`llm_assist`、`upload` 三个生产开关；前端业务页后续应把 `42201 + detail.switch_key` 展示为企业配置提示。

### 2026-05-29

- 类型：设计文档 / 企业管理四页细化
- 关联文档：`docs/design/pages/organization-management.md`、`docs/design/pages/organization-profile.md`、`docs/design/pages/organization-resource-config.md`、`docs/design/pages/organization-announcements.md`、`docs/design/pages/organization-audit-logs.md`
- 内容：根据交付文档第四章和企业管理讨论，补强企业信息、资源配置、公告通知和操作日志四页的页面设计。企业信息明确左侧资料表单 + 右侧治理栏结构、认证信息排版和最近变更入口；资源配置补充企业预算、Provider 作用域、模型额度场景和生产开关影响矩阵；公告通知补充分发对象构建器、接收人预览、人员管理结构复用和审核/导出自动提醒生成规则；操作日志补充跳转筛选默认值、详情 Drawer 分区、风险等级展示规则和跨页面审计事件覆盖矩阵。
- 测试结果：文档更新，无代码测试；已按 `ui-ux-pro-max -> hallmark -> Ant Design` 设计链路约束页面结构，避免四页同质化模板和伪造接口事实。
- 后续动作：根据这些设计继续实现或打磨企业信息、资源配置、公告通知和操作日志页面；仍需补 URL 深链接、企业级通知策略、WebSocket 实时推送、异步审计导出和更多企业认证后续接口。

### 2026-05-29

- 类型：前后端实现 / 人员管理安全提醒
- 关联文档：`docs/api/team-profile.md`、`docs/design/pages/team-member-management.md`、`docs/planning/TODO.md`
- 内容：补齐人员管理页 `发送安全提醒` 能力。后端新增 `POST /teams/{team_id}/members/security-reminders`，按企业作用域和 `member:update` 权限校验，请求体包含 `user_ids`、提醒标题和提醒内容；接口只向当前企业 active 成员发送站内提醒，跳过不存在、已禁用或不属于当前企业的用户，创建 `target_type=member` 的企业通知，并写入 `member_security_reminder_sent` 审计日志。前端人员管理表格支持多选后批量发送安全提醒，行内更多菜单支持单人成员安全提醒，Modal 可编辑提醒标题和正文，成功后展示发送/跳过数量。
- 测试结果：`conda run -n markup-api python -m pytest apps/api/tests/test_auth_team_rbac.py` 通过，12 passed；`conda run -n markup-api python -m compileall apps/api/app` 通过；`npm run test -- WorkspaceApp` 通过，22 passed；`npm run typecheck`、`npm run lint`、`npm run build`、`git diff --check` 通过。Vitest 仍输出 jsdom 对 `getComputedStyle` pseudo-elements 和 anchor navigation 的已知未实现提示；Vite build 仍有大 chunk 体积提示。
- 后续动作：人员管理后续剩余缺口为批量导入成员和成员任务转交；企业通知后续仍需邮件通道策略和系统/审核/导出自动提醒。

### 2026-05-29

- 类型：设计文档 / 企业管理使用场景补充
- 关联文档：`docs/design/pages/organization-management.md`、`docs/design/pages/organization-profile.md`、`docs/design/pages/organization-resource-config.md`、`docs/design/pages/organization-announcements.md`、`docs/design/pages/organization-audit-logs.md`
- 内容：根据企业管理四页讨论，进一步补充页面组设计优先级和四个独立页面的高频使用场景。企业信息强调“企业是谁、是否已认证、是否可继续生产”；资源配置强调预算、Provider、模型额度、资质和生产开关的前置检查；公告通知强调基于人员结构的分发预览和处理追踪；操作日志强调按 request_id、实体、操作人和时间范围进行追溯。
- 测试结果：文档更新，无代码测试。
- 后续动作：后续实现企业管理页面时优先按这些高频路径落地，再补深链接、WebSocket、异步审计导出和企业级通知策略。

### 2026-05-29

- 类型：前后端实现 / 人员管理批量导入
- 关联文档：`docs/api/team-profile.md`、`docs/design/pages/team-member-management.md`、`docs/planning/TODO.md`
- 内容：补齐人员管理页 `批量导入成员` 能力。后端新增 `POST /teams/{team_id}/members/import`，按企业作用域和 `member:create` 权限校验；请求体为结构化 rows，支持已有账号加入企业和新账号创建后加入企业，导入文本内重复邮箱、已在企业内成员、用户名冲突和新账号缺少密码会逐行跳过。成功项写入 `member_imported` 或 `member_account_imported`，并写入企业级 `member_batch_import_completed` 汇总审计日志。前端人员管理更多菜单新增批量导入 Modal，支持粘贴 CSV 文本并解析为结构化 JSON，成功后刷新成员表格并展示导入/跳过数量。
- 测试结果：`conda run -n markup-api python -m pytest apps/api/tests/test_auth_team_rbac.py` 通过，12 passed；`conda run -n markup-api python -m compileall apps/api/app` 通过；`npm run test -- WorkspaceApp` 通过，22 passed；`npm run typecheck`、`npm run lint`、`npm run build`、`git diff --check` 通过。Vitest 仍输出 jsdom 对 `getComputedStyle` pseudo-elements 和 anchor navigation 的已知未实现提示；Vite build 仍有大 chunk 体积提示。
- 后续动作：人员管理后续剩余缺口为成员任务转交；批量导入后续可接入文件上传、Excel 解析和导入结果明细 Drawer。

### 2026-05-29

- 类型：设计文档 / 企业管理四页细化
- 关联文档：`docs/design/pages/organization-management.md`、`docs/design/pages/organization-profile.md`、`docs/design/pages/organization-resource-config.md`、`docs/design/pages/organization-announcements.md`、`docs/design/pages/organization-audit-logs.md`
- 内容：根据企业管理讨论和交付文档第 4 章，继续细化企业信息、资源配置、公告通知和操作日志四页设计。企业信息同步认证材料上传最新边界，明确 `/uploads` 上传 + URL 兜底；资源配置补充资源对象和业务影响矩阵、概览交互、预算健康提示、Provider 缺失状态和模型场景额度；公告通知补充消息来源、企业人员结构分发、详情 Drawer 主操作、实时降级和通知设置边界；操作日志补充审计事实边界、高级筛选、diff 展示、大范围导出确认和跨页来源筛选 Tag。
- 测试结果：文档更新，无代码测试；已按 `ui-ux-pro-max -> hallmark -> Ant Design` 设计链路做结构约束，避免四页模板化和接口事实伪造。
- 后续动作：后续可按这些文档继续实现企业信息、资源配置、公告通知和操作日志页面；仍需补 URL 深链接、企业级通知策略、WebSocket 实时推送、异步审计导出、平台审核回写和认证撤回。

### 2026-05-29

- 类型：前端实现 / 工作台 Loading 状态统一
- 关联文档：`docs/design/FRONTEND_DESIGN_STYLE.md`、`docs/planning/TODO.md`
- 内容：将工作台可见的裸文本 loading 收敛到 Ant Design 组件体系。新增 `WorkspaceLoading` 作为页面级首屏加载组件；企业信息、人员管理、资源配置、公告通知、操作日志和 Owner 生产链路的企业信息加载统一使用该组件；日志详情、AI 预审详情、审核详情、题目加载和发布检查改为 Ant Design `Spin`，空选择态改为 `Empty`；面包屑动态尾部改为小号 `Spin`，标注工作台打开按钮改用 `Button loading`。修正页面级 Spin 的空内容容器，避免 Ant Design 嵌套 loading 产生割裂的灰色占位底。
- 测试结果：`npm.cmd run typecheck`、`npm.cmd run test -- src/app/App.test.tsx src/components/layout/AppShell.test.tsx --testTimeout=15000`、`npm.cmd run build` 和 `git diff --check` 通过。`npm.cmd run lint` 仍被既有 `LoginPage.tsx` 的 `react-hooks/set-state-in-effect` 规则阻断；`npm.cmd run test -- src/pages/workspace/WorkspaceApp.test.tsx --testTimeout=15000` 有 37 passed / 3 skipped / 1 failed，失败项为任务管理导出下拉测试未触发导出回调，未指向本轮 loading 改动。
- 后续动作：如后续引入 Skeleton，需要仅用于信息结构稳定且设计稿明确要求的首屏区域，不回退到裸文本 loading；另需单独处理 LoginPage lint 和任务导出 Dropdown 测试稳定性。

### 2026-05-29

- 类型：前端实现 / 企业信息 Logo 上传
- 关联文档：`docs/design/pages/organization-profile.md`、`docs/planning/PROGRESS_LOG.md`
- 内容：补齐企业信息页 Logo 上传交互。前端 `OrganizationProfilePage` 复用统一 `POST /uploads`，选择 Logo 图片后以 `category=image` 上传，上传成功自动把返回 URL 填入 `logo_url` 表单字段并标记表单为已修改；用户继续点击 `保存修改` 后通过现有 `PUT /teams/{team_id}` 写入企业资料。该流程保留 URL 手动编辑能力，上传失败不清空已填写表单。
- 测试结果：新增 `WorkspaceApp` 专项测试覆盖 Logo 上传、URL 自动填入和保存企业资料；`npm run test -- WorkspaceApp` 通过，25 passed；`npm run typecheck` 和 `git diff --check` 通过。Vitest 仍输出 jsdom 对 `getComputedStyle` pseudo-elements 和 anchor navigation 的已知未实现提示。
- 后续动作：Logo/认证材料后续仍需对象存储、MIME 深度校验、安全扫描、短期签名 URL 和内嵌预览；企业认证仍需平台审核回写和撤回认证。

### 2026-05-29

- 类型：前端实现 / 操作日志来源筛选
- 关联文档：`docs/design/pages/organization-audit-logs.md`、`docs/planning/PROGRESS_LOG.md`
- 内容：补齐操作日志页跨页面来源筛选的可见反馈和清除能力。`OperationLogsPage` 在接收到来自人员管理、企业信息或资源配置的初始筛选时，会在表格上方展示来源筛选 Tag，包括实体类型、实体 ID、操作人或动作；新增 `实体 ID`、`操作人 ID` 高级筛选输入；点击 `清除来源筛选` 会清空来源相关条件并重新查询普通日志列表。
- 测试结果：新增 `WorkspaceApp` 专项断言覆盖从人员管理进入操作日志后展示 `实体：成员`、`实体 ID：owner-1`，以及清除来源筛选后请求不再携带 `entity_type=team_member` / `entity_id=owner-1`；`npm run test -- WorkspaceApp` 通过，25 passed；`npm run typecheck` 和 `git diff --check` 通过。Vitest 仍输出 jsdom 对 `getComputedStyle` pseudo-elements 和 anchor navigation 的已知未实现提示。
- 后续动作：操作日志后续仍需 URL query 深链接、时间范围筛选、保存筛选、大范围异步导出和关联对象名称冗余。

### 2026-05-29

- 类型：前端实现 / Labeler 标注工作台真实接口接入
- 关联文档：`docs/planning/TODO.md`、`docs/api/labeling.md`
- 内容：将 `WorkspaceApp` 中的标注页面从样例 Renderer 升级为真实 Labeler 工作台。前端新增 `getLabelingWorkbench`、`getLabelingQuestion`、`saveLabelingDraft`、`submitLabelingQuestion` 服务方法和对应类型；页面支持输入已领取任务 ID 打开工作台、展示任务进度和题目队列、上一题/下一题/跳题、按后端返回的模板版本 schema 渲染 `TemplateRenderer`、恢复草稿、手动保存草稿、30 秒自动保存、提交答案并把 `42201 field_errors` 映射回字段错误。样式按工作台密度设计为左侧题目队列 + 右侧作答区，避免继续保留占位样例页。
- 测试结果：新增 `WorkspaceApp` 前端测试覆盖真实工作台加载、草稿恢复、手动保存、提交校验错误展示和修正后提交成功；`npm run typecheck`、`npm run lint`、`npm run test -- WorkspaceApp`、`npm run build`、`conda run -n markup-api python -m compileall apps/api/app`、`conda run -n markup-api python -m pytest apps/api/tests/test_auth_team_rbac.py`、`git diff --check` 通过。WorkspaceApp 35 passed，后端 RBAC/生产链路测试 12 passed。Vitest 仍输出 jsdom 对 `getComputedStyle` pseudo-elements、anchor navigation 和 canvas getContext 的已知未实现提示；Vite build 仍有大 chunk 体积提示。
- 后续动作：后续将任务广场领取结果直接导航到标注工作台；仍需资质检查、不满足资质提示、打回重提、贡献统计、AI 预审入队和 Reviewer 队列联动。

### 2026-05-29

- 类型：前端实现 / 登录页协议确认
- 关联文档：`docs/design/pages/auth-entry.md`、`docs/design/FRONTEND_DESIGN_STYLE.md`
- 内容：登录表单补齐与注册表单一致的协议确认勾选。用户登录前也需要显式勾选“我已阅读并同意用户协议与隐私政策”，协议正文继续通过现有 Ant Design Modal 打开，不改认证接口形状。
- 测试结果：补充登录态未勾选协议时的前端校验测试，并重新执行认证页专项测试与前端构建。
- 后续动作：如后续需要收紧合规留痕，可再评估是否记录协议版本与确认时间，但这不属于当前前端交互改动范围。

### 2026-05-29

- 类型：前后端实现 / OAuth provider 替换与图标入口
- 关联文档：`docs/api/auth.md`、`docs/operations/DEPLOYMENT.md`、`docs/design/FRONTEND_DESIGN_STYLE.md`、`docs/design/pages/auth-entry.md`、`docs/planning/TODO.md`
- 内容：移除飞书 OAuth provider，新增 Google 与 Hugging Face。后端 `oauth_service` 现支持 GitHub、Google、Hugging Face 三个 provider 的 start URL、ticket 兑换前置链路与用户信息抓取；前端认证页第三方登录入口由文字链接改为基于 Ant Design `Button + Tooltip` 的紧凑图标按钮，减少认证卡片占用空间并与当前弹层式登录页风格对齐。
- 测试结果：补充并替换前后端 OAuth start 测试，前端 `LoginPage` 测试改为断言 GitHub / Google / Hugging Face 图标入口。
- 后续动作：本地真实联调仍需在 `apps/api/.env` 配置 Google / Hugging Face 应用密钥，并确认第三方平台回调地址与后端一致。

### 2026-05-29

- 类型：后端实现 / Labeler 提交链路 schema 校验
- 关联文档：`docs/api/labeling.md`、`docs/api/production.md`、`docs/product/REQUIREMENTS_AND_NOTES.md`、`docs/planning/TODO.md`
- 内容：补齐 Labeler 工作台后端最小闭环。新增 `Submission` 模型和 `submissions` 索引，`GET /labels/workbench/{task_id}` 返回已领取任务的任务摘要、绑定模板版本 schema、题目列表、当前题目和进度；`GET /labels/questions/{question_id}` 返回单题详情和草稿；`PUT /labels/questions/{question_id}/draft` 持久化草稿；`POST /labels/questions/{question_id}/submit` 读取任务绑定的已发布模板版本并复用 `validate_template_answers` 做后端二次校验，失败返回 `42201 + field_errors`，通过后写入提交、更新题目状态和任务 `submitted` 统计，并写入提交审计日志。
- 测试结果：扩展 `test_owner_can_import_dataset_build_template_and_publish_multimodal_task`，覆盖独立 Labeler 领取任务、打开工作台、保存草稿、提交空答案触发字段级校验、提交合法答案后题目进入 `submitted` 且任务统计递增；`conda run -n markup-api python -m pytest apps/api/tests/test_auth_team_rbac.py` 通过，12 passed。仍有既有 passlib/FastAPI/datetime deprecation warnings。
- 后续动作：前端 Labeler 工作台仍需从样例 Renderer 切换为真实接口、接入 30 秒自动保存、题目导航和提交错误映射；提交后 AI 预审入队、Reviewer 队列、打回重提和贡献积分仍待补齐。

### 2026-05-29

- 类型：前端实现 / 公告通知批量处理
- 关联文档：`docs/design/pages/organization-announcements.md`、`docs/planning/PROGRESS_LOG.md`
- 内容：补齐公告通知页表格多选后的批量状态操作。前端 `AnnouncementsPage` 增加 `rowSelection`，选中通知后显示批量操作条，展示可标为已读和可设为已处理数量；批量标为已读、批量设为已处理复用现有 `POST /notifications/{notification_id}/state` 单条接口逐条更新，完成后刷新本地列表摘要并清理已处理选择。企业通知撤回和删除仍保留逐条确认，避免批量高风险误操作。
- 测试结果：新增 `WorkspaceApp` 专项测试覆盖选择两条审核/导出提醒、批量标为已读、再次选择后批量设为已处理；`npm run test -- WorkspaceApp` 通过，26 passed；`npm run typecheck` 和 `git diff --check` 通过。Vitest 仍输出 jsdom 对 `getComputedStyle` pseudo-elements 和 anchor navigation 的已知未实现提示。
- 后续动作：公告通知后续仍需系统公告、审核提醒、导出完成提醒的自动写入、WebSocket 实时推送、企业级通知策略和邮件通道策略。

### 2026-05-29

- 类型：前端实现 / 公告通知接收人预览约束
- 关联文档：`docs/design/pages/organization-announcements.md`、`docs/planning/PROGRESS_LOG.md`
- 内容：补齐企业通知发送前的接收人预览强约束。`AnnouncementsPage` 在提交新建企业通知时，如果当前分发条件尚未预览，会先调用 `GET /notifications/preview`；如果预览接收人数为 0，则阻止发送并保留 Modal 内容，提示用户调整分发对象。修改标题、正文或分发条件会清空旧预览，避免使用过期接收人结果误发。
- 测试结果：新增 `WorkspaceApp` 专项测试覆盖未手动点击预览时提交会先调用预览接口，且预览返回 0 人时不会调用 `POST /notifications` 发送；`npm run test -- WorkspaceApp` 通过，27 passed；`npm run typecheck` 和 `git diff --check` 通过。Vitest 仍输出 jsdom 对 `getComputedStyle` pseudo-elements 和 anchor navigation 的已知未实现提示。
- 后续动作：后续可把分发预览扩展为完整接收人 Drawer，展示不可接收成员和降级原因；仍需企业级通知策略、邮件通道策略和 WebSocket 推送。

### 2026-05-29

- 类型：设计文档 / 企业管理四页实现蓝图
- 关联文档：`docs/design/pages/organization-management.md`、`docs/design/pages/organization-profile.md`、`docs/design/pages/organization-resource-config.md`、`docs/design/pages/organization-announcements.md`、`docs/design/pages/organization-audit-logs.md`
- 内容：根据企业管理剩余四页讨论，进一步补充可直接指导前端实现的页面设计蓝图。页面组文档新增四页实现优先级和差异化结构；企业信息补充首屏两栏布局、资料保存、Logo 上传、认证提交、材料 Drawer 和敏感字段确认；资源配置补充五个 Tab 的主操作、生产开关表格、Provider 作用域和模型额度边界；公告通知补充首屏布局、新建企业通知完整分发预览、表格行为和通知设置边界；操作日志补充审计查询布局、来源筛选、详情 Drawer、脱敏和导出流程。
- 测试结果：文档更新，无代码测试；本轮按 `ui-ux-pro-max -> hallmark -> Ant Design` 设计链路约束页面，重点避免四页模板化、聊天化通知页、时间线化日志页和接口事实伪造。
- 后续动作：按文档继续对企业信息、资源配置、公告通知和操作日志页面做前端实现/打磨；后续仍需补企业级通知策略、WebSocket 推送、异步审计导出、平台审核回写、认证撤回和 AI/LLM 生产开关全链路约束。

### 2026-05-29

- 类型：前后端实现 / 模板条件显示联动
- 关联文档：`docs/api/production.md`、`docs/design/pages/owner-template-designer.md`、`docs/product/REQUIREMENTS_AND_NOTES.md`、`docs/planning/TODO.md`
- 内容：补齐模板 `linkage_rules` 条件显示的运行时支持。后端 `POST /templates/validate` 新增联动规则解释器，支持 `source_field/operator/value/target_component_id/action` 及兼容字段别名；被 `show` / `hide` 规则隐藏的组件不再参与必填、长度、正则、选项数量或 JSON 格式校验，并在 summary 返回 `hidden_component_count`。前端共享 `TemplateRenderer` 使用同一规则即时显示/隐藏目标组件，并过滤隐藏字段对应的错误提示，保证 Designer Renderer 预览和后续 Labeler 工作台可复用同一运行时行为。
- 测试结果：新增后端运行时校验断言和前端 `TemplateRenderer` 组件交互测试；`conda run -n markup-api python -m compileall apps/api/app`、`conda run -n markup-api python -m pytest apps/api/tests/test_auth_team_rbac.py`、`npm run typecheck`、`npm run lint`、`npm run test -- WorkspaceApp`、`npm run build`、`git diff --check` 通过。Vitest 仍输出 jsdom 对 `getComputedStyle` pseudo-elements、anchor navigation 和 canvas getContext 的已知未实现提示；Vite build 仍有大 chunk 体积提示。当前可视化联动规则编辑器、联动校验和 Labeler 正式提交链路复用仍为后续工作。
- 后续动作：继续补 Designer 属性面板中的联动规则编辑器、联动校验规则和 Labeler 提交链路后端二次校验复用。

### 2026-05-29

- 类型：前端实现 / Designer 联动规则配置
- 关联文档：`docs/api/production.md`、`docs/design/pages/owner-template-designer.md`、`docs/product/REQUIREMENTS_AND_NOTES.md`、`docs/planning/TODO.md`
- 内容：在模板 Designer 右侧属性面板新增基础条件显示配置。Owner 选中目标组件后可启用联动，选择触发字段、条件、匹配值和满足条件时显示/隐藏动作；配置保存到 schema 顶层 `linkage_rules`，可直接被已有 `TemplateRenderer` 和 `POST /templates/validate` 消费。删除组件时同步清理引用该组件的联动规则，避免保留悬空依赖。
- 测试结果：新增 `WorkspaceApp` Designer 交互断言，覆盖启用当前组件联动、写入 `source_field`、`target_component_id`、`operator`、`value` 和 `action`；`conda run -n markup-api python -m compileall apps/api/app`、`conda run -n markup-api python -m pytest apps/api/tests/test_auth_team_rbac.py`、`npm run typecheck`、`npm run lint`、`npm run test -- WorkspaceApp`、`npm run build`、`git diff --check` 通过。Vitest 仍输出 jsdom 对 `getComputedStyle` pseudo-elements、anchor navigation 和 canvas getContext 的已知未实现提示；Vite build 仍有大 chunk 体积提示。
- 后续动作：继续补多条件组合、跨页联动、联动校验和 Labeler 正式提交链路校验复用。

### 2026-05-29

- 类型：前端实现 / 认证页 OAuth callback 向导重构
- 关联文档：`docs/design/FRONTEND_DESIGN_STYLE.md`、`docs/design/pages/auth-entry.md`
- 内容：将 `/oauth/callback` 的账号关联视图从普通登录卡片重构为基于 Ant Design 的账号接入向导。OAuth callback 现在使用 `Steps`、`Card`、`Alert`、`Descriptions`、`Tag`、`Form` 企业“选择方式 -> 验证账号/创建账号 -> 进入工作台”流程，首屏改为两张 antd 决策卡，默认强调“绑定已有账号”；绑定已有账号、注册新账号和补绑邮箱三条分支都收敛为单层主卡片，不再使用嵌套灰底表单盒子。普通登录、注册、忘记密码链路和后端 OAuth API 形状保持不变。
- 测试结果：更新 `LoginPage.test.tsx` 的 OAuth callback 断言以匹配新文案和新向导结构；执行 `npm run typecheck`、`npm run test -- src/pages/auth/LoginPage.test.tsx`、`npm run build`、`git diff --check` 验证本轮改动。
- 后续动作：如后续继续优化 OAuth 首登体验，可再补 callback 页面在不同 provider、无可信邮箱和接口失败态下的视觉细节，但不应回退到普通认证 tab 心智。

### 2026-05-29

- 类型：前端实现 / OAuth callback 改为首页背景认证弹层
- 关联文档：`docs/design/FRONTEND_DESIGN_STYLE.md`、`docs/design/pages/auth-entry.md`
- 内容：将 `/oauth/callback` 从独立 OAuth 关联页改为“首页背景 + 认证弹层”承载。前端 `App.tsx` 新增 callback 容器路由，读取 `ticket/provider` 后保持 callback URL 不变，并自动打开与登录/注册同一套 `LoginPage` 覆盖窗口。`LoginPage` 新增显式 OAuth 上下文输入，OAuth 首登 UI 改为单卡弹层结构，使用 `Tabs` 在“绑定已有账号 / 注册新账号”之间切换；不再使用步骤流、选择卡、嵌套卡片和独立 callback 页面布局。无可信邮箱时继续在同一张认证卡片中完成补绑邮箱。
- 测试结果：更新 `App.test.tsx` 和 `LoginPage.test.tsx`，覆盖 callback 路由显示首页背景与认证弹层、关闭 OAuth 弹层后回到普通登录弹层、OAuth 双 Tab 结构、可信邮箱只读展示和无可信邮箱验证码输入；执行 `npm run typecheck`、`npm run test -- src/pages/auth/LoginPage.test.tsx`、`npm run test -- src/app/App.test.tsx`、`npm run build`、`git diff --check` 验证。
- 后续动作：若后续继续优化 OAuth 首登体验，可继续收紧弹层文案和密度，但应保持与普通认证弹层同一心智，不再回退到独立 callback 页面。

### 2026-05-29

- 类型：前后端偏差修正 / OAuth 关联体验收口
- 关联文档：`docs/api/auth.md`、`docs/product/REQUIREMENTS_AND_NOTES.md`、`docs/design/pages/auth-entry.md`
- 内容：去掉 OAuth 绑定已有账号时“第三方可信邮箱必须与当前账号邮箱一致”的限制，绑定链路现在只校验现有账号密码和第三方身份唯一性；前端 OAuth 弹层同步删除“建议优先绑定已有账号”提示，并给绑定/注册 Tab 的内容区增加稳定最小高度，减少模式切换时弹层跳高。第三方可信邮箱仅作为展示或注册默认值，不再作为绑定已有账号的阻断条件。
- 测试结果：补充后端 OAuth 邮箱不一致仍可绑定已有账号的测试，并重新执行前后端相关验证。
- 后续动作：如后续继续压缩 OAuth 弹层信息密度，应保持“同一主卡 + 稳定高度 + 不做邮箱一致性阻断”的基线。

### 2026-05-29

- 类型：后端偏差修正 / GitHub OAuth 账号切换
- 关联文档：`docs/api/auth.md`、`docs/operations/DEPLOYMENT.md`
- 内容：GitHub OAuth 启动入口增加 `prompt=select_account`，要求 GitHub 授权页先显示账号选择器，避免用户退出 MarkUp 后重新走 GitHub 登录时被浏览器直接带回上一次 GitHub 账号，无法切换第三方身份。
- 测试结果：补充 GitHub OAuth start 重定向断言，校验授权 URL 包含 `prompt=select_account`。
- 后续动作：如果后续发现特定浏览器插件、SSO 或 GitHub 自身会话策略仍跳过选择器，需要再评估是否补充“切换 GitHub 账号”帮助提示或显式登出说明。

### 2026-05-29

- 类型：前后端实现 / 个人账号维护
- 关联文档：`docs/api/auth.md`、`docs/api/team-profile.md`、`docs/design/FRONTEND_DESIGN_STYLE.md`、`docs/planning/TODO.md`
- 内容：按个人账号维护计划重做账号体验。顶栏登录后在头像左侧新增独立“工作台”按钮，pending 用户进入 onboarding；头像下拉改为身份信息卡，Labeler 展示个人资料、积分和资质摘要，企业用户加载默认企业和当前成员身份并按角色给出快捷入口。工作台账号管理页清空旧的管理员注册、企业信息和成员维护内容，重建为账号概览、基本资料、账号安全、第三方账号、通知偏好，企业关系信息通过概览摘要承载。后端扩展 `PUT /profile/me` 保存 `avatar`，新增撤销其他会话、OAuth 身份列表和解绑接口；个人头像上传复用 `/uploads` 的 `category=image` 无企业头窄口。
- 测试结果：`npm run typecheck` 通过。当前本地 shell 无 `conda`、`python` 或 `py` 可执行程序，后端 compileall/pytest 需在配置好 Python/conda 的环境中补跑。
- 后续动作：继续补前端交互测试、执行 lint/test/build 和后端 pytest；后续可扩展 MFA、设备列表逐条撤销和账号注销，但不属于本轮范围。

### 2026-05-29

- 类型：测试结果 / 个人账号维护
- 关联文档：`docs/planning/TODO.md`
- 内容：完成个人账号维护实现后的前端验证和通用检查。为重做后的账号中心补充个人资料保存专项测试，并更新 AppShell/App 导航测试适配顶栏独立“工作台”按钮。
- 测试结果：`npm run typecheck`、`npm run lint`、`npm run build`、`npm run test -- src/app/App.test.tsx src/components/layout/AppShell.test.tsx --testTimeout=15000`、`npm run test -- src/pages/workspace/WorkspaceApp.test.tsx -t saves personal profile --testTimeout=15000`、`git diff --check` 通过。`npm run test -- WorkspaceApp --testTimeout=15000` 在 5 分钟超时，输出未出现明确断言失败，主要为既有 jsdom `getComputedStyle`、canvas 和 navigation 未实现提示；当前环境无 `conda`、`python`、`py`，后端 pytest/compileall 未能执行。
- 后续动作：在可用 Python/conda 环境补跑 `conda run -n markup-api python -m pytest apps/api/tests/test_auth_team_rbac.py` 与 `conda run -n markup-api python -m compileall apps/api/app`；如需恢复旧账号页测试，应改为企业管理页面专项，而不是账号管理页。
### 2026-05-30

- 类型：开发运维修正 / 本地初始化脚本对齐系统 Agent 架构
- 关联文档：`docs/operations/DEPLOYMENT.md`
- 内容：修正 `apps/api/scripts/dev_seed_accounts.py`，移除过期的人类 `agent@test.local` 测试账号，改为只初始化 `admin / owner / reviewer / labeler` 四类人类账号，并通过现行企业初始化逻辑自动创建系统 `Agent`。同步更新部署文档中的本地测试账号表，明确系统 `Agent` 不再提供独立登录账号。
- 测试结果：已用本机 Python 执行 `scripts/dev_seed_accounts.py --reset`，成功重置当前本地 MongoDB `markup` 库并重建测试数据；输出企业 ID 为 `813bedff002b3f78a772ca84`。
- 后续动作：如后续继续调整企业创建或系统 Agent 语义，需同步维护该 seed 脚本，避免开发库初始化再次偏离现架构。

- 类型：前后端实现 / 系统 Agent 设置
- 关联文档：`docs/product/REQUIREMENTS_AND_NOTES.md`、`docs/api/team-profile.md`、`docs/design/pages/organization-resource-config.md`
- 内容：补齐系统 `Agent` 的配置闭环。后端新增 `GET/PUT /api/v1/teams/{team_id}/agent-settings`，新企业会自动创建系统 Agent，默认显示名为 `Agent`，缺省头像使用官方预设，并限制只有 `Team Admin` 可修改 `display_name` 与 `avatar`；修改行为写入 `system_agent_settings_updated` 审计日志。前端在资源配置页“积分管理”Tab 顶部新增 `Agent 设置` 卡片，支持官方预设头像、自定义上传与恢复默认，同时保持人员管理页对系统 Agent 只读。
- 测试结果：已补充前后端测试夹具与断言，待执行 `npm.cmd run typecheck`、`npm.cmd run test -- src/pages/workspace/WorkspaceApp.test.tsx --testTimeout=25000`、`conda run -n markup-api python -m pytest apps/api/tests/test_auth_team_rbac.py` 做定向验证。
- 后续动作：继续清理其余活跃文档和测试中遗留的旧称谓 `AI资源管理员`，并确认资源配置页的 Team Admin 权限判断是否需要进一步从企业成员关系精确推导。

- 类型：前后端实现 / 系统 Agent 型 AI资源管理员
- 关联文档：`docs/product/REQUIREMENTS_AND_NOTES.md`、`docs/api/team-profile.md`、`docs/architecture/SYSTEM_ARCHITECTURE.md`、`docs/design/pages/team-member-management.md`
- 内容：将 `AI资源管理员` 从人工成员角色收敛为企业内置系统 Agent。后端 `POST /teams` 现在会自动创建系统 Agent 成员，并为 `team_members` 增加 `is_system_member` 标记；成员 payload 会返回该标记并把系统 Agent 的 `actions.can_edit/can_remove/can_disable` 固定为 `false`。普通成员创建、邀请、编辑、删除、批量改角色链路不再接受人工 `agent`；批量导入中的 `agent` 行会逐行跳过，不影响其余行。前端人员管理页继续展示该角色，但新增“系统 Agent / 只读”提示，并禁止选择、编辑、提醒、转交和移除。
- 兼容修正：前后端现在都会把历史遗留的 `team_role=agent` 记录直接视为系统 Agent；即使旧数据暂未补齐 `is_system_member` 标记，也不会再暴露编辑、删除、批量操作或任务转交入口。历史旧数据改为人工清洗，不再在启动或接口读写时自动改库。

- 类型：后端收口 / 系统 Agent 历史数据改为人工清洗
- 关联文档：`docs/product/REQUIREMENTS_AND_NOTES.md`、`docs/api/team-profile.md`
- 内容：按最新约束移除系统 Agent 的运行时自动修正逻辑。后端不再在应用启动、读取 `agent-settings` 或更新 `agent-settings` 时自动补齐历史 `team_role=agent` 记录的 `is_system_member`、显示名、头像、权限或 `UserProfile`；现阶段仅对旧记录保留“按系统 Agent 只读兼容展示”的行为。若历史记录缺少系统 Agent 档案，`GET /teams/{team_id}/agent-settings` 会明确提示需先人工清洗历史数据，再进入设置页维护。
- 测试结果：新增后端回归测试，覆盖“成员列表只读兼容展示旧 agent 记录，但 `agent-settings` 不触发自动修正且返回人工清洗提示”；待具备 Python/conda 环境后补跑 `conda run -n markup-api python -m pytest apps/api/tests/test_auth_team_rbac.py`。
- 后续动作：与数据侧确认旧 `agent` 数据清洗脚本或人工处理流程；前端资源配置页在重新接入时需要消费该错误提示并给出明确引导。
- 测试结果：已同步更新前后端相关测试夹具与文档；待执行 `npm.cmd run typecheck`、`npm.cmd run test -- src/pages/workspace/WorkspaceApp.test.tsx --testTimeout=25000`、`conda run -n markup-api python -m pytest apps/api/tests/test_auth_team_rbac.py` 做定向验证。
- 后续动作：继续检查公告通知、企业图、AI 资源治理等其他引用 `agent` 角色的页面，确认它们沿用“可见但不可人工操作”的新语义。

- 类型：前后端实现 / 资源配置页纠偏为积分预算治理 + AI 资源
- 关联文档：`docs/design/pages/organization-resource-config.md`、`docs/product/REQUIREMENTS_AND_NOTES.md`、`docs/api/team-profile.md`、`docs/api/review-ai-export.md`、`docs/planning/TODO.md`
- 内容：资源配置页完成产品语义纠偏。前端将 `积分管理` 升级为企业积分预算治理入口，展示 `总积分预算 / 已承诺 / 已结算 / 剩余 / 使用率 / 预警状态`，新增积分充值 Drawer 和预警设置 Drawer；`AI 预算` 正式改为 `AI 资源`，仅保留 Token 消耗、成本估算、成本归因、Provider/模型状态与调用日志，不再暴露预算、充值、预警、申请或审批语义。后端新增 `/api/v1/teams/{team_id}/points-budget`、`/points-budget/recharge`、`/points-budget/alerts` 及 `TeamPointsBudget` 最小闭环模型与审计写入；历史 `/ai-resources/teams/{team_id}/budget*` 与 `/teams/{team_id}/budget/requests*` 接口保留为兼容能力，但不再作为当前前端活跃产品主路径。
- 测试结果：补充 `WorkspaceApp` 资源配置专项断言，删除旧 AI 预算断言并新增积分充值、积分预警、AI 资源观察断言；补充后端企业积分预算接口测试，覆盖概览、模拟充值、预警保存与审计日志。
- 后续动作：继续补齐企业积分预算冻结、扣减、冲正和自动阻断策略；评估历史 AI 预算兼容接口是否需要单独沉淀为后端运维能力或最终下线。

### 2026-05-30

- 类型：前后端实现 / 资源配置页二次收敛为企业积分钱包视角
- 关联文档：`docs/design/pages/organization-resource-config.md`、`docs/product/REQUIREMENTS_AND_NOTES.md`、`docs/api/team-profile.md`、`docs/architecture/SYSTEM_ARCHITECTURE.md`、`docs/planning/TODO.md`
- 内容：资源配置页继续从“积分预算治理”收敛为“企业积分钱包 + AI 资源”视角。前端删除标题栏下首行统计栏，积分管理改为 `单行钱包摘要 + 单行操作条 + 任务占用来源表`，不再保留大治理卡；四个核心字段改为真实钱包口径 `积分余额 / 预扣积分 / 花销统计 / 可用余额`。AI 资源首屏改为紧凑观察页，只保留指标条、操作条、说明和归因表，并把成本估算收进 Drawer。积分充值交互升级为微信、支付宝、对公转账三套模拟支付分支 UI，同时为万亿级数值录入与展示增加安全上限与紧凑格式显示。后端继续沿用 `/points-budget*` 路径，但返回与写入逻辑已经升级为企业钱包真口径；人工审核通过后会同步扣减企业钱包并累加 `spent_points_total`。
- 测试结果：`npm.cmd run typecheck` 通过；`npm.cmd run test -- src/pages/workspace/WorkspaceApp.test.tsx -t "renders updated resource configuration wallet and ai overview flows"` 通过。当前 Vitest 仍输出 jsdom 的 `getComputedStyle() with pseudo-elements` 提示，以及本页遗留的 antd 过时属性 warning，但未阻断专项测试。后端 pytest 本轮未执行。
- 后续动作：继续清理本页与其他页面中的 antd 过时属性 warning；在具备后端测试环境后补跑企业钱包与审核联动相关 pytest。
- 类型：前端实现 / ResourceConfigPage 页面清理
- 关联文档：`docs/design/pages/organization-resource-config.md`
- 内容：只针对 `apps/web/src/pages/workspace/ResourceConfigPage.tsx` 收敛页面交互。修复 `支付密码` 入口误隐藏问题，前端不再只依赖 `user.role === 'team_admin'`；积分区操作条移除 `查看任务`，将 `查看积分审计` 改为 `积分审计`；钱包流水表新增紧凑筛选条与 `导出流水` 下拉，支持按当前筛选结果导出 `CSV / Excel / JSON`；充值流程在金额录入和确认阶段都明确展示 `1 积分 = 1 元`；保持微信、支付宝、对公转账三种分支式模拟支付 UI，并继续沿用大数值安全输入与紧凑展示。
- 测试结果：`npm.cmd run typecheck` 通过；`npm.cmd run test -- src/pages/workspace/WorkspaceApp.test.tsx -t "renders updated resource configuration wallet and ai overview flows"` 通过。
- 后续动作：如后端后续补齐流水导出专用接口，可将当前前端本地导出切换为服务端按筛选条件导出，避免大数据量时一次性拉全量流水。
### 2026-05-31

- 类型：前后端实现 / 账号字段语义收口
- 关联文档：`docs/api/auth.md`、`docs/api/team-profile.md`、`docs/product/REQUIREMENTS_AND_NOTES.md`、`docs/architecture/SYSTEM_ARCHITECTURE.md`
- 内容：统一拆分 `username` 与 `display_name` 的职责。后端注册、OAuth 注册、管理员建成员和成员批量导入链路现在都要求显式提交 `display_name + username`，不再把登录账号当显示名自动回填；`auth/me`、`profile/me`、会话签发返回和成员列表补齐 `display_name`。前端登录注册页、企业账号中心、顶栏身份卡和成员管理展示统一优先使用 `display_name`，注册页与成员创建页文案同步改为“显示名 / 登录账号”。
- 测试结果：待执行前端 Vitest、后端 pytest 与 `git diff --check`；当前已知 `npm.cmd run typecheck` 仍会被仓库内既有问题 `apps/web/src/pages/workspace/ResourceConfigPage.tsx` 重复声明 `ledgerToolbarStyle` 阻塞，未在本次改动中处理。
- 后续动作：继续回归 `LoginPage`、`WorkspaceApp`、`test_auth_team_rbac.py` 相关测试，并在可用 Python 环境下补跑后端鉴权与成员管理用例。

- 类型：前后端实现 / 资源配置页积分钱包口径收口
- 关联文档：`docs/design/pages/organization-resource-config.md`、`docs/product/REQUIREMENTS_AND_NOTES.md`、`docs/planning/TODO.md`
- 内容：继续只围绕 `ResourceConfigPage` 与企业积分钱包规则收口。前端补齐 `支付密码` 入口可见性，避免再因只看全局角色而把入口误隐藏；积分提现 Drawer 新增钱包摘要，并在前端先按 `可提现余额 = 可用余额` 做校验。后端同步修正企业钱包口径：`预扣积分` 只按已发布任务计算，任务一经发布即开始预扣，不需要先被领取；提现校验改为扣除预扣后的可用余额，预扣中的积分不能提现。
- 测试结果：补充后端用例覆盖“只有已发布任务才预扣”和“提现不能使用预扣积分”；待执行 `npm.cmd run typecheck`、`npm.cmd run test -- src/pages/workspace/WorkspaceApp.test.tsx -t "renders updated resource configuration wallet and ai overview flows"` 与 `conda run -n markup-api python -m pytest apps/api/tests/test_auth_team_rbac.py` 做定向验证。
- 后续动作：如后续继续补齐任务发布前校验或冻结/冲正能力，需要保持 `预扣积分 / 可用余额 / 可提现余额` 三者始终共用同一口径，避免资源页再次出现展示正确但后端可绕过的偏差。

- 类型：前端实现 / 资源配置页流水导出修复
- 关联文档：`apps/web/src/pages/workspace/ResourceConfigPage.tsx`
- 内容：修复积分管理页 `导出流水 -> Excel` 实际导出为 HTML 伪装 `.xls` 的问题，现已改为通过 `xlsx` 生成真实 `.xlsx` 文件，并同步把下拉文案改为 `导出 XLSX`。
- 测试结果：`npm.cmd install`、`npm.cmd run typecheck`、`npm.cmd run test -- src/pages/workspace/WorkspaceApp.test.tsx -t "renders updated resource configuration wallet and ai overview flows"` 通过。
- 后续动作：如后续需要和后端导出中心统一，可再将钱包流水导出切换为服务端文件流输出，但前端下载格式应继续保持真实 `.xlsx`。

- 类型：前端实现 / 资源配置页流水导出依赖收口
- 关联文档：`apps/web/src/pages/workspace/ResourceConfigPage.tsx`
- 内容：移除前端对存在安全告警的 `xlsx` 包依赖，资源配置页流水导出改为使用 `exceljs` 生成真实 `.xlsx` 文件，继续保留 `CSV / XLSX / JSON` 三种导出能力；同时删除页面内临时手写的 OOXML/ZIP 拼装逻辑，避免后续维护双轨实现。
- 测试结果：待执行 `npm.cmd run typecheck` 与 `npm.cmd run test -- src/pages/workspace/WorkspaceApp.test.tsx -t "renders updated resource configuration wallet and ai overview flows"` 做最终确认。
- 后续动作：如后续需要进一步压缩前端包体，可评估将流水导出下沉到服务端导出中心，但当前前端仍保持真实 `.xlsx` 下载能力。
### 2026-05-31

- 类型：前端文案收口 / 业务页去业务逻辑解释
- 关联文档：`docs/design/FRONTEND_DESIGN_STYLE.md`
- 内容：按当前产品口径收口 `apps/web/src/pages` 下业务操作页文案，删除 onboarding、工作台、AI 预审、公告通知、任务发布、任务广场、资源配置等页面里“系统如何流转”“后续会接什么”“接口预留/占位/模拟阶段”这类解释型文案，统一改成必要的操作提示、结果反馈和直接说明；资料填写要求、上传限制、敏感信息提醒、审核风险和表单校验文案继续保留。
- 测试结果：待执行 `npm.cmd run typecheck` 与定向 `WorkspaceApp` / `OnboardingPage` 前端测试，确认文案收口后无断言回退。

- 类型：前端实现 / display_name 展示位收口
- 关联文档：`docs/product/REQUIREMENTS_AND_NOTES.md`
- 内容：继续清理前端里把 `username` 当主展示名的残留位置。`OnboardingPage`、公告通知指定成员选择器、成员管理主列表与详情、审核任务转交弹窗，以及部分工作台昵称展示位现在统一优先显示 `display_name`；`username` 仅保留在登录账号、副信息或详情字段中。
- 测试结果：待执行 `npm.cmd run typecheck` 与前端定向 Vitest 回归。
- 后续动作：继续扫查其余工作台页面中仍以 `username` 作为主可见文案的历史残留点，确认是否需要按同一规则继续收口。
- 类型：前后端实现 / 绝对邀请链接、认证续链与展示名语义对齐
- 关联文档：`docs/api/auth.md`、`docs/api/team-profile.md`、`docs/product/REQUIREMENTS_AND_NOTES.md`、`docs/architecture/SYSTEM_ARCHITECTURE.md`、`docs/operations/DEPLOYMENT.md`
- 内容：企业邀请码链路改为统一输出绝对 `invite_url`，后端通过 `FRONTEND_APP_URL` 生成 onboarding 深链接；前端新增认证返回目标存储与恢复逻辑，未登录用户打开邀请码链接后可先登录/注册/OAuth，再自动回到加入企业流程；`OnboardingPage` 支持公开引导态与基于查询参数直接进入 join 流程；人员管理页的邀请码生成、重发与复制统一归一化为绝对链接；本轮涉及的用户展示位继续按 `display_name -> username` 顺序消费，避免把登录账号当主展示名。
- 测试结果：`npm.cmd run typecheck` 通过；`npm.cmd run test -- src/app/App.test.tsx --testTimeout=30000` 通过；`npm.cmd run test -- src/pages/onboarding/OnboardingPage.test.tsx src/pages/auth/LoginPage.test.tsx --testTimeout=30000` 通过；`npm.cmd run test -- src/pages/workspace/WorkspaceApp.test.tsx -t "supports invite-code flow and hides 2FA from people management" --testTimeout=30000` 通过；`npm.cmd run test -- src/pages/workspace/WorkspaceApp.test.tsx -t "resends and revokes team invitations from people management" --testTimeout=30000` 通过；当前桌面环境缺少可执行 `python/conda`，未能补跑 `apps/api/tests/test_auth_team_rbac.py`。
### 2026-05-31

- 类型：前后端实现 / AI Provider 配置中心重构
- 关联文档：`docs/design/pages/organization-resource-config.md`、`docs/api/review-ai-export.md`、`docs/product/REQUIREMENTS_AND_NOTES.md`、`docs/planning/TODO.md`
- 内容：资源配置页 `AI Provider` 完成从“简单表格 + 简单 Drawer”到“单路由单模型配置中心”的收敛。前端改为左侧配置列表 + 右侧详情面板 + 宽 Drawer，支持新增、编辑、复制、启停、删除、测试连接；每条配置显式维护 `route_name / provider_kind / model_id / pricing(输入/输出/Cache 命中) / capabilities / runtime_config`，API Key 默认掩码，不回显历史明文，输入新值视为轮换。后端同步补齐 Provider CRUD、真实测试接口、费率驱动的成本估算与最近测试状态回写，并保留 `provider / default_model / models` 兼容字段供旧消费方平滑迁移。
- 测试结果：`npm.cmd run typecheck` 通过；`C:\Users\Archyix\AppData\Local\Programs\Python\Python312\python.exe -m py_compile app/api/v1/ai_resources.py app/services/resource_service.py app/schemas/resource.py app/models/resource.py app/core/security.py app/core/database.py app/domains/rbac.py` 通过；`npm.cmd run test -- src/pages/workspace/WorkspaceApp.test.tsx -t "renders updated resource configuration wallet and ai overview flows"` 通过。Vitest 运行时仍有既有 jsdom `getComputedStyle() with pseudo-elements` 提示和 antd 过时属性 warning，但未阻断本次专项用例。
- 后续动作：继续把 `OwnerProductionPages` 与其他 AI 资源消费方逐步从旧兼容字段迁移到 `route_name / provider_kind / model_id / capabilities / pricing`；后续可再清理资源页内 antd 的 `Drawer width`、`Alert message`、`Table pagination.position` 过时属性 warning。
- 类型：前后端实现 / AI Provider 专属接入字段与 Drawer 内检测
- 关联文档：`docs/design/pages/organization-resource-config.md`
- 内容：继续只围绕资源配置页收口 `AI Provider` 体验。`ResourceConfigPage.tsx` 里的新增/编辑 Drawer 不再只是统一的 `Base URL + API Key + 模型 ID`，而是会按 `provider_kind` 动态切换厂商专属字段；当前已覆盖 `OpenAI` 的 `Organization ID / Project ID`、`OpenAI Compatible` 的 `自定义请求头(JSON)`、`OpenRouter` 的 `站点地址 / 应用名称`、`Anthropic` 的 `Anthropic Version`、`Gemini` 的 `API Version`、`Azure OpenAI` 的 `Azure 资源名 / API Version`、`Ollama / LM Studio` 的 `Keep Alive / 上下文窗口`、`通义千问` 的 `Workspace ID`、`方舟` 的 `Region`。同时把检测动作前移到 Drawer，新增 `创建并检测 / 保存并检测`，让用户在新建页就能完成真实连通性检测。后端同步最小修正 `resource_service.py`，使 `runtime_config` 除了通用运行参数外，也会保留并回填这些专属字段。
- 测试结果：`npm.cmd run typecheck` 通过；`python -m py_compile app/services/resource_service.py` 通过。
- 后续动作：如后续需要让 `OpenAI Organization / Project`、`OpenRouter` 站点信息等字段真正参与测试请求头或正式调用链路，需要再扩展后端 Provider 适配器，而不只是停留在配置持久化与展示层。

- 类型：前端缺陷修复 / 顶栏个人信箱预览 effect 触发链路
- 关联文档：`docs/design/FRONTEND_DESIGN_STYLE.md`
- 内容：修复 `SiteNav.tsx` 登录态首次加载个人信箱预览时在 `useEffect` 内同步触发会更新 state 的请求函数，导致 React hooks lint 规则 `set-state-in-effect` 报错的问题。当前改为在 effect 中注册短延时任务后再加载预览，保留自动刷新未读角标的行为，同时避免同步级联渲染风险。
- 测试结果：`npm.cmd run typecheck` 通过；`.\\node_modules\\.bin\\eslint.cmd src/components/layout/SiteNav.tsx` 通过。全量 `npm.cmd run lint` 仍存在其他文件既有 lint 错误，后续按“每次只修一个 bug”继续处理。
- 后续动作：继续按 lint 输出顺序修复下一个独立前端缺陷。

- 类型：前端缺陷修复 / 注册显示名控制字符校验
- 关联文档：`docs/api/auth.md`、`docs/design/FRONTEND_DESIGN_STYLE.md`
- 内容：修复 `LoginPage.tsx` 显示名校验正则包含控制字符范围导致 ESLint `no-control-regex` 报错的问题。当前改为通过字符码遍历拒绝 `0x00-0x1F` 与 `0x7F`，保持“显示名不能包含控制字符”的产品校验语义不变。
- 测试结果：`npm.cmd run typecheck` 通过；`.\\node_modules\\.bin\\eslint.cmd src/pages/auth/LoginPage.tsx` 通过。全量 `npm.cmd run lint` 仍存在其他文件既有 lint 错误，后续继续逐个修复。
- 后续动作：继续按 lint 输出顺序处理 `OnboardingPage.tsx` 中的独立 lint 缺陷。

- 类型：前端缺陷修复 / Onboarding 未使用图标导入
- 关联文档：`docs/design/FRONTEND_DESIGN_STYLE.md`
- 内容：删除 `OnboardingPage.tsx` 中已经不再使用的 `ClipboardCheck` 图标导入，修复 `@typescript-eslint/no-unused-vars` 阻断 lint 的问题。本轮不改 onboarding 业务流程与页面展示。
- 测试结果：`npm.cmd run typecheck` 通过；`Select-String -Path apps/web/src/pages/onboarding/OnboardingPage.tsx -Pattern "ClipboardCheck"` 无匹配；`.\\node_modules\\.bin\\eslint.cmd src/pages/onboarding/OnboardingPage.tsx --rule "react-hooks/set-state-in-effect: off"` 通过，用于确认未使用导入问题已消除。同文件剩余 `set-state-in-effect` 错误后续单独修复。
- 后续动作：继续处理 `OnboardingPage.tsx` 的邀请码状态同步 effect。

- 类型：前端缺陷修复 / Onboarding 邀请码派生状态同步
- 关联文档：`docs/api/auth.md`、`docs/api/team-profile.md`
- 内容：修复 `OnboardingPage.tsx` 使用 `useEffect` 将 URL 中的 `invite_code` 同步写入本地 state，触发 React hooks `set-state-in-effect` lint 错误的问题。当前改为由“当前 URL 邀请码 + 用户编辑草稿”派生输入值，URL 变化仍能更新默认邀请码，用户手动编辑也不会丢失。
- 测试结果：`npm.cmd run typecheck` 通过；`.\\node_modules\\.bin\\eslint.cmd src/pages/onboarding/OnboardingPage.tsx` 现在仅剩下一处 `setPath('join-org')` 的既有 `set-state-in-effect` 错误，原 `setInviteCode(inviteCodeFromSearch)` 错误已消除。
- 后续动作：继续单独处理自动进入加入企业步骤的 `setPath` effect。

- 类型：前端缺陷修复 / Onboarding 邀请码入口自动跳转 effect
- 关联文档：`docs/api/auth.md`、`docs/api/team-profile.md`
- 内容：修复 `OnboardingPage.tsx` 在登录后检测到 `organization_action=join + invite_code` 时，于 `useEffect` 内同步 `setPath('join-org')` 触发 React hooks `set-state-in-effect` lint 错误的问题。当前改为注册短延时任务后进入加入企业表单，继续保留邀请码续链自动进入 join 流程的行为。
- 测试结果：`.\\node_modules\\.bin\\eslint.cmd src/pages/onboarding/OnboardingPage.tsx` 通过；`npm.cmd run typecheck` 通过；`npm.cmd run test -- src/pages/onboarding/OnboardingPage.test.tsx --testTimeout=30000` 通过，结果为 1 个测试文件、5 passed。
- 后续动作：继续回到全量 lint 输出处理下一个独立缺陷。

- 类型：前端缺陷修复 / 企业资料受保护素材 URL 派生
- 关联文档：`docs/design/pages/organization-profile.md`
- 内容：修复 `OrganizationProfilePage.tsx` 中 `useProtectedAssetUrl` 在 `useEffect` 内同步清空或写入 `resolvedUrl`，触发 React hooks `set-state-in-effect` lint 错误的问题。当前将空 URL、外链和 `data:` URL 改为直接派生返回，仅对需要企业鉴权的素材执行异步拉取并按来源缓存结果，避免 URL 切换时短暂显示旧 blob URL。
- 测试结果：`npm.cmd run typecheck` 通过；`npm.cmd run test -- src/pages/workspace/WorkspaceApp.test.tsx -t "organization profile" --testTimeout=30000` 通过，结果为 1 个测试文件、2 passed、51 skipped；`.\\node_modules\\.bin\\eslint.cmd src/pages/workspace/OrganizationProfilePage.tsx` 现在仅剩 `renderReadonlyCard` 未使用错误，原 `setResolvedUrl` effect 错误已消除。
- 后续动作：继续单独清理 `OrganizationProfilePage.tsx` 的未使用只读卡片函数。

- 类型：前端缺陷修复 / 企业资料页未使用只读卡片函数
- 关联文档：`docs/design/pages/organization-profile.md`
- 内容：删除 `OrganizationProfilePage.tsx` 中已无引用的 `renderReadonlyCard` 函数，修复 `@typescript-eslint/no-unused-vars` lint 错误。本轮不改变企业资料页渲染结构。
- 测试结果：`.\\node_modules\\.bin\\eslint.cmd src/pages/workspace/OrganizationProfilePage.tsx` 通过；`npm.cmd run typecheck` 通过；`npm.cmd run test -- src/pages/workspace/WorkspaceApp.test.tsx -t "organization profile" --testTimeout=30000` 通过，结果为 1 个测试文件、2 passed、51 skipped。
- 后续动作：继续处理个人信箱页 effect 加载链路。

- 类型：前端缺陷修复 / 个人信箱首次加载 effect
- 关联文档：`docs/design/FRONTEND_DESIGN_STYLE.md`、`docs/api/review-ai-export.md`
- 内容：修复 `PersonalInboxPage.tsx` 首次进入页面时在 `useEffect` 内同步调用 `loadInbox('all')`，触发 React hooks `set-state-in-effect` lint 错误的问题。当前改为注册短延时任务后加载个人信箱，保留进入页面自动加载通知的行为。
- 测试结果：`.\\node_modules\\.bin\\eslint.cmd src/pages/workspace/PersonalInboxPage.tsx` 无错误，仅保留既有 Fast Refresh 导出警告；`npm.cmd run typecheck` 通过；`npm.cmd run test -- src/pages/workspace/WorkspaceApp.test.tsx -t "hidden personal inbox" --testTimeout=30000` 通过，结果为 1 个测试文件、1 passed、52 skipped。
- 后续动作：继续处理资源配置页未使用参数与 effect 问题。

- 类型：前端缺陷修复 / 资源配置页未使用任务入口 prop
- 关联文档：`docs/design/pages/organization-resource-config.md`
- 内容：修复 `ResourceConfigPage.tsx` 将 `onOpenTasks` 解构为 `_onOpenTasks` 后未使用，触发 `@typescript-eslint/no-unused-vars` 的问题。当前保留 `onOpenTasks` prop 类型兼容，但不再从参数中解构未使用值。
- 测试结果：`npm.cmd run typecheck` 通过；`npm.cmd run test -- src/pages/workspace/WorkspaceApp.test.tsx -t "resource configuration" --testTimeout=30000` 通过，结果为 1 个测试文件、2 passed、51 skipped；`.\\node_modules\\.bin\\eslint.cmd src/pages/workspace/ResourceConfigPage.tsx` 不再报告 `_onOpenTasks`，仍剩后续独立 lint 问题。
- 后续动作：继续处理 `canManageWalletSecurity` 未使用问题。

- 类型：前端缺陷修复 / 积分预警阈值输入稳定性
- 关联文档：`docs/design/pages/organization-resource-config.md`
- 内容：验证资源配置页时发现积分预警 Drawer 在预警关闭状态下仍预填历史阈值，用户清空后输入新值时可能提交不完整数字。本轮改为仅在预警已开启时回填历史阈值，关闭状态下启用预警需要用户明确输入本次最低可用余额；同时用 Ant Design `Form.Item normalize` 统一清洗阈值输入为整数串。
- 测试结果：`npm.cmd run typecheck` 通过；`npm.cmd run test -- src/pages/workspace/WorkspaceApp.test.tsx -t "resource configuration" --testTimeout=30000` 通过，结果为 1 个测试文件、2 passed、51 skipped。
- 后续动作：继续回到 lint 队列处理资源配置页剩余未使用变量和 effect 问题。

- 类型：前端缺陷修复 / 积分预警阈值输入提交中间态
- 关联文档：`docs/design/pages/organization-resource-config.md`
- 内容：复跑资源配置专项测试时发现积分预警阈值仍可能在快速输入后提交中间态，例如用户输入 `75` 时提交 `7`。本轮将预警阈值输入从 Form store 中解耦，使用非受控 Ant Design `Input` 记录最后输入意图，并在提交瞬间优先读取真实输入框 DOM 值后再做整数校验，避免中间态缓存进入请求体。
- 测试结果：`npm.cmd run typecheck` 通过；`npm.cmd run test -- src/pages/workspace/WorkspaceApp.test.tsx -t "renders updated resource configuration wallet and ai overview flows" --testTimeout=30000` 连续 2 次通过；`npm.cmd run test -- src/pages/workspace/WorkspaceApp.test.tsx -t "resource configuration" --testTimeout=30000` 通过，结果为 1 个测试文件、2 passed、51 skipped；`git diff --check` 通过。
- 后续动作：继续回到 lint 队列，单独处理 `canManageWalletSecurity` 未使用问题和 Provider 选中态 effect 问题。

- 类型：前端缺陷修复 / 资源配置页未使用钱包安全权限变量
- 关联文档：`docs/design/pages/organization-resource-config.md`
- 内容：删除 `ResourceConfigPage.tsx` 中已无引用的 `canManageWalletSecurity` 派生变量，修复 `@typescript-eslint/no-unused-vars` lint 错误。本轮不改变资源配置页的权限判断、钱包安全入口或页面渲染行为。
- 测试结果：`.\\node_modules\\.bin\\eslint.cmd src/pages/workspace/ResourceConfigPage.tsx --rule "react-hooks/set-state-in-effect: off" --rule "react-hooks/exhaustive-deps: off"` 通过；`npm.cmd run typecheck` 通过；`npm.cmd run test -- src/pages/workspace/WorkspaceApp.test.tsx -t "resource configuration" --testTimeout=30000` 通过，结果为 1 个测试文件、2 passed、51 skipped；`git diff --check` 通过。为确认上一轮积分预警阈值输入稳定性，`npm.cmd run test -- src/pages/workspace/WorkspaceApp.test.tsx -t "renders updated resource configuration wallet and ai overview flows" --testTimeout=30000` 额外连续 2 次通过。
- 后续动作：继续单独处理 `ResourceConfigPage.tsx` 中 Provider 选中态 effect 的 hooks lint 问题。

- 类型：前端缺陷修复 / 资源配置页 Provider 选中态派生
- 关联文档：`docs/design/pages/organization-resource-config.md`
- 内容：修复 `ResourceConfigPage.tsx` 中根据 Provider 列表同步 `setSelectedProviderId` 的 effect，避免触发 React hooks `set-state-in-effect` lint 错误。当前改为在渲染期派生有效 Provider ID：已有选中项仍优先展示，选中项缺失时临时回退到列表首项，列表为空时自然无选中详情。
- 测试结果：`.\\node_modules\\.bin\\eslint.cmd src/pages/workspace/ResourceConfigPage.tsx` 已不再报告 `set-state-in-effect` error，仅剩 `loadCurrentTab` 依赖 warning；`npm.cmd run typecheck` 通过；`npm.cmd run test -- src/pages/workspace/WorkspaceApp.test.tsx -t "resource configuration" --testTimeout=30000` 通过，结果为 1 个测试文件、2 passed、51 skipped；`git diff --check` 通过。
- 后续动作：继续单独处理 `ResourceConfigPage.tsx` 中 `loadCurrentTab` 的 hooks dependency warning。

- 类型：前端缺陷修复 / 积分预警阈值快速保存稳定性
- 关联文档：`docs/design/pages/organization-resource-config.md`
- 内容：继续修复积分预警 Drawer 在快速输入并立即保存时可能提交第一位数字的问题。阈值输入改为受控草稿值，`onChange` 同步更新草稿与提交 ref；提交前在启用预警场景等待输入事件队列完成一个 tick，再读取 ref/state/DOM 值做整数校验。资源配置专项测试同步在保存前等待输入框可见值稳定为 `75`，避免测试在输入控件尚未完成第二次键入时抢先点击保存。
- 测试结果：`.\\node_modules\\.bin\\eslint.cmd src/pages/workspace/ResourceConfigPage.tsx --rule "react-hooks/exhaustive-deps: off"` 通过；`npm.cmd run typecheck` 通过；`npm.cmd run test -- src/pages/workspace/WorkspaceApp.test.tsx -t "renders updated resource configuration wallet and ai overview flows" --testTimeout=30000` 通过；`npm.cmd run test -- src/pages/workspace/WorkspaceApp.test.tsx -t "resource configuration" --testTimeout=30000` 通过，结果为 1 个测试文件、2 passed、51 skipped；`git diff --check` 通过。
- 后续动作：继续单独处理 `ResourceConfigPage.tsx` 中 `loadCurrentTab` 的 hooks dependency warning。

- 类型：前端缺陷修复 / 资源配置页初始化加载依赖收口
- 关联文档：`docs/design/pages/organization-resource-config.md`
- 内容：修复 `ResourceConfigPage.tsx` 首次加载 effect 缺少 `loadCurrentTab` 依赖的 hooks warning。当前将共享数据、积分、调用日志和当前 Tab 加载函数收敛为 `useCallback`，并让 `loadCurrentTab` 显式接收目标企业，避免 effect 依赖当前 `team` 状态造成重复初始化；刷新按钮与 Tab 切换在已有企业上下文时再触发加载。
- 测试结果：`.\\node_modules\\.bin\\eslint.cmd src/pages/workspace/ResourceConfigPage.tsx` 通过；`npm.cmd run typecheck` 通过；`npm.cmd run test -- src/pages/workspace/WorkspaceApp.test.tsx -t "resource configuration" --testTimeout=30000` 通过，结果为 1 个测试文件、2 passed、51 skipped；`git diff --check` 通过。
- 后续动作：继续回到全量 lint 队列，处理下一个独立前端缺陷。

- 类型：前端缺陷修复 / WorkspaceApp 测试未使用邀请 payload
- 关联文档：`docs/design/FRONTEND_DESIGN_STYLE.md`
- 内容：删除 `WorkspaceApp.test.tsx` 企业账号中心用例 mock 中已无引用的 `generatedInvitationPayload` 局部变量，修复 `@typescript-eslint/no-unused-vars` lint 错误。本轮不改变测试覆盖语义或页面行为。
- 测试结果：`.\\node_modules\\.bin\\eslint.cmd src/pages/workspace/WorkspaceApp.test.tsx` 通过；`npm.cmd run typecheck` 通过；`npm.cmd run test -- src/pages/workspace/WorkspaceApp.test.tsx -t "enterprise personal account center" --testTimeout=30000` 通过，结果为 1 个测试文件、1 passed、52 skipped；`git diff --check` 通过。
- 后续动作：继续处理 `WorkspaceApp.tsx` 中未使用导入与占位组件问题。

- 类型：前端缺陷修复 / WorkspaceApp 未使用组件符号
- 关联文档：`docs/design/FRONTEND_DESIGN_STYLE.md`
- 内容：删除 `WorkspaceApp.tsx` 中已无引用的 Ant Design `Select` 导入和旧的 `WorkspacePlaceholderPage` 占位组件，修复 `@typescript-eslint/no-unused-vars` lint 错误。本轮不改变工作台路由分发或页面渲染行为。
- 测试结果：`.\\node_modules\\.bin\\eslint.cmd src/pages/workspace/WorkspaceApp.tsx` 已不再报告未使用符号 error，仅剩 `questionItems` 依赖 warning；`npm.cmd run typecheck` 通过；`npm.cmd run test -- src/pages/workspace/WorkspaceApp.test.tsx -t "enterprise personal account center" --testTimeout=30000` 通过，结果为 1 个测试文件、1 passed、52 skipped；`git diff --check` 通过。
- 后续动作：继续单独处理 `WorkspaceApp.tsx` 中 `questionItems` 的 hooks dependency warning。

- 类型：前端缺陷修复 / apiClient 认证请求扩展字段剥离
- 关联文档：`docs/api/auth.md`
- 内容：修复 `apiClient.ts` 中 `stripAuthenticatedRequestInit` 为剥离认证扩展字段而解构出未使用局部变量，触发 `@typescript-eslint/no-unused-vars` 的问题。当前改为复制请求初始化对象后显式删除 `rebuildAfterRefresh / invalidateOnAuthFailure / invalidateOnRefreshFailure`，保留原有请求重试和会话失效语义。
- 测试结果：`.\\node_modules\\.bin\\eslint.cmd src/services/apiClient.ts` 通过；`npm.cmd run typecheck` 通过；`npm.cmd run test -- src/services/apiClient.test.ts --testTimeout=30000` 通过，结果为 1 个测试文件、9 passed；`git diff --check` 通过。
- 后续动作：继续处理 `WorkspaceApp.tsx` 中 `questionItems` 的 hooks dependency warning。

### 2026-05-31

- 类型：后端缺陷修复 / OAuth 已绑定账号停用状态绕过
- 关联文档：`docs/api/auth.md`、`docs/architecture/SYSTEM_ARCHITECTURE.md`
- 内容：认证安全边界巡检发现，普通密码登录会拒绝 `status != active` 的账号，但已绑定 OAuth 身份的 `/auth/oauth/exchange` 换票路径在签发 `LoginPayload` 前只检查用户是否存在，停用账号仍可能创建新的 refresh session。当前已在 OAuth exchange 已绑定账号分支补齐 `status=active` 与 `email_verified=true` 校验，失败时返回 `40101`，并同步 API 文档说明。
- 测试结果：已先用 `python -m pytest apps/api/tests/test_auth_team_rbac.py -k "oauth_exchange_rejects_inactive_linked_user"` 复现红测，修复后该定向用例通过；`python -m pytest apps/api/tests/test_config_security.py` 通过，8 passed；`python -m pytest apps/api/tests/test_auth_team_rbac.py` 通过，51 passed；`python -m compileall apps/api/app` 通过；`git diff --check` 通过，仅输出 CRLF 工作区提示。
- 后续动作：下一轮继续从企业作用域与权限方向巡检，优先关注路径 `team_id` 与 `X-Team-ID` 一致性及 Reviewer/Agent 边界。

### 2026-05-31

- 类型：后端缺陷修复 / AI Provider 写入口企业作用域
- 关联文档：`docs/api/review-ai-export.md`、`docs/architecture/SYSTEM_ARCHITECTURE.md`
- 内容：企业作用域与权限巡检发现，`/api/v1/ai-resources/configs/{provider_id}` 系列写入口只校验调用者在当前 `X-Team-ID` 下有 `ai_provider:manage`，但没有校验目标 Provider 是否属于该企业；知道其他企业 Provider ID 时可跨企业切换状态、更新、复制、删除或触发测试。当前在 AI Resources 路由层补齐 Provider 所属企业校验，并让列表/调用日志在缺少 `team_id` 时只回落到当前 `X-Team-ID`，平台全量视图保留给 `platform:manage`。
- 测试结果：已先用 `python -m pytest apps/api/tests/test_auth_team_rbac.py -k "ai_provider_status_update_rejects_cross_team_provider"` 复现红测，修复后该定向用例通过；`python -m pytest apps/api/tests/test_config_security.py` 通过，8 passed；`python -m pytest apps/api/tests/test_auth_team_rbac.py` 通过，52 passed；`python -m compileall apps/api/app` 通过；`git diff --check` 通过，仅输出 CRLF 工作区提示。
- 后续动作：下一轮继续生产链路巡检，优先看任务发布状态机、发布后字段限制和题目导入/导出。

### 2026-05-31

- 类型：后端缺陷修复 / AI 预审企业作用域
- 关联文档：`docs/api/review-ai-export.md`
- 内容：企业作用域与权限巡检发现，`/api/v1/ai-reviews/tasks` 在请求缺少 `X-Team-ID` 时会回退使用全局 reviewer 的 `submission:view` 权限，导致 reviewer 可能枚举非当前企业的 AI 预审 job。当前 AI 预审服务已统一要求企业作用域，并在列表、详情、手动触发和批量触发前校验目标任务必须属于当前 `X-Team-ID`。
- 测试结果：已先用 `python -m pytest apps/api/tests/test_auth_team_rbac.py -k "ai_review_jobs_require_team_scope_header"` 复现红测（缺少企业作用域仍返回 200），修复后该定向用例通过。
- 后续动作：下一轮继续生产链路巡检，优先看任务发布状态机、发布后字段限制和题目导入/导出。

### 2026-05-31

- 类型：后端缺陷修复 / 任务审批发布生产开关
- 关联文档：`docs/api/production.md`、`docs/api/review-ai-export.md`
- 内容：生产链路巡检发现，`task_publish=false` 只阻止 `POST /tasks/{task_id}/publish`，但 Team Admin 可通过 `POST /tasks/{task_id}/status` 的 `approve` 动作把 `pending_review` 任务写入 `published`，绕过任务发布生产开关。当前已在审批发布路径复用 `task_publish` 开关，关闭时返回 `42201` 且保持任务在 `pending_review`。
- 测试结果：已先用 `python -m pytest apps/api/tests/test_auth_team_rbac.py -k "task_publish_switch_blocks_pending_review_approval"` 复现红测（开关关闭时仍返回 200），修复后该定向用例通过。
- 后续动作：下一轮继续生产链路巡检，优先看发布后字段限制和题目导入/导出边界。

### 2026-05-31

- 类型：后端缺陷修复 / 草稿模板版本快照
- 关联文档：`docs/api/production.md`
- 内容：生产链路巡检发现，草稿模板每次 `PUT /templates/{template_id}` 都新增一条相同 `version` 的 `TemplateVersion`，发布时可能把旧 v1 快照标记为已发布，导致后续任务绑定到过期 schema。当前草稿保存改为覆盖当前草稿版本快照；只有已发布模板进入编辑时才递增版本并生成新的草稿快照。
- 测试结果：已先用 `python -m pytest apps/api/tests/test_auth_team_rbac.py -k "draft_template_update_replaces_current_version_snapshot"` 复现红测（同一模板出现两个 v1 快照），修复后该定向用例通过。
- 后续动作：下一轮继续生产链路巡检，优先看发布后字段限制和题目导入/导出边界。
### 2026-05-31

- 类型：产品/架构/前后端基线收敛 / 平台共享 AI Provider + 企业 AI 调用钱包
- 关联文档：`docs/design/pages/organization-resource-config.md`、`docs/api/review-ai-export.md`、`docs/api/team-profile.md`、`docs/product/REQUIREMENTS_AND_NOTES.md`、`docs/architecture/SYSTEM_ARCHITECTURE.md`、`docs/planning/TODO.md`
- 内容：补齐“平台共享 AI 路由 + 企业 AI 调用积分钱包”的当前活跃基线。平台现在可以维护多条 `scope=platform` 的共享 Provider，并且全局仅允许一条 `is_platform_default=true`；企业读取 Provider 列表时会看到企业自有路由与平台共享路由的合并结果，但企业侧对平台共享路由只读。每个新企业创建时自动初始化独立的 `TeamAiWallet(balance_points=0)`，AI 钱包与任务奖励积分钱包分账，显示单位统一为 `积分`，并固定 `1 积分 = 1 元`。只有真实调用平台共享路由时才从企业 AI 钱包按实际 usage/cost 扣费，调用前只校验余额大于 0；若单次成功调用把余额扣成负数，本次仍允许成功，但后续新的平台共享路由调用会继续被拦截，直到充值。`Provider 测试连接`、`成本估算` 和未真正访问上游模型的校验流程不扣费。
- 测试结果：`npm.cmd run typecheck` 通过；`python -m pytest apps/api/tests/test_ai_resources_platform_wallet.py` 通过，结果为 3 passed；`npm.cmd run test -- src/pages/workspace/WorkspaceApp.test.tsx -t "renders updated resource configuration wallet and ai overview flows" --testTimeout=30000` 通过。全量 `npm.cmd run test -- src/pages/workspace/WorkspaceApp.test.tsx --testTimeout=30000` 当前仍有 1 个既有失败：`opens operation logs from workspace URL query and preserves filters`，报错为 `src/app/App.tsx` 中 `parsePlatformPage is not defined`，与本轮资源配置页和 AI 钱包文档同步无直接关系。
- 后续动作：继续把 AI 预审、AI 辅助和其他真实模型调用入口逐步收口到统一的 AI 执行与结算层，避免共享路由计费逻辑分散。
### 2026-05-31

- 类型：平台运营工作台 / 真实前后端闭环
- 关联文档：`docs/api/platform.md`、`docs/api/team-profile.md`、`docs/architecture/SYSTEM_ARCHITECTURE.md`、`docs/design/pages/platform-workbench.md`
- 内容：新增独立 `/platform` 平台运营工作台和 `/api/v1/platform/*` 后端模块，覆盖经营总览、平台服务费结算流水、企业/标注员提现待处理、企业认证审核、标注员资质审核和服务费率设置。财务口径复用企业工作台的 `1 积分 = 1 元`，审核通过后标注员奖励不变，需求方企业额外承担平台服务费。企业提现改为创建平台待处理单，平台批准后才真实扣款并写钱包流水。
- 测试结果：`python -m compileall apps/api/app` 通过；`python -m pytest apps/api/tests` 通过，91 passed；`npm run typecheck` 通过；`npm run lint` 通过但保留既有 `WorkspaceApp.tsx` hooks dependency warning；`npm run test` 通过，123 passed、1 skipped；`git diff --check` 通过，仅有 CRLF 工作区提示。
- 后续动作：继续根据实际运营联调补充平台工作台筛选和数据可视化。

### 2026-05-31

- 类型：平台运营工作台 / 经营趋势补齐
- 关联文档：`docs/api/platform.md`、`docs/design/pages/platform-workbench.md`
- 内容：补齐经营总览的近 30 天结算趋势。`GET /api/v1/platform/workbench` 新增 `settlement_trend`，按自然日返回平台服务费 `commission_points / commission_yuan` 同值数据；前端 `/platform` 经营总览使用 Ant Design `Progress` 渲染真实趋势条，不使用 mock 数据。
- 测试结果：`python -m compileall apps/api/app` 通过；`python -m pytest apps/api/tests/test_platform_workbench.py -q` 通过，4 passed；`python -m pytest apps/api/tests -q` 通过，91 passed；`npm run typecheck` 通过；`npm run lint` 通过但保留既有 `WorkspaceApp.tsx` hooks dependency warning；`npm run test` 通过，123 passed、1 skipped；`git diff --check` 通过，仅有 CRLF 工作区提示。
- 后续动作：继续根据实际运营联调补充平台工作台筛选项与分页体验。

### 2026-05-31

- 类型：后端缺陷修复 / 结果导出审核记录
- 关联文档：`docs/api/review-ai-export.md`
- 内容：导出/审计巡检发现，`include_review_records=true` 已在 API 文档和 TODO 中标记支持，但导出行只写入空数组，无法带出已存在的 `submission_reviewed` 审计记录。当前修复为创建导出文件时按当前企业和 submission ID 读取审核审计日志，按时间升序写入 `review_id`、`reviewer_id`、`decision`、`comment`、`round`、`stage` 和 `created_at`，继续作为独立 `review_records` 表上线前的最小来源。
- 测试结果：已先用 `python -m pytest apps/api/tests/test_export_review_records.py -q` 复现红测（导出 `review_records` 为空），修复后定向用例通过；`python -m pytest apps/api/tests/test_config_security.py` 通过（10 passed）；`python -m pytest apps/api/tests/test_auth_team_rbac.py` 通过（78 passed）；`python -m compileall apps/api/app` 通过；`git diff --check` 通过，仅有既有 CRLF 工作区提示。
- 后续动作：继续在导出、上传、审计、通知方向巡检，优先关注导出过滤语义、下载审计和上传材料访问边界。
### 2026-05-31

- 类型：后端缺陷修复 / 任务题目企业作用域
- 关联文档：`docs/api/production.md`
- 内容：生产链路巡检发现，任务详情先校验了 `Task.team_id`，但后续多个题目查询只按 `task_id` 读取 `Question`。在数据中存在同 `task_id` 但 `team_id` 不一致的异常题目时，`GET /tasks/{task_id}/questions` 会把跨企业题目计入列表和分页总数；同一根因也会影响题目导出、统计、复制、删除重排和发布 readiness 计数。当前新增统一的 `task_question_query`，所有任务题目读取/删除/统计路径都同时绑定当前任务的 `team_id` 与 `task_id`。
- 测试结果：已先用 `python -m pytest apps/api/tests/test_task_question_team_scope.py -q` 复现红测（分页总数返回 2，包含跨企业题目），修复后该定向用例通过。
- 后续动作：继续生产链路巡检，优先覆盖题目导入/导出格式边界、发布后字段限制和积分预算扣减链路。
### 2026-05-31

- 类型：后端缺陷修复 / 标注领取题目企业作用域
- 关联文档：`docs/api/labeling.md`
- 内容：标注与审核链路巡检发现，`POST /labels/tasks/{task_id}/claim` 已先读取并校验公开任务，但后续重复领取检查、可领取题目列表和剩余题量统计只按 `task_id` 查询 `Question`。如果存在同 `task_id` 但 `team_id` 不一致的异常题目，Labeler 领取时可能把跨企业题目分配给自己并创建提交草稿。当前领取链路、标注工作台已领取题目读取、剩余题量和 submission 映射都改为同时绑定任务的 `team_id` 与 `task_id`。
- 测试结果：已先用 `python -m pytest apps/api/tests/test_labeling_claim_deadline.py -q` 复现红测（跨企业题目被优先领取且剩余题量返回 1），修复后该定向测试通过。
- 后续动作：继续标注与审核链路巡检，优先覆盖重提状态机、Reviewer assigned_only 读写边界和批量审核幂等/部分失败语义。
### 2026-05-31

- Type: frontend/backend progress / platform workspace AI Provider center
- Related docs: `docs/api/review-ai-export.md`, `docs/architecture/SYSTEM_ARCHITECTURE.md`, `docs/planning/TODO.md`, `docs/design/pages/platform-workbench.md`
- Details: 平台工作台新增独立 `AI Provider` 一级页面，平台管理员现在可以在 `/platform?page=providers` 直接维护 `scope=platform` 的共享路由。页面采用左侧列表、右侧详情和宽 Drawer 的企业后台结构，复用了单路由单模型 Provider 表单能力，并补齐平台侧新增、编辑、复制、启停、删除、设为默认和测试连接动作。
- Details: 为满足“新建页先测后存”，后端补充 `POST /api/v1/ai-resources/configs/test-draft`，平台前端通过平台专用 `platformService` 调用该接口，且不携带 `X-Team-ID`。已保存配置仍使用 `/api/v1/ai-resources/configs/{provider_id}/test`。
- Test results: `python -m pytest apps/api/tests/test_ai_resources_platform_permissions.py -q` 通过；`npm run test -- src/pages/platform/PlatformApp.test.tsx` 通过；`npm run typecheck` 通过。前端测试环境仍有既有 `jsdom getComputedStyle()` 提示，不影响本轮结果。
### 2026-05-31

- 类型：后端缺陷修复 / 结果导出题目企业作用域
- 关联文档：`docs/api/review-ai-export.md`
- 内容：导出、上传、审计、通知方向巡检发现，`POST /exports` 已按当前 `X-Team-ID` 校验任务归属，但生成导出行时只用 `task_id` 查询题目；若存在同 `task_id` 但 `team_id` 不一致的异常题目，正式结果导出文件会混入跨企业题目内容和提交答案。当前导出行生成改为传入已校验的 `Task`，题目查询复用 `task_question_query`，并在读取 submission 时同步限定 `team_id`、`task_id` 和 `question_id`。
- 测试结果：已先用 `python -m pytest apps/api/tests/test_export_review_records.py -q` 复现红测（下载 JSON 中出现 2 行，包含跨企业 `leaked/secret` 内容），修复后该定向测试通过。
- 后续动作：继续导出、上传、审计、通知方向巡检，优先关注导出过滤语义、下载审计边界和上传下载权限。
### 2026-05-31

- Type: frontend bugfix / auth refresh session update event
- Related docs: `docs/api/auth.md`
- Details: Frontend workbench sweep found that automatic access-token refresh persisted the rotated `LoginPayload` into storage but did not emit the existing `markup:session-updated` event that `App` listens to for session rehydration. If refresh returned a changed user/permission payload, the storage copy was current while the active shell state could stay stale until another explicit session update or reload. The refresh path now emits the shared session update event immediately after persisting the refreshed session.
- Test results: red test first with `npm.cmd run test -- apiClient.test.ts --run` reproduced the missing event (`0` calls); after the fix the same targeted test passed with 11 tests. Frontend gates passed: `npm.cmd run typecheck`, `npm.cmd run lint` (existing hooks dependency warnings only), `npm.cmd run test -- --run` (125 passed, 1 skipped, existing jsdom warnings), and `npm.cmd run build` (existing ExcelJS eval/chunk-size warnings).
- Next action: continue frontend workbench experience sweep, prioritizing permission fallback and auth-state synchronization issues before UI-only polish.

### 2026-06-01

- 类型：前后端缺陷修复 / 模板新建版本空白页
- 关联文档：`docs/api/production.md`、`docs/design/pages/owner-production.md`
- 内容：修复人工审核样例中的“商品标题清洗审核模板”点击新建版本后进入空白 Designer 的问题。该类历史样例模板主记录 `AnnotationTemplate.schema` 可能为空，但 `TemplateVersion.schema` 保留了完整快照；后端模板 payload、发布检查和复制模板现在在 schema 缺少有效 `tabs` 时回退读取当前版本或最新版本快照，前端 Designer 加载 schema 时也会先规范化 legacy 稀疏组件字段，确保缺少 `config/options/version` 的旧组件不会打断画布渲染。本次不改变 API shape。
- 测试结果：`conda run -n markup-api python -m pytest apps/api/tests/test_auth_team_rbac.py -k "template_payload_falls_back_to_latest_version_schema or delete_published_template_requires_no_task_references"` 通过，2 passed；`npm run test -- src/pages/workspace/WorkspaceApp.test.tsx -t "opens a published template version when its schema uses sparse legacy component fields" --testTimeout=30000` 通过；`npm run typecheck` 通过；`npm run lint` 通过但保留既有 4 个 hooks dependency warning；`conda run -n markup-api python -m compileall apps/api/app` 通过；`git diff --check` 通过。
- 后续动作：继续用真实页面检查模板列表中的新建版本、选项回车编辑、发布模板删除/归档入口，必要时再补 Playwright 回归。

- 类型：前端缺陷修复 / 人员管理邀请记录操作列
- 关联文档：`docs/design/pages/organization-management.md`
- 内容：修复人员管理相关表格的操作区显示异常。成员表在当前列宽总和下缺少横向滚动，右侧“操作/更多”区域容易被容器裁切；同时行内 `Dropdown` 挂载在表格局部容器时，会被 `workspace-fixed-table-panel` 和抽屉内层的 `overflow: hidden` 裁掉。当前为成员表和邀请记录表补齐横向滚动宽度，并将成员行“更多”菜单挂到 `document.body`，保证“查看 / 编辑 / 更多”和“重新生成邀请码 / 撤销”都能完整展示。
- 测试结果：`npm.cmd run test -- src/pages/workspace/WorkspaceApp.test.tsx -t "people management|invite-code flow|revoke team invitations|transfers assigned review tasks"` 通过；`npm.cmd run typecheck` 通过。
- 后续动作：继续巡检人员管理页的表格列宽与抽屉内表格渲染，优先关注移动端和窄屏下的按钮挤压问题。

- 类型：前后端缺陷修复 / 人员管理权限兜底与已有账号加企业
- 关联文档：`docs/api/team-profile.md`
- 内容：继续修正人员管理页中与真实企业管理流程不一致的行为。前端成员管理权限不再错误依赖“当前筛选结果里是否还看得到自己”，改为优先读取当前登录会话角色和权限摘要，在筛空列表后仍能保留 `添加成员` 和批量操作入口；默认企业选择改为优先使用 `GET /teams/admin/overview.default_team_id`，避免多企业管理员总是落到列表第一支企业；成员新增弹窗新增“添加已有账号”模式，直接用邮箱把已注册账号加入当前企业，不再强迫管理员重复创建账号；批量导入 CSV 同步兼容“已有账号只填邮箱和角色”的最小格式。后端 `members/import` 也按同一规则收口：已有账号加入企业时不再要求 `username/display_name/password`，新账号仍保持必填校验；成员 payload 补充 `position` 与 `phone`，前端不再把“职位”错误伪造成角色标签，手机号也改为展示真实资料字段。
- 测试结果：`npx.cmd vitest run src/pages/workspace/WorkspaceApp.test.tsx -t "adds an existing registered account to the team from people management|uses default_team_id and keeps manage actions visible after an empty filter result|renders the standalone people management table with filters, detail, create and edit actions" --reporter=verbose` 通过；`python -m pytest apps/api/tests/test_auth_team_rbac.py -q` 通过。全量 `npm.cmd run typecheck` 当前仍被既有 `apps/web/src/pages/workspace/ResourceConfigPage.tsx` 类型错误阻塞，非本轮引入。
- 后续动作：继续巡检人员管理页中的剩余业务文案、批量操作反馈与窄屏布局；待资源配置页既有类型错误清理后，再补跑全量前端类型检查。

- 类型：前后端功能下线 / 人员管理审核任务转交
- 关联文档：`docs/api/team-profile.md`、`docs/design/pages/team-member-management.md`
- 内容：按最新产品决策移除人员管理中的“转交审核任务”能力。前端从成员行内更多菜单、成员详情 Drawer 和相关 Modal 中删除该入口，不再展示“审核任务转交”说明；审核工作台里与该能力绑定的说明文案也同步收口。后端下线 `POST /teams/{team_id}/members/{user_id}/transfer-tasks` 路由、请求模型和服务实现，避免保留已废弃的半残接口；人员管理其余成员编辑、批量改角色、安全提醒、邀请和已有账号加入企业能力保持不变。
- 测试结果：已更新前端 `WorkspaceApp.test.tsx` 与后端 `test_auth_team_rbac.py`，移除对成员审核任务转交的断言；定向回归 `npx.cmd vitest run src/pages/workspace/WorkspaceApp.test.tsx -t "renders the standalone people management table with filters, detail, create and edit actions|supports invite-code flow and hides 2FA from people management|adds an existing registered account to the team from people management|uses default_team_id and keeps manage actions visible after an empty filter result|resends and revokes team invitations from people management" --reporter=verbose` 与 `python -m pytest apps/api/tests/test_auth_team_rbac.py -q` 待本轮代码落定后已重新验证。
- 后续动作：继续观察人员管理页的操作收口后是否还存在多余文案和窄屏按钮挤压问题；若后续需要新的审核分配能力，应重新按活跃流程单独设计，不复用已下线入口。

- 类型：前端功能下线 / 人员管理移除添加已有账号入口
- 关联文档：`docs/design/pages/team-member-management.md`
- 内容：按最新产品决策，人员管理页 `添加成员` 弹窗不再提供“添加已有账号”模式。前端成员新增入口现收敛为 `创建账号 / 邮箱邀请 / 邀请码邀请` 三种方式，删除原先基于 `/teams/{team_id}/members/import` 的单邮箱快速加入企业分支和对应成功提示，避免与批量导入、创建账号和邀请链路形成重复入口。后端现有 `POST /teams/{team_id}/members` 与 `members/import` 能力暂保留兼容，不作为当前活跃前端主路径。
- 测试结果：已删除 `WorkspaceApp.test.tsx` 中“adds an existing registered account to the team from people management” 场景；定向回归 `npx.cmd vitest run src/pages/workspace/WorkspaceApp.test.tsx -t "renders the standalone people management table with filters, detail, create and edit actions|supports invite-code flow and hides 2FA from people management|uses default_team_id and keeps manage actions visible after an empty filter result|resends and revokes team invitations from people management" --reporter=verbose` 通过。
- 后续动作：继续观察成员新增弹窗是否还存在冗余选项；若后续确需恢复“已有用户直接加企业”，需重新明确与邀请/导入路径的职责边界后再恢复。

- 类型：前端交互收口 / 企业侧平台共享 Provider 仅保留名字展示
- 关联文档：`docs/design/pages/organization-resource-config.md`
- 内容：继续收口 `ResourceConfigPage.tsx` 的企业侧 `AI Provider` 展示。平台共享 Provider 卡片与详情只保留平台配置昵称 `route_name` 作为唯一主名，并继续展示价格与模态能力；状态、类型、模型、测试、接入地址和鉴权细节不再暴露。企业自配 Provider 继续保留高密度专业详情，方便企业维护自有路由。
- 测试结果：`cd apps/web && npx eslint src/pages/workspace/ResourceConfigPage.tsx src/pages/workspace/WorkspaceApp.test.tsx` 通过；`cd apps/web && npx vitest run src/pages/workspace/WorkspaceApp.test.tsx -t "renders updated resource configuration wallet and ai overview flows" --reporter=verbose` 待本轮一并确认。
- 后续动作：如后续任务发布页或其他企业侧 Provider 选择器也需要同样的“平台只露出业务名、自配展示专业细节”边界，应同步统一展示口径。
- Type: frontend refinement / ResourceConfigPage AI history + provider density cleanup
- Related docs: `docs/design/pages/organization-resource-config.md`
- Details: Continued to tighten `apps/web/src/pages/workspace/ResourceConfigPage.tsx`. The AI history table no longer falls back to internal operation names as the visible Provider label, request-id rendering now suppresses fake/internal placeholders, and zero-cost AI calls render as neutral `0 积分` instead of `+0 积分`. The team-side provider center now uses a denser responsive grid, renames the platform area to `平台共享路由`, removes duplicated platform-provider headings, keeps platform shared details limited to route nickname + pricing + capabilities, and preserves richer professional detail only for team-managed providers. The page also removes remaining Ant Design deprecation usage on this screen (`Drawer.size`, table pagination `placement`, `Alert.title`, `Tag.variant`, `Space.orientation`) and replaces form watchers that could trigger disconnected `useForm` warnings with explicit local state sync.
- Test results: pending local verification after this round with `npx eslint src/pages/workspace/ResourceConfigPage.tsx src/pages/workspace/WorkspaceApp.test.tsx` and `npx vitest run src/pages/workspace/WorkspaceApp.test.tsx -t "renders updated resource configuration wallet and ai overview flows" --reporter=verbose`.

### 2026-06-01

- 类型：前后端实现 / 企业工作台 Dashboard
- 关联文档：`docs/api/team-profile.md`、`docs/design/FRONTEND_DESIGN_STYLE.md`、`docs/planning/TODO.md`
- 内容：新增 `GET /api/v1/teams/{team_id}/dashboard` 企业级聚合接口，要求 `Authorization + X-Team-ID` 且路径企业与 Header 企业一致，权限为 `team:read`。接口不新增数据库表，聚合企业资料、会员与钱包、任务/题目生产统计、审核统计、AI 预审队列、导出任务、通知、审计日志和生产资源开关状态，并按 Team Admin / Owner / Reviewer / Agent 返回角色化快捷入口。Reviewer 只统计当前企业内分配给自己的审核任务，非生产角色的导出摘要返回 0 与空数组。
- 内容：前端新增 `WorkspaceDashboardPage`，企业用户 `/workspace` 默认主页面由硬编码占位改为真实企业看板。页面先调用 `/teams/admin/overview` 获取默认企业，再调用 `/teams/{team_id}/dashboard`；使用 Ant Design `Statistic`、`Progress`、`Table`、`List`、`Tag`、`Alert`、`Button`、`Tooltip` 展示待办风险、指标状态条、生产漏斗、最近任务、治理通知/审计和资源状态。Reviewer 不展示任务生产管理主入口，Agent 聚焦资源配置；当时 Labeler 未纳入企业看板，后续已由 2026-06-06 分角色 Labeler 看板记录更新为 `labeler-dashboard` 分流。
- 内容：顺手修复 `ResourceConfigPage.tsx` 中 Ant Design 新版类型不匹配：Table pagination `placement` 改为 `bottomEnd`，`Space.justify` 改为样式属性，恢复全量前端 typecheck。
- 测试结果：`python -m pytest apps/api/tests/test_auth_team_rbac.py -q -k "team_dashboard"` 通过，4 passed；`python -m pytest apps/api/tests/test_auth_team_rbac.py -q` 通过，87 passed；`python -m compileall apps/api/app` 通过；`npm --prefix apps/web run typecheck` 通过；`cd apps/web && npx vitest run src/pages/workspace/WorkspaceApp.test.tsx -t "dashboard" --testTimeout=30000` 通过，3 passed。Vitest 仍输出 jsdom `getComputedStyle()` pseudo-elements 未实现提示，不影响测试结果。
- 后续动作：后续可继续为企业 Dashboard 增加日期筛选、趋势图或 WebSocket 实时刷新；当前第一版保持全量累计 + 最近 5 条记录口径。
### 2026-06-01

- Type: frontend refinement / ResourceConfigPage wallet summary and platform-provider fallback cleanup
- Related docs: `docs/design/pages/organization-resource-config.md`
- Details: Continued to tighten only `apps/web/src/pages/workspace/ResourceConfigPage.tsx`. The points-wallet summary is reduced back to the four main business fields (`积分余额 / 预扣积分 / 花销统计 / 可用余额`) instead of mixing in pending-withdraw noise. The AI overview removes the extra platform-default status tag near the wallet summary, and AI history now renders `transfer_in` rows under `企业积分钱包` so payment method strings or other source labels no longer masquerade as Provider names. Team-side platform shared Provider details also stop repeating the route nickname inside the detail body; if a team currently has no self-managed Provider, the page now defaults the detail panel to the first visible platform shared route instead of showing an empty state. To reduce residual Ant Design form-lifecycle warnings, the page’s form-bearing Drawers are now force-rendered so their `useForm` instances stay attached before field sync runs.
- Test results: not rerun in this round per request.

### 2026-06-01

- Type: frontend refinement / ResourceConfigPage membership header and provider sticky action cleanup
- Related docs: `docs/design/pages/organization-resource-config.md`
- Details: Continued to tighten `apps/web/src/pages/workspace/ResourceConfigPage.tsx`. The membership summary header now keeps `企业钱包可用余额` on the same row as the effective plan tag, and the book/current plan duplication is removed unless the book plan actually differs from the effective plan. The points and AI overview status areas now share the same restrained badge style instead of mixing multiple strong colors, the `估算成本` button is removed from the AI overview action bar, and the AI Provider page now keeps `新增配置 / Agent 设置` pinned at the top inside a continuous white shell so the old gray seam does not show through while scrolling.
- Test results: not rerun in this round per request.

### 2026-06-02

- Type: frontend refinement / PeopleManagementPage table header parity
- Related docs: `docs/design/FRONTEND_DESIGN_STYLE.md`
- Details: Restored the personnel management page to the shared Ant Design table enhancement path. `apps/web/src/pages/workspace/PeopleManagementPage.tsx` now uses `EnhancedTable` for both the member table and invitation table, adds native header filters/search for role, position, invite mode, status, and recent time windows, and restores sorter coverage for identity, email, counts, inviter, expiry, and response time so this page matches the rest of the workspace governance tables.
- Test results: `npm.cmd run typecheck`; `npm.cmd run build`

- Type: frontend refinement / Global Ant Design table enhancement rollout
- Related docs: `docs/design/FRONTEND_DESIGN_STYLE.md`
- Details: Added `apps/web/src/components/ui/EnhancedTable.tsx` as the shared Ant Design table enhancement layer and rolled it out across workspace, task-square, and platform list pages. The shared layer now unifies drag-resize column widths, `scroll.x = max-content` fallback, fixed table layout, sorter-icon tooltip behavior, and sticky headers for `workspace-fixed-table` usage. `ResourceConfigPage.tsx` was also migrated back onto the shared layer so the page no longer maintains a separate local resizable-table implementation.
- Test results: not rerun in this round per request.

- Type: frontend refinement / production list header filters
- Related docs: `docs/design/FRONTEND_DESIGN_STYLE.md`
- Details: Tightened the three owner-side production list tables in `apps/web/src/pages/workspace/OwnerProductionPages.tsx`. Dataset, template, and task table views now expose Ant Design native header filters and sorters instead of relying only on page-level search bars. The dataset table gained format / mapping / updated-time filters and sorters, while template and task list tables now decorate their existing columns with status, structure, reference, progress, AI/reviewer, and reward/distribution filters without rewriting the underlying row renderers.
- Test results: not rerun in this round per request.

- Type: frontend refinement / table header filters parity across workspace pages
- Related docs: `docs/design/FRONTEND_DESIGN_STYLE.md`
- Details: Continued the Ant Design table rollout on workspace governance pages. `PeopleManagementPage.tsx` now decorates member and invitation tables with native role/status/time filters and sorting; `AnnouncementsPage.tsx` now exposes type/priority/target/status filters plus sender/time sorting; `OperationLogsPage.tsx` now adds action/entity table-header filters and time/operator/request sorting; `OwnerProductionPages.tsx` also stabilizes the task-management table with explicit horizontal scroll width to reduce header/body misalignment under dense columns.
- Test results: not rerun in this round per request.

- Type: frontend refinement / ResourceConfigPage summary cards visual unification
- Related docs: `docs/design/pages/organization-resource-config.md`
- Details: Further tightened only `apps/web/src/pages/workspace/ResourceConfigPage.tsx`. The top metric cards in `积分管理` and `AI 资源` are now rendered with the same neutral white background and light border, instead of using multiple saturated semantic colors for different metrics. This keeps the page header area visually calmer and makes the action/status strips carry the state emphasis instead of the big numbers themselves.
- Test results: not rerun in this round per request.
- Type: frontend/backend contract alignment / shared Provider config source and draft testing parity
- Related docs: `docs/api/review-ai-export.md`, `docs/api/team-profile.md`, `docs/design/pages/organization-resource-config.md`, `docs/planning/TODO.md`
- Details: Finished another cleanup pass centered on `apps/web/src/pages/workspace/ResourceConfigPage.tsx`. The team-side Provider drawer no longer keeps a second local copy of provider-kind metadata, runtime field assembly, pricing summary formatting, or detail rendering; it now reuses the shared `providerConfigShared` source that also drives the platform Provider center. This closes the remaining gap where team-side fields or defaults could drift away from platform-side behavior. The team drawer now follows the same draft-test decision path as the platform page: unsaved changes use `POST /api/v1/ai-resources/configs/test-draft`, while untouched edit state can reuse saved-config testing. In parallel, Agent custom avatar upload is documented as a dedicated `POST /api/v1/teams/{team_id}/agent-settings/avatar` path so ResourceConfigPage no longer depends on task-upload permissions for this action.
- Test results: `cd apps/web && npm run typecheck`; `cd apps/web && npx vitest run src/pages/workspace/WorkspaceApp.test.tsx -t "renders updated resource configuration wallet and ai overview flows"`; `cd apps/web && npx vitest run src/pages/platform/PlatformApp.test.tsx`
- Type: frontend refinement / ResourceConfigPage provider fixed-height scrolling layout
- Related docs: `docs/design/pages/organization-resource-config.md`
- Details: Continued tightening only `apps/web/src/pages/workspace/ResourceConfigPage.tsx`. The AI Provider center now uses a fixed-height shell with internal scrolling instead of letting sparse content stretch across a tall white canvas. The top `平台共享路由` card body is capped with its own scroll area, while the team-provider list and right-side detail panel both use fixed body heights plus internal overflow. This keeps the component sizes stable in a more Ant Design-style workspace layout and prevents low-content platform-shared routes from producing oversized empty detail space.
- Test results: `cd apps/web && npm run typecheck`; `cd apps/web && npx vitest run src/pages/workspace/WorkspaceApp.test.tsx -t "renders updated resource configuration wallet and ai overview flows"`
- Type: frontend bugfix / EnhancedTable page-size changer state bridge
- Related docs: `docs/design/FRONTEND_DESIGN_STYLE.md`
- Details: Fixed a regression where Ant Design table page-size changers were visible but ineffective across workspace and platform tables. The shared `apps/web/src/components/ui/EnhancedTable.tsx` previously forwarded static `pagination.pageSize` values without maintaining any local pagination state, so many tables re-rendered back to their default size immediately after a user selection. The shared table layer now bridges uncontrolled pagination by maintaining internal `current/pageSize` state while still respecting externally controlled pagination configs. This restores working `showSizeChanger` behavior across resource, people, announcements, audit-log, and production-management tables without rewriting each page separately.
- Test results: `cd apps/web && npm run typecheck`; `cd apps/web && npx vitest run src/components/ui/EnhancedTable.test.tsx`; `cd apps/web && npx vitest run src/pages/workspace/WorkspaceApp.test.tsx -t "renders updated resource configuration wallet and ai overview flows"`
- Type: frontend refinement / ResourceConfigPage resizable table columns
- Related docs: `docs/design/pages/organization-resource-config.md`
- Details: Continued to tighten only `apps/web/src/pages/workspace/ResourceConfigPage.tsx`. The four main tables on this page now stay on Ant Design `Table` while supporting drag-resize column widths through a shared header-cell extension. Points ledger, AI history, cert types, and production switches all use the same restrained resize affordance so high-density data can be widened in place without changing the page structure or reintroducing extra cards.
- Test results: not rerun in this round per request.
- Type: frontend refinement / ResourceConfigPage native table filters and action consolidation
- Related docs: `docs/design/pages/organization-resource-config.md`
- Details: Continued to tighten only `apps/web/src/pages/workspace/ResourceConfigPage.tsx`. The page now leans further into Ant Design native table capabilities: points ledger, AI history, cert types, and production switches gain built-in column filters, sorter icons, filter search, sticky headers, and ellipsis handling instead of pushing all filtering into page-level controls. At the same time, low-frequency page actions are consolidated into `更多管理 / 更多操作` dropdown menus so the primary action rows stay shorter and easier to scan.
- Test results: not rerun in this round per request.
- Type: frontend refinement / ResourceConfigPage table experience parity
- Related docs: `docs/design/pages/organization-resource-config.md`
- Details: Continued to tighten only `apps/web/src/pages/workspace/ResourceConfigPage.tsx`. The same higher-level table experience is now carried through the other resource tables as well: AI history, cert types, and production switches each gain lightweight search/reset toolbars on top of the existing Ant Design column filters and sorting, so the page no longer has one “fully tooled” table beside several bare ones.
- Test results: not rerun in this round per request.

### 2026-06-02

- 类型：前端测试补充 / 模板 Designer 自动保存
- 关联文档：`docs/api/production.md`、`docs/design/pages/owner-template-designer.md`
- 内容：为模板 Designer 补充回归测试，覆盖已发布模板点击“新建版本”后基于原 schema 进入 Designer、修改模板名称触发 `auto_saved=true` 自动保存、点击“保存草稿”写回 `auto_saved=false`，且手动保存后无继续修改不会再次触发自动保存。同步修正后端 `POST /templates` 创建模板时未传递 `auto_saved` 的缺口，使新建模板自动保存与更新模板自动保存保持同一 API 语义；前端工作台 toast helper 对测试环境中缺失 `message.open` 的 Ant Design App mock 增加兼容回退。
- 测试结果：`cd apps/web && npm run test -- src/pages/workspace/WorkspaceApp.test.tsx -t "autosaves a new published-template version and stops re-autosaving after manual save without further edits" --testTimeout=30000` 通过；`cd apps/web && npm run typecheck` 通过；`conda run -n markup-api python -m compileall apps/api/app` 通过；`git diff --check` 通过。
- 后续动作：继续补充模板自动保存的新增模板 `POST /templates auto_saved=true` 后端单测，以及真实 Playwright 页面流回归。

### 2026-06-03

- Type: frontend bugfix / PlatformAgentDrawer canvas fill and layout stabilization
- Related docs: `docs/design/FRONTEND_DESIGN_STYLE.md`, `docs/api/review-ai-export.md`
- Details: Tightened the platform Q&A AI drawer layout after the new floating-window refactor exposed an unfilled blank region on the right side of the conversation area. The root cause was a mixed layout chain: the canvas body still relied on a hard-coded `height: calc(100% - 44px)` for the conversation region while the support strip above it had dynamic real height, and the conversation container had been switched to `display: flex` without making its empty state or `Bubble.List` child stretch to full width. The drawer canvas now uses a vertical flex layout, the support strip occupies only its natural height, and the conversation, empty state, and bubble list all explicitly grow to fill the remaining width and height. This removes the visible right-side blank area and makes the floating/expanded panel fill behavior stable under both welcome-state and long streamed replies.
- Test results: pending in this round; rerun `cd apps/web && npm run test -- src/components/layout/SiteNav.test.tsx --run` and `cd apps/web && npm run typecheck`.
- Details update: After visual verification on the real page, there was still a full-height blank strip on the right side of the platform Q&A drawer. The remaining cause was the Drawer body using `display: flex` in the default row direction, while the root `.platform-agent-panel` had no explicit `width: 100%` or flex growth. The layout now also forces the Drawer body into a column flow and makes the panel itself `flex: 1` with `width: 100%`, so the entire toolbar, canvas, and composer stretch across the available drawer width instead of shrink-wrapping to content.
- Details update: Continued tightening the floating interaction feel for `PlatformAgentDrawer`. The old `mousedown + mousemove + setState-on-every-frame` path made drag/resize feel sticky because every pointer move forced React reconciliation across the full chat drawer, and the resize hot zone was only an 18px corner target. Floating interaction now uses pointer events, a larger dedicated drag blank zone in the title bar, a larger bottom-right resize hit area, DOM-level CSS variable updates during movement, and only commits the final frame back into React state when the interaction ends. This keeps the floating window visually responsive while preventing text selection and improving the perceived sensitivity of both dragging and resizing.
### 2026-06-04

- Type: enterprise workspace convergence / production switches deprecated
- Related docs: `docs/design/pages/organization-resource-config.md`, `docs/architecture/SYSTEM_ARCHITECTURE.md`, `docs/api/review-ai-export.md`
- Details: Removed `生产开关` from the active enterprise-workspace baseline. The resource configuration page no longer exposes a production-switch tab, the dashboard no longer depends on `governance.production_switches`, the public `/api/v1/ai-resources/teams/{team_id}/production-switches*` routes are no longer part of the current frontend path, and the runtime organization-level switch checks were removed from task publish, AI review, export, upload, and related business flows.
- Test results: pending in this round; covered by targeted frontend/backend regression updates below.

- Type: enterprise workspace refinement / operation logs server pagination and audit coverage
- Related docs: `docs/design/pages/organization-audit-logs.md`, `docs/design/pages/organization-resource-config.md`
- Details: Rebuilt `apps/web/src/pages/workspace/OperationLogsPage.tsx` into a dense Ant Design server-paginated audit query page with keyword, entity, action, operator, risk, and date filters, export confirmation, and detail drawer diff view. Backend audit coverage was also extended in the current round so notification state changes, mark-all read, batch AI review trigger, and batch review actions all leave durable `AuditLog` records instead of relying on front-end derived summaries.
- Test results: pending targeted rerun in this round.

### 2026-06-04

- Type: frontend refinement / enterprise workspace header unification
- Related docs: `docs/design/FRONTEND_DESIGN_STYLE.md`
- Details: Unified enterprise workspace page headers in `apps/web/src/pages/workspace/WorkspaceApp.css` around one shared `page-heading` baseline. The header height, vertical alignment, title spacing, and action-row alignment are now normalized instead of being split between default pages, dashboard, and review pages. Header accents are also regrouped by workspace domain: data-production pages now share one blue header family, review-quality pages share one warm review family, and enterprise-management pages share one governance family. The dashboard and enterprise account header overrides that previously removed the accent rail were also folded back into the shared system so enterprise pages no longer feel like unrelated products.
- Test results: `cd apps/web && npm.cmd run test -- --run src/app/workspaceNavigation.test.tsx` passed; `cd apps/web && npm.cmd run test -- --run src/pages/workspace/WorkspaceApp.test.tsx -t "dashboard loads organization overview"` passed; `cd apps/web && npm.cmd run typecheck` is still blocked by pre-existing unrelated `src/pages/platform/PlatformApp.tsx` missing `PlatformReputationAppeal` / `reviewPlatformReputationAppeal`; full-file `WorkspaceApp.test.tsx` still times out in this worktree, and the targeted `enterprise account center` case currently fails on an existing accessible-name mismatch (`save 保存基本资料` vs `保存基本资料`).

- Type: frontend/backend implementation / AI review task-level workspace
- Related docs: `docs/api/review-ai-export.md`, `docs/design/FRONTEND_DESIGN_STYLE.md`, `docs/planning/TODO.md`
- Details: AI 预审从旧 job 队列首页重做为任务级工作台。后端新增 `GET /api/v1/ai-reviews/task-overviews` 与 `GET /api/v1/ai-reviews/task-overviews/{task_id}/submissions`，旧 `/ai-reviews/tasks` job 列表继续兼容；任务概览返回当前企业可见任务的 AI 覆盖率、状态计数、建议计数、异常和分页，任务明细返回提交级 AI job、评分、建议、失败原因和更新时间。Reviewer 可见范围同步收紧为任务 `reviewer_ids` 或成员 `assigned_review_tasks` 命中的授权范围。
- Details: 前端 `AiReviewPage` 改为固定视口高密度工作台：首页提供紧凑统计条、单行筛选、表格/卡片切换和“查看预审明细”主操作；详情页使用独立 `ai-review-task` 页面展示返回、任务摘要、覆盖率、提交明细表格、结果 Drawer、失败重试、单条触发和批量触发。样式同步收口为密铺布局，减少旧队列页的大缝隙和位置跳动。
- Details: 补齐最小 AI worker 执行服务：`pending/failed -> processing -> completed/failed`，通过 AI Resources/Gateway 调用 Provider，解析结构化 JSON 写入 `result/error/retry_count` 并记录审计；完成后不修改 submission/question 的最终人工审核状态，AI 只提供评分、建议和风险。
- Test results: `cd apps/web && npx.cmd vitest run src/pages/workspace/WorkspaceApp.test.tsx -t "ai review" --testTimeout=30000` passed, 1 passed / 72 skipped, with existing jsdom `getComputedStyle()` pseudo-element warnings. `python -m pytest apps/api/tests/test_auth_team_rbac.py -q -k "ai_review"` passed, 4 passed / 85 deselected, with existing FastAPI `on_event` deprecation warnings. `npm.cmd --prefix apps/web run typecheck` is still blocked by pre-existing unrelated `apps/web/src/pages/platform/PlatformApp.tsx` missing `PlatformReputationAppeal` and `reviewPlatformReputationAppeal`; AI 预审相关 type errors have been cleared.
- Remaining risks: Function Calling/schema 级输出约束、死信队列、扣费幂等和人工审核页内更完整的 AI 评分维度展示仍需后续补强。

### 2026-06-05

- Type: frontend refinement / workspace internal ID display cleanup
- Related docs: `docs/design/FRONTEND_DESIGN_STYLE.md`, `docs/planning/TODO.md`
- Details: Downgraded long backend/internal identifiers across the workspace UI. Added a shared `workspaceDisplay` helper for short secondary codes, friendly entity references, and folded technical details. AI review, dashboard recent AI jobs, manual review, task management details/questions, announcements, personal inbox, operation logs, resource configuration, Labeler points/reputation tables, and labeling fallback entry now prioritize business names, task titles, question sequence numbers, submission records, statuses, times, and short codes instead of exposing full job/submission/question/request IDs in primary UI. Full IDs remain available only in technical info or advanced export/reconciliation contexts.
- Test results: pending this round.

- Type: frontend bugfix / workspace table shell gutter removal
- Related docs: `docs/design/FRONTEND_DESIGN_STYLE.md`
- Details: Fixed the shared workspace Ant Design table shell instead of patching individual pages. `workspace-fixed-table-panel`, `workspace-table-panel`, and `production-table-shell` now use edge-to-edge table containers with `min-width: 0 / max-width: 100% / overflow: hidden`, production table shells no longer add `0 12px` horizontal padding, the duplicated inner table border is removed, and fixed table bodies no longer force `scrollbar-gutter: stable`. This removes the left blank strip and right scrollbar/action-column blank gutter across production, governance, inbox, AI review, and labeler workspace tables while keeping Ant Design responsible for native table scroll alignment.
- Test results: `cd apps/web && npx.cmd vitest run src/pages/workspace/WorkspaceApp.test.tsx -t "renders the standalone people management table|renders announcements with notification creation|renders operation logs with filters|loads task-level ai review" --testTimeout=30000 --reporter=verbose` passed, 4 passed / 69 skipped. `git diff --check -- apps/web/src/pages/workspace/WorkspaceApp.css docs/design/FRONTEND_DESIGN_STYLE.md docs/planning/PROGRESS_LOG.md` passed. `npm.cmd --prefix apps/web run typecheck` remains blocked only by the existing unrelated `apps/web/src/pages/platform/PlatformApp.tsx` missing `PlatformReputationAppeal` / `reviewPlatformReputationAppeal`.

- Type: frontend refinement / workspace table action-column unification
- Related docs: `docs/design/FRONTEND_DESIGN_STYLE.md`
- Details: Added shared `WorkspaceTableActions` for workspace Ant Design table action columns and aligned existing workspace tables with the template-building list baseline. Dataset, template, template-version, task, question, export-history, AI review, people, invitation, announcements, personal inbox, operation-log, organization-material, and Labeler task tables now use icon-only high-frequency actions plus a `MoreOutlined` dropdown for low-frequency actions; dangerous actions keep confirm semantics through the shared component. Operation-column widths are stabilized around 138px, single-action columns around 92px, with `workspace-table-action-cell` preventing text-button overflow and row jitter.
- Test results: `cd apps/web && npx.cmd vitest run src/pages/workspace/WorkspaceApp.test.tsx -t "announcements with notification creation|resends team invitations" --testTimeout=30000` passed, 2 passed / 71 skipped; `cd apps/web && npx.cmd vitest run src/pages/workspace/WorkspaceApp.test.tsx -t "people management|announcements|personal inbox|operation logs|ai review|row actions" --testTimeout=30000` passed, 15 passed / 58 skipped. Both runs keep existing jsdom warnings for pseudo-elements/navigation/canvas. `npm.cmd --prefix apps/web run typecheck` still fails only on pre-existing unrelated `apps/web/src/pages/platform/PlatformApp.tsx` missing `PlatformReputationAppeal` and `reviewPlatformReputationAppeal`; the workspace action-column changes typecheck cleanly after adding an explicit `ColumnsType<DatasetPayload>` annotation for the dataset table.

- Type: frontend/backend bugfix / AI review closed loop
- Related docs: `docs/api/review-ai-export.md`, `docs/planning/TODO.md`, `docs/architecture/SYSTEM_ARCHITECTURE.md`
- Details: Closed the current AI review loop without introducing a durable worker. Labeler question submit now returns the created AI review job and schedules it through FastAPI `BackgroundTasks`; manual trigger, batch trigger, and retry use the same dispatcher. AI review execution now passes a shared structured schema to supported providers, validates `pass/reject/manual` server-side, stores structured results on `AiReviewJob`, marks malformed decisions as failed, and releases each attempted submission to the existing Reviewer queue by setting `task_submitted_at`. The AI review task overview/detail APIs now hide tasks with `ai_config.enabled=false`.
- Details: Fixed the AI review workspace tables by removing the `scroll={{ y: 1 }}` override from both overview and detail tables, letting the shared fixed-table shell control height.
- Test results: `python -m py_compile apps/api/app/services/ai_reviews_service.py apps/api/app/services/resource_service.py apps/api/app/services/labels_service.py apps/api/app/api/v1/ai_reviews.py apps/api/app/api/v1/labels.py` passed. `python -m pytest apps/api/tests/test_auth_team_rbac.py -k "ai_review"` passed, 6 passed / 85 deselected, with existing FastAPI `on_event` deprecation warnings. `npm.cmd --prefix apps/web run test -- --run src/pages/workspace/WorkspaceApp.test.tsx -t "loads task-level ai review" --testTimeout=30000` passed, 1 passed / 72 skipped, with existing jsdom pseudo-element warnings.

- Type: frontend mobile adaptation / full-site responsive verification progress
- Related docs: `goal.md`, `docs/design/mobile-adaptation-plan.md`, `docs/design/FRONTEND_DESIGN_STYLE.md`
- Details: Continued the full-site mobile adaptation goal. `OwnerProductionPages.tsx` now guards task template/dataset name-map derivation with safe arrays so malformed or incomplete mocked list payloads no longer trigger `Cannot read properties of undefined (reading 'map')` during task-management rendering. Template搭建 AI and 任务发布 AI mobile modal shells now constrain `.ant-modal-content` to `calc(100dvh - 16px)`, make the modal body flex-fill with internal overflow, and let the assistant dialog fill the remaining body height. This keeps both assistant close/clear controls visible and prevents the mobile expanded state from growing beyond the viewport.
- Details: Rechecked the mobile adaptation docs and recorded current implementation/test state in `docs/design/mobile-adaptation-plan.md`. The document now reflects the `820px` workspace sidebar breakpoint, implemented card/list/mobile AI behavior, and remaining verification risks.
- Test results: `cd apps/web && npm run typecheck` passed. `cd apps/web && npm run test -- WorkspaceApp` completed with 47 passed / 26 failed / 1 skipped; the previous `taskTemplates.map` unhandled error is no longer present, while remaining failures are existing UI/test expectation drift around labeler task button text and task-management toast messages. Playwright browser audit covered 390x844, 430x932, 768x1024, 1280x800, 1440x900, and 1920x1080 across home, login entry, task market, workspace home, task management, publish task, datasets, templates, AI review, manual review, and resource config. Body-level horizontal overflow stayed at 0-1px; wide tables remained inside internal scroll containers. Manual Playwright checks confirmed task-publish AI and template AI open/close on mobile, keep clear/close buttons visible, and now stay within the actual mobile viewport height.
- Remaining risks: Some Ant Design deprecated-prop warnings still surface in console as error-level text; task market requests under the current logged-in enterprise account show 403 and need permission/public-scope follow-up; the local browser runner reports a minimum practical CSS width around 487px, so strict 390px visual screenshots should be supplemented with a dedicated Playwright project or real-device pass before declaring the full goal complete.

- Type: frontend mobile adaptation / manual review mobile stability
- Related docs: `goal.md`, `docs/design/mobile-adaptation-plan.md`
- Details: Stabilized the manual-review high-risk path for mobile verification. The main review comment and direct-revise comment no longer depend on disconnected Ant Design Form instances while the detail/modal tree is conditionally rendered; the direct-revise comment is now a controlled textarea with explicit `aria-label` and local validation. The right-side audit timeline/submission history area keeps a bounded `overflow-y: auto` region on mobile instead of being flattened into an unbounded visible block, so it remains scrollable above the sticky review action footer.
- Test results: `cd apps/web && npm run typecheck` passed; `cd apps/web && npm run test -- WorkspaceApp -t "uses a GUI form for manual revise" --testTimeout=30000 --reporter=verbose` passed; `cd apps/web && npm run test -- WorkspaceApp -t "loads manual review queue and submits an approval|uses a GUI form for manual revise|batch finishes published|batch appends tags" --testTimeout=30000 --reporter=verbose` passed, 4 passed / 70 skipped; `git diff --check` passed. Playwright browser checks on `/workspace?page=manual-review` at 390x844, 768x1024, and 1920x1080 found no console error/warning, no local request failure, no `useForm` warning, and 0-1px body-level horizontal overflow. At the mobile breakpoint, `.review-audit-timeline` reports `overflowY: auto` with a bounded height and safe bottom padding.

- Type: frontend mobile adaptation / multimodal dataset, template, mask, and AI regression pass
- Related docs: `goal.md`, `docs/design/mobile-adaptation-plan.md`, `docs/design/pages/owner-production.md`
- Details: Closed the immediate type-check regression in the dataset import/mobile verification path by typing the imported dataset mock as `DatasetPayload` instead of the narrower base fixture type. `DatasetMediaRef` now explicitly accepts `media_type`, matching backend/multimodal payloads and the existing preview parser. The dataset metadata-save mock now treats `rows` as optional, so tests reflect the API contract without clearing imported rows. This keeps data import, dataset detail, multimodal preview, template Designer, ShowItem binding, task publish, and both AI assistants on a shared typed payload path.
- Test results: `cd apps/web && npm run typecheck` passed. `cd apps/web && npm run test -- WorkspaceApp -t "imports and previews enterprise datasets|builds and publishes a multi-tab template" --testTimeout=30000 --reporter=verbose` passed, 2 passed / 72 skipped. `cd apps/web && npm run test -- WorkspaceApp -t "imports and previews enterprise datasets|keeps loaded dataset rows|builds and publishes a multi-tab template|loads rich designer presets|opens the template AI assistant|renders multimodal ShowItem bindings|publishes an enterprise task|opens the task publish AI assistant" --testTimeout=30000 --reporter=verbose` passed, 8 passed / 66 skipped. `cd apps/web && npm run test -- TemplateRenderer.mask --testTimeout=30000 --reporter=verbose` passed, 1 passed. `git diff --check` passed.

- Type: frontend mobile adaptation / Playwright viewport audit and AI modal tightening
- Related docs: `goal.md`, `docs/design/mobile-adaptation-plan.md`
- Details: Ran Playwright CLI viewport audits against the live local frontend/backend. Public pages `/`, `/tasks`, and `/login` were checked at 390x844, 430x932, 768x1024, 1280x800, 1440x900, and 1920x1080 with no body-level horizontal overflow, console error/warning, or requestfailed events; `/login` currently resolves to the homepage login overlay route. Logged-in owner workspace checks covered dashboard, task management, publish task, datasets, templates, AI review, manual review, and resource config. Task management, datasets, and templates show card/list mobile paths at 390px while desktop remains table-oriented. Resource config exposes several force-rendered Ant Design Drawer root nodes, but they have `pointer-events: none`; screenshot inspection confirmed no visual overlay blocking the page.
- Details: Tightened the two AI assistant expanded modals for mobile. `TaskPublishAiAssistant` and `TemplateAiAssistant` now use Ant Design 5 `focusable={{ focusTriggerAfterClose: false }}` instead of deprecated `focusTriggerAfterClose`, and mobile CSS limits the modal root to `calc(100dvh - 16px)` with two equal internal rows using `minmax(0, 1fr)`. This prevents the previous 390px task AI root from exceeding the viewport height.
- Test results: Playwright task-publish AI 390x844 check passed: opened=true, title and clear action visible, modal rect 374x828 inside 390x844, close removes title, overflowX=0, consoleEntries=[]. Playwright template Designer AI 390x844 check passed after entering Designer via the first `修改` action: editClicked=true, opened=true, title and clear action visible, modal rect 374x828, close removes title, overflowX=0. `cd apps/web && npm run typecheck` passed. `cd apps/web && npm run test -- WorkspaceApp -t "opens the template AI assistant|opens the task publish AI assistant" --testTimeout=30000 --reporter=verbose` passed, 2 passed / 72 skipped. `git diff --check` passed.

- Type: frontend mobile adaptation / dataset detail and table editor mobile flow
- Related docs: `goal.md`, `docs/design/mobile-adaptation-plan.md`
- Details: Verified the dataset-management mobile path with Playwright at 390x844. The dataset list card actions expose `修改` and `表格编辑`. The detail path opens via `修改`, retains data preview, multimodal/media wording, field/column/mapping controls, and no body-level horizontal overflow. The table-edit path opens via `表格编辑`, keeps Ant Design Table, Save, fullscreen, save-table, add-row, delete-row, add-column, and delete-column actions reachable on mobile.
- Test results: Playwright dataset flow check passed with `detailClicked=true`, `tableClicked=true`, `detail.overflowX=0`, `tableEditor.hasTable=true`, `tableEditor.hasSave=true`, `tableEditor.hasFullscreen=true`, `tableEditor.overflowX=0`, no console warnings/errors, and no failed requests. Playwright fullscreen check passed with `hasExitFullscreen=true`, `hasTable=true`, `hasSave=true`, `overflowX=0`, and table rect roughly 374x761 inside a 390x844 viewport, confirming the fullscreen space is used by the table instead of a blank gray area.

- Type: frontend mobile adaptation / template Designer mobile panel overlap fix
- Related docs: `goal.md`, `docs/design/mobile-adaptation-plan.md`
- Details: Fixed a real 390px mobile Designer obstruction where the property panel kept the desktop fixed shell height/overflow chain and its ShowItem binding preview visually overflowed over the left material preset area. This made the `图片分类组合` quick-combo button visible but not clickable because pointer events were intercepted by `.property-panel`. The mobile Designer shell now uses a normal vertical flex flow under the 820px breakpoint, and `.designer-workbench-page .survey-designer-shell`, `.designer-canvas`, and `.survey-canvas-list` explicitly reset height/max-height/overflow so palette, canvas, and property panel no longer overlap.
- Test results: Playwright 390x844 Designer chain now reaches the Designer via `修改`, clicks `图片分类组合`, confirms preset content appears, finds description/binding/answer-field/type controls, opens `Renderer 预览`, and reports `overflowX=0`, no console warning/error, and no failed requests. `cd apps/web && npm run typecheck` passed. `git diff --check` passed.

- Type: frontend mobile adaptation / Template Renderer image mask mobile drawing
- Related docs: `goal.md`, `docs/design/mobile-adaptation-plan.md`
- Details: Continued the Template Renderer / 图片 Mask mobile path. `ImageMaskAnnotation` now resolves row-level multimodal media through the shared `WorkspaceMediaPreview` parser, so `media_type` / `kind` / `mime_type` image payloads work the same way as direct `type=image` payloads. Designer Renderer preview sample content now merges a local inline SVG preview image into rows that lack an image field, avoiding blocked external `example.com` preview requests and keeping Mask components drawable during mobile preview. The mobile Renderer toolbar also constrains dataset/row Select controls with `min-width: 0` and single-column wrapping so they no longer widen the preview body.
- Test results: `cd apps/web && npm run test -- TemplateRenderer.mask --testTimeout=30000 --reporter=verbose` passed, 2 passed. `cd apps/web && npm run typecheck` passed. `git diff --check` passed. Playwright 390x844 Designer -> `图片 Mask 标注` -> `Renderer 预览` chain now finds `.image-mask-board`, verifies `touch-action: none`, uses the inline data image without request failures, draws on the board, and confirms the toolbar reaches `1 个标注`; no console warning/error or requestfailed events were recorded. Body-level overflow still reports a 1px reading caused by the workspace top Ant Design menu overflow item clipped outside the viewport, not by the Renderer/Mask body.

- Type: frontend mobile adaptation / task management mobile actions
- Related docs: `goal.md`, `docs/design/mobile-adaptation-plan.md`
- Details: Rechecked the task-management mobile card action path and removed the Ant Design static-modal warning from the high-frequency task status confirmations. Task-management status/info confirmations now prefer `App.useApp().modal` so mobile pause/finish/delete/edit-state dialogs consume the current Ant Design context; a small fallback keeps Vitest/jsdom paths compatible when the context modal API is unavailable. The mobile workspace subnav also constrains its fixed Ant Design menu to `100vw` and hides overflow inside the menu list, keeping horizontal scrolling local to the nav.
- Test results: `cd apps/web && npm run test -- WorkspaceApp -t "batch finishes published and paused tasks from task management|opens task result export drawer|batch appends tags" --testTimeout=30000 --reporter=verbose` passed, 3 passed / 71 skipped. `cd apps/web && npm run typecheck` passed. `git diff --check` passed. Playwright 390x844 task-management check opened the card `更多` menu, confirmed `查看结果 / 导出`, `暂停发放`, and `结束任务` are reachable, opened the result-export drawer with `创建导出任务` visible, then opened the `暂停发放？` confirmation modal in the foreground; no console warning/error or requestfailed events were recorded. A fresh `/tasks` task-square check under the owner session returned only 200 responses for `/labels/tasks` and notifications, so the earlier 403 marketplace risk did not reproduce in this pass.

- Type: frontend mobile adaptation / full-chain viewport verification
- Related docs: `goal.md`, `docs/design/mobile-adaptation-plan.md`
- Details: Continued the mobile adaptation goal after pushing the task-management mobile-action subtask. Public pages `/`, `/tasks`, and `/login` were checked at 390x844, 430x932, 768x1024, 1280x800, 1440x900, and 1920x1080. Logged-in owner workspace checks then covered the correct workspace routes `task-management`, `resource-config`, `publish-task`, `datasets`, `templates`, and `manual-review` at the same six viewports. All checked pages reported `overflowX=0`, no console warning/error, and no requestfailed. Resource-config still has Ant Design force-render Drawer roots in the DOM, but they do not intercept page operation.
- Details: Ran mobile business-chain checks for the remaining high-risk pages. Dataset detail and table editor still expose multimodal/media/field controls, Ant Design Table, save, fullscreen, add-row and add-column actions; fullscreen table uses the released vertical space (`374 x 761` at 390x844). Template Designer can enter from the template card, add the `图片分类组合`, show description/binding/answer-field/type controls, open Renderer preview, and open/close the template AI modal. Image Mask annotation requires the board to be in view; after scrolling the board into view, drawing creates `1 个标注` and keeps `touch-action: none`.
- Details: Rechecked the new task wizard mobile flow. The bottom action area shows `上一步 / 任务发布 AI / 手动保存 / 下一步` without blocking the summary. `分发与奖励` can switch to `指派链接`, show link expiration, and update the publish summary. `人工复审` no longer shows the removed explanatory hint; selecting two Reviewer options displays `审核员百分比分配`, two percentage inputs, `合计 100%`, and summary text `2 人 / 100%`.
- Details: Rechecked manual review submission history at 390x844, 430x932, 768x1024, 1280x800, and 1920x1080. `.review-audit-timeline` exists, uses `overflow-y: auto`, has safe bottom padding, and the page has no body-level horizontal overflow.
- Test results: Playwright CLI checks passed for the routes and flows above with no console warning/error and no requestfailed. After fetching collaborator commits `0ba19fc` and `9a28e6f`, the branch was fast-forwarded and the quick browser regression was repeated for `/`, `/tasks`, `task-management`, `publish-task`, `datasets`, `templates`, `manual-review`, and `resource-config` at 390x844, 1280x800, and 1920x1080; all reported `overflowX=0`, no console warning/error, and no requestfailed. `cd apps/web && npm run typecheck` passed. `git diff --check` passed.
### 2026-06-07

- Type: backend bugfix / labeling-review submission guard sweep
- Related docs: `docs/api/labeling.md`, `docs/api/review-ai-export.md`, `docs/product/REQUIREMENTS_AND_NOTES.md`
- Details: 本轮按“标注与审核链路”方向一次修复 3 个可证明缺陷。其一，`POST /labels/tasks/{task_id}/claim` 只校验请求包大小是否小于可用题量，未校验是否属于任务配置后对外返回的有效 `bundle_options`，导致 Labeler 可领取未配置的任意包大小；现已拒绝不可用包大小并保持题目/提交不变。其二，AI 预审任务提交先写入 `submission/question` 再入队，未在写入前复用任务 AI readiness；Provider 发布后被停用或配置失效时会留下半提交状态。现已在任何状态写入前校验 Provider、模型、input prompt、review matrix 和确认状态，失败返回 `42201` 并保留草稿。其三，`assigned_only=false` 只在审核队列/统计生效，Reviewer 看到同企业未分配提交后无法打开详情、历史和 diff；现读接口支持同名查询参数，默认仍收紧到已分配范围，只有具备 `submission:view` 的当前企业 Reviewer 才能用 `assigned_only=false` 打开未分配提交，审核提交动作不放宽。
- Test results: 先新增并运行红测 `python -m pytest apps/api/tests/test_labeling_claim_deadline.py apps/api/tests/test_labeling_review_round_guards.py apps/api/tests/test_review_history_scope.py -k "bundle_size_outside_configured_options or stale_ai_review_config or unassigned_reviewer_view"`，初始 3 failed，分别证明未配置包大小被领取、AI 配置失效仍提交成功、未分配提交详情返回 403；修复后同一 targeted tests 通过：3 passed / 19 deselected。相关验证：`python -m pytest apps/api/tests/test_labeling_claim_deadline.py -k "bundle_size_outside_configured_options"` 1 passed / 14 deselected；`python -m pytest apps/api/tests/test_labeling_review_round_guards.py apps/api/tests/test_review_history_scope.py apps/api/tests/test_review_queue_visibility.py apps/api/tests/test_ai_review_submission_state.py` 12 passed。默认后端门禁：`python -m pytest apps/api/tests/test_config_security.py` 17 passed；`python -m pytest apps/api/tests/test_auth_team_rbac.py` 97 passed；`python -m compileall apps/api/app` passed；`git diff --check` passed。尝试运行包含新增领取用例的整文件组合时，`test_labeling_claim_deadline.py` 仍有 3 个既有用例失败（finished/rejected task visibility 与 abandon 响应状态口径），本轮未混修。
- Remaining risks: 本轮收紧的是领取包大小、AI 提交前置 readiness 和审核读接口 assigned-only 语义；领取并发的数据库原子性、真正多轮 diff 版本快照、AI worker 调度/重试策略、Reviewer 提交级细粒度指派仍留给后续标注/审核或 AI 预审专项轮次继续覆盖。`test_labeling_claim_deadline.py` 的既有 full-file 失败需要后续单独判定文档口径后处理。下一轮按 sweep 顺序进入导出、上传、审计、通知方向。

- Type: backend bugfix / export-upload-audit-notification sweep
- Related docs: `docs/api/review-ai-export.md`, `docs/product/REQUIREMENTS_AND_NOTES.md`, `docs/planning/TODO.md`
- Details: 本轮按“导出、上传、审计、通知”方向一次修复 3 类可证明缺陷。其一，组织级审计列表和详情仍只要求 `team:read`，Reviewer 可读取企业操作日志，和文档要求的 `team:manage` 不一致；现已将 `/api/v1/audit-logs` 与 `/api/v1/audit-logs/{log_id}` 收紧到当前企业 `team:manage`。其二，企业通知管理列表使用 `member:read`，Labeler 可打开管理面列表并看到非自身目标通知；现已收紧为 `member:invite`，与创建、撤回、删除企业通知的管理权限一致。其三，团队统一上传在 `category=image` 时只保存客户端传入的 content type，未校验文件名推断类型，导致 PDF 可伪装成图片分类上传；现已要求团队图片上传的扩展名与 MIME 同时匹配 JPG/PNG/GIF。同步修正本轮触及测试文件中过期的固定 refresh session 时间为相对有效期，避免日期滚动导致测试失真。
- Test results: 先新增并运行红测：`python -m pytest apps/api/tests/test_audit_log_scope.py -k "reviewer_cannot_list_organization_audit_logs or reviewer_cannot_open_organization_audit_log_detail"` 失败 2 项，证明 Reviewer 可读组织审计；`python -m pytest apps/api/tests/test_auth_team_rbac.py -k "team_image_upload_rejects_spoofed_document_content_type"` 失败 1 项，证明伪装图片上传被接受。修复后同两条 targeted tests 通过。相关测试：`python -m pytest apps/api/tests/test_audit_log_scope.py` 4 passed；`python -m pytest apps/api/tests/test_upload_avatar_validation.py` 2 passed；`python -m pytest apps/api/tests/test_export_review_records.py` 3 passed；`python -m pytest apps/api/tests/test_notification_management_permissions.py` 3 passed。默认后端门禁：`python -m pytest apps/api/tests/test_config_security.py` 13 passed；`python -m pytest apps/api/tests/test_auth_team_rbac.py` 87 passed；`python -m compileall apps/api/app` passed；`git diff --check` passed，仅保留既有 FastAPI `on_event`、`datetime.utcnow()`、passlib/argon2 警告和 Git LF/CRLF 提示。
- Remaining risks: 生产对象存储、完整 MIME sniffing、安全扫描、短期签名 URL、大范围异步审计导出和通知 WebSocket 推送仍属于后续规划项；下一轮按 sweep 顺序进入前端工作台体验，优先覆盖 auth refresh retry、权限回退和 Ant Design 表单/表格真实回归。
### 2026-06-07

- Type: frontend bugfix / workspace permission fallback sweep
- Related docs: `docs/product/REQUIREMENTS_AND_NOTES.md`, `docs/design/mobile-adaptation-plan.md`, `docs/planning/TODO.md`
- Details: 本轮按“前端工作台体验”方向一次修复 3 个可证明权限入口偏差。其一，Reviewer 导航仍展示并允许访问 `announcements` 与 `operation-logs`，但后端组织通知管理列表已要求 `member:invite`、组织审计列表/详情已要求 `team:manage`，点击会落入 403；现 Reviewer 仅保留企业信息、资源配置、人员管理等只读组织入口。其二，Agent 导航仍展示通知和操作日志入口，但 Agent 不具备对应后端管理权限；现 Agent 组织工具只保留资源配置。其三，团队 Labeler 复用 Reviewer 组织管理组，仍可从侧栏和 standalone 子导航进入公告通知/工作日志；现团队 Labeler 组织入口收敛为企业信息、资源配置、人员管理，`WorkspaceApp` 的 standalone 子导航与 `openOperationLogs` 也统一走 `canAccessWorkspacePage`，无权限时回退默认页而不是进入 403 页面。顺手清理 `WorkspaceApp.tsx` 中本轮触碰文件内 3 处只使用 setter 的 unused state 值，使 touched-file eslint 不再产生新增 error。
- Test results: 先更新并运行红测 `npm.cmd run test -- --run src/app/workspaceNavigation.test.tsx`，复现 3 项失败：团队 Labeler 组织组仍含 `announcements/operation-logs`，Reviewer 仍可访问 `announcements/operation-logs`，Agent 仍可访问 `announcements/operation-logs`。修复后同一测试通过，6 passed。相关目标测试 `npm.cmd run test -- --run src/services/apiClient.test.ts src/app/workspaceNavigation.test.tsx` 通过，2 files / 17 passed；`npm.cmd run typecheck` 通过；`npm.cmd run build` 通过，保留既有 `exceljs` direct eval 与 Vite chunk size warning；`git diff --check` 通过。限定本轮文件的 eslint `eslint src/app/workspaceNavigation.tsx src/app/workspaceNavigation.test.tsx src/pages/workspace/WorkspaceApp.tsx` 无 error，仅保留 `WorkspaceApp.tsx` 既有 hook dependency warnings。完整 `npm.cmd run lint` 仍被既有 29 errors / 26 warnings 阻塞，主要在 `EnhancedTable`、`HomePage`、`PlatformApp`、`TaskSquarePage`、`AiReviewPage`、`OperationLogsPage`、`OwnerProductionPages`、`ResourceConfigPage`、`ReviewQueuePage`、`WorkspaceDashboardPage` 等文件；完整 `npm.cmd run test -- --run` 在 5 分钟内未返回结果，本轮未将其作为通过门禁。
- Remaining risks: 需要后续单独 sweep 前端 lint 基线和超大 `WorkspaceApp.test.tsx` 运行时长；下一轮按 sweep 顺序回到认证与安全边界，优先继续找 session/refresh/logout/OAuth/生产配置类真实缺陷。

### 2026-06-07

- Type: backend bugfix / auth-security sweep
- Related docs: `docs/product/REQUIREMENTS_AND_NOTES.md`, `docs/planning/TODO.md`
- Details: 本轮按“认证与安全边界”方向一次修复 3 个可证明缺陷。其一，`/auth/refresh` 只按 refresh token 的 `jti` 查找 `RefreshSession`，未校验命中的 session 是否属于 JWT `sub`，在异常数据或签名密钥泄露后的伪造场景下可能用 A 用户 subject 消费 B 用户 session 并签发 A 的新会话；现已在 rotation 前强制校验 `session.user_id == payload["sub"]`。其二，生产配置只要求前端 OAuth callback 使用公网 HTTPS，未约束 GitHub / Google / Hugging Face provider redirect URI；现已在生产环境对已配置 provider redirect URI 统一要求公网 HTTPS。其三，注册验证码在 `SMTP_ENABLED=false` 时会直接跳过，且生产配置未阻止该组合；现已要求生产启用并完整配置 SMTP，同时服务层仅允许非生产注册流程保留该开发旁路。
- Test results: 先新增并运行红测：`python -m pytest apps/api/tests/test_config_security.py -k "production_requires_smtp_enabled_for_email_verification or production_requires_https_oauth_provider_redirect_uris"` 失败 2 项，证明生产 SMTP 关闭与 OAuth provider HTTP redirect 未被拦截；`python -m pytest apps/api/tests/test_auth_team_rbac.py -k "refresh_rejects_token_when_session_belongs_to_another_user"` 失败 1 项，证明 refresh session/user 不一致仍返回 200。修复后同两组 targeted tests 均通过。默认后端门禁通过：`python -m pytest apps/api/tests/test_config_security.py` 15 passed；`python -m pytest apps/api/tests/test_auth_team_rbac.py` 88 passed；`python -m compileall apps/api/app` passed；`git diff --check` passed，仅保留既有 FastAPI `on_event`、`datetime.utcnow()`、passlib/argon2 和 Git LF/CRLF 提示。
- Remaining risks: 生产 SMTP 配置目前沿用现有 `email_service.validate_smtp_settings()` 的必填项约束；OAuth provider 未配置时不强制要求 redirect URI，后续若改为生产强制启用某 provider，需要在部署文档中补充 provider 级必填项。

### 2026-06-07

- Type: backend bugfix / team-scope permission sweep
- Related docs: `docs/product/REQUIREMENTS_AND_NOTES.md`, `docs/planning/TODO.md`
- Details: 本轮按“团队作用域与权限”方向一次修复 3 个可证明边界缺陷。其一，Team Labeler 继承了 `member:read`，可直接请求 `/teams/{team_id}/members` 枚举企业成员，与 Labeler 只服务当前企业项目、不得进入企业成员治理的边界不一致；现已从 Labeler 默认团队权限中移除 `member:read`。其二，Team Labeler 继承了 `budget:view`，可读取 `/teams/{team_id}/points-budget` 企业积分钱包概览，与资源/预算治理边界不一致；现已从 Labeler 默认团队权限中移除 `budget:view`。其三，通知收件人预览 `/notifications/preview` 仅要求 `member:read`，Reviewer 可枚举企业广播/角色/成员收件范围；现已收紧为 `member:invite`，与企业通知管理列表、创建、撤回和删除权限保持一致。
- Test results: 先新增并运行红测：`python -m pytest apps/api/tests/test_auth_team_rbac.py -k "team_labeler_cannot_list_team_members or team_labeler_cannot_view_points_budget"` 失败 2 项，证明 Team Labeler 可读成员列表和积分预算；`python -m pytest apps/api/tests/test_notification_management_permissions.py -k "reviewer_cannot_preview_team_notification_recipients"` 失败 1 项，证明 Reviewer 可预览收件人范围。修复后同两组 targeted tests 均通过。相关验证：`python -m pytest apps/api/tests/test_notification_management_permissions.py` 4 passed。默认后端门禁通过：`python -m pytest apps/api/tests/test_config_security.py` 15 passed；`python -m pytest apps/api/tests/test_auth_team_rbac.py` 90 passed；`python -m compileall apps/api/app` passed；`git diff --check` passed，仅保留既有 FastAPI `on_event`、`datetime.utcnow()`、passlib/argon2 警告和 Git LF/CRLF 提示。
- Remaining risks: 前端旧测试 mock 中仍可能手写 Labeler 的旧权限集合；真实会话权限来自后端 `permissions_for_team_role("labeler")`，本轮先收紧 API 边界，后续前端工作台轮次可清理 mock 权限样例。

### 2026-06-07

- Type: backend bugfix / production-chain guard sweep
- Related docs: `docs/product/REQUIREMENTS_AND_NOTES.md`, `docs/planning/TODO.md`
- Details: 本轮按“生产链路”方向一次修复 3 个可证明状态/版本边界缺陷。其一，任务题目导入解析后没有复用题目内容非空校验，`[{}]` 这类空题目可进入草稿并污染后续发布检查；现已对导入后的每一行执行 `normalize_question_content`，失败时返回带行号的 `row_errors`。其二，草稿题目更新接口允许写入 `claimed/submitted/approved/rejected` 等运行期状态和 `assigned_to`，绕过领取、提交、审核状态机；现已禁止草稿生产编辑预置运行期状态和领取人，仅保留题目内容编辑与必要的 `pending` 清理。其三，模板 schema 归一化会把不支持的 `schema_version` 静默改成当前版本，导致 readiness 无法拦截未知模板版本；现已保留不支持版本号并标记 `unsupported_schema_version`，由模板发布检查阻断。
- Test results: 先新增并运行红测：`python -m pytest apps/api/tests/test_task_production_guards.py -k "task_question_import_rejects_empty_rows or draft_question_update_rejects_runtime_status_mutation or template_publish_rejects_unsupported_schema_version"` 失败 3 项，证明空题目导入、草稿题目状态伪造和不支持 schema 版本发布均未被拦截；修复后同一 targeted tests 通过，3 passed / 3 deselected。相关验证：`python -m pytest apps/api/tests/test_task_production_guards.py` 6 passed。默认后端门禁通过：`python -m pytest apps/api/tests/test_config_security.py` 15 passed；`python -m pytest apps/api/tests/test_auth_team_rbac.py` 90 passed；`python -m compileall apps/api/app` passed。Warnings 仅为既有 FastAPI `on_event`、`datetime.utcnow()` 和 passlib/argon2 deprecation 提示。
- Remaining risks: 题目导入列映射目前只校验内容对象非空，仍可后续单独巡检“映射源列缺失但目标字段为 null”的更细粒度导入质量问题；模板 schema 仅阻断不支持版本，老版本到当前版本的兼容归一化保持既有行为。

### 2026-06-07

- Type: backend bugfix / labeling-review workflow sweep
- Related docs: `docs/product/REQUIREMENTS_AND_NOTES.md`, `docs/planning/TODO.md`
- Details: 本轮按“标注与审核链路”方向一次修复 3 个可证明状态/校验缺陷。其一，领取题目后只递增 `claimed`，没有同步 `pending` 和其他题目统计，导致任务统计在领取后保留旧的待领取数；现在领取成功后复用 `sync_task_question_stats` 重算题目状态，并让统计同步函数保留 `pending`。其二，AI 预审幂等键只按 `submission_id` 生成，多轮打回重提会复用上一轮已完成 job，新的答案不会创建本轮预审记录；现在第 2 轮及以后把 `current_round` 写入幂等键，且先校验 submission 仍为 `submitted` 再复用已有 job。其三，人工审核 `revise` 可直接写入 Reviewer 修改后的答案并通过结算，但未复用模板运行时校验；现在直接修订入库前使用绑定模板版本校验 `revised_answers`，失败时拒绝并保持原提交不变。
### 2026-06-08

- Type: team governance guard / unique team admin
- Related docs: `docs/product/REQUIREMENTS_AND_NOTES.md`, `docs/api/team-profile.md`, `docs/architecture/SYSTEM_ARCHITECTURE.md`
- Details: 收紧企业管理员约束为“每企业唯一 `team_admin`”。后端成员服务统一拦截新增第二个 `team_admin` 的入口，覆盖添加已有成员、创建成员账号、邀请码、批量导入、接受邀请、单人改角色和批量改角色；同时阻止把唯一 `team_admin` 禁用、改角色或删除。前端人员管理页同步移除 `team_admin` 的可选操作入口，保留列表展示但不再允许在表单、批量操作或导入提示中把成员设为 `team_admin`。
- Test results: `npm.cmd run typecheck` 通过；`python -m pytest apps/api/tests/test_auth_team_rbac.py -k "second_team_admin or unique_team_admin or import_new_team_admin_member_is_skipped_when_team_admin_exists"` 8 passed；`python -m compileall apps/api/app` 通过。补跑 `python -m pytest apps/api/tests/test_auth_team_rbac.py -q` 时仍有 4 个既有失败，分别在 `test_review_batch_history_diff_and_stats`、`test_ai_review_submission_enqueues_job_when_enabled`、`test_email_confirm_does_not_consume_reset_password_code`、`test_oauth_register_duplicate_username_keeps_bind_email_code_usable`，与本轮唯一管理员约束改动无直接关系。
- Remaining risks: 当前仍没有独立的管理员移交流程；如果后续需要显式更换企业管理员，应新增受审计的 transfer 流程，而不是放开普通成员管理入口。

- Test results: 先新增并运行红测 `python -m pytest apps/api/tests/test_labeling_review_round_guards.py -q`，复现 3 项失败：领取后 `pending` 仍为旧值、多轮重提未创建新 AI 预审 job、非法 `revised_answers` 可被 `revise` 接受。修复后同一 targeted tests 通过，3 passed。相关验证中 `python -m pytest apps/api/tests/test_review_task_reward_points.py apps/api/tests/test_ai_review_submission_state.py apps/api/tests/test_labeling_review_guards.py -q` 随组合运行通过；`python -m pytest apps/api/tests/test_labeling_claim_deadline.py -q` 当前仍有 3 个相邻基线失败，集中在 finished/rejected 任务回显和 abandon payload 状态，未纳入本轮 3-bug 修复范围。默认后端门禁通过：`python -m pytest apps/api/tests/test_config_security.py -q` 15 passed；`python -m pytest apps/api/tests/test_auth_team_rbac.py -q` 90 passed；`python -m compileall apps/api/app` passed；`git diff --check` passed，仅保留 Git LF/CRLF 提示和既有 FastAPI/datetime/passlib 警告。
- Remaining risks: 本轮仅收紧同步统计、AI 预审轮次幂等和 Reviewer 直接修订校验；领取并发锁粒度、AI worker 持久化调度、审核 diff 的跨轮基线仍留给后续标注/审核轮次继续巡检。
### 2026-06-07

- Type: backend bugfix / export-notification-upload guard sweep
- Related docs: `docs/product/REQUIREMENTS_AND_NOTES.md`, `docs/planning/TODO.md`
- Details: 本轮按“导出、上传、审计、通知”方向一次修复 3 个可证明边界缺陷。其一，结果导出在未传 `filters.status` 时会导出同任务下所有题目，包含仍在审核中的 `submitted` 数据，与“审核通过后数据进入可导出状态 / Owner 可导出已通过数据”的口径不一致；现默认导出范围收紧为 `approved`。其二，任务通知虽然要求 `related_entity_id`，但服务层仍把 `target_type=task` 回退为全企业 active 成员可见；现按任务 owner、reviewer、已分配题目和已有提交的 Labeler 解析收件人，并把解析后的 `target_user_ids` 固化到通知。其三，团队 `category=document` 上传只校验大小和权限，不校验扩展名/MIME，导致可执行文件可作为企业文档上传；现团队文档/认证材料上传要求 PDF 扩展名与 MIME 同时匹配。
- Test results: 先新增并运行红测 `python -m pytest apps/api/tests/test_export_notification_upload_guards.py -q`，复现 3 项失败：默认导出混入 submitted 行、无关团队成员可见任务通知、`payload.exe` 可作为 document 上传。修复后同一 targeted tests 通过，3 passed。相关全量 `python -m pytest apps/api/tests/test_export_review_records.py apps/api/tests/test_notification_management_permissions.py apps/api/tests/test_upload_avatar_validation.py apps/api/tests/test_export_notification_upload_guards.py -q` 通过，12 passed。默认后端门禁通过：`python -m pytest apps/api/tests/test_config_security.py -q` 15 passed；`python -m pytest apps/api/tests/test_auth_team_rbac.py -q` 90 passed；`python -m compileall apps/api/app` passed；`git diff --check` passed，仅保留 Git LF/CRLF 提示和既有 FastAPI/datetime/passlib 警告。
- Remaining risks: 导出创建仍缺显式 idempotency key 和异步队列；团队 dataset/template/media 类上传仍需按各自业务格式继续细分 MIME/扩展名白名单；通知的 review/export 完成提醒仍在 TODO 中。

### 2026-06-07

- Type: frontend bugfix / workspace experience guard sweep
- Related docs: `docs/product/REQUIREMENTS_AND_NOTES.md`, `docs/design/FRONTEND_DESIGN_STYLE.md`, `docs/planning/TODO.md`
- Details: 本轮按“前端工作台体验”方向一次修复 3 个可证明偏差。其一，后端已将企业认证材料上传收紧为 PDF 扩展名和 MIME 双校验，但组织信息页仍未限制选择器，也未在本地拦截非 PDF 文件，导致用户可发起必然失败的上传请求；现已为认证材料 Upload 增加 `.pdf,application/pdf` accept，并在 beforeUpload 中按扩展名和 MIME 拦截。其二，任务相关企业通知要求绑定具体任务 ID，但前端 preview/create 直接透传输入框内容，`"  task-1  "` 会作为不同 ID 发给后端；现已在预览和发送前统一 trim 关联对象标识，空白字符串按缺失处理，表单校验也使用 trim 后结果。其三，顶部个人信箱预览只拉取 5 条，但标记预览项已读/星标后用这 5 条重算全量 summary，导致未读徽标从服务端汇总数错误缩水；现改为基于被更新的单条通知对服务端 summary 做增量修正。
- Test results: 先新增并运行红测：`npm.cmd run test -- --run src/pages/workspace/WorkspaceApp.test.tsx -t "blocks non-PDF organization verification materials before upload"` 初始失败，证明认证材料 input 缺少 accept 且无效文件可进入上传流程；`npm.cmd run test -- --run src/pages/workspace/WorkspaceApp.test.tsx -t "trims task notification related ids before previewing and sending"` 初始失败，证明 preview 收到带空格的 `related_entity_id`；`npm.cmd run test -- --run src/components/layout/SiteNav.test.tsx -t "keeps the inbox badge total after marking a preview item read"` 初始失败，证明未读汇总被局部预览重算。修复后三条 targeted tests 均通过。相关验证：`npm.cmd run test -- --run src/components/layout/SiteNav.test.tsx` 12 passed；`npm.cmd run test -- --run src/pages/workspace/WorkspaceApp.test.tsx -t "organization profile|notification|personal inbox"` 6 passed / 72 skipped；`npm.cmd run typecheck` passed；`npm.cmd run build` passed，保留既有 `exceljs` direct eval 与 chunk size warning；`git diff --check` passed，仅有 Git LF/CRLF 提示。完整 `npm.cmd run lint` 仍被既有 23 errors / 26 warnings 阻塞，主要分布在 `EnhancedTable`、`HomePage`、`PlatformApp`、`TaskSquarePage`、`AiReviewPage`、`LabelerDashboardPage`、`OperationLogsPage`、`OwnerProductionPages`、`ResourceConfigPage`、`ReviewQueuePage`、`WorkspaceDashboardPage` 等非本轮文件；完整 `npm.cmd run test -- --run` 运行 5 分钟超时未返回结果。
- Remaining risks: 前端 lint 基线和全量 Vitest 超时仍需后续独立 sweep；组织资料 Logo、dataset/template/media 等其他业务上传入口仍应按各自格式继续巡检；通知表单本轮只收紧任务 ID 标准化，review/export/system 类通知的自动触发和可见范围仍按后续导出/通知轮次继续覆盖。

### 2026-06-07

- Type: backend bugfix / labeling-review queue and AI review lifecycle sweep
- Related docs: `docs/api/review-ai-export.md`, `docs/product/REQUIREMENTS_AND_NOTES.md`, `docs/planning/TODO.md`
- Details: 本轮按“标注与审核链路”方向一次修复 3 个可证明缺陷。其一，批量人工审核的 schema 允许 `decision=revise` 携带 `revised_answers`，但服务层只把 `decision/comment` 传给单条审核逻辑，导致批量直接修订必然失败；现在批量审核会透传 `revised_answers`，与单条 `revise` 契约一致。其二，审核队列 `reviewer_id` 过滤只匹配 `task.reviewer_ids`，漏掉通过 `TeamMember.assigned_review_tasks` 正式分派给 Reviewer 的任务；现在过滤同时识别任务 reviewer 列表和 active 成员分派表。其三，AI 预审 retry/worker 执行只按 job 状态处理，缺少 job-task-question-submission 作用域、提交状态和当前轮次幂等键校验，已审核完成的旧提交可被重新入队，错配 job 也可能释放错误提交到人工队列；现在 retry 和 worker 入口共用当前性校验，仅允许同作用域、仍为 `submitted`、且 idempotency key 匹配当前审核轮次的 job 继续处理。
- Test results: 先新增并运行红测：`python -m pytest apps/api/tests/test_labeling_review_round_guards.py -k "batch_review_revise_applies_revised_answers"` 失败 1 项，证明批量修订 `success_count=0`；`python -m pytest apps/api/tests/test_review_queue_visibility.py -k "reviewer_filter_includes_member_assigned_tasks"` 失败 1 项，证明 reviewer_id 过滤漏掉成员分派任务；`python -m pytest apps/api/tests/test_ai_review_submission_state.py -k "retry_rejects_completed_job_after_submission_left_review or process_rejects_job_with_mismatched_submission_scope"` 失败 2 项，证明已审核提交可重试、错配 job 可执行。修复后上述 targeted tests 均通过：1 passed、1 passed、2 passed。相关验证：`python -m pytest apps/api/tests/test_labeling_review_round_guards.py apps/api/tests/test_review_queue_visibility.py apps/api/tests/test_ai_review_submission_state.py apps/api/tests/test_labeling_review_guards.py` 12 passed；默认后端门禁：`python -m pytest apps/api/tests/test_config_security.py` 15 passed，`python -m pytest apps/api/tests/test_auth_team_rbac.py` 93 passed，`python -m compileall apps/api/app` passed，`git diff --check` passed，仅保留既有 FastAPI `on_event`、`datetime.utcnow()`、passlib/argon2 警告和 Git LF/CRLF 提示。
- Remaining risks: 本轮收紧的是批量修订、审核队列分派过滤、AI 预审 job 当前性校验；AI worker 的持久化调度、Provider 失败重试策略、审核 diff 的跨轮版本基线仍留给后续标注/审核或 AI 预审专项继续巡检。下一轮按 sweep 顺序进入导出、上传、审计、通知方向。

### 2026-06-07

- Type: backend bugfix / notification delivery boundary sweep
- Related docs: `docs/api/review-ai-export.md`, `docs/product/REQUIREMENTS_AND_NOTES.md`, `docs/planning/TODO.md`
- Details: 本轮继续按“导出、上传、审计、通知”方向一次修复 3 个可证明通知边界缺陷。其一，`target_type=team/role` 通知的收件范围应由企业成员和角色规则推导，但创建时仍会持久化并回显客户端夹带的 `target_user_ids`，可把外企业用户 ID 暴露给可见接收人；现在全企业和角色通知不再存储或返回任意 `target_user_ids`，只有 member/task 通知固化解析后的目标用户。其二，系统 `agent` 是只读内置成员，但角色/成员通知预览会把 `team_role=agent` 或 `is_system_member=true` 的成员计入收件人，创建时也可向系统 Agent 分发人工通知；现在预览、创建和个人可见性统一排除系统 Agent 与历史 `team_role=agent` 记录。其三，通知模型接受 `expire_at`，设计稿要求到期后进入已过期状态，但后端状态仍返回 `unread/read` 且 `status=expired` 筛不到；现在过期通知仍保留历史可见性，状态口径返回 `expired`，摘要未读数和状态筛选同步按该口径计算。
- Test results: 先新增并运行红测：`python -m pytest apps/api/tests/test_export_notification_upload_guards.py -k "target_user_ids or system_agent_members or expired_notifications"` 失败 3 项，分别证明 team/role 通知回显外部 `target_user_ids`、系统 Agent 被角色预览计入、过期通知仍返回 `unread`。修复后同一 targeted tests 通过，3 passed / 3 deselected。相关全量：`python -m pytest apps/api/tests/test_export_notification_upload_guards.py apps/api/tests/test_notification_management_permissions.py apps/api/tests/test_audit_log_scope.py apps/api/tests/test_upload_avatar_validation.py` 16 passed。默认后端门禁通过：`python -m pytest apps/api/tests/test_config_security.py` 15 passed；`python -m pytest apps/api/tests/test_auth_team_rbac.py` 93 passed；`python -m compileall apps/api/app` passed；`git diff --check` passed，仅保留既有 FastAPI `on_event`、`datetime.utcnow()`、passlib/argon2 警告和 Git LF/CRLF 提示。
- Remaining risks: 本轮只收紧通知分发候选、公开 payload 和过期状态口径；通知 WebSocket 推送、系统/审核/导出自动提醒生成、企业级通知策略、dataset/template/media 上传格式白名单和大范围异步审计导出仍留给后续导出/上传/审计/通知或专项轮次继续覆盖。下一轮按 sweep 顺序进入前端工作台体验方向。

### 2026-06-07

- Type: frontend bugfix / workspace announcement and inbox status sweep
- Related docs: `docs/design/FRONTEND_DESIGN_STYLE.md`, `docs/design/pages/organization-announcements.md`, `docs/planning/TODO.md`
- Details: 本轮按“前端工作台体验”方向一次修复 3 个可证明偏差。其一，后端通知状态已支持 `expired`，但个人信箱 helper 不认识该状态，且本地汇总仍按 `is_read=false` 把过期通知计入未读、处理入口也未排除过期通知；现在个人信箱状态标签补齐 `已过期`，本地汇总只统计 `status=unread`，过期/撤回/删除通知不再视为可处理。其二，公告通知页状态筛选缺少 `已过期`，过期通知在表格和详情中只能显示原始 `expired`，且状态筛选 onChange 会用旧闭包里的 status 发起请求；现在列表、详情、表格筛选和服务端查询都支持 `status=expired`，选择状态时立即使用新值请求。其三，新建企业通知 Modal 仍把系统 Agent 作为人工角色选项，也在指定成员下拉中展示系统 Agent；现在角色选择仅保留 Owner/Reviewer/Labeler，指定成员选项排除 `team_role=agent` 或 `is_system_member=true` 的系统成员。
- Test results: 先新增并运行红测：`npm.cmd run test -- --run src/pages/workspace/personalInboxHelpers.test.ts src/pages/workspace/WorkspaceApp.test.tsx -t "expired notifications|expired announcements|system agent"` 失败，证明 helper 缺少 `expired` 标签、公告页缺少已过期展示/筛选、收件人角色下拉仍展示 Agent。修复后精准 targeted tests 通过：`npm.cmd run test -- --run src/pages/workspace/personalInboxHelpers.test.ts src/pages/workspace/WorkspaceApp.test.tsx -t "treats expired notifications as expired instead of unread or handleable|filters expired announcements with the expired status option|excludes system agent from announcement role and member recipient selectors"`，3 passed / 78 skipped。相关验证：`npm.cmd run test -- --run src/pages/workspace/personalInboxHelpers.test.ts src/components/layout/SiteNav.test.tsx src/pages/workspace/WorkspaceApp.test.tsx -t "announcements|personal inbox|SiteNav|personalInboxHelpers"` 18 passed / 75 skipped；限定本轮文件 `npm.cmd exec eslint -- src/pages/workspace/AnnouncementsPage.tsx src/pages/workspace/personalInboxHelpers.ts src/pages/workspace/personalInboxHelpers.test.ts src/pages/workspace/WorkspaceApp.test.tsx src/types/api.ts` passed；`npm.cmd run typecheck` passed；`npm.cmd run build` passed，保留既有 `exceljs` direct eval 与 chunk size warning；`git diff --check` passed，仅有 Git LF/CRLF 提示。完整 `npm.cmd run lint` 仍被既有 23 errors / 26 warnings 阻塞；完整 `npm.cmd run test -- --run` 运行 5 分钟超时。
- Remaining risks: 前端 lint 基线、超大 Vitest 全量运行时长、公告通知的 WebSocket 实时推送、review/export/system 自动提醒触发和更完整的移动端公告通知视觉复测仍需后续轮次覆盖。下一轮按 sweep 顺序回到认证与安全边界。

### 2026-06-07

- Type: backend bugfix / auth-security configuration and OAuth email trust sweep
- Related docs: `docs/api/auth.md`, `docs/api/team-profile.md`, `docs/planning/TODO.md`
- Details: 本轮按“认证与安全边界”方向一次修复 3 个可证明缺陷。其一，OAuth 注册仅检查 provider 的 `email_verified` 布尔值，未要求 provider 同时返回具体邮箱；当第三方档案出现 `email_verified=true` 但 `email=None` 时，用户可提交任意邮箱并绕过 `bind_email` 验证码完成注册。现在只有 `trusted_profile_email()` 能解析出“已验证且存在”的邮箱时才免验证码，否则必须提交邮箱并通过 `bind_email` 验证码。其二，生产配置声称要求 public HTTPS URL，但 `FRONTEND_OAUTH_CALLBACK_URL` 仍接受 `https://10.0.0.8/...` 这类私网 HTTPS 地址；现在公网 URL 校验会拒绝私网、loopback、link-local、reserved、multicast 和 unspecified IP 主机。其三，`FRONTEND_APP_URL` 用于拼接企业邀请链接，但生产配置允许带 path 的 `https://app.example.com/console`，会生成错误 invite URL；现在生产 `FRONTEND_APP_URL` 必须是公网 HTTPS origin，且不得包含 userinfo、path、query 或 fragment。
- Test results: 先新增并运行红测：`python -m pytest apps/api/tests/test_auth_team_rbac.py -k "provider_verified_flag_has_no_email"` 失败 1 项，证明 OAuth 注册会无验证码创建 `spoofed-oauth-email@example.com`；`python -m pytest apps/api/tests/test_config_security.py -k "private_https_frontend_oauth_callback_url or frontend_app_url_must_be_origin"` 失败 2 项，证明私网 callback 和带 path 的 frontend origin 未被拒绝。修复后上述 targeted tests 均通过：OAuth 1 passed，配置 2 passed。默认后端门禁通过：`python -m pytest apps/api/tests/test_config_security.py` 17 passed；`python -m pytest apps/api/tests/test_auth_team_rbac.py` 94 passed；`python -m compileall apps/api/app` passed；`git diff --check` passed，仅保留 Git LF/CRLF 提示和既有 FastAPI `on_event`、`datetime.utcnow()`、passlib/argon2 警告。
- Remaining risks: 本轮收紧的是 OAuth 邮箱信任条件和生产 URL 形态校验；后续仍应继续覆盖 OAuth state/ticket 在多进程部署中的持久化、一致性和 provider 级生产必填项策略。

### 2026-06-07

- Type: backend bugfix / export-audit CSV safety sweep
- Related docs: `docs/api/review-ai-export.md`, `docs/product/REQUIREMENTS_AND_NOTES.md`, `docs/planning/TODO.md`
- Details: 本轮按“导出、上传、审计、通知”方向一次修复 3 个可证明缺陷。其一，结果导出 CSV 会直接写出用户答案中以 `=`、`+`、`-`、`@` 开头的字符串，下载后可能被电子表格软件解释为公式；现已在 CSV 渲染阶段统一加前置单引号转义，不影响 JSON/JSONL 和已使用 inline string 的 Excel 输出。其二，审计日志 CSV 导出会直接写出 User-Agent 等请求字段，同样可能形成公式型单元格；现已对审计 CSV 数据行复用同一转义逻辑。其三，`fields_config.rename` 可把多个已选源字段映射到同一输出列名，后写字段会静默覆盖先写字段；现已在导出行生成时拒绝空/非字符串 rename 目标和目标列名冲突，返回 `40002` 且不创建导出任务。
- Test results: 先新增并运行红测：`python -m pytest apps/api/tests/test_export_review_records.py -k "formula_like_answer_values or rename_collisions"` 初始失败 2 项，证明结果导出 CSV 未转义公式型答案且 rename 冲突仍创建任务；`python -m pytest apps/api/tests/test_audit_log_scope.py -k "audit_csv_export_escapes_formula_like_user_agent"` 初始失败 1 项，证明审计 CSV 未转义公式型 User-Agent。修复后同两组 targeted tests 均通过。相关全量：`python -m pytest apps/api/tests/test_export_review_records.py apps/api/tests/test_audit_log_scope.py apps/api/tests/test_export_notification_upload_guards.py -q` 16 passed。默认后端门禁：`python -m pytest apps/api/tests/test_config_security.py -q` 17 passed；`python -m pytest apps/api/tests/test_auth_team_rbac.py -q` 97 passed；`python -m compileall apps/api/app` passed；`git diff --check` passed，仅保留 Git LF/CRLF 提示和既有 FastAPI `on_event`、`datetime.utcnow()`、passlib/argon2 警告。
- Remaining risks: 本轮仅处理 CSV 公式注入与 rename 列覆盖；导出日期时区过滤、导出创建幂等、大范围异步审计导出、dataset/template/media 上传格式白名单和 review/export 自动通知仍留给后续导出/上传/审计/通知轮次继续覆盖。
### 2026-06-07

- Type: backend bugfix / team RBAC permission boundary sweep
- Related docs: `docs/api/team-profile.md`, `docs/product/REQUIREMENTS_AND_NOTES.md`, `docs/planning/TODO.md`
- Details: 本轮按“团队作用域与权限”方向一次修复 3 个可证明缺陷。其一，`POST /teams/{team_id}/members` 添加已有用户时可给 `team_role=labeler` 夹带 `team:manage` 等高权限，形成角色名为 Labeler 但能力为管理员的成员。其二，`POST /teams/{team_id}/members/accounts` 创建成员账号时同样可给低角色写入 `budget:manage` 等超出目标角色的权限。其三，`POST /teams/{team_id}/invite` 可把越权 `permissions` 固化到邀请码，用户接受后获得超出 `team_role` 的企业治理能力。现在显式 `permissions` 必须是目标角色默认权限的子集；未显式提交时仍使用目标角色默认权限。修复同时覆盖成员更新和历史邀请接受，避免旧入口或旧邀请继续带入越权权限。
- Test results: 先新增并运行红测 `python -m pytest apps/api/tests/test_auth_team_rbac.py -k "permissions_outside_target_team_role"`，复现 3 项失败，分别证明添加已有成员、创建成员账号和邀请成员都会接受越权权限；修复后同一 targeted tests 通过，3 passed / 94 deselected。默认后端门禁通过：`python -m pytest apps/api/tests/test_config_security.py` 17 passed；`python -m pytest apps/api/tests/test_auth_team_rbac.py` 97 passed；`python -m compileall apps/api/app` passed；`git diff --check` passed，仅保留 Git LF/CRLF 提示和既有 FastAPI `on_event`、`datetime.utcnow()`、passlib/argon2 警告。
- Remaining risks: 本轮收紧的是成员权限集合与目标企业角色的上界；后续仍需继续巡检 Owner/Reviewer/Labeler 在各业务 API 上的实际可见范围，以及系统 Agent 在资源治理和通知链路中的只读边界。

### 2026-06-07

- Type: backend bugfix / auth onboarding and OAuth email-code boundary sweep
- Related docs: `docs/api/auth.md`, `docs/product/REQUIREMENTS_AND_NOTES.md`
- Details: 本轮按“认证与安全边界”方向一次修复 3 个可证明缺陷。其一，`POST /api/v1/auth/onboarding/complete` 未限制只能由 `pending` 用户调用，已完成身份分流的 Labeler 可重入接口并尝试改写为需求方/创建企业；现在非 `pending` 用户直接返回状态冲突，且不创建企业或成员关系。其二，需求方创建企业路径先把 pending 用户改为 `admin` 再创建企业，企业名冲突等失败路径会留下已提权账号；现在企业创建成功后才更新全局角色，失败时保持 `pending`。其三，OAuth 旧补绑邮箱接口在目标邮箱不存在账号时会先消费 `bind_email` 验证码再提示改走显式注册，导致前端随后调用 `/oauth/register-account` 无法复用同一验证码；现在 bind-email 先校验但不消费验证码，只有确认可绑定到已有活跃账号后才消费。
- Test results: 先新增并运行红测 `python -m pytest apps/api/tests/test_auth_team_rbac.py -k "onboarding_rejects_non_pending_user_without_role_change or onboarding_create_failure_keeps_pending_role or oauth_bind_email_failure_keeps_code_usable_for_explicit_register"`，修复前 3 failed，分别证明非 pending onboarding 返回 200、企业创建失败后用户变为 `admin`、失败补绑后显式 OAuth 注册返回 400。修复后同一 targeted tests 通过，3 passed / 97 deselected。默认后端门禁通过：`python -m pytest apps/api/tests/test_auth_team_rbac.py` 100 passed；`python -m pytest apps/api/tests/test_config_security.py` 17 passed；`python -m compileall apps/api/app` passed；`git diff --check` passed。
- Remaining risks: 本轮收紧的是 onboarding 重入/失败原子性和 OAuth bind-email 验证码消费时机；OAuth ticket 的多进程持久化、一致性、provider 级生产必填项策略，以及 session/refresh/logout 的更细粒度边界仍留给后续认证专项继续覆盖。下一轮按 sweep 顺序进入团队作用域与权限方向。

### 2026-06-07

- Type: backend bugfix / team explicit-permission narrowing sweep
- Related docs: `docs/api/team-profile.md`, `docs/product/REQUIREMENTS_AND_NOTES.md`
- Details: 本轮按“团队作用域与权限”方向一次修复 3 个可证明缺陷。其一，`POST /teams/{team_id}/members` 添加已有成员时虽然允许把 Reviewer 权限显式收窄为 `team:read`，但运行时鉴权又把 Reviewer 默认 `member:read` 并回去，成员仍可枚举企业成员。其二，`POST /teams/{team_id}/members/accounts` 创建成员账号时存在同样问题，显式收窄权限只体现在成员记录返回值，不影响后续 API 鉴权。其三，`POST /teams/{team_id}/invite` 创建的收窄权限邀请码在接受后也会被角色默认权限放大。现在成员与邀请记录会标记显式权限收窄，`get_current_user` 在有该标记时只使用持久化权限；历史未标记记录继续按角色默认权限兼容。
- Test results: 先新增并运行红测 `python -m pytest apps/api/tests/test_auth_team_rbac.py -k "add_member_respects_explicit_permission_narrowing or create_member_account_respects_explicit_permission_narrowing or invitation_accept_respects_explicit_permission_narrowing"`，修复前 3 failed，分别证明添加已有成员、创建成员账号、邀请码接受三个入口都会把显式收窄的 Reviewer 放大到可访问成员列表。修复后同一 targeted tests 通过，3 passed / 100 deselected。默认后端门禁通过：`python -m pytest apps/api/tests/test_auth_team_rbac.py` 103 passed；`python -m pytest apps/api/tests/test_config_security.py` 17 passed；`python -m compileall apps/api/app` passed；`git diff --check` passed。
- Remaining risks: 本轮收紧的是显式成员权限收窄的运行时生效语义；历史无标记成员记录仍按角色默认权限兼容，若生产中存在需要收窄的旧成员，应通过成员更新接口重新保存一次权限以写入标记。下一轮按 sweep 顺序进入生产链路方向。

### 2026-06-08

- Type: frontend navigation / reviewer AI review access
- Related docs: `docs/product/REQUIREMENTS_AND_NOTES.md`, `docs/architecture/SYSTEM_ARCHITECTURE.md`, `docs/design/pages/reviewer-manual-review.md`
- Details: Reviewer 工作台侧栏的 `审核质检` 分组新增 `AI预审` 入口，并继承 `ai-review` / `ai-review-task` 的权限兜底；Reviewer 仍不显示 Owner 数据生产链路或资源配置入口。产品基线和 Reviewer 页面设计稿同步更新为 `AI预审 + 人工审核` 的审核质检入口结构。
- Test results: `cd apps/web && npm run test -- src/app/workspaceNavigation.test.tsx --testTimeout=15000` 通过，7 passed；`cd apps/web && npm run typecheck` 通过；`git diff --check` passed。
- Remaining risks: 本轮只调整 Reviewer 侧栏可见入口和前端权限兜底，不改变 AI 预审任务页的数据范围、API 权限或人工审核提交权限。

### 2026-06-08

- Type: frontend/backend behavior / task distribution and internal labeler assignment
- Related docs: `docs/product/REQUIREMENTS_AND_NOTES.md`, `docs/api/production.md`, `docs/api/labeling.md`, `docs/api/review-ai-export.md`, `docs/architecture/SYSTEM_ARCHITECTURE.md`, `docs/design/pages/owner-task-management.md`, `docs/planning/TODO.md`
- Details: 任务发布分发与奖励语义按新需求收敛：活跃前端只展示 `包大小分配` 和 `企业内流转`，独立 `指派链接` 入口移除；分享链接转为包大小分配下的 `assignment.enabled/expire_hours` 开关。企业内流转隐藏积分奖励与费用估算，保存 0 积分口径，并支持在发布/编辑流程中指定企业内 active Labeler；任务管理行级更多菜单新增 `分配企业 Labeler` Modal，调用 `PUT /api/v1/tasks/{task_id}/internal-labelers` 后写审计日志。后端同步校验 `assignment.target_labeler_ids` 只能是当前企业 active、非系统成员的 Labeler，并在任务广场/资质检查/领取接口按目标 Labeler 范围过滤。
- Details: 修复企业内 Labeler 可绕过 `X-Team-ID` 的公开任务领取风险。现在服务端基于 `team_members` 判断当前用户是否为任务所属企业 active Labeler，而不是只看请求是否携带企业头；企业内 Labeler 即使走个人公开入口，也看不到、查不了资质、领不了本企业发布的 `first_come_all` 公开积分任务。任务发布 AI 助手提示词也更新为只主动生成 `first_come_all` / `quota_grab`，`assigned_link` 仅保留历史兼容。
- Test results: `conda run -n markup-api python -m pytest apps/api/tests/test_labeling_claim_deadline.py -k "public_market_hides_internal_and_assigned_link_tasks or team_labeler_cannot_claim_public_reward_task_from_own_team or internal_flow_target_labelers_restrict_visibility_and_claim"` 通过，3 passed / 20 deselected；`conda run -n markup-api python -m pytest apps/api/tests/test_auth_team_rbac.py -k "update_task_internal_labelers_endpoint_validates_active_team_labelers"` 通过，1 passed / 129 deselected；`conda run -n markup-api python -m compileall apps/api/app` 通过；`cd apps/web && npm run typecheck` 通过；`git diff --check` passed。
- Remaining risks: 本轮覆盖分发策略、企业内 Labeler 指定和公开积分任务领取边界；任务发布 AI 助手真实 Provider 输出仍需在接入真实模型后继续观察，`assigned_link` 历史落地页兼容链路未作为本轮主路径复测。

### 2026-06-08

- Type: frontend behavior / template designer quick presets
- Related docs: `docs/design/pages/owner-template-designer.md`
- Details: 模板搭建页左侧栏移除 `加载测试模板` 入口，避免测试用模板出现在 Owner 日常搭建路径。常用组合从直接追加改为高风险覆盖操作：点击后先弹出 Ant Design 确认弹窗，提示会清空当前页签已有物料并同步移除相关联动规则；用户点击 `确认覆盖` 后才用该组合重建当前页签内容，点击取消不改变画布。
- Test results: `cd apps/web && npm run test -- src/pages/workspace/WorkspaceApp.test.tsx -t "confirms before replacing canvas content with a designer preset" --testTimeout=40000` 通过，1 passed / 92 skipped；`git diff --check` passed。后续任务发布分发类型已收敛，`cd apps/web && npm run typecheck` 已重新通过。
- Remaining risks: 本轮只调整常用组合的覆盖确认与测试模板入口；模板 AI、手动拖拽、单物料添加和保存发布链路未改动。

### 2026-06-08

- Type: frontend content / public help manual completion
- Related docs: `docs/markup_requirements.md`, `docs/MarkUp-说明文档/README.md`, `docs/product/REQUIREMENTS_AND_NOTES.md`, `docs/planning/TODO.md`
- Details: 按核心交付需求和当前交付说明完善公开 `/help` 帮助手册知识源 `apps/web/src/pages/help/helpContent.json`。本轮从轻量角色说明扩展为 9 个章节、14 个 FAQ，覆盖平台完整链路、账号/onboarding/OAuth/信箱、个人与企业 Labeler、任务广场领取、模板 Renderer 作答、Owner 任务发布向导、数据集导入与多模态 Manifest、模板 Designer/Renderer/版本、AI 预审、人工审核、结果导出、审计、企业会员/积分钱包/AI Provider、操作日志与故障排查。同步移除过期的“生产资源开关”和“AI 预审真实 worker 建设中”口径，继续保持 `/help` 只面向终端用户，不承载平台运营、API、部署或开发者文档。
- Test results: `cd apps/web && npm run test -- --run src/pages/help/HelpPage.test.tsx --testTimeout=30000` 通过，4 passed；`cd apps/web && npm run typecheck` 通过；`node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync('apps/web/src/pages/help/helpContent.json','utf8')); console.log([d.meta.updated_at,d.sections.length,d.faqs.length,d.nav.length].join(' '));"` 输出 `2026-06-08 9 14 9`。
- Remaining risks: 帮助手册只同步当前已面向终端用户可解释的产品能力；平台运营后台、API、部署、本地启动和开发者说明继续留在 `docs/MarkUp-说明文档/` 与活跃 `docs/` 文档中，不暴露到公开 `/help`。若后续 AI Worker、Function Calling、review_records 多轮快照或导出异步队列能力继续增强，需要再同步公开帮助口径。
## 2026-06-09

- 类型：任务管理业务规则修正 / 暂停发放
- 内容：修正组织任务管理页“暂停发放”的业务规则。此前后端 `POST /tasks/{task_id}/status` 的 `pause` 仍复用了旧守卫，前端确认弹窗也把存在 `claimed/rejected` 数据视为不可暂停，导致与最新业务口径冲突。现在暂停发放只停止新的领取，不再因已领取未完成、待审核或打回待修改数据而拒绝暂停；这些数据继续按原链路提交、审核和结算。同步移除前端暂停弹窗中的错误阻断提示，并更新生产接口文档与页面设计稿。
- 测试结果：补充前端回归用例，覆盖“存在 claimed/rejected 题目时仍可暂停发放”；后端 targeted test 同步改为断言可暂停。已执行 `python -m pytest apps/api/tests/test_task_production_guards.py -k "pause_allows_claimed_or_rejected_questions"`、`npm --prefix apps/web run test -- --run src/pages/workspace/WorkspaceApp.test.tsx -t "allows pausing a published task that still has claimed or rejected questions"` 和 `npm --prefix apps/web run typecheck`。
- 剩余风险：本轮只修正暂停发放语义，不改变结束任务对 `claimed/submitted/rejected` 的阻断，也不调整任务修改边界中“收集中任务需先暂停后再编辑”的既有规则。

- 类型：前后端缺陷修复 / 模板 Designer 联动条件
- 内容：排查并修复模板搭建 Designer 中选项类组件作为联动触发字段时条件不生效的问题。根因是 Designer 的“联动匹配值”允许手填可见文案，而 Renderer 和后端运行时答案保存的是 `option.value`，导致 Owner 配置看似正确但运行时无法匹配；同时切换触发字段时旧的 `source_component_id/field/when_field` 别名可能残留。现在选项类触发字段改为下拉选择真实 `option.value`，切换触发字段会清理旧别名并默认选中首个选项值；共享 Renderer 与 `POST /templates/validate` 同步支持 value/label 别名匹配，兼容已经误存 label 的历史 schema。
- 测试结果：`npm.cmd --prefix apps/web run typecheck` 通过；`cd apps/web; npx.cmd vitest run src/pages/workspace/WorkspaceApp.test.tsx -t "applies template linkage rules in the shared renderer" --testTimeout=30000` 通过；`cd apps/web; npx.cmd vitest run src/pages/workspace/WorkspaceApp.test.tsx -t "matches option labels in template linkage rules for legacy designer values" --testTimeout=30000` 通过；`cd apps/web; npx.cmd vitest run src/pages/workspace/WorkspaceApp.test.tsx -t "builds and publishes a multi-tab template from the enterprise designer" --testTimeout=60000` 通过；`python -m pytest apps/api/tests/test_auth_team_rbac.py -q -k "template_schema_versioning_and_runtime_rules_are_stable_after_task_publish"` 通过。
- 剩余风险：本轮只修复单条基础条件显示规则的值匹配和历史兼容；多条件组合、联动校验和自定义表达式仍按 TODO 继续排期。

- 类型：前端缺陷修复 / 任务管理只读详情
- 内容：修正任务管理中收集中任务点击“查看”被“请先暂停发放”弹窗阻断的问题。任务状态机仍保持收集中任务不能直接修改，但 `openEdit` 不再阻止进入详情页；收集中、待审核和已结束任务进入同一任务详情页面，以“只读查看”Tag 和说明 Alert 标识，隐藏保存按钮，并继续禁用发布配置、题目新增/导入/删除等写操作。已暂停任务仍保留只允许修改描述、富文本说明和标签的能力。
- 测试结果：`npm.cmd --prefix apps/web run typecheck` 通过；`cd apps/web; npx.cmd vitest run src/pages/workspace/WorkspaceApp.test.tsx -t "opens published tasks in a readonly detail view" --testTimeout=30000` 通过；`git diff --check` 通过。
- 剩余风险：本轮只修复 Owner 任务管理详情入口和只读表达，不改变后端 `PUT /tasks/{task_id}` 的修改边界。

- 类型：前端视觉修复 / 题目预览技术信息
- 内容：修正任务管理题目预览弹窗中“技术信息”区域层级过重的问题。题目 ID 不再使用 `WorkspaceTechnicalInfo` 的折叠面板和 Descriptions 容器，改为一行轻量 `WorkspaceSecondaryCode`；同时将 `.task-question-preview` 的卡片样式选择器从所有嵌套 `div` 收窄到摘要 `dl` 的直接子项，避免内部内容被重复套边框。
- 测试结果：`cd apps/web; npx.cmd vitest run src/pages/workspace/WorkspaceApp.test.tsx -t "opens published tasks in a readonly detail view" --testTimeout=30000` 通过；`git diff --check` 通过。`npm.cmd --prefix apps/web run typecheck` 当前被既有 `apps/web/src/features/ai/providerConfigShared.tsx` 类型错误阻断：`TS2367 number | "low" | "high" | "auto"` 与空字符串比较无交集，本轮未改该文件。
- 剩余风险：本轮只处理任务题目预览弹窗；AI 预审和操作日志抽屉仍保留折叠式技术信息，用于隐藏低频内部 ID。

### 2026-06-08

- Type: frontend styling / task owner transfer modal
- Related docs: `docs/design/pages/owner-task-management.md`
- Details: 任务管理页 `转交负责人` 弹窗的目标负责人候选框补齐满行布局。Ant Design `Select showSearch` 在未选择负责人、仅展示 placeholder 时也固定占满短表单整行，不再按空值内容收缩。
- Test results: `cd apps/web && npm run test -- src/pages/workspace/WorkspaceApp.test.tsx -t "transfers task owner from task management row actions" --testTimeout=40000` 通过，1 passed / 92 skipped；`git diff --check` passed。`cd apps/web && npm run typecheck` 当前被同文件既有企业 Labeler 配额分配草稿阻塞，错误集中在缺失 `normalizeLabelerAllocations` / `buildLabelerAllocationPayload` 等符号，本轮未扩大修复该分发配置链路。
- Remaining risks: 本轮只修复转交负责人 Select 的空值布局和测试断言；候选加载、权限校验、owner-transfer API 和企业 Labeler 分发配置未改动。

### 2026-06-08

- Type: frontend/backend behavior / internal Labeler allocation percentages
- Related docs: `docs/product/REQUIREMENTS_AND_NOTES.md`, `docs/api/production.md`, `docs/architecture/SYSTEM_ARCHITECTURE.md`, `docs/design/pages/owner-task-management.md`, `docs/planning/TODO.md`
- Details: 新建任务页 `分发与奖励` 的企业内流转候选收紧为当前企业 active、非系统成员的 Labeler，不再把任意已选 ID 回填成候选。选择多位 Labeler 时，原公开任务资质字段区域改为每位 Labeler 的任务分配百分比，沿用人工复审多 Reviewer 的百分比分配交互，前端和后端均要求覆盖所有已选 Labeler 且合计 `100%`；单人默认 `100%`，未指定 Labeler 表示所有企业 active Labeler 可见可领。草稿编辑和任务管理行级 `分配企业 Labeler` 弹窗同步保存 `assignment.target_labeler_allocations`，企业内流转保存时继续清空公开资质门槛并使用 0 积分口径。
- Test results: `cd apps/web && npm run typecheck` 通过；`cd apps/web && npm run test -- src/pages/workspace/WorkspaceApp.test.tsx -t "updates internal labeler assignment with allocation percentages from row actions|creates and publishes a task with reviewer allocations" --testTimeout=50000` 通过，1 passed / 93 skipped；`cd apps/web && npm run test -- src/pages/workspace/WorkspaceApp.test.tsx -t "publishes an enterprise task with ShowItem column mapping and assignment link" --testTimeout=50000` 通过，1 passed / 93 skipped；`conda run -n markup-api python -m pytest apps/api/tests/test_auth_team_rbac.py -k "update_task_internal_labelers"` 通过，1 passed / 129 deselected；`conda run -n markup-api python -m compileall apps/api/app` 通过；`git diff --check` 通过。
- Remaining risks: 本轮覆盖发布向导、草稿编辑数据结构、行级分配弹窗、API schema 与后端归一化校验；完整前端 lint/build 和全量测试未在本轮作为门禁重跑，当前工作树仍包含多处本轮无关的既有改动与未跟踪文件，提交前需精确挑选本轮相关文件。

### 2026-06-08

- Type: frontend bugfix / internal Labeler candidate filtering
- Related docs: `docs/product/REQUIREMENTS_AND_NOTES.md`, `docs/api/production.md`, `docs/design/pages/owner-task-management.md`
- Details: 新建任务页和任务管理行级 `分配企业 Labeler` 弹窗在读取 `GET /teams/{team_id}/members?role=labeler&status=active` 后，前端状态入口继续执行 active Labeler 过滤，只保留 `team_role=labeler`、成员 active、用户 active、非系统成员的企业 Labeler。即使接口或测试 mock 返回混入 Reviewer、Owner、disabled Labeler 或系统 Agent，下拉候选、摘要和分配比例区域也不会展示或保留这些成员。
- Test results: `cd apps/web && npm run typecheck` 通过；`cd apps/web && npm run test -- src/pages/workspace/WorkspaceApp.test.tsx -t "publishes an enterprise task with ShowItem column mapping and assignment link" --testTimeout=50000` 通过，1 passed / 93 skipped；`cd apps/web && npm run test -- src/pages/workspace/WorkspaceApp.test.tsx -t "updates internal labeler assignment with allocation percentages from row actions" --testTimeout=50000` 通过，1 passed / 93 skipped；`git diff --check` 通过。
- Remaining risks: 本轮只收紧前端成员候选状态入口，不改变 `/teams/{team_id}/members` API shape、后端成员查询或 `PUT /tasks/{task_id}/internal-labelers` 校验逻辑；完整前端 lint/build 和全量测试未在本轮重跑。

### 2026-06-08

- Type: backend/frontend behavior / template publish readiness warning cleanup
- Related docs: `docs/api/production.md`, `docs/design/pages/owner-template-designer.md`
- Details: 模板发布检查不再返回或展示 Renderer 预览建议类警告。Renderer 预览仍保留为独立入口和手动校验工具，但未运行预览不再作为发布检查弹窗的 warning 项。
- Test results: `cd apps/web && npm run typecheck` 通过；`conda run -n markup-api python -m compileall apps/api/app` 通过；已确认旧 Renderer 预览 warning key 和旧用户可见文案不再存在于代码或活跃 API/设计文档。尝试运行 `cd apps/web && npm run test -- src/pages/workspace/WorkspaceApp.test.tsx -t "builds and publishes a multi-tab template from the enterprise designer" --testTimeout=40000` 时，当前工作树中该历史长链路用例在进入发布检查弹窗前就因找不到旧的 `单选进入答案` 按钮失败，本轮不扩大修复该 Designer 选择器问题。
- Remaining risks: 本轮只删除发布检查弹窗的 Renderer 预览提示，不改变模板 Renderer 页面、运行时校验或模板发布阻塞规则。

### 2026-06-08

- Type: frontend behavior / task owner transfer modal
- Related docs: `docs/design/pages/owner-task-management.md`
- Details: 任务管理页 `转交负责人` 弹窗移除说明型 Alert，不再展示“负责人转交只迁移任务 owner...”文案。目标负责人从自由文本输入改为企业内可转交负责人候选列表，前端加载当前企业 active Team Admin 与 Owner，使用 Ant Design `Select showSearch` 选择目标用户并继续提交原有 `target_owner_id`。
- Test results: `cd apps/web && npm run test -- src/pages/workspace/WorkspaceApp.test.tsx -t "transfers task owner from task management row actions" --testTimeout=40000` 通过，1 passed / 92 skipped；`git diff --check` passed。
- Remaining risks: 本轮只调整转交弹窗前端候选交互；`POST /tasks/{task_id}/owner-transfer` API shape、权限校验、审计写入和任务状态机未改动。

### 2026-06-09

- Type: frontend routing bugfix / Platform Admin workspace entry
- Related docs: `docs/REQUIREMENTS_AND_NOTES.md`, `docs/design/FRONTEND_DESIGN_STYLE.md`, `docs/design/pages/auth-entry.md`
- Details: 确认平台测试账号后端 `users.global_role`、登录响应和 JWT 均为 `platform_admin`，问题出在前端允许 Platform Admin 手动停留在 `/workspace`，工作台权限兜底会落到个人工具视角。现在 `/workspace` 路由识别到平台权限后直接 replace 到 `/platform`，与登录成功、顶栏工作台入口和平台设计稿保持一致。
- Test results: `PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin npm --prefix apps/web run test -- src/app/App.test.tsx --run -t "platform admins away from workspace|non-pending login|pending users" --testTimeout=40000` 通过，4 passed / 11 skipped；`PATH=/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin npm --prefix apps/web run typecheck` 通过；`git diff --check` 通过。Vitest 保留既有 jsdom `getComputedStyle` / canvas 未实现提示。
- Remaining risks: 本轮只修复 Platform Admin 入口分流，不改变平台后台页面内容、API 权限或企业/Labeler 工作台分流。

### 2026-06-09

- Type: backend bugfix / template material registry alignment
- Related docs: `docs/api/production.md`, `docs/design/pages/owner-template-designer.md`
- Details: 对齐模板 Designer 前端物料与后端发布检查注册表。后端 `REGISTERED_TEMPLATE_COMPONENT_TYPES` 补齐 `Scale` 和 `Ranking`，模板搭建 AI 的 `SUPPORTED_COMPONENT_TYPES` 与提示词也同步补齐这两类物料；任务难度评估的选择类组件统计将 `Scale` 和 `Ranking` 计入 choice component。修复后量表评分和排序题不再在模板发布检查中被误判为“未注册组件类型”阻塞。
- Test results: 本机没有 `conda` 命令，使用 `/Users/HIN/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3` 创建临时 Python 3.12 venv 并按 `apps/api/requirements.txt` 安装依赖后验证。`/tmp/markup-api-test-venv-new/bin/python -m pytest apps/api/tests/test_auth_team_rbac.py -k "template_readiness_accepts_all_designer_material_types"` 通过，1 passed / 132 deselected；`/tmp/markup-api-test-venv-new/bin/python -m pytest apps/api/tests/test_template_assistant_prompt.py` 通过，1 passed；`/tmp/markup-api-test-venv-new/bin/python -m compileall apps/api/app` 通过；`git diff --check` 通过。
- Remaining risks: 本轮只修复物料注册表与发布检查/模板 AI 支持列表的一致性，不扩大 Labeler 提交侧对 `Scale`、`Ranking` 答案值的运行时语义校验；完整后端测试套件未在本轮重跑。

### 2026-06-10

- Type: frontend/backend bugfix / task publish return and AI schema alignment
- Related docs: `docs/api/review-ai-export.md`, `docs/design/pages/owner-task-management.md`, `docs/design/pages/owner-template-ai-assistant.md`, `docs/design/pages/owner-task-publish-ai-assistant.md`
- Details: 新建/草稿任务发布成功后，发布向导在完成 `POST /tasks/{task_id}/publish`、关闭发布检查和提示成功后自动返回任务管理列表，避免 Owner 继续停留在已发布任务的创建向导中。模板搭建 AI 的前端应用白名单补齐 `Scale` / `Ranking`，与后端注册物料和提示词一致；模板 AI 和任务发布 AI 在点击应用时会比较应用前后 schema/draft 指纹，若所选建议无法匹配当前 schema 或发布向导字段，不再提示成功，而是保留变更并展示错误。任务发布 AI 上下文新增当前模板的精简 `templateSchema` 摘要，后端 prompt 明确该 schema 只用于 ShowItem、答案字段、物料类型和 AI 预审语义对齐，禁止输出模板结构变更；同时把生成字段约束收敛到发布向导可应用的 `share_enabled`、`internal_labeler_ids`、`reviewer_ids`、`ai_review_matrix` 等字段，并在前端兼容少量任务 API payload 风格字段。
- Test results: `PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin npm --prefix apps/web run test -- src/pages/workspace/TemplateAiAssistant/changeUtils.test.ts src/pages/workspace/TaskPublishAiAssistant/changeUtils.test.ts --run --testTimeout=30000` 通过，2 files / 2 tests passed；`/tmp/markup-api-test-venv-new/bin/python -m pytest apps/api/tests/test_template_assistant_prompt.py apps/api/tests/test_task_publish_assistant_prompt.py` 通过，2 passed；`PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin npm --prefix apps/web run typecheck` 通过；`PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin npm --prefix apps/web run test -- src/pages/workspace/WorkspaceApp.test.tsx -t "publishes an enterprise task with ShowItem column mapping and assignment link" --run --testTimeout=60000` 通过，1 passed / 98 skipped；`PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin npm --prefix apps/web run test -- src/pages/workspace/WorkspaceApp.test.tsx -t "opens the task publish AI assistant and applies generated basic info changes|opens the template AI assistant and applies a generated field change" --run --testTimeout=60000` 通过，2 passed / 97 skipped；`/tmp/markup-api-test-venv-new/bin/python -m compileall apps/api/app` 通过；`git diff --check` 通过。
- Remaining risks: 本轮收紧的是发布成功导航、AI 输出契约和前端应用反馈；真实 Provider 的结构化输出稳定性仍需结合线上模型继续观察，后续如 AI Gateway 支持 JSON Schema / function calling，应把当前 prompt 约束升级为服务端结构化输出 schema。
