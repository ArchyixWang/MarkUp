# Review, AI, Export API

## 人工审核 `/reviews`

- `GET /api/v1/reviews/queue`
- `GET /api/v1/reviews/submissions/{submission_id}`
- `POST /api/v1/reviews/submissions/{submission_id}`
- `POST /api/v1/reviews/submissions/batch`
- `GET /api/v1/reviews/submissions/{submission_id}/history`
- `GET /api/v1/reviews/stats`
- `GET /api/v1/reviews/submissions/{submission_id}/diff`

人工审核接口属于企业作用域接口，请求必须同时携带 `Authorization` 和当前 `X-Team-ID`；缺少企业作用域时直接拒绝，不回退使用全局 reviewer 权限。

审核 `decision`：

- `approved`
- `rejected`
- `revise`

打回或要求修改必须填写 `comment`。Reviewer 队列必须支持 `assigned_only`，避免越权查看未分配数据。

当前最小实现状态：

- 已实现 `GET /api/v1/reviews/queue`，默认只返回当前 Reviewer 分配范围内的 `submitted` 提交；Team Admin / Owner 可查看当前企业范围。查询参数补充 `status=submitted|processed|all`、`ai_suggestion=pass|reject|manual` 和 `keyword`，用于人工审核页统计筛选、左侧队列过滤和已处理视图。
- 已实现 `GET /api/v1/reviews/stats`，返回当前权限范围内 `pending/completed/approved/rejected/total_visible/task_count/by_status`，用于人工审核页摘要指标。
- 已实现 `GET /api/v1/reviews/submissions/{submission_id}`，返回提交、任务、题目、审核上下文，以及最近一条 AI 预审 job（如存在）。
- 已实现 `POST /api/v1/reviews/submissions/{submission_id}` 单条审核；`approved` 会把 submission/question 置为 `approved`，`rejected` 会置为 `rejected` 并增加当前轮次；`revise` 表示审核员就地修订标注答案后直接入库，请求体必须携带 `revised_answers` 和 `comment`，后端会更新 `submission.answers`、把 submission/question 置为 `approved`。任务统计会按当前题目状态重新同步，所有审核提交都会写入 `submission_reviewed` 审计日志并记录修订前后答案。
- 已实现 `POST /api/v1/reviews/submissions/batch`，请求体为 `submission_ids[] + decision + comment`，逐条复用单条审核逻辑并返回 `success_count/failed_count/results`；打回或要求修改仍强制填写原因。
- 已实现 `GET /api/v1/reviews/submissions/{submission_id}/history`，当前以 `entity_type=review/entity_id=submission_id` 的审计日志生成审核历史，返回轮次、阶段、结论、意见、操作人和时间。
- 已实现 `GET /api/v1/reviews/submissions/{submission_id}/diff`，当前按 `submission.draft -> submission.answers` 生成字段级差异，返回 `added/removed/changed/unchanged`；真正第 1/2 轮答案对比需后续引入独立 `review_records` 或 submission 版本快照。
- `GET /api/v1/reviews/submissions/{submission_id}`、`/history` 和 `/diff` 支持与队列一致的 `assigned_only` 查询参数。默认仍只允许 Reviewer 访问已分配范围；当 `assigned_only=false` 且当前企业 Reviewer 具备 `submission:view` 时，可打开同企业未分配提交的详情、历史和 diff。提交审核动作仍按已分配范围校验。
- 前端人工审核页已接入队列、统计、详情 Drawer、审核历史、字段差异、AI 预审 job 页签和表格多选批量审核。AI 结构化评语展示、多级 stage 和真实多轮版本 diff 仍待继续补齐。

Additional current review contracts:

- `GET /api/v1/reviews/queue` `reviewer_id` matches both direct task reviewers (`task.reviewer_ids`) and task assignments stored on active `TeamMember.assigned_review_tasks`.
- Batch review with `decision=revise` follows the single-review contract: `comment` and `revised_answers` are required, and the same revised answer payload is forwarded to each selected submission.

## AI 预审 `/ai-reviews`

- `GET /api/v1/ai-reviews/tasks`
- `GET /api/v1/ai-reviews/task-overviews`
- `GET /api/v1/ai-reviews/task-overviews/{task_id}/submissions`
- `POST /api/v1/ai-reviews/submissions/{submission_id}/trigger`
- `POST /api/v1/ai-reviews/batch-trigger`
- `GET /api/v1/ai-reviews/tasks/{job_id}`
- `POST /api/v1/ai-reviews/tasks/{job_id}/retry`

AI 预审接口属于企业作用域接口，请求必须同时携带 `Authorization` 和当前 `X-Team-ID`；缺少企业作用域时直接拒绝，不回退使用全局 reviewer 权限。

AI 任务状态：

- `pending`
- `processing`
- `completed`
- `failed`

AI 输出应使用结构化结果，至少能表达维度评分、总分、建议和 `approved/pass`、`rejected`、`need_manual_review`。

当前最小实现状态：

