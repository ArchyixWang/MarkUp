# Team, User, Profile API

## 用户

- `GET /api/v1/users/{user_id}`：用户详情，包含企业、资质和统计。
- `PUT /api/v1/users/{user_id}`：更新用户角色或状态。

## 企业

企业作用域接口需要 bearer token 和 `X-Team-ID`。

- `GET /api/v1/teams/admin/overview`：管理员企业概览，不需要 `X-Team-ID`。
- `POST /api/v1/teams`：创建企业，当前用户自动成为 `team_admin`，并自动挂载一个系统 `Agent` 成员。
- 每个企业必须且只能有一个 active `team_admin`。当前没有独立的管理员移交流程，因此成员管理、邀请、导入、批量改角色、禁用和删除都不得创建第二个 `team_admin`，也不得移除或禁用唯一 `team_admin`。
- `GET /api/v1/teams/{team_id}/agent-settings`：读取系统 `Agent` 设置，返回只读账号信息、当前显示名称、头像、默认值与官方预设头像列表。
- `PUT /api/v1/teams/{team_id}/agent-settings`：更新系统 `Agent` 的 `display_name` 与 `avatar`；仅 `Team Admin` 可修改，写入 `system_agent_settings_updated` 审计日志。
- `POST /api/v1/teams/{team_id}/agent-settings/avatar`：上传企业系统 `Agent` 的自定义头像；仅 `team:manage` 且满足 `team_admin_only` 的调用者可用，不再复用任务文件上传权限模型，返回可直接保存到 Agent 设置的头像 URL。
- `GET /api/v1/teams/{team_id}`：企业详情。
- `GET /api/v1/teams/{team_id}/dashboard`：企业工作台 Dashboard 聚合数据。需要 `Authorization + X-Team-ID`，路径 `team_id` 必须与 `X-Team-ID` 一致，权限为 `team:read`。
- `GET /api/v1/teams/{team_id}/labeler-dashboard`：企业内 Labeler 项目看板。需要 `Authorization + X-Team-ID`，路径 `team_id` 必须与 `X-Team-ID` 一致，当前成员必须是该企业 `labeler`。
- `PUT /api/v1/teams/{team_id}`：更新企业资料。
- `POST /api/v1/teams/{team_id}/verification`：提交或重新提交企业认证，状态进入 `pending_review`。
- `GET /api/v1/teams/{team_id}/membership`：读取企业会员套餐、有效期、套餐表、三项资源用量和超额项；旧企业缺少会员字段时按 `Free` 返回。
- `POST /api/v1/teams/{team_id}/membership/subscribe`：购买、续费或预约降级会员套餐；请求体为 `target_plan` 与可选 `payment_password`。`basic/pro/enterprise` 立即扣企业积分钱包并生效；`free/basic/pro` 低于当前套餐时只预约到当前有效期结束后生效，不退款。
- `POST /api/v1/teams/{team_id}/membership/cancel-scheduled-change`：取消已预约的会员降级。
- `GET /api/v1/teams/{team_id}/members`：成员列表。
- `POST /api/v1/teams/{team_id}/members`：添加已有用户为企业成员。
- `POST /api/v1/teams/{team_id}/members/accounts`：创建可登录成员账号并加入企业。
- `POST /api/v1/teams/{team_id}/members/import`：批量导入成员；请求体为 `rows`、可选 `default_password` 和 `send_email`。每行包含 `email`、`team_role`、可选 `username/display_name/password/assigned_review_tasks`。后端按邮箱去重；已有账号按邮箱直接加入当前企业时可省略 `username/display_name/password`，且只写入企业成员关系，不改写该账号既有 `global_role`；新邮箱仍需用行内密码或默认密码创建账号并加入企业。已在企业内的成员、重复邮箱、缺少新账号必填字段、用户名冲突或导入 `agent` 角色的行会逐行跳过。成功项写入 `member_imported` 或 `member_account_imported`，并写入企业级 `member_batch_import_completed` 汇总审计日志。
- `POST /api/v1/teams/{team_id}/invite`：邀请成员，支持 `email` 与 `code` 两种邀请模式。
- `GET /api/v1/teams/{team_id}/invitations`：邀请记录列表，支持 `status=all|pending|accepted|rejected|expired|revoked`。
- `POST /api/v1/teams/{team_id}/invitations/{invitation_id}/resend`：重发待接受或已过期邀请；`email` 模式会生成新邀请码并重新发邮件，`code` 模式会重新生成邀请码和 onboarding 链接但不发邮件，并写入 `invitation_resent` 审计日志。
- `POST /api/v1/teams/{team_id}/invitations/{invitation_id}/revoke`：撤销待接受或已过期邀请，状态变为 `revoked`，原邀请链接不可继续使用，并写入 `invitation_revoked` 审计日志。
- `POST /api/v1/teams/invitations/{invite_code}/respond`：接受或拒绝邀请。接受邀请只变更企业成员关系；已是非 `pending` 的既有账号不得因企业邀请被改写全局角色，`pending` 用户通过 onboarding 填码加入企业时仅激活为非特权全局身份（企业 Labeler 为 `labeler`，其他企业角色为 `user`）。

