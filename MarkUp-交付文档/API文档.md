# MarkUp API 文档

## 1. 基础约定

### 1.1 Base URL

```text
/api/v1
```

本地开发常用地址：

```text
http://127.0.0.1:8000/api/v1
```

健康检查不挂载在 `/api/v1` 下：

```http
GET /health
```

### 1.2 认证

受保护接口使用 Bearer Token：

```http
Authorization: Bearer <access_token>
```

企业作用域接口还需要：

```http
X-Team-ID: <team_id>
```

路径中的 `team_id`、请求头 `X-Team-ID` 和当前登录用户的企业成员关系需要匹配。平台运营接口 `/platform/*` 不使用企业作用域，主要依赖全局平台权限。

### 1.3 统一响应

成功响应通常由后端统一包装：

```json
{
  "code": 0,
  "message": "success",
  "data": {},
  "request_id": "req_xxx",
  "timestamp": "2026-06-09T12:00:00Z"
}
```

分页数据通常位于 `data.items` 和 `data.pagination`。错误响应通常包含 `code`、`message`、`detail`、`request_id` 和 `timestamp`。

### 1.4 错误码范围

| 范围 | 含义 |
| --- | --- |
| `0` | 成功 |
| `40001-40099` | 参数校验 |
| `40101-40199` | 认证 |
| `40301-40399` | 权限 |
| `40401-40499` | 资源不存在 |
| `40901-40999` | 状态或唯一性冲突 |
| `42201-42299` | 业务规则限制 |
| `50001-50099` | 系统或第三方服务错误 |

## 2. 完整 API 路由索引

表中 `源码` 为对应后端路由文件和装饰器所在行号，便于逐项复核。

### 2.1 Health

| 方法 | 路径 | 源码 |
| --- | --- | --- |
| GET | `/health` | `apps/api/app/main.py:35` |

### 2.2 Auth

| 方法 | 路径 | 源码 |
| --- | --- | --- |
| POST | `/api/v1/auth/email/send-code` | `auth.py:81` |
| POST | `/api/v1/auth/email/confirm` | `auth.py:87` |
| POST | `/api/v1/auth/register` | `auth.py:93` |
| POST | `/api/v1/auth/onboarding/complete` | `auth.py:108` |
| POST | `/api/v1/auth/register/admin` | `auth.py:156` |
| POST | `/api/v1/auth/login` | `auth.py:170` |
| POST | `/api/v1/auth/refresh` | `auth.py:178` |
| POST | `/api/v1/auth/logout` | `auth.py:194` |
| GET | `/api/v1/auth/me` | `auth.py:208` |
| PUT | `/api/v1/auth/password` | `auth.py:219` |
| POST | `/api/v1/auth/sessions/revoke-others` | `auth.py:225` |
| POST | `/api/v1/auth/password/reset` | `auth.py:243` |
| POST | `/api/v1/auth/register/team` | `auth.py:249` |
| GET | `/api/v1/auth/oauth/{provider}/start` | `auth.py:258` |
| GET | `/api/v1/auth/oauth/{provider}/callback` | `auth.py:269` |
| POST | `/api/v1/auth/oauth/exchange` | `auth.py:283` |
| POST | `/api/v1/auth/oauth/bind-email` | `auth.py:291` |
| POST | `/api/v1/auth/oauth/link-account` | `auth.py:298` |
| POST | `/api/v1/auth/oauth/link-current-user` | `auth.py:305` |
| POST | `/api/v1/auth/oauth/register-account` | `auth.py:316` |
| GET | `/api/v1/auth/oauth/identities` | `auth.py:333` |
| DELETE | `/api/v1/auth/oauth/identities/{provider}` | `auth.py:339` |

### 2.3 Users

| 方法 | 路径 | 源码 |
| --- | --- | --- |
| GET | `/api/v1/users/{user_id}` | `users.py:16` |
| PUT | `/api/v1/users/{user_id}` | `users.py:27` |

### 2.4 Teams