- 已实现 `ai_review_jobs` 集合，字段包含企业、任务、提交、题目、标注员、Prompt、评分维度、状态、重试次数、结果、错误和幂等键。
- Labeler 提交答案时，如果任务 `ai_config.enabled=true`，后端会自动创建 `pending` AI 预审任务；任务使用 `idempotency_key=submission:{submission_id}:ai-review`，重复提交或手动触发不会重复建 job。
- `POST /api/v1/ai-reviews/submissions/{submission_id}/trigger` 支持 Owner/Team Admin/Reviewer 按权限手动触发或返回已有 job。
- `POST /api/v1/ai-reviews/batch-trigger` 支持批量触发，逐条返回成功或失败。
- `GET /api/v1/ai-reviews/tasks` 继续作为兼容 job 队列接口，支持按 `task_id` 和 `status` 查询当前企业权限范围内的 AI 预审任务，并返回状态摘要；`GET /api/v1/ai-reviews/tasks/{job_id}` 返回单个 job。
- `GET /api/v1/ai-reviews/task-overviews` 是当前 AI 预审首页主接口，一级对象为任务，返回当前企业可见任务的 AI 预审汇总、状态计数、覆盖率、异常数、最近更新时间和分页。支持 `keyword`、`task_status`、`ai_status`、`provider_id`、`only_anomalies`、`page`、`page_size` 查询参数。
- `GET /api/v1/ai-reviews/task-overviews/{task_id}/submissions` 返回指定任务下每条提交/题目的 AI job、评分、建议、失败原因、更新时间和分页。支持 `status`、`suggestion`、`keyword`、`page`、`page_size` 查询参数。
- `POST /api/v1/ai-reviews/tasks/{job_id}/retry` 将失败或已完成 job 重新置为 `pending`，用于详情页失败重试；其他状态返回状态冲突。
- 当前 AI worker 最小执行服务已接入：`pending/failed -> processing -> completed/failed`，通过 AI Resources/Gateway 调用 Provider，解析结构化 JSON 写入 `result/error/retry_count` 并记录调用日志和审计日志。AI 完成后只写结构化评分、建议和风险，不修改 submission/question 的最终人工审核状态。
- 当前前端 AI 预审页已改为任务级工作台：`/workspace?page=ai-review` 默认展示任务概览表格，支持表格/卡片切换、关键词/任务状态/AI 状态/Provider/异常筛选；点击任务进入独立子页面 `/workspace?page=ai-review-task&task_id=...` 查看提交级明细、结构化结果 Drawer、单条触发、失败重试和批量触发。旧 job 队列接口保留兼容，但不再作为首页心智。

## AI 资源 `/ai-resources`

- `GET /api/v1/ai-resources/configs?team_id={team_id}`：Provider 配置列表。
- `POST /api/v1/ai-resources/configs`：创建 Provider 配置。
- `GET /api/v1/ai-resources/teams/{team_id}/budget`：历史 AI 预算兼容详情接口。
- `POST /api/v1/ai-resources/teams/{team_id}/budget/limit`：历史 AI 预算上限兼容接口。
- `POST /api/v1/ai-resources/teams/{team_id}/budget/alerts`：历史 AI 预算预警兼容接口。
- `GET /api/v1/ai-resources/teams/{team_id}/wallet`：企业 AI 调用钱包摘要。
- `GET /api/v1/ai-resources/teams/{team_id}/history`：企业 AI 统一调用历史。
- `POST /api/v1/ai-resources/teams/{team_id}/wallet/transfer-in`：从企业积分钱包向 AI 钱包划转，请求体为 `amount` 与 `payment_password`，不接收微信、支付宝、对公转账等支付方式字段。
- `POST /api/v1/ai-resources/estimate`：模型成本估算。
- `GET /api/v1/ai-resources/calls?team_id={team_id}`：AI 调用日志。
- `POST /api/v1/ai-resources/chat?team_id={team_id}`：Provider 测试连接。
- `GET /api/v1/ai-resources/teams/{team_id}/reports/cost`：成本报表。


- `GET /api/v1/ai-resources/cert-types`：资质类型只读聚合。
- `POST /api/v1/ai-resources/batch`
- `GET /api/v1/ai-resources/batch/{batch_id}`

业务模块不应直接调用第三方模型，必须通过 AI Gateway / AI Resources 统一处理 provider、模型、预算、token、成本、日志、重试和错误。

Labeler 工作台的题目级 `POST /api/v1/labels/questions/{question_id}/llm-assist` 与兼容别名 `/ai-assist` 同样走 AI Resources / Gateway，不由前端直接选择或访问第三方 Provider。该链路使用 Labeling AI Assist 结构化输出 schema 约束 `answers / explanation / field_explanations / image_annotations`：OpenAI/Azure 优先使用 `response_format=json_schema`，DeepSeek、OpenAI Compatible 和 OpenRouter 使用 `response_format=json_object` 并把 schema 写入 prompt，Gemini 使用 `responseMimeType=application/json`，其它 Provider 通过 prompt 注入 schema 后仍由服务端统一校验。生成结果只作为 Labeler 建议，必须人工点击应用后才进入草稿答案。

`POST /api/v1/labels/llm-assist/preview` is the same gateway-backed structured-output flow for Renderer/Designer preview. It accepts `schema/content/answers/prompt`, requires team context and `task:read`, and returns normalized suggestions without creating a submission or consuming question-level `assist_usage`.

Labeler `LLMComponent` generation no longer chooses an implicit default Provider. Template Designer must persist `component.config.provider_id` for each `LLMComponent`; runtime calls send `component_id`, and the backend resolves the Provider from the schema before calling AI Resources. Missing Provider configuration is treated as a template configuration error and should be surfaced to the Owner/Labeler instead of falling back silently.

当前产品语义补充：

