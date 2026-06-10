# Labeling API

## 任务广场

`GET /api/v1/labels/tasks`

任务广场只面向个人 Labeler 的公开接单路径。企业内 Labeler 的默认工作台是企业项目看板，只处理所在企业分配/领取的公司项目；企业内 Labeler 不应在企业项目看板首屏展示“自由接单”“高收益任务”或公开任务推荐作为主路径。

任务广场默认只返回个人公开接单可领取的 `distribution=first_come_all` 包大小分配任务。若当前用户同时是某任务发布企业的 active `labeler` 成员，则该用户不能在个人公开入口看到、资质检查或领取本企业发布的公开积分任务，即使请求未携带 `X-Team-ID` 也必须按任务不可见处理。`distribution=quota_grab` 属于企业内流转，只在当前用户携带对应企业 `X-Team-ID`、企业角色为 `labeler` 且请求 `team_scope=mine` 时返回；任务设置了 `assignment.target_labeler_ids` 时，仅列表中的企业 Labeler 可见可领，空数组表示当前企业所有 active Labeler。`distribution=assigned_link` 仅为历史兼容值，不进入公开任务广场。

支持查询参数：

| 参数 | 说明 |
| --- | --- |
| `keyword` | 搜索标题、描述、企业或标签 |
| `category` | `text` / `image` / `audio` / `multimodal` |
| `difficulty` | `easy` / `medium` / `hard` |
| `qualification_required` | 资质要求 |
| `status` | `open` / `in_progress` / `closed` |
| `team_verified` | 企业是否认证 |
| `tag` | 单个标签 |
| `unit_range` | 单条奖励范围 |
| `deadline_range` | 截止时间范围 |
| `quick_filter` | 推荐、高奖励、即将截止、易上手、新任务等 |
| `sort` | `recommended` / `unitDesc` / `deadlineAsc` / `newest` / `availableDesc` |
| `page` | 页码 |
| `page_size` | 6、12 或 24 |

响应 `items[]` 包含：

- `task_id`
- `title`
- `category`
- `description`
- `unit_points`
- `bundle_options`
- `available_items`
- `deadline`
- `deadline_mode`
- `completion_hours`
- `difficulty`
- `tags`
- `status`
- `owner_team_name`
- `estimated_minutes`
- `published_at`
- `priority`
- `team_verified`
- `deliverable`
- `qualification_required`
- `review_notes`
- `agreement_config`：公开返回 `required`、`use_default_template`、`text` 和 `file_name`，用于领取前展示任务用户协议

`unit_points` 与审核结算共用后端奖励口径：`reward_rule.mode=item` 时取 `points_per_item`/`unit_points`，`reward_rule.mode=task` 时用 `total_points` 按任务题目总数折算单题积分。

## 领取任务包

`POST /api/v1/labels/tasks/{task_id}/claim`

认证：需要 Labeler 登录。

请求：

```json
{
  "bundle_size": 100,
  "agreement_accepted": true
}
```

当任务 `agreement_config.required=true` 时，`agreement_accepted` 必须为 `true`，否则返回业务规则错误并拒绝领取。

响应：

```json
{
  "task_id": "task_id",
  "bundle_size": 100,
  "claimed_items": 100,
  "remaining_items": 320
}
```

`bundle_size` 必须属于任务广场返回的当前可用 `bundle_options`；若请求值不在可用选项内，返回 `40003`，且不得分配题目或创建草稿提交。

领取成功会写入当前企业作用域的 `task_bundle_claimed` 审计日志，便于 Team Admin / Owner 在操作日志中追踪领取人、领取数量和协议勾选状态。

失败情况：

- 未登录
- 资质不满足
- 包大小不可用
- 任务关闭
- 已领取或并发冲突
- 任务要求用户协议但未勾选同意

当任务 `deadline` 已过期时，即使任务状态仍为 `published` 且仍有未领取题目，领取接口也会按任务关闭处理并返回 `40902`，不会分配题目或创建提交草稿。

领取成功后若任务配置了 `completion_hours`，题目会写入 `claim_due_at`。当 Labeler 再进入我的任务、标注工作台、单题详情、草稿保存、提交答案或任务完成确认时，后端会检查已超过 `claim_due_at` 且仍未提交/通过的题目：超时题目会释放回任务池、清空领取人和完成时限、按题数扣减信誉分；当前题目已超时时，草稿保存和提交答案返回 `40902`，不得继续覆盖草稿或提交答案。

前端行为：任务广场详情抽屉的领取流程为三步：`任务详情 -> 签署协议 -> 领取确认`。第二步展示任务用户协议；当 `agreement_config.required=true` 时必须勾选同意后才能进入确认并提交领取请求，非必签任务展示无需额外签署提示但仍保留第二步。领取成功后应关闭任务详情抽屉，并导航到 `/workspace?page=labeling&task_id={task_id}`。标注工作台读取 `task_id` 后自动调用 `GET /labels/workbench/{task_id}`，无需用户手工输入任务 ID；无 `task_id` 时可回退使用最近一次打开的已领取任务 ID。

## 标注工作台