| 方法 | 路径 | 源码 |
| --- | --- | --- |
| GET | `/api/v1/teams/admin/overview` | `teams.py:87` |
| POST | `/api/v1/teams` | `teams.py:93` |
| GET | `/api/v1/teams/{team_id}` | `teams.py:117` |
| GET | `/api/v1/teams/{team_id}/dashboard` | `teams.py:124` |
| GET | `/api/v1/teams/{team_id}/labeler-dashboard` | `teams.py:131` |
| GET | `/api/v1/teams/{team_id}/membership` | `teams.py:138` |
| POST | `/api/v1/teams/{team_id}/membership/subscribe` | `teams.py:144` |
| POST | `/api/v1/teams/{team_id}/membership/cancel-scheduled-change` | `teams.py:164` |
| PUT | `/api/v1/teams/{team_id}` | `teams.py:176` |
| GET | `/api/v1/teams/{team_id}/agent-settings` | `teams.py:189` |
| POST | `/api/v1/teams/{team_id}/agent-settings/avatar` | `teams.py:201` |
| PUT | `/api/v1/teams/{team_id}/agent-settings` | `teams.py:221` |
| POST | `/api/v1/teams/{team_id}/verification` | `teams.py:243` |
| GET | `/api/v1/teams/{team_id}/members` | `teams.py:256` |
| POST | `/api/v1/teams/{team_id}/members` | `teams.py:274` |
| POST | `/api/v1/teams/{team_id}/members/accounts` | `teams.py:296` |
| POST | `/api/v1/teams/{team_id}/members/import` | `teams.py:322` |
| POST | `/api/v1/teams/{team_id}/invite` | `teams.py:342` |
| GET | `/api/v1/teams/{team_id}/invitations` | `teams.py:367` |
| POST | `/api/v1/teams/{team_id}/invitations/{invitation_id}/resend` | `teams.py:380` |
| POST | `/api/v1/teams/{team_id}/invitations/{invitation_id}/revoke` | `teams.py:402` |
| POST | `/api/v1/teams/invitations/{invite_code}/respond` | `teams.py:423` |
| PUT | `/api/v1/teams/{team_id}/members/{user_id}` | `teams.py:435` |
| POST | `/api/v1/teams/{team_id}/members/batch-role` | `teams.py:459` |
| POST | `/api/v1/teams/{team_id}/members/security-reminders` | `teams.py:479` |
| DELETE | `/api/v1/teams/{team_id}/members/{user_id}` | `teams.py:501` |
| GET | `/api/v1/teams/{team_id}/budget` | `teams.py:514` |
| GET | `/api/v1/teams/{team_id}/points-budget` | `teams.py:520` |
| GET | `/api/v1/teams/{team_id}/points-budget/ledger` | `teams.py:526` |
| GET | `/api/v1/teams/{team_id}/points-budget/payment-password/status` | `teams.py:533` |
| POST | `/api/v1/teams/{team_id}/points-budget/payment-password/set` | `teams.py:544` |
| POST | `/api/v1/teams/{team_id}/points-budget/payment-password/change` | `teams.py:565` |
| POST | `/api/v1/teams/{team_id}/points-budget/payment-password/reset` | `teams.py:587` |
| POST | `/api/v1/teams/{team_id}/points-budget/recharge` | `teams.py:612` |
| POST | `/api/v1/teams/{team_id}/points-budget/withdraw` | `teams.py:619` |
| POST | `/api/v1/teams/{team_id}/points-budget/alerts` | `teams.py:638` |
| POST | `/api/v1/teams/{team_id}/budget/requests` | `teams.py:645` |
| GET | `/api/v1/teams/{team_id}/budget/requests` | `teams.py:652` |
| POST | `/api/v1/teams/{team_id}/budget/requests/{request_id}/approve` | `teams.py:659` |

### 2.5 Profile

| 方法 | 路径 | 源码 |
| --- | --- | --- |
| GET | `/api/v1/profile/me` | `profile.py:38` |
| GET | `/api/v1/profile/dashboard` | `profile.py:44` |
| PUT | `/api/v1/profile/me` | `profile.py:50` |
| POST | `/api/v1/profile/certifications/domain` | `profile.py:61` |
| POST | `/api/v1/profile/certifications/education` | `profile.py:72` |
| POST | `/api/v1/profile/certifications/materials` | `profile.py:83` |
| GET | `/api/v1/profile/certifications/materials/{file_id}/download` | `profile.py:95` |
| GET | `/api/v1/profile/certifications/review-queue` | `profile.py:111` |
| POST | `/api/v1/profile/certifications/{cert_id}/review` | `profile.py:125` |
| GET | `/api/v1/profile/points` | `profile.py:137` |
| POST | `/api/v1/profile/points` | `profile.py:143` |
| GET | `/api/v1/profile/reputation` | `profile.py:156` |
| POST | `/api/v1/profile/reputation/appeals` | `profile.py:162` |
| POST | `/api/v1/profile/points/withdraw` | `profile.py:172` |

### 2.6 Platform