- AI 资源只承担观察职责，展示 AI 钱包摘要、Token 消耗、成本估算、Provider/模型状态与统一调用历史。
- 企业作用域读取 `GET /api/v1/ai-resources/configs?team_id={team_id}` 与 `GET /api/v1/ai-resources/calls?team_id={team_id}` 时，除 `Authorization` 与 `X-Team-ID`/`team_id` 一致性外，还必须具备 `budget:view` 或 `ai_provider:manage` 权限；普通企业 Labeler 不得读取 AI 资源配置或调用日志。
- 真实消耗发生在 Provider 小号侧，平台不以当前资源配置页表达真实“AI 预算池”。
- 企业预算治理已转移到 `/teams/{team_id}/points-budget*`，用于任务奖励积分预算，而非 AI 消耗预算。
- 当前资源配置页中的 `AI 积分充值` 实际是“企业积分钱包 -> AI 钱包”的原子划转，必须输入企业钱包支付密码；不再使用独立的 AI 钱包直充主路径，也不得展示或提交支付方式。

当前生产资源开关已作为服务端业务约束接入部分核心链路：

- `task_publish=false`：`POST /api/v1/tasks/{task_id}/publish` 和 `POST /api/v1/tasks/{task_id}/status` 的 `approve` 动作返回 `42201`，`detail.switch_key=task_publish`。
- `data_export=false`：`POST /api/v1/exports` 返回 `42201`，`detail.switch_key=data_export`；历史导出列表和已完成下载仍按权限可查。
- `public_market=false`：`GET /api/v1/labels/tasks` 不返回该企业公开任务；`POST /api/v1/labels/tasks/{task_id}/claim` 返回 `42201`，`detail.switch_key=public_market`。

`upload=false`：`POST /api/v1/uploads` 返回 `42201`，`detail.switch_key=upload`。

AI 预审触发、批量触发与后续 LLM 辅助链路不再依赖企业级生产开关，当前按团队权限和业务参数直接执行。

### AI Provider 配置中心补充

- `GET /api/v1/ai-resources/configs?team_id={team_id}` 返回企业可见的 Provider 路由列表，活跃字段为 `route_name / provider_kind / model_id / pricing / capabilities / runtime_config / last_test_*`。
- `POST /api/v1/ai-resources/configs` 创建一条“单路由单模型”Provider 配置。
- `PATCH /api/v1/ai-resources/configs/{provider_id}` 更新配置；未传 `api_key` 时保留旧密钥，传入新 `api_key` 视为轮换。
- `POST /api/v1/ai-resources/configs/{provider_id}/duplicate` 复制现有配置，新副本默认停用。
- `POST /api/v1/ai-resources/configs/{provider_id}/status` 启用或停用配置。
- `DELETE /api/v1/ai-resources/configs/{provider_id}` 删除配置。
- `POST /api/v1/ai-resources/configs/{provider_id}/test` 触发真实连接测试，并回写最近测试状态、延迟、错误与 `request_id`。
- `POST /api/v1/ai-resources/estimate` 现在必须基于 `provider_id` 估算，成本口径读取 Provider 自身的 `pricing.input_price_per_million / output_price_per_million / cache_hit_price_per_million`，不再使用固定常量估算。估算前必须校验 Provider 可见性：企业作用域只能估算当前 `X-Team-ID` 企业自有路由或企业可见的平台共享路由；无企业作用域时只有全局 `platform:manage` 可估算平台路由。
- 企业级 AI Provider 配置和调用日志必须带当前企业作用域：列表接口传入 `team_id` 时会校验 `X-Team-ID`，未传 `team_id` 时仅回落到当前 `X-Team-ID`，只有平台管理权限可读取平台全量视图。
- `PATCH /configs/{provider_id}`、复制、状态切换、删除和测试连接都必须校验目标 Provider 属于当前 `X-Team-ID` 对应企业；企业管理员不能修改其他企业 Provider，也不能修改平台级 Provider。
- 平台级 Provider 管理只认可全局 `platform:manage`；通过 `X-Team-ID` 企业成员记录授予的自定义权限不会提升为平台 Provider 管理权限。

## 导出 `/exports`

- `POST /api/v1/exports`
- `GET /api/v1/exports`
- `GET /api/v1/exports/{export_id}`
- `GET /api/v1/exports/{export_id}/download`
- `DELETE /api/v1/exports/{export_id}`

支持格式：

- JSON
- JSONL
- CSV
- Excel

导出必须异步执行，支持过滤、字段 include/exclude、字段重命名、是否包含审核记录、进度查询和下载审计。

当前实现状态：

- 已实现 `POST /api/v1/exports`、`GET /api/v1/exports`、`GET /api/v1/exports/{export_id}`、`GET /api/v1/exports/{export_id}/download` 和 `DELETE /api/v1/exports/{export_id}`。
- Formal result export create/list/detail/download/cancel routes require `task:manage` in the current team; read-only or reviewer roles must not create or download result export files that contain submitted answers.
- CSV result exports escape formula-like string cells that begin with `=`, `+`, `-`, or `@` after leading whitespace. `fields_config.rename` must not map two selected source fields to the same output column; collisions return `40002` and do not create an export job.
- `POST /exports` 当前创建任务后同步生成文件并写入 `export_jobs`，以 `completed + progress=100` 返回；前端按异步任务和下载历史模型展示，后续可替换为 worker 队列。
- 支持 `json`、`jsonl`、`csv`、`excel` 四种格式。
- 支持 `filters.status`、`filters.labeler_id` / `filters.assigned_to`、`filters.start_date`、`filters.end_date`；`filters.status` 在题目已有提交记录时按同企业同任务的最新提交状态筛选，未提交题目才回落到题目状态，默认导出 `approved` 数据。日期范围按提交记录最近更新时间过滤，筛选审核通过数据时即为审核通过后的提交更新时间。导出行包含题目源内容、提交 ID、标注员、答案、提交时间和提交更新时间；字段配置支持 `fields_config.include`、`fields_config.exclude`、`fields_config.rename` 和 `include_review_records`。`fields_config.include` 支持精确字段路径，也支持 `content.*`、`answers.*` 这类前缀通配，用于导出动态原始数据列和动态答案列。
- `include_review_records=true` 时，导出行会从同企业 `submission_reviewed` 审计日志补充当前提交的审核记录，包含 `review_id`、`reviewer_id`、`decision`、`comment`、`round`、`stage` 和 `created_at`；在独立 `review_records` 表上线前，该字段以审计日志为来源。
- 创建导出不再依赖企业级生产开关，当前按团队权限和导出参数直接执行。
- 下载接口会增加 `download_count` 并写 `export_downloaded` 审计日志；创建导出写 `export_created` 审计日志。
- 已完成的导出任务不能取消；`pending/processing` 状态预留给后续真实异步 worker。

