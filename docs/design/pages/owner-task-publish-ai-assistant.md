# 任务发布 AI 浮窗助手设计稿

## 1. 功能概述

`MarkUp 任务发布 AI` 是任务管理中新建/修改任务向导内的操作型 AI 助手。它服务 Owner / Team Admin 在发布任务时，通过自然语言生成、补全、修改和检查任务发布配置。助手不能直接发布任务，也不能绕过 readiness 检查；所有 AI 输出必须先转换为结构化“待应用变更”，由用户查看、勾选、预览并点击 `应用` 后才写入当前发布向导表单。

该能力复用现有 AI 基线：

- Provider 来源：企业可见的 `GET /api/v1/ai-resources/configs?team_id={team_id}`，仅展示可用 Provider，不额外暴露模型选择。
- 调用方式：后端通过 AI Resources 的 Provider 生成封装调用模型，记录 AI 调用日志和审计日志。
- 上传能力：附件复用 `POST /api/v1/uploads`，发送给任务发布 AI 的是上传后的 `file_id`、文件名、URL 和 MIME 信息。
- UI 基线：Ant Design 原生组件，沿用模板搭建 AI 的悬浮入口、左右分栏、变更确认、预览和应用机制，视觉跟任务管理浅蓝色工作台保持一致。第一版避免在任务发布浮窗内引入 `@ant-design/x` 消息/发送器组件，降低 closed drawer 或动态 sender 在工作台内反复挂载导致的运行时循环风险。

## 2. 页面入口

入口只出现在任务管理的 `新建任务` / `修改任务` 发布向导页面，不出现在任务管理列表页或任务详情只读页。

入口形态：

- 页面底部中央固定一个胶囊形悬浮输入框。
- 左侧显示 AI 图标，按 Provider 选择动态兜底：
  - 平台共享 Provider：显示 MarkUp 平台 AI 标识。
  - 企业自配 Provider 且 Agent 有图标：显示 Agent 图标。
  - 企业自配 Provider 无 Agent 图标但企业有 logo：显示企业 logo。
  - 仍不可用时：显示默认 AI 标识。
- 中间播放动态打字 placeholder，例如 `试试说：帮我创建一个图片分类标注任务`。
- 右侧为发送图标。用户可直接输入并发送，也可点击入口打开完整面板。
- 浮窗层级高于向导主体，但不得遮挡底部 `上一步 / 手动保存 / 下一步 / 发布任务` 的主要操作；必要时底部偏移上移。

### 2.1 打字动画

任务发布 AI 的提示语不是静态 placeholder，而是持续播放拟真打字动画：

- 输入框内始终显示闪烁光标。
- 光标前方逐字出现提示文字，光标跟随在句子末尾。
- 文字完整显示后停留约 12 秒。
- 停留结束后逐字反向删除，直到回到空状态。
- 删除完成后空白停顿约 1.5 秒，再切换到下一条提示语继续播放。
- hover、focus 或用户开始输入时暂停动画；用户清空输入并失焦后恢复动画。

## 3. 前端交互流程

1. 用户进入任务管理，点击 `新建任务` 或修改草稿任务。
2. 发布向导底部出现 `MarkUp 任务发布 AI` 悬浮输入框。
3. 用户点击入口或直接输入指令，打开居中的 AI 弹窗。
4. 左侧显示欢迎语：`你好！我是任务发布 AI 助手，请告诉我你想创建或优化什么标注任务。`
5. 右侧默认显示 `你说 AI 做` 引导态，首屏展示三条快捷指令：
   - `帮我创建一个图片分类标注任务`
   - `根据当前模板和数据集补全发布配置`
   - `帮我检查发布前还有哪些阻塞项`
6. 用户发送消息后，左侧展示用户气泡和 AI loading，右侧展示思考态。
7. 后端返回结构化变更后，左侧展示摘要与后续建议，右侧进入 `变更` 标签。
8. 用户可勾选/取消变更、展开查看 before/after、风险提示和依赖提示。
9. 用户切换到 `预览` 标签，查看“当前草稿 + 已勾选变更”的任务发布配置预览。
10. 用户点击 `应用`，前端将已勾选变更写入当前向导本地状态。
11. 现有发布摘要、费用估算、当前步骤阻塞项和自动保存草稿逻辑自然刷新。
12. AI 对话追加系统反馈：`已应用 x 项变更到当前任务发布配置。`

## 4. 组件拆分

第一版组件放在 `apps/web/src/pages/workspace/TaskPublishAiAssistant/`：

