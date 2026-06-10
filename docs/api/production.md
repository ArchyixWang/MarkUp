# Owner Production API

本文覆盖 Owner 生产链路：数据集、模板、任务和题目。

## 数据集 `/datasets`

- `GET /api/v1/datasets`
- `POST /api/v1/datasets`
- `GET /api/v1/datasets/{dataset_id}`
- `PUT /api/v1/datasets/{dataset_id}`
- `PUT /api/v1/datasets/{dataset_id}/table`
- `POST /api/v1/datasets/{dataset_id}/patch-upload`
- `GET /api/v1/datasets/{dataset_id}/download?format=json|jsonl|csv`
- `DELETE /api/v1/datasets/{dataset_id}`

`PUT /api/v1/datasets/{dataset_id}` 新增 `derived_columns`、`PUT /api/v1/datasets/{dataset_id}/table`、`POST /api/v1/datasets/{dataset_id}/media-assets/bind`、`POST /api/v1/datasets/{dataset_id}/patch-upload` 与 `DELETE /api/v1/datasets/{dataset_id}` 都属于会改写数据集源数据或快照的操作。若数据集已被 `pending_review/published/paused/finished` 任务引用，后端必须统一返回 `40902`，保持原始 `rows`、`preview_rows`、`columns` 与未绑定 `media_assets` 不变。派生列和补上传合并完成后，`Dataset.storage_bytes` 必须按最终 `rows + media_assets.size` 快照重算，并仅按净增长校验会员存储额度。

导入支持 CSV、Excel `.xlsx`、JSON、JSONL。图片、音频、视频当前可作为 URL/路径列或 `media_files` 元数据保存；后续可替换为对象存储 URL。

导入成功后 `Dataset.storage_bytes` 记录本次数据文件字节数与随附媒体文件 `size` 汇总，用于企业会员的数据集存储额度统计。导入前会校验当前企业会员有效额度：`sum(Dataset.storage_bytes) + incoming_bytes` 超过套餐上限时阻断导入；旧数据缺少 `storage_bytes` 时按 0 兼容读取，不影响既有数据集访问。

列表接口 `GET /datasets` 返回数据集元数据、字段结构、创建者 `owner_id/owner_name`、最新修改人 `updated_by/updated_by_name` 和 `preview_rows` 采样行，用于列表负责人列和轻量扫描；数据集负责人列使用 `updated_by_name` 展示最新修改人员真实名字，无名称时回退 `updated_by`，历史数据缺少 `updated_by` 时再回退创建者。详情接口 `GET /datasets/{dataset_id}` 返回同一数据集的完整 `rows`，数据集修改页的“数据预览”必须使用完整 `rows` 并通过前端分页展示全部数据，不能只展示 `preview_rows` 前几行。

列结构：

```json
{
  "name": "image_url",
  "data_type": "image",
  "samples": ["https://cdn.example.com/img.png"],
  "comment": "图片列",
  "use_in_mapping": true
}
```

`columns` 只返回 Owner 可配置、可映射的业务字段或派生变量。行级 `media`、`attachments`、`derived_context`、`_bindings` 是系统上下文字段，仍保留在 `rows/preview_rows` 供 Renderer、AI 预审和人工审核消费，但不作为普通列或 `media_list` 映射候选暴露；多模态来源应通过 `media_schema` 选择。

派生变量通过 `PUT /datasets/{dataset_id}` 的 `derived_columns` 新增，支持 `{value}` 和 `{列名}` 占位替换，不执行任意代码。

表格编辑通过 `PUT /datasets/{dataset_id}/table` 保存完整行列快照：

```json
{
  "columns": [
    { "name": "row_id", "data_type": "text", "comment": "主值", "use_in_mapping": true },
    { "name": "image_url", "data_type": "image", "comment": "图片", "use_in_mapping": true }
  ],
  "rows": [
    { "row_id": "sample-001", "image_url": "https://cdn.example.com/001.png", "label_hint": "质检样本" }
  ]
}
```

后端保存后重新推断列样本、行级媒体、`media_schema`、`context_schema`、`processing_summary` 和 `preview_rows`。若数据集已被 `pending_review/published/paused/finished` 任务引用，表格编辑会返回 `40902`，避免改写待审核、收集中、暂停或历史任务的题目源数据。