## 上传 `/uploads`

`POST /api/v1/uploads`

使用 `multipart/form-data`，字段：

- `file`：上传文件，必填，单文件最大 1GB。
- `category`：可选，支持 `image/document/dataset/template/verification/media/other`。

当前实现把真实文件内容写入本地文件系统（由 `FILE_STORAGE_ROOT` 配置，默认 `.storage`），MongoDB `uploaded_files` 只保存 `storage/path/url/file_id/filename/content_type/category/size` 等元数据。企业文件下载必须携带当前企业 `X-Team-ID` 且具备 `task:read`，个人资料文件仍按 `profile:{user_id}` 作用域限制本人访问。个人头像和企业 Agent 头像属于低敏展示资源，会返回 `/api/v1/uploads/{file_id}/public` 只读图片 URL 供 `<img>` / Ant Design `Avatar` 直接渲染；其它上传文件仍使用鉴权下载。下载使用：

Team file upload/download authorization uses the permissions from the current `X-Team-ID` membership only: upload requires team-scoped `task:manage`, and download requires team-scoped `task:read`; global role permissions do not grant access to another team scope.

Storage path deployment rule:

- `FILE_STORAGE_ROOT` controls uploaded files, dataset media, export files, and generated video preview files.
- In production, configure `FILE_STORAGE_ROOT` as an absolute path or mounted volume, such as `/data/markup/storage` on Linux or `D:/markup/storage` on Windows.
- In local development, the default `.storage` is allowed. Relative paths are resolved from the project root, not from the process working directory, so starting the API from the repository root or `apps/api` uses the same storage directory.
- API servers, seed scripts, background workers, and maintenance scripts must use the same `FILE_STORAGE_ROOT`; otherwise metadata in MongoDB can point to files written under a different local directory.
- Do not commit `.storage`, generated previews, downloaded dataset media, or local ffmpeg binaries to Git.

Video preview deployment rule:

- Non-browser-native videos such as AVI/MKV/MOV require backend transcoding before preview playback or AI Provider access.
- The backend must be able to execute both `ffmpeg` and `ffprobe`. If they are not in the backend process `PATH`, configure `FFMPEG_PATH` and `FFPROBE_PATH` as absolute executable paths.
- Missing or invalid `FFMPEG_PATH` reports `preview_error=ffmpeg_not_configured`; missing or invalid `FFPROBE_PATH` reports `preview_error=ffprobe_not_configured`.

All upload categories reject dangerous executable/script files before category-specific validation. The guard checks both filename extensions such as `.exe`, `.msi`, `.bat`, `.cmd`, `.ps1`, `.sh`, `.js`, `.vbs`, `.dll`, `.scr`, `.com`, `.html`, `.xhtml`, and `.svg`, plus dangerous MIME types such as `application/x-msdownload`, `application/x-msdos-program`, `application/x-msi`, `application/x-sh`, `application/x-shellscript`, `application/octet-stream`, `text/html`, `application/xhtml+xml`, `image/svg+xml`, `application/javascript`, and `text/javascript`.

- `GET /api/v1/uploads/{file_id}/download`

上传会写入 `file_uploaded` 审计日志；生产环境后续可把本地文件系统替换为对象存储、MIME 深度校验、安全扫描和短期签名 URL，但不得回退为 MongoDB 内联二进制/base64 存储。

## 审计 `/audit-logs`

- `GET /api/v1/audit-logs?team_id={team_id}`
- `GET /api/v1/audit-logs/export?team_id={team_id}&export_format=csv|json`
- `GET /api/v1/audit-logs/{log_id}`

当前实现状态：

- 已实现审计日志列表和详情查询。
- Organization-level audit log list/detail/export routes require `team:manage` in the current team; Reviewer access must use a narrower reviewer-scoped audit surface instead of the organization-level endpoints.
- Audit CSV export escapes formula-like string cells that begin with `=`, `+`, `-`, or `@` after leading whitespace before writing the downloadable file.
- 列表支持 `team_id`、`entity_type`、`entity_id`、`action`、`operator_id`、`keyword`、`risk_level`、`start_date`、`end_date`、`page`、`page_size` 查询参数。
- `start_date` / `end_date` 必须是 ISO 日期时间字符串；格式错误时返回 `40002`，不会暴露服务端异常。
- `GET /api/v1/audit-logs/{log_id}` 返回单条日志完整字段；企业级详情仅返回带当前企业 `team_id` 的日志，无企业归属日志不会通过该接口暴露。
- 传入 `team_id` 时接口会校验 `X-Team-ID` 企业作用域，并只返回该企业审计日志；未传 `team_id` 时会回落到当前 `X-Team-ID` 企业上下文，没有企业上下文则拒绝访问；企业、成员、数据集、模板、任务、AI 资源和通知等关键写入会记录 `team_id`。
- 当前返回字段包括日志 ID、企业 ID、实体类型、实体 ID、动作、操作人、请求 `request_id`、变更内容、IP、User-Agent、展示层风险等级、变更摘要和创建时间。旧数据在本字段上线前写入时可能没有 `request_id`。
- `risk_level` 目前由后端按 action 关键词推断，用于页面展示；权限、审计事实和风险判定的最终口径后续仍应沉淀为审计写入字段。
- 当前前端操作日志页打开详情 Drawer 时会调用详情接口加载完整日志，支持查看 `request_id` 和字段 diff，并通过后端按当前筛选条件导出 CSV；导出动作会写入 `audit_log_exported` 审计日志。大范围异步审计导出、关联对象名称冗余和旧日志 request_id 回填仍待补齐。

