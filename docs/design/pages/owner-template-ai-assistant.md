# 模板搭建 AI 浮窗助手设计稿

## 1. 功能概述

`MarkUp 模版搭建 AI` 是模板 Designer 内的操作型 AI 助手。它服务 Owner 在搭建标注模板时，通过自然语言生成、修改、优化模板 schema。助手不能绕过用户确认直接写入画布；所有 AI 输出必须先转换为结构化“待应用变更”，由用户查看、勾选、预览并点击 `应用` 后才写入当前 Designer 状态。

该能力复用平台现有 AI 基线：

- Provider 来源：企业可见的 `GET /api/v1/ai-resources/configs?team_id={team_id}`，包含企业自配 Provider 与平台共享 Provider。
- 调用方式：后端通过 AI Resources 的 Provider 生成封装调用模型，记录 AI 调用日志和审计日志。
- 上传能力：附件使用现有 `POST /api/v1/uploads`，发送给模板助手的是上传后的 `file_id`、文件名、URL 和 MIME 信息。
- UI 基线：Ant Design + `@ant-design/x`，延续模板 Designer 的固定视口、浅蓝 AI 信息色和图标化操作。

## 2. 页面入口

入口仅出现在 `模板搭建` 的 Designer 子页面，不出现在模板列表页或 Renderer 预览页。

入口形态：

- 页面底部中央固定一个胶囊形悬浮输入框。
- 输入框左侧显示 AI 图标，按 Provider 选择动态兜底：
  - 平台共享 Provider：显示 MarkUp 平台 logo。
  - 企业自配 Provider 且 Agent 有图标：显示 Agent 图标。
  - 企业自配 Provider 无 Agent 图标但企业有 logo：显示企业 logo。
  - 仍不可用时：显示默认 `RobotOutlined` 或 MarkUp 标识。
- 中间播放动态打字 placeholder，例如 `试试说：帮我生成一个图片分类标注模版`。
- 右侧为发送图标。用户可直接输入并发送，也可点击入口打开完整面板。

悬浮入口必须在 Designer 三栏工作区上方层级显示，但不得遮挡底部关键操作；窄屏下可缩短宽度并保留图标、输入和发送按钮。

### 2.1 打字动画

底部悬浮输入框的提示语不是静态 placeholder，而是持续播放拟真打字动画：

- 输入框内始终显示闪烁光标，用于提示用户这里可以输入。
- 光标前方逐字出现提示文字，光标跟随在句子末尾。
- 文字完整显示后停留约 12 秒，保证用户有足够时间阅读完整提示语。
- 停留结束后逐字反向删除，直到回到空状态。
- 删除完成后空白停顿约 1.5 秒，再切换到下一条提示语继续播放。
- 动画循环播放，但每条提示语都必须有足够长的可读停留时间，避免过快切换。
- 动画应轻量、柔和，不干扰用户正常搭建模板。
- 动画颜色、字体、圆角、阴影和边框风格需要与 MarkUp 任务管理/模板搭建的浅蓝色 Ant Design 风格一致。
- 用户 hover、focus 或开始输入时暂停动画，优先展示用户输入内容；用户清空输入并失焦后恢复动画。

## 3. 前端交互流程

1. Owner 进入 Designer。
2. 底部悬浮输入框开始循环播放提示语，包含逐字输入、完整停留 12 秒、逐字删除、空白停顿 1.5 秒和闪烁光标。
3. 用户点击入口或直接输入指令后，打开居中的 `MarkUp 模版搭建 AI` 弹窗。
4. 左侧显示对话历史和输入区；右侧默认显示 `你说 AI 做` 引导态。
5. 用户发送自然语言指令或点击快捷指令。
6. 右侧切换为思考态，左侧显示 AI loading 气泡，发送按钮变为停止按钮。
7. 后端返回结构化变更后，左侧显示摘要，右侧进入 `变更` 标签。
8. 用户可勾选/取消变更、展开查看 before/after 和风险说明。
9. 用户切换到 `预览` 标签，查看“当前模板 + 已勾选变更”的临时 Renderer 预览。
10. 用户点击 `应用`，前端只把已勾选变更写入当前 Designer schema。
11. 应用成功后左侧追加系统反馈：`已应用 x 项变更到当前模版。`
12. 若关闭面板时仍有未应用变更，使用 Ant Design `Modal.confirm` 二次确认。

## 4. 组件拆分

组件放在 `apps/web/src/pages/workspace/TemplateAiAssistant/`：