| 方法 | 路径 | 源码 |
| --- | --- | --- |
| GET | `/api/v1/platform/workbench` | `platform.py:35` |
| GET | `/api/v1/platform/settlements` | `platform.py:44` |
| GET | `/api/v1/platform/payment-requests` | `platform.py:70` |
| POST | `/api/v1/platform/payment-requests/{request_id}/review` | `platform.py:96` |
| GET | `/api/v1/platform/teams/verification-queue` | `platform.py:108` |
| POST | `/api/v1/platform/teams/{team_id}/verification/review` | `platform.py:132` |
| GET | `/api/v1/platform/certifications/review-queue` | `platform.py:144` |
| POST | `/api/v1/platform/certifications/{cert_id}/review` | `platform.py:159` |
| GET | `/api/v1/platform/reputation-appeals` | `platform.py:171` |
| POST | `/api/v1/platform/reputation-appeals/{appeal_id}/review` | `platform.py:184` |
| GET | `/api/v1/platform/settings/commission` | `platform.py:196` |
| PUT | `/api/v1/platform/settings/commission` | `platform.py:205` |
| GET | `/api/v1/platform/settings/agent-embedding` | `platform.py:216` |
| PUT | `/api/v1/platform/settings/agent-embedding` | `platform.py:225` |

### 2.7 Platform Agent

| 方法 | 路径 | 源码 |
| --- | --- | --- |
| POST | `/api/v1/platform-agent/chat/stream` | `platform_agent.py:19` |
| GET | `/api/v1/platform-agent/status` | `platform_agent.py:29` |

### 2.8 Datasets

| 方法 | 路径 | 源码 |
| --- | --- | --- |
| GET | `/api/v1/datasets` | `datasets.py:46` |
| POST | `/api/v1/datasets` | `datasets.py:53` |
| GET | `/api/v1/datasets/{dataset_id}` | `datasets.py:89` |
| GET | `/api/v1/datasets/{dataset_id}/download` | `datasets.py:96` |
| PUT | `/api/v1/datasets/{dataset_id}` | `datasets.py:114` |
| PUT | `/api/v1/datasets/{dataset_id}/table` | `datasets.py:128` |
| POST | `/api/v1/datasets/{dataset_id}/media-assets/bind` | `datasets.py:142` |
| POST | `/api/v1/datasets/{dataset_id}/patch-upload` | `datasets.py:156` |
| DELETE | `/api/v1/datasets/{dataset_id}` | `datasets.py:192` |

### 2.9 Templates

| 方法 | 路径 | 源码 |
| --- | --- | --- |
| GET | `/api/v1/templates` | `templates.py:20` |
| POST | `/api/v1/templates` | `templates.py:25` |
| GET | `/api/v1/templates/{template_id}` | `templates.py:45` |
| PUT | `/api/v1/templates/{template_id}` | `templates.py:50` |
| POST | `/api/v1/templates/{template_id}/publish` | `templates.py:65` |
| GET | `/api/v1/templates/{template_id}/readiness` | `templates.py:70` |
| POST | `/api/v1/templates/validate` | `templates.py:75` |
| POST | `/api/v1/templates/{template_id}/copy` | `templates.py:81` |
| POST | `/api/v1/templates/{template_id}/archive` | `templates.py:93` |
| DELETE | `/api/v1/templates/{template_id}` | `templates.py:98` |
| GET | `/api/v1/templates/{template_id}/versions` | `templates.py:104` |
| GET | `/api/v1/templates/{template_id}/versions/diff` | `templates.py:109` |
| GET | `/api/v1/templates/{template_id}/preview` | `templates.py:121` |
| GET | `/api/v1/templates/{template_id}/export` | `templates.py:127` |

### 2.10 Tasks