| 组件/文件 | 职责 |
| --- | --- |
| `TaskPublishAiAssistant` | 对外入口，接收 team、当前任务上下文、Provider、上传和应用回调。 |
| `useTypingPlaceholder` | 可复用模板 AI 的打字节奏，使用任务发布提示语。 |
| `changeUtils` | 将已勾选结构化变更应用到任务发布草稿上下文。 |
| `types` | 任务发布 AI 消息、上下文、变更、props 类型。 |
| `TaskPublishAiAssistant.css` | 复用模板 AI 浮窗布局并补充任务发布预览样式。 |

由于现有模板 AI 尚未抽成通用组件，任务发布 AI 第一版复用交互模式和样式基线，不强行抽象模板 schema 与任务表单两套不同应用逻辑。打字 placeholder 已按 12 秒完整停留、1.5 秒空白停顿的节奏实现，并将悬浮入口拆成子组件，避免打字动画刷新整棵弹窗树。

## 5. 数据结构

结构化变更：

```ts
type AiTaskPublishChange = {
  id: string
  type:
    | 'update_basic_info'
    | 'update_template_dataset'
    | 'update_field_mapping'
    | 'update_distribution'
    | 'update_reward'
    | 'update_ai_review'
    | 'update_human_review'
    | 'update_agreement'
    | 'fix_readiness_blocker'
    | 'update_publish_check'
  step:
    | 'basic_info'
    | 'template_dataset'
    | 'distribution_reward'
    | 'ai_review'
    | 'human_review'
    | 'agreement'
    | 'readiness_check'
  title: string
  description?: string
  before?: unknown
  after?: Record<string, unknown>
  riskLevel?: 'low' | 'medium' | 'high'
  dependencies?: string[]
  selected: boolean
  expanded?: boolean
}
```

任务发布草稿上下文包含：

- `basicInfo`：标题、描述、分类多选、难度、标签、截止、领取后完成时限。
- `templateAndData`：模板、数据集、`row_count`、ShowItem 映射，以及当前模板的精简 `templateSchema`。该 schema 只用于理解 ShowItem、答案字段、物料类型和 AI 预审输入，不允许任务发布 AI 返回模板结构变更。
- `distributionAndReward`：分发策略、资质、奖励模式、标注员实际获得积分、企业预计支付、平台手续费。
- `aiReview`：Provider、维度、Input 字段说明、评分矩阵、矩阵确认状态、阈值。
- `humanReview`：Reviewer 列表和每人预计分配量。
- `agreement`：协议要求、默认模板、自定义文本、协议文件。
- `readiness`：前端本地阻塞项、后端 readiness 结果、是否可发布。
- `autoSave`：草稿 ID、自动保存状态和本地保存状态。

## 6. API 设计

新增接口：

```http
POST /api/v1/ai/task-publish-assistant/chat
```

请求字段：

- `provider_id?: string`
- `workspace_id: string`
- `team_id?: string`
- `draft_task_id?: string`
- `current_task_draft: TaskPublishDraftContext`
- `message: string`
- `attachments?: Array<{ id; name; url?; type? }>`
- `conversation_id?: string`

响应字段：

- `conversation_id`
- `message`
- `reasoning?`
- `changes: AiTaskPublishChange[]`
- `suggestions?: string[]`
- `usage?`
- `provider?`
- `fallback?: "mock" | "provider_parse_failed"`
- `readiness_preview?`
- `cost_preview?`

第一版不新增 `apply-ai-changes` 后端接口。应用变更只写前端本地状态，随后沿用现有 `createTask/updateTask` 草稿保存和 `getTaskReadiness` 发布前检查。

生成约束：

- 后端提示词必须明确 `templateAndData.templateSchema` 仅用于对齐发布配置，不允许返回 `create_field`、`delete_field`、`update_field` 等模板助手变更。
- AI 返回的 `after` 字段必须使用发布向导能应用的字段名，例如 `share_enabled`、`expire_hours`、`internal_labeler_ids`、`internal_labeler_allocations`、`reviewer_ids`、`review_allocations`、`ai_review_matrix`。
- 字段映射只能写入 `after.mapping`，key 为当前 ShowItem id，value 为数据集列名或 `null`。
- AI 预审建议必须使用当前模板答案字段语义生成评分矩阵，矩阵项至少包含 `key`、`dimension`、`definition`、`scoring_standard`、`deduction_rule`、`reject_condition`、`manual_condition`。

## 7. Provider 复用方案

- Provider 列表复用任务发布页已有 `listAiProviderConfigs(team.team_id)` 结果。
- Provider 选择只暴露 Provider，不暴露模型。若后端调用需要模型，使用 Provider 默认模型。
- 平台共享 Provider 扣费仍由 AI Resources 的调用封装处理。
- Provider 不可用或返回不可解析时，后端返回明确 `fallback` 的结构化兜底方案，保证前端交互可完整验证。