| 组件 | 职责 |
| --- | --- |
| `TemplateAiAssistant` | 对外入口，接收 team、当前模板表单、schema、Provider 列表和 `onApplyChanges`。 |
| `TemplateAiFloatingInput` | 底部悬浮输入框、AI 图标、动态打字 placeholder、快捷发送。 |
| `TemplateAiDialog` | Ant Design `Modal` 容器，左右分栏、关闭确认、主状态编排。 |
| `TemplateAiChatPanel` | 对话气泡、欢迎语、AI loading、建议按钮、简要 reasoning 折叠区。 |
| `TemplateAiInputBox` | Provider 选择、附件上传、文本输入、发送/停止。 |
| `TemplateAiGuidePanel` | 初始引导态和三个标注模板快捷指令。 |
| `TemplateAiThinkingPanel` | 右侧思考态。 |
| `TemplateAiChangePanel` | 变更列表、全选、展开/收起、应用按钮。 |
| `TemplateAiPreviewPanel` | 使用临时 schema 渲染 Renderer 预览。 |
| `hooks/useTypingPlaceholder` | 动态 placeholder 动画，hover/focus/输入时暂停。 |
| `hooks/useTemplateAiChanges` | 选中变更、应用变更、生成预览 schema。 |

## 5. 数据结构

前端变更类型：

```ts
type AiTemplateChange = {
  id: string
  type:
    | 'create_field'
    | 'delete_field'
    | 'update_field'
    | 'reorder_field'
    | 'update_options'
    | 'update_validation'
    | 'create_quality_rule'
  title: string
  description?: string
  targetFieldId?: string
  targetFieldName?: string
  position?: {
    type: 'append' | 'prepend' | 'before' | 'after'
    fieldId?: string
    tabId?: string
  }
  before?: unknown
  after?: unknown
  selected: boolean
  expanded?: boolean
}
```

请求结构：

```ts
type AiTemplateAssistantRequest = {
  provider_id?: string
  workspace_id: string
  template_id?: string
  template_name?: string
  template_description?: string
  current_template: TemplateSchemaPayload
  message: string
  attachments?: Array<{
    id: string
    name: string
    url?: string
    type?: string
  }>
  conversation_id?: string
}
```

响应结构：

```ts
type AiTemplateAssistantResponse = {
  conversation_id: string
  message: string
  reasoning?: string
  changes: AiTemplateChange[]
  usage?: {
    points?: number
    tokens?: number
  }
  suggestions?: string[]
  provider?: {
    provider_id?: string
    route_name?: string
    model?: string
  }
  fallback?: 'mock' | 'provider_parse_failed'
}
```

## 6. API 设计

新增接口：

```http
POST /api/v1/ai/template-assistant/chat
```

企业作用域接口，必须携带 `Authorization` 和 `X-Team-ID`。权限要求为当前企业 `task:manage`，因为该接口会读取并建议修改模板结构。

请求体：

- `provider_id`：可选；若未传，后端优先使用当前企业可见的启用 Provider，平台默认 Provider 可作为兜底。
- `template_id`：可选；新建模板还没有 ID 时允许为空。
- `current_template`：当前 Designer 内存 schema，必须随请求传入，确保 AI 理解用户尚未保存的改动。
- `message`：自然语言指令。
- `attachments`：现有上传接口返回的文件引用。
- `conversation_id`：多轮会话 ID。

响应体返回结构化变更，不返回后台系统提示词。

Schema 对齐要求：

- 后端提示词必须携带当前 `current_template` 的 `schema_version`、tabs、components 和注册物料白名单。
- AI 返回的 `after.type` 必须是 Designer 已注册英文组件类型，包含 `Scale`、`Ranking` 等量表/排序物料，不允许返回中文类型名或旧物料名。
- 更新、删除、移动类变更必须引用当前 schema 中真实存在的 `targetFieldId`；新增类变更的 `position.tabId` 必须来自当前 tabs。
- 前端应用已勾选变更后若 schema 没有任何差异，必须显示 Ant Design 错误提示，不能提示应用成功。

阶段实现边界：

- 第一版后端会优先调用所选 Provider，并要求模型只输出 JSON。
- 如果 Provider 未配置、调用失败或返回无法解析，后端返回 `fallback=mock` 或 `provider_parse_failed` 的结构化兜底方案，保证前端完整交互可测试。
- 后续 AI Gateway 完整落地后，保留同一 API shape，把兜底逻辑替换为真实 function call / structured output。