关键状态迁移、权限变更、审核、预算、导出下载必须写审计日志。

## 通知 `/notifications`

- `GET /api/v1/notifications/my`：当前登录用户的个人信箱，支持 `notification_type`、`status`、`keyword`、`page`、`page_size`。响应除 `items/summary/pagination` 外返回 `type_options[]`，前端必须用该字段动态渲染类型筛选，不再硬编码企业通知 Tab。
- `POST /api/v1/notifications/my/mark-all-read`：将当前用户个人信箱中可见、未个人删除、企业隔离通过且当前状态为 `unread` 的消息全部标为已读；`expired`、`revoked`、已读、已处理或个人删除消息不得被改写。
- `POST /api/v1/notifications/my/{notification_id}/state`：更新当前用户个人信箱中的单条消息状态，请求体支持 `action: read | unread | handled | unhandled | star | unstar | delete`；兼容旧 `status=read|handled`。`delete` 为当前用户个人软删除，只写 `deleted_for`，不影响企业公告治理页或其他接收人。
- `POST /api/v1/notifications/my/batch-state`：批量更新当前用户个人信箱状态，请求体为 `{ "notification_ids": ["..."], "action": "read|unread|handled|unhandled|star|unstar|delete" }`。接口只处理当前用户可见且未个人删除的通知，跨企业、未分发给当前用户或已删除消息计入 `skipped_count`，不得改写原通知。
- `GET /api/v1/notifications?team_id={team_id}`：企业通知管理列表，需要当前企业 `member:invite` 权限，支持 `notification_type`、`status`、`keyword`、`page`、`page_size`；普通接收者应使用个人信箱 `/notifications/my` 查看自己可见的通知。
- `POST /api/v1/notifications?team_id={team_id}`：创建企业通知。
- `GET /api/v1/notifications/preview?team_id={team_id}`：按企业、角色、成员或任务分发规则预览接收人。
- `POST /api/v1/notifications/mark-all-read?team_id={team_id}`：将当前用户在该企业内可见且当前状态为 `unread` 的通知标为已读，不得改写未分发给当前用户、已过期、已撤回、已读或已处理通知的阅读状态。
- `POST /api/v1/notifications/{notification_id}/state`：更新当前用户通知状态，支持 `read`、`handled`；写入前必须校验目标通知属于当前 `X-Team-ID` 企业，跨企业请求返回权限错误且不得更新阅读/处理状态。
- `POST /api/v1/notifications/{notification_id}/revoke?team_id={team_id}`：撤回企业通知，保留列表状态和审计记录。
- `DELETE /api/v1/notifications/{notification_id}?team_id={team_id}`：软删除企业通知，列表默认隐藏，审计日志保留。

当前通知实现覆盖企业通知创建、列表、阅读状态、处理状态、分发预览、撤回、软删除、个人信箱和个人通知偏好读写。个人信箱和个人通知状态更新都要求用户仍是通知所属企业的 active 成员，并按当前用户实际可见范围过滤：指定成员、全企业、匹配企业角色，以及按任务 owner、reviewer、已分配题目和已有提交解析出的任务相关成员；不会返回或改写未分发给当前用户的企业通知。设置 `expire_at` 的通知到期后仍保留历史可见性，但个人信箱和企业列表的状态口径返回 `expired`，并可用 `status=expired` 筛选。

通知响应字段除基础标题、正文、类型、目标、关联对象和个人状态外，还包含：

- `event_key`：系统状态事件幂等键。后端对 `(team_id, event_key)` 建立唯一索引，仅在 `event_key` 存在时生效；重复触发同一业务状态不得生成重复通知。
- `action_url`：前端详情 Drawer 的“前往处理”链接，指向工作台内任务、审核、导出、资源、人员或 Labeler 页面。
- `metadata`：轻量结构化上下文，例如状态、计数、失败原因摘要、任务/数据集/模板名称和结算信息。不得写入密钥、附件原文或大体量数据。

系统通知分发：

- 后端新增内部通知分发层 `notification_dispatcher.emit_notification(...)`，业务服务不得绕过团队隔离直接拼写个人信箱通知。分发层统一负责收件人解析、类型、幂等、标题正文、动作链接、元数据和 `system_notification_emitted` 审计日志。
- 当前只在重要节点落个人信箱通知：任务发布申请、任务发布成功、任务暂停/关闭、标注提交进入人工审核、AI 预审失败、人工审核结果、导出完成、成员加入、成员角色/权限变化、成员移除和成员安全提醒。数据集导入完成、模板发布成功、领取成功、提交成功、AI 预审任务创建/成功、企业积分或 AI 钱包成功充值/转入/提现、邀请创建和认证提交等确认型流水不进入个人信箱，只保留业务页面状态与审计日志。
- 当前导入、模板校验、任务发布校验、AI Provider 调用和导出失败等失败通知只在已有持久业务状态时落库；无业务对象或仅同步抛错的失败不会伪造通知。平台级个人资质审核、全局维护公告等后续应使用独立 `scope=platform` 或独立模型，本轮不混入团队通知。