| 方法 | 路径 | 源码 |
| --- | --- | --- |
| GET | `/api/v1/tasks` | `tasks.py:51` |
| GET | `/api/v1/tasks/export` | `tasks.py:83` |
| POST | `/api/v1/tasks` | `tasks.py:115` |
| POST | `/api/v1/tasks/ai-review/input/generate` | `tasks.py:121` |
| POST | `/api/v1/tasks/ai-review/matrix/generate` | `tasks.py:127` |
| POST | `/api/v1/tasks/difficulty/evaluate` | `tasks.py:133` |
| GET | `/api/v1/tasks/assigned/{code}` | `tasks.py:139` |
| GET | `/api/v1/tasks/{task_id}` | `tasks.py:144` |
| GET | `/api/v1/tasks/{task_id}/questions` | `tasks.py:149` |
| POST | `/api/v1/tasks/{task_id}/questions/batch` | `tasks.py:164` |
| POST | `/api/v1/tasks/{task_id}/questions/import` | `tasks.py:170` |
| GET | `/api/v1/tasks/{task_id}/questions/export` | `tasks.py:202` |
| GET | `/api/v1/tasks/{task_id}/questions/{question_id}` | `tasks.py:209` |
| PUT | `/api/v1/tasks/{task_id}/questions/{question_id}` | `tasks.py:214` |
| DELETE | `/api/v1/tasks/{task_id}/questions/batch` | `tasks.py:220` |
| DELETE | `/api/v1/tasks/{task_id}/questions/{question_id}` | `tasks.py:226` |
| PUT | `/api/v1/tasks/{task_id}` | `tasks.py:232` |
| POST | `/api/v1/tasks/{task_id}/publish` | `tasks.py:238` |
| POST | `/api/v1/tasks/{task_id}/status` | `tasks.py:244` |
| POST | `/api/v1/tasks/{task_id}/owner-transfer` | `tasks.py:250` |
| PUT | `/api/v1/tasks/{task_id}/internal-labelers` | `tasks.py:264` |
| POST | `/api/v1/tasks/{task_id}/request-assistance` | `tasks.py:278` |
| POST | `/api/v1/tasks/{task_id}/copy` | `tasks.py:295` |
| DELETE | `/api/v1/tasks/{task_id}` | `tasks.py:308` |
| GET | `/api/v1/tasks/{task_id}/stats` | `tasks.py:314` |
| GET | `/api/v1/tasks/{task_id}/readiness` | `tasks.py:319` |

### 2.11 Labels

| 方法 | 路径 | 源码 |
| --- | --- | --- |
| GET | `/api/v1/labels/tasks` | `labels.py:29` |
| POST | `/api/v1/labels/tasks/{task_id}/claim` | `labels.py:70` |
| GET | `/api/v1/labels/tasks/{task_id}/qualification-check` | `labels.py:82` |
| POST | `/api/v1/labels/tasks/{task_id}/complete` | `labels.py:93` |
| GET | `/api/v1/labels/my-tasks` | `labels.py:104` |
| GET | `/api/v1/labels/workbench/{task_id}` | `labels.py:114` |
| GET | `/api/v1/labels/contributions` | `labels.py:125` |
| GET | `/api/v1/labels/questions/{question_id}` | `labels.py:135` |
| GET | `/api/v1/labels/questions/{question_id}/rejection` | `labels.py:146` |
| POST | `/api/v1/labels/questions/{question_id}/llm-assist` | `labels.py:157` |
| POST | `/api/v1/labels/questions/{question_id}/ai-assist` | `labels.py:158` |
| POST | `/api/v1/labels/llm-assist/preview` | `labels.py:170` |
| PUT | `/api/v1/labels/questions/{question_id}/draft` | `labels.py:191` |
| POST | `/api/v1/labels/questions/{question_id}/submit` | `labels.py:203` |
| POST | `/api/v1/labels/questions/{question_id}/abandon` | `labels.py:218` |

### 2.12 Reviews

| 方法 | 路径 | 源码 |
| --- | --- | --- |
| GET | `/api/v1/reviews/queue` | `reviews.py:21` |
| GET | `/api/v1/reviews/stats` | `reviews.py:48` |
| GET | `/api/v1/reviews/submissions/{submission_id}` | `reviews.py:59` |
| GET | `/api/v1/reviews/submissions/{submission_id}/history` | `reviews.py:71` |
| GET | `/api/v1/reviews/submissions/{submission_id}/diff` | `reviews.py:83` |
| POST | `/api/v1/reviews/submissions/batch` | `reviews.py:95` |
| POST | `/api/v1/reviews/submissions/{submission_id}` | `reviews.py:106` |

### 2.13 Exports

| 方法 | 路径 | 源码 |
| --- | --- | --- |
| POST | `/api/v1/exports` | `exports.py:23` |
| GET | `/api/v1/exports` | `exports.py:29` |
| GET | `/api/v1/exports/{export_id}` | `exports.py:43` |
| GET | `/api/v1/exports/{export_id}/download` | `exports.py:48` |
| DELETE | `/api/v1/exports/{export_id}` | `exports.py:55` |

### 2.14 Audit Logs