补上传合并通过 `POST /datasets/{dataset_id}/patch-upload`，使用 `multipart/form-data`：

- `primary_key`：用于对齐合并的主值字段，当前数据集和补充数据集每行都必须包含。
- `file`：补充数据文件，支持 CSV、Excel `.xlsx`、JSON、JSONL 和 Manifest JSONL。
- `media_assets`：可选 JSON 数组，声明外部媒体 URL 或对象存储路径。
- `media_files`：可选图片、音频、视频文件列表。

合并规则：补充数据的 `primary_key` 命中已有行时更新该行字段和行级媒体，未命中时追加新行；不会删除原有行。响应沿用 `DatasetPayload`，并额外返回 `merge_summary.primary_key / incoming_rows / matched_rows / appended_rows`。

补上传合并后的 `Dataset.storage_bytes` 按最终 `rows + media_assets.size` 快照重算；会员存储额度只按本次合并后的净增长校验，命中已有行的覆盖更新不会重复累加历史上传字节。若数据集已被 `pending_review/published/paused/finished` 任务引用，补上传同样返回 `40902` 并保持原始行不变。

`DELETE /datasets/{dataset_id}` 会拒绝删除已被 `pending_review/published/paused/finished` 任务引用的数据集，避免破坏待审核、收集中、暂停和历史任务的发布检查与回放链路；草稿任务引用的数据集仍可由发布前检查重新暴露缺失绑定。

## 模板 `/templates`

- `GET /api/v1/templates`
- `POST /api/v1/templates`
- `GET /api/v1/templates/{template_id}`
- `PUT /api/v1/templates/{template_id}`
- `GET /api/v1/templates/{template_id}/readiness`
- `POST /api/v1/templates/validate`
- `POST /api/v1/templates/{template_id}/publish`
- `POST /api/v1/templates/{template_id}/copy`
- `POST /api/v1/templates/{template_id}/archive`
- `DELETE /api/v1/templates/{template_id}`
- `GET /api/v1/templates/{template_id}/versions`
- `GET /api/v1/templates/{template_id}/versions/diff?from_version=1&to_version=2`
- `GET /api/v1/templates/{template_id}/preview`

模板 schema 采用：

```json
{
  "schema_version": "1.0",
  "tabs": [
    {
      "id": "tab_read",
      "title": "阅读材料",
      "components": []
    }
  ],
  "components": [],
  "validation_rules": {},
  "linkage_rules": [],
  "llm_config": {}
}
```

当前模板管理补充规则：

- `copy` 会基于源模板 schema 创建新的草稿模板，版本从 `v1` 开始，不影响源模板。
- `archive` 将模板状态置为 `archived`，默认模板列表不再返回归档模板；历史任务仍通过已绑定的 `template_version_id` 回放。
- `DELETE` 允许删除未被任务引用的模板，包括草稿、已发布和已归档模板；如已有任务引用该模板，后端返回状态冲突，避免破坏历史任务和提交回放。
- 模板列表和详情响应返回创建者 `owner_id/owner_name`，前端在模板搭建列表负责人列和卡片标签中展示为创建人。
- 归档模板不能继续修改或发布。
- 模板草稿支持 `auto_saved=true|false`。`auto_saved=true` 仍属于 `draft`，用于区分自动保存草稿与手动保存草稿；已发布模板点击“新建版本”后，`PUT /templates/{template_id}` 会基于当前已发布 schema 生成新的草稿版本，后续自动保存和手动保存都继续落在这个新版本草稿上。
- 模板发布检查的合法组件类型必须与前端 Designer 物料注册表保持一致，当前包括 `ShowItem`、`TextInput`、`TextArea`、`SingleSelect`、`MultiSelect`、`TagSelect`、`Scale`、`Ranking`、`RichEditor`、`FileUpload`、`ImageUpload`、`ImageMaskAnnotation`、`AudioUpload`、`VideoUpload`、`JsonEditor`、`LLMComponent`、`GroupContainer`。未注册类型继续作为阻塞项返回，不允许绕过。
- `GET /templates/{template_id}/readiness` 返回模板发布检查结果，覆盖页签、可提交字段、字段 key 唯一性、组件类型、校验规则、联动规则和 LLM 配置；`POST /templates/{template_id}/publish` 会复用同一检查，存在阻塞项时返回 `42201` 和检查详情。
- `GET /templates/{template_id}/versions` 返回每个版本的 `schema`、`component_stats` 与 `reference_stats`，用于版本历史抽屉展示结构规模、任务引用情况，并支持历史版本 Renderer 预览和 schema 导出。`schema` 是该版本的完整模板快照，前端不得用当前 latest schema 替代历史版本 schema。
- `GET /templates/{template_id}/versions/diff` 返回两个版本之间的新增、删除、修改组件、字段 key 变化、校验/联动变化和高风险变化摘要。
- 草稿模板的多次保存会更新当前草稿版本快照，不会重复创建相同版本号；已发布模板进入编辑时才递增版本并生成新的草稿版本。
- 任务创建时会绑定该模板的最新已发布版本，而不是最新草稿版本；任务发布后继续使用 `template_version_id` 回放历史 schema。模板后续生成新草稿版本，不影响既有任务的发布检查、题目映射和历史回放。
- `POST /templates/validate` 根据同一份 schema 对模拟或真实 answers 执行运行时基础校验，当前覆盖必填、文本长度、正则、单选选项合法性、多选/标签选择数量、JSON 格式、`linkage_rules` 条件显示和 ShowItem 预览数据绑定警告。被条件隐藏的组件不会参与必填或格式校验。Designer 的 Renderer 预览页和 Labeler 正式提交链路已复用同一校验函数做后端二次校验。