邀请模式：

- `invite_mode=email`
  - 请求体需要 `email`
  - 接收邀请时校验当前登录邮箱与邀请邮箱一致
  - 可发邮件
- `invite_mode=code`
  - 请求体不需要 `email`
  - 供已注册用户在 `/onboarding` 填写企业邀请码加入
  - 接收邀请时不校验邮箱一致性
  - 重发时只重新生成邀请码和 onboarding 链接，不发邮件
- 历史缺失 `invite_mode` 的旧邀请记录，运行时按 `email` 模式处理
- `PUT /api/v1/teams/{team_id}/members/{user_id}`：更新企业角色、权限和审核任务。
- 涉及 `team_admin` 的额外规则：如果企业内已经存在 active `team_admin`，新增成员、创建账号、邀请、导入、接受邀请、改角色和批量改角色都不得再写入第二个 `team_admin`；唯一 `team_admin` 也不得被改角色、禁用或删除。
- 成员添加、成员账号创建、邀请和成员更新如显式提交 `permissions`，权限集合必须是目标 `team_role` 默认权限的子集；不得通过 `permissions` 把 `labeler/reviewer/owner` 提升到超出其企业角色边界的管理能力。未提交 `permissions` 时按目标角色默认权限写入；已显式提交的收窄权限是运行时鉴权的上限，不得再与角色默认权限合并。
- `POST /api/v1/teams/{team_id}/members/batch-role`：批量修改成员企业角色；请求体为 `user_ids` 与目标 `team_role`，当前用户、非本企业成员和已是目标角色的成员会跳过；成功成员重置为目标角色默认权限，逐项写入 `member_role_batch_updated` 审计日志，并写入企业级 `member_role_batch_update_completed` 汇总日志。
- `POST /api/v1/teams/{team_id}/members/security-reminders`：向指定成员发送账号安全提醒；请求体为 `user_ids`、可选 `title` 和 `content`。后端仅向当前企业 active 成员发送站内通知，跳过不存在、已禁用或不属于当前企业的用户；成功后创建 `target_type=member` 的企业通知，并写入 `member_security_reminder_sent` 审计日志。
- `DELETE /api/v1/teams/{team_id}/members/{user_id}`：移除成员；不可移除自己。

企业角色：

- `team_admin`
- `owner`
- `reviewer`
- `agent`
- `labeler`

说明：

- `agent` 现在是企业内置系统成员角色，只用于企业图、审计语义和资源治理展示。
- 系统 Agent 的默认显示名称固定为 `Agent`，角色标签也统一显示为 `Agent`。
- 系统 Agent 的可配置字段仅有 `display_name` 和 `avatar`；`username` 保持系统生成且不可修改。
- 普通成员管理接口不接受人工创建、邀请、编辑、禁用、删除或批量改角色为 `agent`。
- 兼容历史数据时，后端会把 `team_role=agent` 的成员按系统 Agent 只读处理；即使旧记录尚未补齐 `is_system_member=true`，也不可被人工修改或删除。
- 历史 `agent` 旧数据不在运行时自动修正；如缺少系统 Agent 所需的档案或默认资料，需先人工清洗数据，再进入 `Agent 设置` 维护界面。