| 方法 | 路径 | 源码 |
| --- | --- | --- |
| GET | `/api/v1/audit-logs` | `audit_logs.py:15` |
| GET | `/api/v1/audit-logs/export` | `audit_logs.py:56` |
| GET | `/api/v1/audit-logs/{log_id}` | `audit_logs.py:95` |

### 2.15 AI Resources

| 方法 | 路径 | 源码 |
| --- | --- | --- |
| GET | `/api/v1/ai-resources/configs` | `ai_resources.py:103` |
| POST | `/api/v1/ai-resources/configs` | `ai_resources.py:118` |
| PATCH | `/api/v1/ai-resources/configs/{provider_id}` | `ai_resources.py:131` |
| POST | `/api/v1/ai-resources/configs/{provider_id}/duplicate` | `ai_resources.py:144` |
| POST | `/api/v1/ai-resources/configs/{provider_id}/status` | `ai_resources.py:156` |
| DELETE | `/api/v1/ai-resources/configs/{provider_id}` | `ai_resources.py:169` |
| POST | `/api/v1/ai-resources/configs/{provider_id}/test` | `ai_resources.py:181` |
| POST | `/api/v1/ai-resources/configs/test-draft` | `ai_resources.py:194` |
| GET | `/api/v1/ai-resources/teams/{team_id}/budget` | `ai_resources.py:206` |
| GET | `/api/v1/ai-resources/teams/{team_id}/wallet` | `ai_resources.py:217` |
| GET | `/api/v1/ai-resources/teams/{team_id}/wallet/ledger` | `ai_resources.py:228` |
| GET | `/api/v1/ai-resources/teams/{team_id}/history` | `ai_resources.py:239` |
| POST | `/api/v1/ai-resources/teams/{team_id}/wallet/recharge` | `ai_resources.py:250` |
| POST | `/api/v1/ai-resources/teams/{team_id}/wallet/transfer-in` | `ai_resources.py:270` |
| POST | `/api/v1/ai-resources/teams/{team_id}/budget/limit` | `ai_resources.py:290` |
| POST | `/api/v1/ai-resources/teams/{team_id}/budget/alerts` | `ai_resources.py:303` |
| POST | `/api/v1/ai-resources/estimate` | `ai_resources.py:316` |
| GET | `/api/v1/ai-resources/calls` | `ai_resources.py:327` |
| GET | `/api/v1/ai-resources/teams/{team_id}/reports/cost` | `ai_resources.py:338` |
| GET | `/api/v1/ai-resources/cert-types` | `ai_resources.py:349` |

### 2.16 AI Reviews

| 方法 | 路径 | 源码 |
| --- | --- | --- |
| GET | `/api/v1/ai-reviews/tasks` | `ai_reviews.py:23` |
| GET | `/api/v1/ai-reviews/task-overviews` | `ai_reviews.py:35` |
| GET | `/api/v1/ai-reviews/task-overviews/{task_id}/submissions` | `ai_reviews.py:62` |
| GET | `/api/v1/ai-reviews/tasks/{job_id}` | `ai_reviews.py:87` |
| POST | `/api/v1/ai-reviews/tasks/{job_id}/retry` | `ai_reviews.py:98` |
| POST | `/api/v1/ai-reviews/submissions/{submission_id}/trigger` | `ai_reviews.py:112` |
| POST | `/api/v1/ai-reviews/batch-trigger` | `ai_reviews.py:126` |

### 2.17 AI Assistants

| 方法 | 路径 | 源码 |
| --- | --- | --- |
| POST | `/api/v1/ai/template-assistant/chat` | `template_assistant.py:14` |
| POST | `/api/v1/ai/task-publish-assistant/chat` | `task_publish_assistant.py:14` |

### 2.18 Notifications

| 方法 | 路径 | 源码 |
| --- | --- | --- |
| GET | `/api/v1/notifications/my` | `notifications.py:26` |
| POST | `/api/v1/notifications/my/mark-all-read` | `notifications.py:41` |
| POST | `/api/v1/notifications/my/batch-state` | `notifications.py:50` |
| POST | `/api/v1/notifications/my/{notification_id}/state` | `notifications.py:61` |
| GET | `/api/v1/notifications` | `notifications.py:73` |
| POST | `/api/v1/notifications` | `notifications.py:90` |
| GET | `/api/v1/notifications/preview` | `notifications.py:103` |
| POST | `/api/v1/notifications/mark-all-read` | `notifications.py:118` |
| POST | `/api/v1/notifications/{notification_id}/state` | `notifications.py:129` |
| POST | `/api/v1/notifications/{notification_id}/revoke` | `notifications.py:141` |
| DELETE | `/api/v1/notifications/{notification_id}` | `notifications.py:155` |