- `GET /api/v1/labels/workbench/{task_id}`：获取已领取任务的标注工作台。
- `GET /api/v1/labels/questions/{question_id}`：单题详情。
- `PUT /api/v1/labels/questions/{question_id}/draft`：保存草稿。
- `POST /api/v1/labels/questions/{question_id}/submit`：提交答案。
- `POST /api/v1/labels/questions/{question_id}/abandon`：放弃题目。
- `POST /api/v1/labels/questions/{question_id}/llm-assist`：题目级 LLM 辅助。
- `POST /api/v1/labels/questions/{question_id}/ai-assist`：兼容旧前端的 LLM 辅助别名，行为与 `/llm-assist` 一致。
- `GET /api/v1/labels/contributions`：我的贡献统计。
- `GET /api/v1/labels/questions/{question_id}/rejection`：查看打回详情。
- `GET /api/v1/labels/tasks/{task_id}/qualification-check`：领取前资质检查。

草稿保存建议前端每 30 秒自动调用；提交时前端和后端都必须基于模板 schema 做校验。

`POST /labels/questions/{question_id}/llm-assist` 请求体：

```json
{
  "prompt": "可选的标注员补充提示"
}
```

该接口通过 AI Resources / Gateway 调用平台默认 Provider，并要求模型返回结构化 JSON。服务端会继续严格解析和归一化结果：`answers` 必须是按模板 `field` 输出的建议答案，`explanation` 是整体说明，`field_explanations` 是字段级依据，`image_annotations` 是可选的归一化图片区域建议。非法 JSON、缺少 `answers` 或非法图片坐标均返回第三方调用错误，且不计入本题 AI 辅助使用次数。

返回数据包含 `answers`、`explanation`、`field_explanations`、`annotated_images`、`assist_usage` 以及 Provider 调用元信息。AI 辅助只生成建议，不自动覆盖当前答案；前端必须由 Labeler 点击“应用此项”或“应用全部”后才写入当前草稿答案。

当前前端工作台实现说明：

- Labeler 工作台读取 `GET /labels/workbench/{task_id}` 返回的 `template.schema`，并复用模板 Designer / Renderer 预览同一个 `TemplateRenderer` 组件渲染。
- `linkage_rules` 条件显示在 Labeler 工作台中与 Designer Renderer 预览一致；被隐藏组件不会显示字段错误，后端提交校验也会跳过隐藏字段。
- `ShowItem` 只从题目 `content` 中展示原始数据，不进入 `answers`。
- `LLMComponent` 在正式 Labeler 工作台按模板位置展示为 AI 辅助入口，消费组件 `label`、`button_text` 和 `prompt_hint`；只读预览不触发请求。额度为 0、额度已用尽、题目已提交/锁定、放弃中、保存或提交中时入口禁用。

### Renderer / Designer LLM preview

`POST /api/v1/labels/llm-assist/preview` is the team-scoped preview route for template Renderer and Designer previews. The request body is:

```json
{
  "schema": {},
  "content": {},
  "answers": {},
  "prompt": "optional preview hint"
}
```

The caller must send `X-Team-ID` and have `task:read`. The route reuses the same structured output contract as question-level Labeler AI assist (`answers / explanation / field_explanations / image_annotations`), including server-side JSON parsing, answer normalization, field explanation normalization, and image annotation normalization. It does not require a real `question_id`, does not create or update a `submission`, and returns `assist_usage: null` because it is not counted against a question-level Labeler quota. Frontend preview surfaces may merge returned `answers` into local preview answers so `LLMComponent` position, `prompt_hint`, and field application can be tested before publishing.

For both question-level assist and preview assist, the frontend sends `component_id`; the backend resolves the selected `LLMComponent` from the template schema and uses `component.config.provider_id`. A Provider must be explicitly selected in the template Designer for each `LLMComponent`; if it is missing, disabled, or not found, the request is rejected or the frontend shows a "select Provider first" reminder. The API does not silently fall back to the platform default Provider for LLM components.

## 个人 Labeler Dashboard

`GET /api/v1/profile/dashboard`

认证：需要个人 Labeler 登录，不需要 `X-Team-ID`。该接口用于个人 Labeler 进入 `/workspace` 后的默认看板，返回个人任务、公开任务推荐、收益、资质和信誉分摘要，不返回任何企业治理、企业钱包、成员管理或审计日志信息。

响应顶层字段固定为：

- `viewer_role`：固定为 `personal_labeler`。
- `profile`：当前 Labeler 展示资料、基础状态和信誉分。
- `summary_cards`：已领取任务、待标注、待审核、已通过、可用积分、本月收益、信誉分和资质状态等指标。
- `todo_items`：个人待办，例如继续标注、处理打回、补充资质。
- `labeling`：个人已领取任务和提交分布。
- `quality`：通过率、返工率、待审核和已审核摘要。
- `points`：个人积分钱包、收益概览和最近流水。
- `certifications`：个人资质摘要和最近认证记录。
- `recent_tasks`：我的任务。
- `recent_records`：最近提交/审核记录。
- `recommended_tasks`：公开任务广场推荐入口。
- `shortcuts`：继续标注、去任务广场、积分管理、资质认证等入口。
- `generated_at`：服务端生成时间。