前端能力判断优先看 `permissions`，不要只依赖角色名。

## 企业工作台 Dashboard

`GET /api/v1/teams/{team_id}/dashboard` 用于企业用户进入 `/workspace` 后的默认企业看板。前端先调用 `GET /teams/admin/overview` 取得默认企业，再携带同一企业的 `X-Team-ID` 调用本接口。第一版口径为当前企业全量累计与最近 5 条记录，不提供日期筛选，不新增数据库表。

响应顶层字段固定为：

- `team`：企业名称、状态、认证状态、成员统计和当前会员摘要。
- `viewer_role`：当前访问者在企业内的角色。
- `summary_cards`：看板首屏指标卡，覆盖活跃任务、待人工审核、AI 预审队列、导出任务、企业积分和成员额度。
- `todo_items`：待办/风险条目，包含目标工作台页面 `target_page`。
- `production`：任务状态统计、题目领取/提交/通过/打回统计、最近活跃任务 Top 5。
- `review`：当前角色可见审核统计。Reviewer 只统计分配给自己的任务提交，Team Admin / Owner 可看当前企业范围。
- `ai`：AI 预审 job 状态摘要、AI 钱包余额、Provider 启用/共享数量和最近 job。
- `exports`：导出任务状态摘要和最近导出 Top 5；无 `task:manage` 权限的角色返回 0 和空数组。
- `resources`：企业积分钱包余额、预扣、已花销、可用余额，以及会员三项额度用量。
- `governance`：当前角色可见的最近通知、Team Admin/Owner 可见的重要审计日志、生产资源开关异常。
- `shortcuts`：按 Team Admin / Owner / Reviewer / Agent 返回的主操作入口。Reviewer 不返回任务生产管理主入口；Agent 聚焦资源配置。
- `generated_at`：服务端生成时间。

## 企业内 Labeler Dashboard

`GET /api/v1/teams/{team_id}/labeler-dashboard` 用于企业内 Labeler 进入 `/workspace` 后的默认项目看板。该接口只返回当前登录 Labeler 在当前企业内已分配或已领取的公司项目数据，不返回企业全局生产、企业钱包、成员治理、审计日志等管理视角数据。

权限与隔离规则：

- 必须携带 `Authorization` 和 `X-Team-ID`。
- 路径 `team_id` 必须与 `X-Team-ID` 一致。
- 当前用户必须是该企业 active `labeler` 成员。
- 返回数据必须严格限制在当前企业项目和当前 Labeler 相关题目/提交内，不得混入公开任务广场或其他企业数据。

响应顶层字段固定为：

- `viewer_role`：固定为 `team_labeler`。
- `team`：企业基本摘要。
- `profile`：当前 Labeler 展示资料。
- `summary_cards`：公司分配任务、待标注题目、待修改题目、待审核提交、已通过、项目完成率等指标。
- `todo_items`：当前企业项目待办。
- `labeling`：当前 Labeler 在企业项目内的任务、题目和提交分布。
- `quality`：通过率、返工率、待审核和已审核摘要。
- `recent_tasks`：我的公司项目。
- `recent_records`：最近提交/审核记录。
- `notifications`：面向当前 Labeler 的企业项目通知；企业广播默认不下发给普通 Labeler。
- `shortcuts`：继续公司项目、项目历史、企业公告、个人资料等入口。
- `generated_at`：服务端生成时间。

## 企业会员

会员等级 V1 只限制企业级三项资源：成员上限、活跃生产任务数和数据集存储容量。成员上限只统计真实 active 企业成员；企业内置系统 `Agent`、`is_system_member=true` 的成员或 `team_role=agent` 的兼容旧记录不计入会员成员用量。套餐固定为：

| 套餐 | 年费 | 成员上限 | 活跃生产任务 | 数据集存储 |
| --- | ---: | ---: | ---: | ---: |
| Free | 0 | 3 | 3 | 3 GB |
| Basic | 999 | 10 | 5 | 20 GB |
| Pro | 3,999 | 50 | 30 | 500 GB |
| Enterprise | 19,999 | 300 | 200 | 2 TB |
| More | 联系平台定制 | 定制 | 定制 | 定制 |