`linkage_rules` 当前支持条件显示运行时规则：

```json
{
  "source_field": "need_extra",
  "operator": "equals",
  "value": "yes",
  "target_component_id": "extra_reason",
  "action": "show"
}
```

字段别名兼容 `source_component_id`、`field`、`when_field`、`target_field`、`target`、`then_field`；`operator` 支持 `equals`、`not_equals`、`contains`、`not_contains`、`not_empty`、`empty` 及兼容别名；`action` 支持 `show` 和 `hide`。Designer 右侧属性面板已支持为当前选中组件配置单条基础条件显示规则；多条件组合和联动校验仍是后续高级能力。

运行时校验请求：

```json
{
  "schema": {
    "schema_version": "1.0",
    "tabs": [],
    "components": []
  },
  "answers": {
    "summary": "ab",
    "labels": ["risk"]
  },
  "content": {
    "title": "合同条款"
  }
}
```

运行时校验响应 `data`：

```json
{
  "valid": false,
  "field_errors": [
    {
      "component_id": "summary",
      "field": "summary",
      "label": "摘要",
      "rule": "min_length",
      "message": "摘要 至少需要 5 个字符"
    }
  ],
  "warnings": [
    {
      "component_id": "show_title",
      "field": "title",
      "message": "ShowItem 未绑定到预览数据"
    }
  ],
  "summary": {
    "answer_field_count": 3,
    "error_count": 1,
    "warning_count": 1
  }
}
```

`ShowItem` 只展示题目原始数据，不进入答案；发布任务时通过 `column_mapping` 绑定数据集列。

物料类型：

- `ShowItem`
- `TextInput`
- `TextArea`
- `SingleSelect`
- `MultiSelect`
- `TagSelect`
- `RichEditor`
- `FileUpload`
- `ImageUpload`
- `JsonEditor`
- `LLMComponent`

## 任务 `/tasks`

- `POST /api/v1/tasks`
- `GET /api/v1/tasks`
- `GET /api/v1/tasks/export`
- `GET /api/v1/tasks/{task_id}`
- `PUT /api/v1/tasks/{task_id}`
- `POST /api/v1/tasks/{task_id}/publish`
- `POST /api/v1/tasks/{task_id}/status`
- `POST /api/v1/tasks/{task_id}/owner-transfer`
- `PUT /api/v1/tasks/{task_id}/internal-labelers`
- `POST /api/v1/tasks/{task_id}/copy`
- `DELETE /api/v1/tasks/{task_id}`
- `GET /api/v1/tasks/{task_id}/stats`
- `GET /api/v1/tasks/{task_id}/readiness`

当前实现状态：