企业隔离硬规则：

- 除未来独立平台级系统公告外，通知必须带 `team_id`；当前不得借 `target_type=team` 表达全平台广播。
- `target_type=team` 只表示 `notification.team_id` 内的企业广播，默认仅面向 active 的 `team_admin / owner / reviewer`，排除普通 `labeler` 和系统 `agent`。
- `target_type=member/role/task` 同样先校验当前用户是通知所属 `team_id` 的 active 成员，且分发预览和创建时排除系统 `agent` 成员；即使 `target_user_ids` 包含外企业用户 ID，也不能跨企业可见或被改单条/批量状态。
- `target_type=team/role` 的收件范围由企业成员与角色规则推导，响应和持久化不得回显客户端夹带的 `target_user_ids`；只有 `member/task` 通知固化解析后的目标用户 ID。
- 个人信箱默认排除 `deleted_for` 包含当前用户的消息；`read_by / handled_by / starred_by / deleted_for` 全部是用户级状态。
- 企业公告创建、预览、撤回、删除需要同时满足 query `team_id`、`X-Team-ID` 和通知自身 `team_id` 一致。

类型口径：

- 后端统一输出 `system / task / review / export / points / security / organization`。
- 历史 `notification_type=team` 响应映射为 `organization`；新建企业公告写入 `organization`。
- Labeler 个人信箱不展示企业广播，只展示显式分发给自己的任务、积分、安全、系统等个人消息。

撤回和删除会写入 `notification_revoked` / `notification_deleted` 审计日志。系统主动通知已接入 REST 个人信箱落库与读取；WebSocket 推送、邮件通道、企业级通知策略、平台级全局公告和异步失败重试仍待后续接入。`target_type=task` 要求传入 `related_entity_id`，后端按当前任务关系解析并固化收件人。

## WebSocket

连接：

```text
wss://api.markup.example.com/ws?token=xxx
```

主题：

- `review:{submission_id}`
- `export:{export_id}`
- `task:{task_id}:stats`
- `system:notifications`

## 平台问答 AI `/platform-agent`

- `POST /api/v1/platform-agent/chat/stream`
- `GET /api/v1/platform-agent/status`

`POST /platform-agent/chat/stream` 返回 `text/event-stream`，当前事件类型固定为：

- `meta`：连接已接收、Provider / request_id / fallback 等元信息。
- `delta`：平台默认 Provider 返回的真实增量文本片段；前端按到达顺序实时渲染。
- `sources`：最终引用的公开帮助文档片段。
- `done`：流结束，携带 `request_id / tokens / cost / latency_ms`。
- `error`：接口不可用、限流或其它流式错误。

当前平台问答 AI 的后端行为基线：

- 已配置平台默认 Provider 时，后端直接走对应 Provider 的流式接口并把增量内容透传给前端，不再等待整段回答生成完成后再二次切块。
- 当前覆盖的文本 Provider 流式分支包括 `OpenAI / OpenAI Compatible / DeepSeek / Azure OpenAI / Anthropic / Gemini`。
- 如果平台默认 Provider 缺失、上游流式调用失败或响应无法解析，后端继续回退为公开帮助文档摘要回答，并在 `meta/done` 中显式标记 `fallback=rag_summary`。
## 2026-05-31 AI 资源补充基线

### 平台共享 Provider

- `GET /api/v1/ai-resources/configs?team_id={team_id}` 当前返回企业自有路由与平台共享路由的合并结果。
- 响应补充 `is_platform_default`、`team_can_manage`、`api_key_configured`。
- 平台共享路由使用 `scope=platform`，企业侧只读，不可修改核心接入参数；平台路由创建、修改、复制、启停、删除和 `team_can_manage` 判定只认可全局 `platform:manage`，企业成员自定义权限不会提升为平台管理权限。
- 全局最多仅允许一条平台共享路由满足 `is_platform_default=true`。
- 任务发布页与后续 AI 调用入口可直接选择平台共享路由，但不会自动预选默认路由。
- 平台工作台 `/platform?page=providers` 现在直接消费 `/api/v1/ai-resources/configs` 的平台视图，由平台管理员维护 `scope=platform` 的共享路由本体；前端只展示平台级配置，不再要求先进入企业资源配置页间接查看。
- 新增 `POST /api/v1/ai-resources/configs/test-draft`：对未保存的 Provider 草稿做真实连通性检测，不落库、不写审计、不产生业务成本；当前同时供平台工作台和企业资源配置页的新增/编辑 Drawer 内“测试连接”使用。
- `test-draft` 与已保存的 `POST /api/v1/ai-resources/configs/{provider_id}/test` 必须走同一套 provider adapter 与错误归一化逻辑，避免草稿测试字段生效而保存后测试失真，或反之出现“假成功”。

### 企业 AI 调用积分钱包

- `GET /api/v1/ai-resources/teams/{team_id}/wallet`
- `GET /api/v1/ai-resources/teams/{team_id}/wallet/ledger`
- `GET /api/v1/ai-resources/teams/{team_id}/history`
- `POST /api/v1/ai-resources/teams/{team_id}/wallet/recharge`
- `POST /api/v1/ai-resources/teams/{team_id}/wallet/transfer-in`

返回基线：

- `team_id`
- `balance_points`
- `updated_at`

流水基线：

- `transaction_type`：`recharge | ai_spend | adjustment`
- `direction`：`credit | debit`
- `amount_points`
- `balance_after`
- `provider_id`
- `route_name`
- `source_type`
- `source_id`
- `request_id`
- `meta`
- `created_at`

统一历史基线：