## 8. 任务发布变更应用方案

前端应用只允许修改当前发布向导状态：

- 基础信息：写入 `form.title`、`form.description`、`category_values`、`difficulty`、`tag_items`、`deadline`、`completion_hours`。
- 模板与数据：写入 `form.template_id`、`form.dataset_id`，必要时清空或更新 `mapping`。
- 字段映射：写入 `mapping`。
- 分发与奖励：写入 `distribution`、资质、`reward_mode`、`points_per_item`、`total_points`。
- AI 预审：写入 `ai_enabled`、`ai_provider_id`、维度、Input 字段说明、矩阵、阈值和矩阵确认状态。
- 人工复审：写入 `reviewer_ids` 与 `review_allocations`。
- 用户协议：写入 `agreement_required`、`agreement_use_default`、`agreement_text`、`agreement_file_name`。
- 兼容字段：若 Provider 按任务 API payload 风格返回 `assignment`、`reward_rule`、`review_config`、`ai_config`、`agreement_config`、`claim_config`，前端会尽量映射到上述发布向导字段，但生成约束仍优先要求直接使用向导字段。

不能应用：

- 直接发布任务。
- 直接绕过 readiness。
- 写入后端草稿但不经过现有保存逻辑。
- 改变现有 API shape。
- 输出模板 schema 结构变更。
- 已勾选变更应用后没有任何表单或映射差异时提示成功。

## 9. 与自动保存草稿的关系

AI 应用变更只调用 `setForm` / `setMapping`。现有 `draftFingerprint`、`hasDraftContent` 和 `saveDraft({ autoSaved: true })` effect 会检测状态变化，并按原逻辑自动保存为 `auto_saved=true`。手动保存和确认发布仍会写回 `auto_saved=false`。

如果自动保存失败，AI 助手只提示“本地已应用但自动保存失败需手动保存”，不自行重试保存。

## 10. 与 readiness 检查的关系

任务发布 AI 不绕过 readiness：

- 弹窗预览展示当前本地 `publishIssues` 和后端 `readiness` 摘要。
- 应用变更后，`publishIssues` 由现有计算逻辑刷新。
- 后端 `getTaskReadiness` 仍只在发布前检查流程中触发，避免 AI 应用时产生额外草稿保存副作用。

## 11. 与发布摘要的关系

发布摘要仍由当前 `TaskPublishWorkspacePage` 的 `form`、`mapping`、`rewardCost`、`selectedTemplate`、`selectedDataset`、`selectedAiDimensions` 等派生数据渲染。AI 应用变更后这些状态更新，摘要自然同步，不新增第二套摘要计算。

AI 预览态可复用相同上下文结构做只读 `Descriptions` / `Tag` / `Alert` 展示，避免复制完整向导表单。

## 12. 权限与安全

- API 使用 `require_permissions("task:manage")`。
- `workspace_id` 必须和当前企业上下文一致。
- Provider 必须属于当前企业或平台共享且处于启用状态。
- 附件只传引用 ID，不把大文件内容直接塞入请求。
- 后端提示词只要求模型输出结构化 JSON，不展示内部系统提示词。
- 高风险变更（奖励、数据集、协议、禁用审核、Reviewer 分配）必须在变更卡片中展示 `riskLevel`。
- 所有生成操作写入审计日志，包含用户、team、draftTaskId、provider、change_count 和 fallback。

## 13. 异常处理

- Provider 未配置：显示 `当前工作区暂未配置可用 AI Provider，请联系管理员配置。`
- 点数不足：沿用 AI Resources 的错误信息，显示为 Ant Design `Alert`。
- 请求超时：显示 `AI 响应超时，请稍后重试。`
- 返回不可解析：后端返回 `fallback=provider_parse_failed` 的结构化兜底方案。
- 无变更：显示 `未识别到需要修改的任务发布配置，你可以尝试描述得更具体一些。`
- 应用失败：保留变更列表，允许重试。
- 未应用变更关闭：使用 `Modal.confirm` 二次确认。
- 依赖缺失：变更详情中展示依赖提示，例如未选数据集时无法应用字段映射。

## 14. 需要确认的问题

1. 企业自配 Provider 的 Agent 图标当前前端类型中没有独立字段，第一版只能使用企业 logo 或默认 AI 标识兜底；后续如需 Agent 图标，需要扩展 Provider payload。
2. 第一版是否允许 AI 自动选择模板/数据集：可以通过 `template_id` / `dataset_id` 应用，但需要后端只返回当前企业可见 ID；如果模型只返回名称，前端只做预览提示，不模糊匹配跨企业资源。
3. `readiness_preview` 第一版由后端基于请求上下文粗略生成，真实发布仍以 `getTaskReadiness` 为准。