- 已实现任务列表、创建、详情、更新、发布、状态控制、删除和统计接口。
- `GET /tasks` 当前支持 `status`、`keyword`、`owner_id`、`reviewer_id`、`tag`、`category`、`difficulty` 查询参数；分页仍返回统一结构，后续再补真实分页。
- `GET /tasks` 和任务详情响应返回发布负责人 `owner_id/owner_name`，前端在任务管理列表负责人列中展示为发布人；负责人转交后该字段随 `owner_id` 刷新。
- `GET /tasks/export` 导出任务列表元数据，支持与 `GET /tasks` 相同筛选参数和 `format=csv|json`；导出字段包括任务 ID、标题、状态、分类、难度、负责人、模板/数据集、题量、领取/提交/通过/打回统计、审核员、AI 开关、分发、奖励、截止时间、标签和创建/更新时间。该接口只导出任务清单元数据，不导出标注结果。
- `POST /tasks` 和 `PUT /tasks/{task_id}` 对草稿任务允许保存部分配置；`template_id`、`dataset_id`、标题、描述、资质、审核、用户协议和领取配置都可分步落库，发布时再统一校验模板、数据集、题目和映射完整性。对非草稿任务仅允许更新 `description`、`rich_content`、`tags`。草稿可携带 `auto_saved=true|false`，用于区分自动保存版本和手动保存草稿，`auto_saved=true` 仍属于 `draft`。
- `POST /tasks/{task_id}/publish` 对 Team Admin 直接进入 `published`；Owner 发布后进入 `pending_review`，等待管理员审核发布。发布前会校验企业会员活跃生产任务额度，`pending_review/published/paused` 计入活跃任务数。
- `POST /tasks/{task_id}/status` 支持 `approve`、`pause`、`resume`、`finish`，不支持 finished 恢复；`approve` 仅允许管理员把 `pending_review` 任务转为 `published`，且写入 `published` 前会复用任务 readiness 检查、`task_publish` 生产开关和企业会员活跃任务额度，若模板版本、数据集、题目、映射、AI、分发配置、生产开关或会员额度已经失效则返回 `42201` 并保持 `pending_review`。`resume` 同样会校验会员活跃任务额度。
- `POST /tasks/{task_id}/owner-transfer` 支持任务负责人转交，请求体为 `target_owner_id` 和可选 `reason`；目标必须是当前企业 active 的 `team_admin` 或 `owner`，成功后更新 `owner_id` 并写入 `task_owner_transferred` 审计日志。该操作不改变题目领取、审核员分配或任务状态。
- `POST /tasks/{task_id}/copy` 支持复制任务生成新草稿，请求体可选 `title`；默认标题追加 `副本`。副本复制基础信息、模板版本、数据集、列映射、审核、AI、资质和题目内容快照，不复制领取、提交、审核记录和导出历史，并写入 `task_copied` 审计日志。
- `DELETE /tasks/{task_id}` 仅允许删除 `draft`。
- `GET /tasks/{task_id}/readiness` 返回发布前检查项、阻塞项、警告项和题目/映射/审核/AI 摘要，用于前端发布检查；其中数据集必须属于当前企业，ShowItem 映射和 `mapping_config` 指向的字段必须仍存在于当前数据集，AI 预审开启时必须绑定当前企业可用或平台共享且 `status=enabled` 的 Provider。

创建任务时可提交：