- `history_id`
- `record_type`：`transfer_in | ai_call | adjustment`
- `created_at`
- `model_name`
- `route_name`
- `tokens`
- `points_delta`
- `balance_after`
- `status`
- `request_id`
- `source_label`

业务规则：

- 企业创建时自动初始化 AI 钱包，默认余额为 `0`。
- AI 钱包与企业任务奖励积分钱包是两套独立账。
- 文案与显示单位统一为 `积分`，口径固定 `1 积分 = 1 元`。
- 资源配置页主路径通过 `POST /wallet/transfer-in` 从企业积分钱包原子划转到 AI 钱包；服务端需在同一事务内校验支付密码、扣减企业可支配余额、增加 AI 钱包余额并写两边流水。该接口不接收 `payment_method`，流水来源固定为 `team_points_wallet`。
- 仅当所选 Provider `scope=platform` 时，才从企业 AI 钱包扣费。
- 调用前只校验 `balance_points > 0`；若 `<= 0`，直接拒绝平台共享路由调用。
- 若一次成功调用在实扣后把余额扣成负数，本次调用保留成功；之后新的平台共享路由调用会继续被拦截，直到充值。
- `POST /api/v1/ai-resources/configs/{provider_id}/test`、`POST /api/v1/ai-resources/estimate` 和未真正访问上游模型的校验流程不扣费。
- 资源配置页主表优先消费 `/history` 统一历史接口，不再以 `/wallet/ledger` 与 `/calls` 双页面入口作为当前主路径。

当前限制：

- 钱包可见性、企业钱包划转、统一历史接口与最小扣费辅助能力已落地；旧 `/wallet/recharge` 与 `/wallet/ledger` 仍保留给兼容消费方。
- 统一的业务 AI 执行与结算封装尚未完全接入所有 AI 场景，后续真实 AI 预审、辅助与聊天能力需要继续接这层结算路径。

## 模板搭建 AI 助手 `/ai/template-assistant`

- `POST /api/v1/ai/template-assistant/chat`

该接口用于模板 Designer 内的 `MarkUp 模版搭建 AI` 浮窗助手。它不是普通问答接口，而是把用户自然语言指令转换为可预览、可勾选、可确认应用的结构化模板变更。

企业作用域接口要求：

- 必须携带 `Authorization: Bearer <token>`。
- 必须携带 `X-Team-ID: <team_id>`。
- 当前用户必须具备当前企业 `task:manage` 权限。
- `provider_id` 只能选择当前企业可见的启用 Provider，包括当前企业自配 Provider 或平台共享 Provider。

请求体：

```json
{
  "provider_id": "provider_123",
  "workspace_id": "team_123",
  "template_id": "template_123",
  "template_name": "商品标题清洗审核模板",
  "template_description": "用于商品标题清洗质检",
  "current_template": {
    "schema_version": "1.0",
    "tabs": [],
    "components": [],
    "validation_rules": {},
    "linkage_rules": [],
    "llm_config": {}
  },
  "message": "帮我添加一个质检备注字段",
  "attachments": [
    {
      "id": "file_123",
      "name": "标注规范.docx",
      "url": "/api/v1/uploads/file_123/download",
      "type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    }
  ],
  "conversation_id": "template-ai-abc"
}
```

响应 `data`：

```json
{
  "conversation_id": "template-ai-abc",
  "message": "已为你生成 1 项模版变更：新增字段「质检备注」。",
  "reasoning": "根据当前模板字段和用户指令，新增多行文本更适合质检备注。",
  "changes": [
    {
      "id": "change_1",
      "type": "create_field",
      "title": "新增字段：质检备注",
      "description": "在当前页末尾新增多行文本字段，用于记录质检说明。",
      "position": {
        "type": "append",
        "tabId": "tab_label"
      },
      "after": {
        "type": "TextArea",
        "field": "quality_note",
        "label": "质检备注",
        "required": false,
        "config": {
          "placeholder": "请输入质检备注"
        },
        "options": []
      },
      "selected": true,
      "expanded": true
    }
  ],
  "suggestions": [
    "将质检备注设置为必填",
    "补充字段说明",
    "生成质检规则"
  ],
  "usage": {
    "points": 0.01,
    "tokens": 1200
  },
  "provider": {
    "provider_id": "provider_123",
    "route_name": "企业质检模型",
    "model": "deepseek-chat"
  },
  "fallback": null
}
```

结构化变更类型：

- `create_field`
- `delete_field`
- `update_field`
- `reorder_field`
- `update_options`
- `update_validation`
- `create_quality_rule`

当前实现说明：

- 后端优先使用 `AI Resources` 的 Provider 生成封装调用模型，并记录 `operation_type=template_assistant_chat` 的 AI 调用日志。
- 前端每次请求都会携带当前 Designer 内存中的 `current_template` schema；后端提示词使用该 schema 的 tabs/components 与组件白名单对齐生成结构化变更。
- 模型返回的组件类型必须使用 Designer 已注册英文类型，包括 `ShowItem`、`TextInput`、`TextArea`、`SingleSelect`、`MultiSelect`、`TagSelect`、`Scale`、`Ranking`、`RichEditor`、`FileUpload`、`ImageUpload`、`ImageMaskAnnotation`、`AudioUpload`、`VideoUpload`、`JsonEditor`、`LLMComponent`、`GroupContainer`。更新、删除、移动类变更必须引用当前 schema 中真实存在的 `targetFieldId`。
- 该接口要求模型输出 JSON；若 Provider 未配置、调用失败或返回无法解析，第一版允许返回 `fallback=mock` 或 `provider_parse_failed` 的结构化兜底方案，便于前端完整交互和验收。
- API 不直接修改模板版本。前端在 Designer 本地状态中应用用户勾选的变更，随后继续通过现有模板自动保存/手动保存接口持久化。
- 若已勾选变更应用后没有产生 schema 差异，前端会提示“所选 AI 变更未匹配当前模板 schema”，不再展示成功但画布无变化。
- 后端不会返回系统提示词正文，不允许前端展示内部 prompt。