`More` 是展示型联系入口，不作为普通企业可写入的套餐枚举。普通企业会员字段只允许 `free/basic/pro/enterprise`；`membership_status=expired` 或会员到期时，后端按 `Free` 有效额度计算限制。

`GET /api/v1/teams/{team_id}/membership` 返回结构至少包含：

- `team_id`
- `current_plan`
- `effective_plan`
- `status`
- `started_at`
- `expires_at`
- `next_plan`
- `last_paid_at`
- `plans`
- `usage.members / usage.active_tasks / usage.storage_bytes`
- `limits.members / limits.active_tasks / limits.storage_bytes`
- `over_limit_items`

购买规则：

- 年付，不自动续费。
- 升级或续费立即按目标套餐年费全额扣企业积分钱包，V1 不做折算。
- 扣费成功写入企业钱包 `membership_fee` 流水和 `membership_subscribed` 审计日志。
- 降级不退款，只写 `membership_next_plan`，到当前有效期结束后生效。
- 取消预约降级写入 `membership_scheduled_change_cancelled` 审计日志。
- 余额不足、支付密码错误、缺少 `team:manage` 或 `X-Team-ID` 与路径企业不一致时失败。

限制规则：

- 成员上限在添加已有用户、创建成员账号、批量导入和接受邀请时校验 active 真实成员数；企业内置系统 Agent 不占用成员名额。
- 活跃生产任务上限在任务发布、Team Admin 审批发布和恢复暂停任务时校验；`pending_review/published/paused` 计入，`draft/finished` 不计入。
- 数据集存储上限在数据集上传/导入前按当前 `Dataset.storage_bytes` 总和加本次导入大小校验。
- 到期或降级后既有成员、任务和数据集保留，不自动删除、禁用或暂停；只阻断新增成员、发布/恢复任务和继续导入超额数据集。

当前前端企业信息页使用 `GET /teams/admin/overview` 取得默认企业，再通过 `PUT /teams/{team_id}` 保存企业资料。当前企业资料分为四块：

- 基本信息：企业名称、行业、联系电话、官网、地址、简介和 Logo URL。
- 开票信息：保存在 `billing_info`。
- 邮寄信息：保存在 `mailing_info`。
- 企业认证：通过独立接口提交。

`PUT /teams/{team_id}` 当前支持的新增资料结构：

- `billing_info`
  - `invoice_type`
  - `invoice_title`
  - `tax_number`
  - `invoice_address`
  - `invoice_phone`
  - `bank_name`
  - `bank_account`
  - `invoice_email`
  - `invoice_remark`
- `mailing_info`
  - `recipient_name`
  - `recipient_phone`
  - `region`
  - `detail_address`
  - `postal_code`
  - `address_alias`
  - `is_default`

企业认证继续使用 `POST /teams/{team_id}/verification` 提交主体名称、统一社会信用代码、认证联系人、联系电话和材料列表；前端应先通过 `POST /uploads` 上传认证材料文件，再把上传结果中的材料地址作为 `verification_materials` 提交，不向用户暴露可手填的 URL 文本框。接口会把 `verification_status` 置为 `pending_review`，并写入 `team_verification_submitted` 审计日志。平台审核回写接口和撤回认证仍待后续补齐。

企业详情当前建议返回企业认证字段：

- `verification_status`：`unverified` / `pending_review` / `verified` / `rejected`。
- `legal_name`
- `registration_number`
- `verification_contact`
- `verification_phone`
- `verification_materials`
- `verification_review_comment`
- `verification_submitted_at`
- `billing_info`
- `mailing_info`

当前成员管理页使用 `GET /teams/{team_id}/members` 作为主表格数据源。成员对象建议至少返回：

- `user_id`
- `username`
- `display_name`
- `email`
- `avatar`
- `position`
- `phone`
- `team_role`
- `team_role_label`
- `member_status`
- `email_verified`
- `permissions`
- `permission_count`
- `assigned_tasks`
- `assigned_task_count`
- `joined_at`
- `is_current_user`
- `is_system_member`
- `actions.can_edit`
- `actions.can_remove`
- `actions.can_disable`

职位与手机号在用户资料存在时可直接返回并展示；最近活跃时间当前后端仍未返回时，前端按设计显示 `-`，不做展示层伪造。