`GET /labels/tasks/{task_id}/qualification-check` 响应 `data`：

```json
{
  "task_id": "task_id",
  "eligible": false,
  "qualification_required": "law",
  "checks": [
    {
      "key": "domain",
      "label": "领域资质",
      "required": "law",
      "actual": "missing",
      "passed": false,
      "message": "需要 law 领域资质"
    }
  ],
  "failed_checks": [],
  "summary": "需要 law 领域资质"
}
```

当前检查项包括领域资质、已通过标注数量和历史通过率。`POST /labels/tasks/{task_id}/claim` 复用同一检查逻辑，不满足时返回 `42201`，`detail` 为上述结构。

`GET /labels/workbench/{task_id}` 响应 `data`：

```json
{
  "task": {
    "task_id": "task_id",
    "title": "任务标题",
    "status": "published",
    "template_version_id": "template_id:v1"
  },
  "template": {
    "template_id": "template_id",
    "template_version_id": "template_id:v1",
    "version": 1,
    "schema": {}
  },
  "questions": [
    {
      "question_id": "question_id",
      "row_index": 1,
      "status": "claimed",
      "submission_status": "draft"
    }
  ],
  "current_question": {
    "question_id": "question_id",
    "content": {},
    "submission": {
      "submission_id": "submission_id",
      "draft": {},
      "answers": {},
      "status": "draft"
    },
    "template_schema": {}
  },
  "progress": {
    "total": 10,
    "submitted": 2,
    "rejected": 0,
    "remaining": 8,
    "percent": 20
  }
}
```

`PUT /labels/questions/{question_id}/draft` 请求：

```json
{
  "answers": {
    "intent": "payment"
  }
}
```

保存成功后写入 `submissions.draft`，若当前提交仍是 `draft` 状态，也同步 `answers`，便于刷新后恢复。若题目或提交已处于 `submitted` 待审核状态，草稿保存会返回 `40902`，不得改写审核 diff 的草稿基线；打回为 `rejected` 后可继续保存草稿并重新提交。

`POST /labels/questions/{question_id}/submit` 请求同样使用 `answers`。后端读取任务绑定的已发布模板版本，复用 `POST /templates/validate` 同源校验函数，覆盖必填、长度、正则、选项合法性、JSON 格式和 `linkage_rules` 条件显示。校验失败返回：

```json
{
  "code": 42201,
  "message": "答案校验未通过",
  "detail": {
    "valid": false,
    "field_errors": [
      {
        "component_id": "intent",
        "field": "intent",
        "label": "意图",
        "rule": "required",
        "message": "意图 为必填项"
      }
    ],
    "summary": {
      "error_count": 1
    }
  }
}
```

校验通过后写入 `submissions`，题目状态更新为 `submitted`，任务统计会按当前题目状态重新同步（重提时从 `rejected` 回到 `submitted`），并写入 `submission_submitted` 审计日志。若题目此前为 `rejected`，标注员可直接复用同一提交接口重新提交，前端会显示“重新提交”主按钮；若题目或提交已处于 `submitted` 待审核状态，再次提交会返回 `40902`，不得覆盖待审核答案。若任务开启 AI 预审，提交写入前必须先校验 `ai_review` 生产开关；开关关闭、Provider 缺失/停用/跨企业、模型或评分矩阵配置不完整时返回 `42201`，且不得创建提交、更新题目状态或入队 AI job。AI 预审入队仍属于后续闭环。

`GET /labels/questions/{question_id}/rejection` 返回当前标注员本人领取题目的最近打回详情和历史打回意见，数据当前仅来自同企业 `submission_reviewed` 审计日志：

```json
{
  "question_id": "question_id",
  "submission_id": "submission_id",
  "task_id": "task_id",
  "status": "rejected",
  "current_round": 2,
  "latest": {
    "review_id": "audit_log_id",
    "round": 1,
    "stage": "manual_review",
    "decision": "rejected",
    "comment": "证据不足，请补充理由",
    "reviewer_id": "reviewer_id",
    "created_at": "2026-05-29T00:05:00"
  },
  "history": [],
  "ai_review": null
}
```

`GET /labels/contributions` 响应 `data`：

```json
{
  "summary": {
    "claimed_questions": 10,
    "pending_questions": 4,
    "total_submissions": 6,
    "submitted": 3,
    "approved": 2,
    "rejected": 1,
    "accuracy_rate": 67,
    "earned_points": 10,
    "estimated_points": 25
  },
  "recent_items": [
    {
      "submission_id": "submission_id",
      "task_id": "task_id",
      "task_title": "任务标题",
      "question_id": "question_id",
      "row_index": 1,
      "status": "submitted",
      "unit_points": 5,
      "submitted_at": "2026-05-29T00:00:00",
      "updated_at": "2026-05-29T00:00:00"
    }
  ]
}
```

`earned_points` 按已通过提交的任务奖励估算，并与审核通过后写入的积分流水保持同源口径；`estimated_points` 按已提交/已通过提交估算，最终仍以 `GET /profile/points` 返回的钱包和流水为准。