### 2.19 Uploads

| 方法 | 路径 | 源码 |
| --- | --- | --- |
| POST | `/api/v1/uploads` | `uploads.py:48` |
| GET | `/api/v1/uploads/{file_id}/download` | `uploads.py:68` |
| POST | `/api/v1/uploads/{file_id}/video-preview` | `uploads.py:85` |
| GET | `/api/v1/uploads/{file_id}/video-preview/status` | `uploads.py:98` |
| GET | `/api/v1/uploads/{file_id}/playback` | `uploads.py:110` |
| GET | `/api/v1/uploads/{file_id}/public` | `uploads.py:120` |

## 3. 分组说明

### 3.1 认证与账号

`/auth/*` 覆盖邮箱验证码、注册、管理员注册、企业注册、登录、刷新、退出、当前用户、密码修改、密码重置、撤销其他会话、OAuth 登录/回调/换票/绑定/注册/身份列表/解绑。
`/users/{user_id}` 提供用户详情和用户更新。

### 3.2 企业、成员、会员与积分

`/teams/*` 覆盖企业创建、企业详情、企业资料更新、Dashboard、企业内 Labeler 看板、企业认证提交、系统 Agent 设置和头像、成员列表、成员添加、成员账号创建、批量导入、邀请、重发/撤销邀请、邀请码响应、成员更新、批量改角色、安全提醒、成员删除、会员订阅、企业积分钱包、支付密码、充值、提现、预警，以及历史预算申请兼容接口。

### 3.3 个人资料、资质、积分与信誉

`/profile/*` 覆盖当前用户资料、个人 Labeler Dashboard、资料更新、领域/学历资质申请、资质材料上传和下载、资质审核兼容入口、个人积分查询、平台管理员积分调整、个人积分提现、信誉查询与信誉申诉。

### 3.4 平台运营

`/platform/*` 覆盖平台经营总览、结算流水、历史支付记录与兼容审核、企业认证队列和审核、资质审核队列和审核、信誉申诉审核、平台服务费率设置、平台问答 Agent Embedding 设置。
`/platform-agent/*` 覆盖平台问答 Agent 的流式聊天和状态查询。

### 3.5 生产链路

`/datasets/*` 覆盖数据集列表、创建/导入、详情、下载、元信息更新、表格快照保存、媒体素材绑定、补上传合并和删除。
`/templates/*` 覆盖模板列表、创建、详情、更新、发布、发布检查、答案校验、复制、归档、删除、版本列表、版本 diff、预览和导出。
`/tasks/*` 覆盖任务列表、任务清单导出、创建、AI 预审字段生成、AI 评分矩阵生成、难度评估、指派链接详情、任务详情、题目管理、任务更新、发布、状态流转、负责人转交、企业内 Labeler 分配、协助请求、复制、删除、统计和发布检查。

### 3.6 标注、审核、AI 与导出

`/labels/*` 覆盖任务广场、领取、领取前资质检查、完成确认、我的任务、标注工作台、贡献、单题详情、打回详情、题目级 AI/LLM 辅助、预览态 LLM 辅助、草稿保存、提交和放弃。
`/reviews/*` 覆盖人工审核队列、统计、提交详情、审核历史、字段 diff、批量审核和单条审核。
`/ai-reviews/*` 覆盖 AI 预审任务队列、任务概览、任务下提交明细、job 详情、重试、单条触发和批量触发。
`/ai-resources/*` 覆盖 AI Provider 配置、复制、启停、删除、连接测试、草稿测试、企业 AI 预算、AI 钱包、钱包流水、统一历史、充值、企业积分转入、预算限制、预算预警、成本估算、调用日志、成本报表和资质类型聚合。
`/ai/template-assistant/chat` 与 `/ai/task-publish-assistant/chat` 分别服务模板搭建助手和任务发布助手。
`/exports/*` 覆盖导出任务创建、列表、详情、下载和取消/删除。

### 3.7 审计、通知与上传

`/audit-logs/*` 覆盖审计日志列表、导出和详情。
`/notifications/*` 覆盖个人通知、个人全部已读、个人批量状态、个人单条状态、企业通知列表、创建、分发预览、企业上下文全部已读、企业通知状态、撤回和软删除。
`/uploads/*` 覆盖文件上传、文件下载、视频预览创建、视频预览状态、播放地址和公开文件访问。