## 企业积分预算

- `GET /api/v1/teams/{team_id}/points-budget`
- `GET /api/v1/teams/{team_id}/points-budget/ledger`
- `POST /api/v1/teams/{team_id}/points-budget/recharge`
- `POST /api/v1/teams/{team_id}/points-budget/withdraw`
- `POST /api/v1/teams/{team_id}/points-budget/alerts`

当前活跃前端资源配置页使用企业积分预算接口承接“积分预算治理”主路径，返回结构固定为：

- `team_id`
- `total_points`
- `committed_points`
- `settled_points`
- `remaining_points`
- `usage_percent`
- `alert_enabled`
- `alert_threshold`
- `updated_at`

说明：

- `committed_points` 与 `settled_points` 当前按任务 `reward_rule + quota/stats` 聚合得出，用于观察任务奖励对企业积分预算的占用。
- `POST /points-budget/recharge` 为模拟充值流程，不接真实支付网关；持久化结果是增加企业积分总额并写入 `points_budget_recharged` 审计日志。
- `POST /points-budget/alerts` 用积分预算使用率阈值配置预警，并写入 `points_budget_alert_updated` 审计日志。
- 当前活跃前端主路径不包含冻结、扣减、冲正和自动阻断，后续如新增需同步更新活跃文档。

## 历史预算申请接口

- `GET /api/v1/teams/{team_id}/budget`
- `POST /api/v1/teams/{team_id}/budget/requests`
- `GET /api/v1/teams/{team_id}/budget/requests`
- `POST /api/v1/teams/{team_id}/budget/requests/{request_id}/approve`

Agent 可申请预算；Owner / Team Admin 可审批。

`/teams/{team_id}/budget/requests*` 与 `/ai-resources/teams/{team_id}/budget*` 仍作为历史 Token 预算兼容接口保留。它们不再是当前资源配置页的活跃前端主路径；当前主路径已收敛为企业积分预算治理与 AI 资源观察。

## Labeler 个人中心

- `GET /api/v1/profile/me`
- `PUT /api/v1/profile/me`

资料字段包括：

- `avatar`：用户头像 URL，写入 `users.avatar`，响应中的 `user.avatar` 返回最新值。
- `display_name`
- `real_name`
- `gender`
- `birthday`
- `profession`
- `work_years`
- `bio`
- `phone`
- `location`
- `education_summary`：Labeler 基础信息页的最高学历，当前 UI 使用 `博士` / `硕士` / `本科` / `大专` / `高中及其他`。
- `education_school`：最高学历就读院校，Labeler 基础信息页直接输入。
- `education_report_mode`：`chsi` / `manual`，分别对应学信网验证报告和非学信网学历认证材料。
- `education_report_documents`：学历/学籍验证材料数组，前端通过 `POST /profile/certifications/materials` 上传后把返回的 `file_id/url/filename/content_type/size/type` 回写到该字段。
- `expertise_tags`
- `notification_settings`：个人通知偏好。当前公告通知页用它保存站内/邮件偏好和系统、企业、审核、导出类型偏好；企业级强制通知策略不由该字段控制。

头像上传复用 `POST /api/v1/uploads`。当请求无 `X-Team-ID` 且 `category=image` 时，认证用户可上传个人头像，文件归属作用域为 `profile:{user_id}`；该窄口仅接受 JPG、PNG 或 GIF。真实文件内容写入文件系统或后续对象存储，MongoDB 只保存访问 URL 和元数据；头像返回 `/api/v1/uploads/{file_id}/public`，用于 Ant Design `Avatar` 直接渲染。企业材料和生产文件仍需企业上下文及对应权限。

账号管理页的“加入企业”仅复用 `POST /api/v1/teams/invitations/{invite_code}/respond` 的 `accept` 动作；拒绝邀请仍保留在邀请链接或后续通知流中。

`GET /profile/me` 额外返回 `labeler_account`，用于 Labeler 登录后的账号管理页：

- `welcome_title` / `welcome_subtitle`
- `basic_info.completed_count`、`total_count`、`completion_percent`、`missing_fields`
- `certifications.total_count`、`approved_count`、`pending_count`、`rejected_count`、`education_status`、`domain_status`
- `points`
- `readiness_steps`

