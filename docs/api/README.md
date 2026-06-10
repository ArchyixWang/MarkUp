# MarkUp API 文档入口

本文档目录是当前后端 API 契约的唯一活跃入口。

## 通用规范

- Base URL：`/api/v1`
- 数据格式：JSON；上传接口使用 `multipart/form-data`
- 认证：`Authorization: Bearer <access_token>`
- 企业作用域接口：额外携带 `X-Team-ID: <team_id>`
- 成功响应：`code`、`message`、`data`、`request_id`、`timestamp`
- 分页响应：`data.items` + `data.pagination`
- 错误响应：`code`、`message`、`detail`、`request_id`、`timestamp`
- ID：MongoDB ObjectId 风格的 24 位十六进制字符串
- 时间：ISO 8601

错误码分组：

| 范围 | 类型 |
| --- | --- |
| `0` | 成功 |
| `40001-40099` | 参数校验 |
| `40101-40199` | 认证 |
| `40301-40399` | 权限 |
| `40401-40499` | 资源不存在 |
| `40901-40999` | 状态/唯一性冲突 |
| `42201-42299` | 业务规则限制 |
| `50001-50099` | 系统或第三方服务错误 |

## 模块文档

| 文档 | 模块 |
| --- | --- |
| `auth.md` | 注册、登录、刷新、登出、OAuth、onboarding、密码与邮箱验证码 |
| `team-profile.md` | 用户、企业、成员、资质、积分 |
| `production.md` | 数据集、模板、任务、题目、Owner 生产链路 |
| `labeling.md` | 任务广场、接单、标注工作台、草稿、提交、贡献 |
| `review-ai-export.md` | 人工审核、AI 预审、AI 资源、导出、审计、上传、WebSocket |
| `platform.md` | 平台运营工作台、服务费结算、提现处理、企业认证与平台规则 |

## 当前集成状态

- `POST /auth/onboarding/complete` 已由后端实现，前端完成 onboarding 后应使用后端返回的 `LoginPayload` 更新会话。
- `GET /labels/tasks` 已接入真实接口，支持任务广场筛选、排序和分页参数。
- `POST /labels/tasks/{task_id}/claim` 已支持 `bundle_size`，后端按可用题目数量分配任务包。
- 2026-05-27 前端集成需求中的 onboarding 与任务广场接口已落入当前模块文档，不再保留独立旧需求文档。
- 2026-06-02 模板 Designer 新增 `POST /api/v1/ai/template-assistant/chat`，用于模板搭建 AI 浮窗助手生成结构化待应用变更；该接口记录在 `review-ai-export.md`。
- 2026-06-02 任务发布向导新增 `POST /api/v1/ai/task-publish-assistant/chat`，用于任务发布 AI 浮窗助手生成结构化待应用变更；该接口记录在 `review-ai-export.md`。