## 任务发布 AI 助手 `/ai/task-publish-assistant`

- `POST /api/v1/ai/task-publish-assistant/chat`

用途：在任务管理的新建/修改任务发布向导中，把用户自然语言指令转换为结构化“待应用任务发布变更”。该接口只生成方案，不直接保存草稿，不发布任务。

权限：`task:manage`，并要求 `workspace_id` 与当前 `X-Team-ID` 企业上下文一致。

请求体核心字段：

```json
{
  "provider_id": "provider_123",
  "workspace_id": "team_123",
  "team_id": "team_123",
  "draft_task_id": "task_123",
  "current_task_draft": {
    "basicInfo": {},
    "templateAndData": {
      "templateSchema": {
        "schema_version": "1.1",
        "tabs": []
      }
    },
    "distributionAndReward": {},
    "aiReview": {},
    "humanReview": {},
    "agreement": {},
    "readiness": {},
    "autoSave": {}
  },
  "message": "帮我创建一个图片分类标注任务",
  "attachments": [],
  "conversation_id": null
}
```

响应体核心字段：

```json
{
  "conversation_id": "task-publish-ai-...",
  "message": "已为你生成 4 项任务发布变更。",
  "reasoning": "简短分析",
  "changes": [
    {
      "id": "change_basic_1",
      "type": "update_basic_info",
      "step": "basic_info",
      "title": "生成任务标题与描述",
      "description": "补全基础信息。",
      "before": {},
      "after": {},
      "riskLevel": "low",
      "dependencies": [],
      "selected": true,
      "expanded": true
    }
  ],
  "suggestions": ["推荐奖励策略", "生成 AI 预审矩阵"],
  "readiness_preview": {
    "blockers": [],
    "warnings": [],
    "canPublish": false
  },
  "cost_preview": {
    "labelerRewardPoints": 200,
    "estimatedEnterpriseCost": 222.22,
    "platformFee": 22.22,
    "rowCount": 100
  },
  "fallback": null
}
```

当前实现说明：

- 后端优先通过 AI Resources 调用所选 Provider，`operation_type=task_publish_assistant_chat`。
- Provider 不可用、调用失败或返回不可解析时，可返回 `fallback=mock` 或 `provider_parse_failed` 的结构化兜底方案，便于前端完整交互。
- 前端应用变更只写入当前发布向导本地表单状态，随后由现有自动保存、发布摘要、费用估算和 readiness 检查逻辑接管；若已勾选变更无法映射到当前表单字段，前端会提示“所选 AI 变更未匹配当前发布向导字段”，不再静默成功。
- 任务发布 AI 的上下文会携带当前模板的精简 `templateSchema`，用于让模型对齐 ShowItem、答案字段、物料类型和 AI 预审语义；但该助手不得返回模板 schema 结构变更，模板新增/删除/修改仍只属于 `/ai/template-assistant`。
- API 不改变任务创建/更新 payload shape；多分类、分发策略、奖励积分、Reviewer 分配和协议字段继续复用现有任务 API。任务发布 AI 主动生成分发配置时只应使用 `first_come_all` 或 `quota_grab`：分享链接作为 `first_come_all` 下的 `share_enabled/expire_hours` 配置，企业内流转作为 `quota_grab` 下的 `internal_labeler_ids/internal_labeler_allocations` 配置；`assigned_link` 仅为历史兼容枚举，不作为独立发布策略推荐。企业内流转不分配积分，AI 生成方案应保持奖励为 0 或不改奖励字段。
## 2026-06-05 AI review closure update

- `POST /api/v1/labels/questions/{question_id}/submit` now returns an optional `ai_review_job` when the task has `ai_config.enabled=true`; the API schedules that job for background processing immediately after the submission response is created.
- Manual trigger, batch trigger, and retry routes also schedule `pending` AI review jobs for processing instead of leaving them queued until a separate caller invokes the worker helper.
- AI review execution now uses a shared structured result schema. Providers that support OpenAI-style `response_format=json_schema` receive the schema in the request body; every provider response is still validated server-side before being accepted.
- Accepted AI suggestions are limited to `pass`, `reject`, and `manual`. Invalid JSON or invalid decisions mark the job `failed`.
- After an AI review attempt finishes, successful or failed, the submitted answer is released to the existing Reviewer queue by setting `submission.task_submitted_at`; AI suggestions remain advisory and do not approve or reject the submission.
- `GET /api/v1/ai-reviews/task-overviews` and task-level detail views hide tasks whose current `ai_config.enabled` is false.

## 2026-06-07 Update

- AI review retry and worker execution only operate on current, same-scope jobs: the job, task, question, and submission must match the same team/task/question/submission graph; the submission must still be `submitted`; and the job idempotency key must match the submission's current review round. Stale jobs for already approved/rejected submissions are not requeued or released back to manual review.

## 2026-06-04 Update

- `ai_review`、导出、上传等链路不再依赖企业级 `生产开关`。相关 API 与运行时拦截已从当前活跃产品基线中移除。
- 企业工作台 `操作日志` 继续按组织作用域消费 `/api/v1/audit-logs`，默认走服务端分页；通知状态变更、批量 AI 预审触发、批量审核等动作现要求写入审计日志，供列表与导出直接查询。