## 资质认证

当前实现包含两套历史接口命名，后续应逐步收敛：

- `GET /api/v1/cert-types`
- `POST /api/v1/cert-types`
- `POST /api/v1/certifications/apply`
- `GET /api/v1/certifications/my`
- `GET /api/v1/certifications/review-queue`
- `POST /api/v1/certifications/{cert_id}/review`
- `POST /api/v1/profile/certifications/domain`
- `POST /api/v1/profile/certifications/education`
- `POST /api/v1/profile/certifications/materials`
- `GET /api/v1/profile/certifications/materials/{file_id}/download`
- `GET /api/v1/profile/certifications/review-queue`
- `POST /api/v1/profile/certifications/{cert_id}/review`

资质审核是平台运营能力，Team Admin 不能审批 Labeler 资质。学历认证当前不接学信网回调，改为用户选择学历并上传证明材料（如学信网截图、毕业证书、学位证书）。个人资质材料上传限制单文件 1GB，当前仅支持图片或 PDF。材料下载受权限保护：本人可下载自己的材料，拥有全局 `certification:review` 或 `platform:manage` 权限的运营角色可下载审核材料；请求携带 `X-Team-ID` 时，企业成员自定义权限不会提升为平台运营权限。

Labeler 职业资质认证页使用 B 站职业认证式的两级行业选择，但内容已替换为 MarkUp：

- 行业：财经领域、司法领域、心理领域、医疗领域、教育领域。
- 职业：财经包含金融通用资质、会计税务从业人员、期货从业人员、拍卖师、保险从业人员、证券从业人员、基金从业人员；司法包含公证员、法官、大学法学院教师/教授、仲裁员、执业律师、检察官、法律职业资格；心理包含心理学社会企业工作人员、心理学历、心理治疗师、心理学学者、心理咨询师、临床心理学从业者；医疗包含卫生专技人员、健康系统社会职务人员、护士、医学学历、高校医学教师、医生、药师；教育包含高中/中学/小学教师、大学教师、幼师。
- `POST /profile/certifications/domain` 新增/使用字段：`industry`、`domain`、`cert_name`、`real_name`、`display_type=detail|fuzzy`、`organization`、`title`、`registration_number`、`documents`、`supplement_documents`、`agreement_accepted`。前端只有在必填项完整、专业资质材料至少 1 份且勾选协议后才启用“提交申请”。
- 说明页为前端静态工作台子页：`certification-rules`、`certification-material-guide`、`certification-user-agreement`，均归属 Labeler 账号管理，不开放给企业角色。

## 积分

- `GET /api/v1/profile/points`：当前用户积分、收益数据概览和流水。
- `POST /api/v1/profile/points`：平台管理员积分调整预留接口；只认可全局 `platform:manage`，企业作用域权限不授予积分调整能力。

`GET /profile/points` 的 `overview` 字段供 Labeler 积分管理页展示收益数据概览：

- `total_points`
- `available_points`
- `settled_points`
- `pending_points`
- `spent_points`
- `today_points`
- `month_points`
- `level`
- `next_level_gap`
- `updated_at`

Labeler 积分管理页当前只展示收益数据概览；`level` 和“下级还差”可跳转到前端静态 `points-level-rules` 等级规则页。当前等级规则页先按累计积分展示 Bronze / Silver / Gold 三档说明，后续真实等级门槛仍以后端积分策略为准。

当前积分结算规则：

- 人工审核 `approved` 后，后端按任务奖励口径为标注员写入 `points_wallets` 和 `points_ledger`：`mode=item` 使用 `points_per_item`/`unit_points`，`mode=task` 使用 `total_points` 按任务题目总数折算出的单题积分。
- 自动结算流水使用 `source_type=submission_review`、`source_id=submission_id` 做幂等保护，避免批量审核重试或重复调用导致重复入账。
- `reason` 默认记录为任务标注审核通过。人工调整积分仍使用 `POST /profile/points` 并写 `points_added` 审计日志。

企业积分钱包接口已接入资源配置页主路径：

- `GET /api/v1/teams/{team_id}/points-budget`
- `POST /api/v1/teams/{team_id}/points-budget/recharge`
- `POST /api/v1/teams/{team_id}/points-budget/alerts`