- 基础信息：`title`、`description`、`rich_content`、`tags`、`category`、`difficulty`。前端新建任务页的任务分类使用 `text/image/audio/video` 多选；为兼容当前任务列表和任务广场接口，单选时 `category` 保存对应单值，多选时 `category` 保存为 `multimodal`，同时在 `qualification_rules.category_tags` 保存实际选择的模态数组。
- 截止与配额：`deadline`、`quota`；`deadline=null` 且 `claim_config.deadline_mode=long_term` 表示长期有效
- 分发：`distribution = first_come_all | quota_grab | assigned_link`。当前 API 枚举值不变；活跃前端仅把 `first_come_all` 展示为包大小分配、`quota_grab` 展示为企业内流转。`assigned_link` 只保留历史兼容，不再作为独立发布策略推荐或展示。
- 分享链接：包大小分配任务可通过 `assignment.enabled=true` 与 `assignment.expire_hours` 开启分享链接；`expire_hours` 默认为 72，合法范围 1-720。后端仍返回 `assignment.code/url/qr_text/expire_at`，其中 `url/qr_text` 可以是相对路径；前端发布结果预览必须转换为完整同源 URL，并用同一个完整 URL 渲染二维码和“预览分享链接”入口。分享链接属于 `first_come_all` 的附加能力，不进入任务广场独立分发策略。
- 企业内 Labeler：企业内流转任务可通过 `assignment.target_labeler_ids` 指定当前企业 active、非系统成员的 Labeler；空数组表示当前企业所有 active Labeler 均可在企业项目范围内看到并领取。前端候选框只能展示 `GET /teams/{team_id}/members?role=labeler&status=active` 返回的企业内 Labeler，不得把已选任意 ID 回填成候选项。
- 企业内 Labeler 分配比例：当 `assignment.target_labeler_ids` 选择多位 Labeler 时，前端在选择框下方展示每位 Labeler 的任务分配百分比，并提交 `assignment.target_labeler_allocations = [{ labeler_id, quota }]`。比例必须覆盖所有已选 Labeler 且合计 `100`；只选择 1 人时后端归一化为 `100`；未指定 Labeler 时不保存显式比例，按所有企业 active Labeler 可见可领处理。
- `PUT /api/v1/tasks/{task_id}/internal-labelers` 可在任务管理列表行内更多菜单中修改企业内 Labeler 分配，请求体为 `{"target_labeler_ids":["..."],"target_labeler_allocations":[{"labeler_id":"...","quota":60}]}`。该接口只允许 `distribution=quota_grab`、非 `finished` 任务，会校验所有目标用户均为当前企业 active、非系统成员的 `labeler`，并校验多 Labeler 比例合计 `100`；成功后写入 `task_internal_labelers_updated` 审计日志。
- 奖励：`reward_rule.mode = task | item`；`item` 表示单题积分，`task` 表示任务总积分，后端展示和审核结算时会按题目总数折算为单题积分。`quota_grab` 企业内流转不分配积分，前端应隐藏奖励输入与费用估算并提交 0 积分口径。
- 模板与数据：`template_id`、`dataset_id`、`column_mapping`
- 审核：`reviewer_ids`、`review_config.reviewer_allocations`。`reviewer_ids` 仍是审核队列权限和筛选的核心字段；`review_config.reviewer_allocations` 用于保存前端发布页的每位 Reviewer 百分比分配，结构为 `[{ reviewer_id, quota }]`，多位 Reviewer 时合计必须为 `100`。
- AI：`ai_config`
- 资质：`qualification_rules`、`required_certs`。`qualification_rules` 可包含 `min_completed_tasks`、`min_accuracy_rate`、`notes` 和 `category_tags`；`category_tags` 仅记录任务分类多选明细，合法值为 `text/image/audio/video`。
- 领取配置：`claim_config.completion_hours` 可选，表示标注员领取后需在多少小时内完成；`claim_config.deadline_mode = date | long_term`
- 用户协议：`agreement_config.required`、`agreement_config.use_default_template`、`agreement_config.text`、`agreement_config.file_name`，用于要求标注员领取前勾选同意任务协议

`ai_config` 当前支持：

- `enabled: boolean`
- `provider_id: string | null`：企业已配置 AI Provider ID。
- `model: string | null`：兼容字段，由 Provider 的默认模型或模型清单派生；任务发布页不再单独选择审核模型。
- `selected_dimensions: string[]`：预设审核维度，例如准确性、完整性、一致性、格式规范、证据充分性、逻辑合理性、安全合规。
- `custom_dimensions: string[]`：Owner 自定义审核维度。
- `input_prompt: string | null`：AI 根据数据集名称、模板名称、字段样例、ShowItem 映射和答案字段上下文生成的 Input 字段语义说明；发布者可编辑确认，不能只把原始变量名直出为语义。
- `review_matrix: Array<object>`：AI 根据预设维度、自定义维度、数据集上下文和模板结构生成的评分矩阵，每行至少包含 `dimension`、`definition`、`scoring_standard`、`deduction_rule`、`reject_condition`、`manual_condition`，发布者可编辑确认。
- `output_schema: object`：后台维护的结构化输出契约，至少支持 `decision`、`reason`、`dimension_scores`、`risk_flags`、`suggested_actions`。
- `thresholds: object`：`pass`、`reject`、`manual_min`、`manual_max`，用于 AI 自动通过、打回和人工复核区间。
- `matrix_confirmed: boolean`：发布者是否已确认当前评分矩阵。
- `prompt: string | null`：兼容字段，最终系统提示词由后台 Prompt Engine 维护，包含 Input 字段说明、待审核 JSON、审核评分矩阵和 function call 输出要求；前端不暴露 Output 提示词正文。
- `review_threshold: number | null`：兼容旧字段，等同通过阈值。