附件接口复用：

```http
POST /api/v1/uploads
```

## 7. Provider 复用方案

前端进入 Designer 后通过 `listAiProviderConfigs(teamId)` 获取可用 Provider：

- 仅展示 `status=enabled` 的 Provider。
- Provider 文案使用 `route_name`，不把 Base URL、API Key 或后台模型参数暴露在助手主界面。
- 平台共享 Provider 只显示平台配置名、价格/能力标签，不显示底层接入详情。
- 切换 Provider 后，悬浮入口和弹窗输入区图标同步更新。

后端调用使用 `resource_service.run_provider_text_generation()`：

- 校验 Provider 启用状态与企业归属。
- 平台共享 Provider 会检查企业 AI 钱包余额。
- 写入 AI 调用日志，`operation_type=template_assistant_chat`。
- 成本、token、request_id 通过响应 `usage/provider` 回传给前端。

## 8. 模版变更应用方案

应用变更先在前端本地 Designer 状态完成，不新增“应用到后端模板版本”的接口。原因：

- Designer 本来就支持草稿自动保存和手动保存。
- 用户可能在新建模板场景尚无 `template_id`。
- AI 变更应与用户拖拽/属性编辑一样进入当前本地 schema，再由现有保存逻辑统一持久化。

前端支持的首批变更：

- `create_field`：向指定 tab 的开头、末尾、某字段前/后插入组件。
- `delete_field`：删除目标组件，并同步移除相关联动规则。
- `update_field` / `update_options` / `update_validation`：合并更新目标组件。
- `reorder_field`：移动组件到指定位置。
- `create_quality_rule`：第一版写入 `schema.llm_config.quality_rules`，不影响 Renderer 提交字段。

所有应用都必须经过 schema normalize，避免重复 ID、重复 field 或非法物料类型。

AI 助手右侧的 `预览` 标签必须直接复用模板 Designer 里的同一套 `TemplateRenderer` 语义，不单独实现一份 AI preview renderer。预览内容应由当前 schema 加上参考数据集样本行 / 手动 mock content 生成，保证和 Designer、Labeler 工作台看到的是同一份内容模型。

## 9. 权限与安全

- 用户必须登录。
- 请求必须携带当前企业 `X-Team-ID`。
- 后端必须校验当前用户具备 `task:manage`。
- 所选 Provider 必须属于当前企业或为平台共享 Provider。
- 附件只传文件引用，不把大文件内容直接塞进请求。
- 后端 prompt 只包含当前模板、附件元信息和用户指令，不读取其他企业模板、数据集或任务。
- AI 返回内容必须经过结构化解析和 schema 校验；无法识别时返回空变更或兜底变更，不把原始模型输出直接应用。
- 删除字段、覆盖选项、批量修改等高风险变更必须在变更卡片里明确展示 before/after。
- 每次 AI 生成和应用建议写审计日志，至少记录用户、企业、模板 ID、Provider、变更数量和 request_id。

## 10. 异常处理

| 场景 | 前端表现 |
| --- | --- |
| Provider 未配置 | `Alert`：当前工作区暂未配置可用 AI 模型，请联系管理员配置。 |
| AI 钱包余额不足 | 展示后端业务错误，并保留对话输入。 |
| 请求超时 | `Alert`：AI 响应超时，请稍后重试。 |
| AI 返回无法解析 | 显示 `AI 返回的修改方案无法识别，已生成可编辑兜底方案。` |
| 无可用变更 | 右侧使用 `Empty`，提示描述得更具体。 |
| 应用失败或无实际 schema 差异 | 保留变更列表，显示错误并允许重试。 |
| 用户中断 | 左侧显示 `已停止本次生成。` |
| 上传失败 | 使用 Ant Design `message.error` 或 Upload 内错误态。 |

## 11. 需要确认的问题

- 企业 Agent 图标目前由资源配置 Agent 设置维护，接口是否需要在 Provider 列表中直接返回 `agent_avatar_url`，还是前端继续从企业详情读取。
- 附件内容是否需要后端在模板助手调用时读取并摘要，还是先只把附件元信息交给 Provider。
- `create_quality_rule` 第一版写入 `llm_config.quality_rules` 是否足够，还是需要独立质量规则 schema。
- 后续是否要求模板 AI 助手支持真正流式结构化变更；当前第一版以普通 JSON 响应为主，沿用平台问答的 UI 样式但不做 SSE。