当前返回口径为：

- `balance_points`：企业当前积分余额
- `reserved_points`：仍在占用中的任务奖励预扣积分
- `spent_points`：企业累计已花销积分
- `available_points`：当前可继续分配的可用余额

补充说明：

- `GET /points-budget/ledger` 返回企业积分钱包流水，当前至少包含 `recharge / withdraw / reward_spend / platform_service_fee` 几类记录。
- `POST /points-budget/withdraw` 为企业钱包即时提现能力，请求体包含 `amount / payout_method / account_name / account_no / bank_name / note / payment_password`；其中 `account_no` 当前允许 `1-120` 个字符。只要 `available_points` 足够且支付密码正确，就会立即写入钱包出账流水并更新余额，不再创建平台待处理单。
- 充值与提现都属于企业钱包账户变动；“查看积分审计”仍用于查看操作日志，和流水表不是同一个概念。

充值仍为模拟支付流程，但会真实持久化企业钱包余额。提现同样为模拟财务流程，不生成真实支付单；只要企业钱包 `available_points` 足够且支付密码正确，就立即完成出账、写入企业钱包流水并更新余额，不再进入平台待处理队列。审核通过后的积分发放会同步扣减企业钱包并累加 `spent_points`，同时按平台费率额外扣减需求方服务费。历史 AI 预算申请/审批接口仍保留为兼容能力，但当前资源配置页前端不再暴露该链路。
## 2026-05-31 账号字段补充

- 成员账号创建 `POST /api/v1/teams/{team_id}/members/accounts` 现要求 `display_name + username + email + password + team_role` 全量明确提交；不再自动用 `username` 回填显示名。
- 批量导入 `POST /api/v1/teams/{team_id}/members/import` 中，新建账号行必须显式提供 `username` 与 `display_name`；缺失、纯空白或格式非法的行会逐行跳过并返回 `reason`，不会整包失败。
- 常用用户返回体如 `GET /api/v1/teams/{team_id}/members`、`GET /api/v1/users/{user_id}`、`GET /api/v1/profile/me` 中的 `user` 字段当前都应提供 `display_name`，页面展示优先使用 `display_name`。
- `real_name` 继续独立，仅用于实名、认证和严肃资料场景；不得再把 `username` 或 `display_name` 当作实名字段解释。
## 2026-05-31 邀请链接与展示字段补充

- `POST /api/v1/teams/{team_id}/invite` 与 `POST /api/v1/teams/{team_id}/invitations/{invitation_id}/resend` 返回的 `invite_url` 现已统一为绝对链接，格式为 `FRONTEND_APP_URL + /onboarding?organization_action=join&invite_code=...`。
- 生产环境 `FRONTEND_APP_URL` 必须配置为公网 HTTPS 站点 origin，例如 `https://app.example.com`；不得包含 path、query、fragment 或私网/localhost 主机，否则邀请链接和 OAuth 回跳目标会在启动配置校验中被拒绝。
- `invite_mode=code` 的邀请不绑定邮箱，供已注册且登录的 `pending` 用户在 onboarding 填码加入；重发时生成新邀请码与新的绝对 `invite_url`，但不发送邮件。
- `invite_mode=email` 继续校验登录邮箱与受邀邮箱一致；历史缺失 `invite_mode` 的记录在运行时按 `email` 处理。
- 成员、邀请记录、邀请人摘要等用户展示位继续优先返回并消费 `display_name`；`username` 仅作为登录账号辅助展示，不替代显示名。
## 2026-05-31 钱包口径补充

- `/teams/{team_id}/points-budget*` 继续表示企业任务奖励积分钱包，不承接 AI 共享路由计费。
- 当前主返回口径固定为 `balance_points / reserved_points / spent_points / available_points`。
- `reserved_points` 当前按“已发布任务奖励占用”口径聚合，用于限制可分配余额与可提现余额。
- `available_points` 同时也是当前可支配余额与可提现余额；预扣中的积分不能提现。
- AI 调用积分钱包已拆分到 `docs/api/review-ai-export.md` 的 `/ai-resources/teams/{team_id}/wallet*`。