任务状态机：

| 当前状态 | 动作 | 下一状态 |
| --- | --- | --- |
| `draft` | `publish` by Owner | `pending_review` |
| `draft` | `publish` by Team Admin | `published` |
| `pending_review` | `approve` by Team Admin | `published` |
| `published` | `pause` | `paused` |
| `paused` | `resume` | `published` |
| `published` / `paused` | `finish` | `finished` |

任务修改边界：草稿任务可修改完整发布配置；收集中任务不能直接修改，必须先执行 `暂停发放`，但前端任务详情必须允许只读查看当前配置、题目、审计和导出记录；已暂停任务仅允许修改 `description`、`rich_content`、`tags`；待审核和已结束任务不可修改但可只读查看。暂停发放只停止未领取数据继续发放，不回收已领取未完成、待审核或打回待修改数据；这些数据仍按原链路继续提交、审核和结算。结束任务前必须确认不存在已领取未完成、待审核或打回待修改数据。

## 题目 `/tasks/{task_id}/questions`

- `GET /api/v1/tasks/{task_id}/questions`
- `GET /api/v1/tasks/{task_id}/questions/{question_id}`
- `POST /api/v1/tasks/{task_id}/questions/batch`
- `POST /api/v1/tasks/{task_id}/questions/import`
- `PUT /api/v1/tasks/{task_id}/questions/{question_id}`
- `DELETE /api/v1/tasks/{task_id}/questions/{question_id}`
- `DELETE /api/v1/tasks/{task_id}/questions/batch`
- `GET /api/v1/tasks/{task_id}/questions/export`

当前实现状态：

- 已实现 `GET /tasks/{task_id}/questions`，支持 `status`、`assigned_to`、`page`、`page_size` 查询参数。
- 已实现 `GET /tasks/{task_id}/questions/{question_id}`。
- 已实现 `POST /tasks/{task_id}/questions/batch`，请求体为 `{"items":[{"content":{...}}]}` 或直接传题目对象数组；仅草稿任务可用。
- 已实现 `POST /tasks/{task_id}/questions/import`，使用 `multipart/form-data`，字段包含 `file`、`replace_existing` 和可选 `column_mapping` JSON；支持 JSON、JSONL、CSV、Excel(.xlsx)，单文件最大 50MB；仅草稿任务可用。
- 题目导入失败时返回结构化行级错误，响应 `detail.row_errors` 为数组，例如 `{"row": 3, "error": "每一行必须是对象"}`；JSON / JSONL 会尽量汇总多行错误，方便前端在导入弹窗中展示并修正源文件。
- 已实现 `PUT /tasks/{task_id}/questions/{question_id}`，支持更新 `content`、`status`、`assigned_to`；仅草稿任务可用。`content` 必须是非空对象，不能通过更新接口写入空题目。
- 已实现 `DELETE /tasks/{task_id}/questions/{question_id}` 和 `DELETE /tasks/{task_id}/questions/batch`；仅草稿任务可用，删除后重排题目序号并同步任务题量统计。
- 已实现 `GET /tasks/{task_id}/questions/export?format=json|jsonl|csv|excel`，用于导出题目源数据；正式标注结果导出仍走后续 `/exports` 异步导出中心。

题目导入失败必须返回行号和错误原因，方便前端显示。已发布任务不允许修改或删除题目，避免破坏领取、提交和审核关系。

当前实现状态补充：

- 前端已接入模板列表、模板详情、保存草稿、发布模板、版本历史和 Renderer 预览结构接口。
- `模板搭建` 工作台入口先进入模板管理列表页；Designer 与 Renderer 预览已拆为独立子页面状态。
- 已发布模板在前端点击修改时按“新建版本”语义进入 Designer，后端 `PUT /templates/{template_id}` 会在 published 状态下递增 `latest_version` 并生成草稿版本。
- 已实现删除、归档、复制模板、发布检查、版本对比和任务引用统计接口。
