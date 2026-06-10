# MarkUp（马克派） 需求基线与注意事项

**维护目的**：把现有 `../markup_requirements.md` 与 `../api/README.md` 中会影响前后端实现的事实整理成开发基线，防止后续功能扩展或实现细节偏离。
**创建日期**：2026-05-21
**事实来源**：`../markup_requirements.md`、`../api/*.md`。原始交付文档不在此处重写，本文用于开发校准、TODO 拆解与偏差确认。

## 1. 偏差处理协议

- 写代码前必须先查阅本文、`../planning/TODO.md` 和 `../architecture/SYSTEM_ARCHITECTURE.md`，确认需求、接口、状态机、权限和架构边界。
- 每次拉取最新代码后，必须阅读合作者最新改动，重点查看 `git log`、相关 diff 和更新后的活跃文档，再继续实现或重启验证。
- 任何实现如果与本文、API 文档或需求文档不一致，先停止扩大改动，明确列出偏差点、影响范围和可选方案。
- 已确认的新需求、新约束或取舍，必须同步补充到本文、`../planning/TODO.md`、`../architecture/SYSTEM_ARCHITECTURE.md` 或 `../planning/PROGRESS_LOG.md`，再继续实现。
- 完成代码、完成测试、推进阶段里程碑或修复偏差后，必须在 `../planning/PROGRESS_LOG.md` 记录完成范围、测试结果、剩余风险和后续动作。
- API 契约以 `../api/*.md` 为准；产品验收目标以 `../markup_requirements.md` 为准。
- 当两份文档冲突时，默认优先保证产品验收链路可跑通，并把冲突列入「待确认问题」。
- 不允许为了前端展示便利绕过状态机、权限、审计、预算、模板版本等核心约束。

## 2. 产品范围

平台目标是 Web 数据标注平台，覆盖完整数据生命周期：

- Owner 建任务、搭模板、导入数据集、配置审核规则和奖励、发布任务、查看看板、导出数据。
- Labeler 浏览任务广场、领取或接收题目、基于模板在线作答、自动保存草稿、提交、查看打回原因并修改。
- AI 审核 Agent 在标注提交后异步预审，按配置 Prompt 和评分维度输出结构化评分、建议和通过/打回/人工复核结论。
- Reviewer 进行多级人工审核、批量操作、查看 AI 评语、查看第 1/2 轮 diff、打回或通过。
- 系统支持 JSON、JSONL、CSV、Excel 多格式异步导出，并能配置字段映射和是否包含审核记录。
- CSV 下载文件不得把用户可控字符串解释为电子表格公式；结果导出和审计导出都需要转义以 `=`、`+`、`-`、`@` 开头的单元格。

## 3. 角色与权限基线

| 角色 | 来源 | 必须能力 |
| --- | --- | --- |
| Platform Admin | API 文档 | 管理资质类型、AI 接口配置、资质审核等平台级配置。 |
| Team Admin | API 文档 | 企业创始人/负责人，管理企业成员、角色、权限、预算和全部任务。 |
| Owner | 需求/API | 创建和管理任务、模板、数据集、审核配置、统计看板、导出。 |
| Reviewer | 需求/API | 查看分配审核队列，提交审核意见，批量审核，查看历史和 diff。 |
| Agent | API 文档 | 管理或申请 AI Token 预算、查看 AI 资源与调用成本。 |
| Labeler | 需求/API | 任务广场、领取题目、作答、草稿、提交、查看贡献与打回。 |
| AI Agent/System | 需求/API | 后台异步预审，写入评分、建议、决策和可追溯审核记录。 |

权限实现注意事项：

- 用户全局身份与企业内角色需要区分，例如用户可能是平台注册用户，同时在某企业内为 `owner` 或 `reviewer`。
- Team Admin 可访问企业全部范围；Owner/Reviewer/Agent 只能访问授权范围。
- `Agent` 现在定义为企业内置系统 Agent，而不是人工成员；企业创建时必须自动带出该角色，且该角色不可通过成员管理创建、邀请、编辑、禁用或删除。
- 每个企业必须且只能有一个 `team_admin`。企业创建时自动生成该唯一管理员；成员管理、邀请、导入、改角色、禁用和删除流程都不得创建第二个 `team_admin`，也不得把唯一 `team_admin` 改没。
- Reviewer 队列必须支持 `assigned_only`，不能让审核员越权查看未分配数据。
- Platform Admin 与 Team Admin 权限边界不能混淆；资质类型、AI provider 配置属于平台级能力。
- 企业 API 必须同时校验 `Authorization` 和 `X-Team-ID`，且路径企业 ID 与请求头企业 ID 必须一致。
- OAuth 首登若第三方未返回可信验证邮箱，必须走补绑邮箱流程后再签发 MarkUp 会话。
- OAuth 首登若第三方尚未绑定 MarkUp 账号，不得自动创建新用户或静默登录已有邮箱同名账号；前端必须引导用户显式选择“绑定已有账号”或“注册新的通用账号”。
- OAuth 首登选择“绑定已有账号”时，只要求用户显式输入现有账号密码并确认第三方身份尚未被其他用户绑定；不要求第三方可信邮箱与当前账号邮箱一致。
- OAuth 绑定关系收紧为“同一 provider 内一一对应”：同一个 MarkUp 账号可以并存多个不同 provider，但在同一个 provider 下最多绑定 1 个第三方账号；同一个第三方身份也最多绑定 1 个 MarkUp 账号。
- 企业账号管理页发起第三方绑定时，必须使用“绑定当前已登录账号”的独立意图；OAuth 回调后只能尝试绑定到当前会话，不得退化成普通第三方登录或切换到其他 MarkUp 账号。
- 若账号管理页绑定时发现第三方身份已绑定其他账号，或当前账号已绑定该 provider 的另一第三方身份，系统必须保持当前会话不变，返回账号管理页提示冲突错误。
- 邮箱验证码仅哈希存储，短 TTL、一次性消费、限制重发频率和失败次数。
- OAuth 补绑邮箱旧接口发现邮箱未对应现有账号并提示改走显式注册流程时，不得消费该验证码；同一张未过期验证码必须可继续用于 OAuth 注册新账号。
- 当前已确认管理员与企业注册拆分：先注册全局管理员账号，再由管理员登录后创建/维护企业；旧 `/auth/register/team` 仅保留为废弃接口并返回替代路径。

工作台与账号管理前端基线：

- 公开导航中的原 `发布任务` 销售入口调整为 `解决方案`，目标路由为 `/solutions`；历史 `/publish` 仅作为兼容入口跳转到 `/solutions`。公开 `/solutions` 当前收敛为套餐方案页，主要展示 `Free / Basic / Pro / Enterprise / More` 会员套餐和选择建议，不承载真实任务创建、发布或审批动作。企业端真实任务发布仍在 `workspace?page=publish-task`，继续遵守任务草稿、模板版本、题目绑定、AI 预审、人工复核、会员额度和发布状态机约束。
- `/workspace` 必须按当前登录用户身份生成可访问页面集合。Platform Admin 不进入企业/个人工作台，访问 `/workspace` 时必须重定向到 `/platform`；企业用户默认进入 `dashboard`；Labeler 默认进入 `labeler-dashboard`，并按是否拥有当前企业 `team_role=labeler` 分流为企业项目工作台或个人标注工作台。未授权或不可访问的 `page` query 必须回退到该身份的默认页，并用 replace 方式修正 URL，避免停留在无权限页面。
- 企业用户 `dashboard` 必须读取真实企业聚合数据，不再使用硬编码占位指标。当前口径为默认企业全量累计 + 最近 5 条记录，覆盖生产、审核、AI、导出、资源和治理摘要；Team Admin / Owner / Reviewer / Agent 按当前企业角色降级显示，Reviewer 不展示任务生产管理主入口。Agent 不新增独立看板页面，只在企业 Dashboard 内聚焦 AI 与资源入口。
- Labeler 必须区分企业内 Labeler 与个人 Labeler。企业内 Labeler 只能服务当前公司项目，默认 `企业项目工作台`，展示公司分配任务、待标注/待修改/待审核、项目完成率、返工率、我的公司项目、最近打回/通过和企业通知；不展示公开任务广场推荐、高收益任务或自由接单赚钱导向。个人 Labeler 默认 `个人标注工作台`，展示我的任务、公开任务推荐、积分收益、资质成长、信誉分和个人贡献摘要。
- 工作台侧栏必须由全局角色、企业角色和权限摘要动态生成。Team Admin / Owner / Reviewer / Agent / Labeler 看到的导航集合不同；新增页面时必须同步更新权限判定、默认页和测试。
- Reviewer 工作台侧栏按 `主页面 / 审核质检 / 企业管理 / 个人工具` 分组；审核质检下可见 `AI预审` 与 `人工审核`，便于 Reviewer 先查看 AI 预审覆盖、失败和建议，再进入人工复核；仍不显示 Owner 数据生产链路。
- 企业用户和 Labeler 的账号管理是两套页面。企业账号管理只负责个人账号维护（概览、基本资料、安全、OAuth），不承载企业信息、人员管理、资源配置或管理员注册链路；这些能力归属企业管理模块。默认企业身份、权限摘要等企业关系信息仅以账号概览中的只读摘要呈现，不再单独设置“企业与角色”子页。Labeler 账号管理只负责个人基础信息、资质材料和积分收益，不复用企业账号中心的 OAuth/企业资源配置界面。
- 企业账号管理中的 `账号概览` 只展示个人账号摘要、登录与验证状态、默认企业关系；不得展示积分、资质、学历摘要、领域标签等 Labeler 画像信息。
- 企业账号管理中的 `基本资料` 只维护头像、显示名、真实姓名、手机号、职位/岗位、所在地、个人简介等企业个人资料；学历、领域标签和其他标注员画像字段不属于企业账号中心活跃维护范围。
- 企业账号管理中的会话安全操作必须真实闭环。`退出全部其他会话` 仅允许在后端成功识别当前 refresh session 时执行；若无法识别当前会话，必须返回重新登录提示，不得以“无法识别当前会话”为由继续撤销当前用户全部会话。
- 当前登录态基线采用“access token 显式绑定 refresh session”。每个 access token 都必须携带 `sid=RefreshSession.id`，后端在每次 `get_current_user()` 鉴权时除校验 JWT 本身外，还必须校验对应 `refresh_sessions` 记录仍存在、属于当前用户、未撤销且未过期。
- 旧版未携带 `sid` 的 access token 在本次发布后直接视为未登录，统一返回 `40101`，不做兼容过渡。
- `退出全部其他会话`、登出、修改密码、重置密码，以及任何后续 revoke-all / revoke-session 流程，都必须通过撤销对应 `RefreshSession` 实现“下一次请求即失效”的 access token 即时下线语义，不再依赖 access token 30 分钟自然过期。
- 企业信息页属于企业管理模块下的资料维护子页面，只负责维护企业基本信息、开票信息、邮寄信息和企业认证；不承担企业总览、生产就绪判断、治理入口或跨模块跳转职责。
- 工作台面包屑和页面标题属于 Shell 级稳定导航体验。页面切换不应先清空再重建面包屑；动态尾部面包屑必须绑定所属父页面，只有当前页面匹配时才显示，避免切页时闪烁或串页。
- 个人信箱入口唯一：所有登录用户只在顶栏 `工作台` 按钮左侧看到信箱图标和未读角标。点击图标只打开轻量概览窗口；完整信箱通过概览中的 `查看全部` 进入工作台隐藏页 `personal-inbox`，面包屑为 `工作台 / 个人信箱`，不得加入工作台侧栏、账号页或企业管理页。
- 个人信箱必须支持用户级管理状态：已读/未读、已处理/未处理、星标/取消星标、已过期和个人软删除；批量管理只在完整页提供，小概览只允许刷新、标已读、星标和进入完整页。`target_type=team` 表示通知所属企业内企业广播，默认只面向 `team_admin / owner / reviewer`，不得发给普通 Labeler 或系统 Agent；`target_type=member/role/task` 的分发预览和创建同样不得把系统 Agent 当作人工收件人；Labeler 个人信箱不展示企业广播。`target_type=team/role` 的收件范围由企业成员和角色规则推导，不得持久化或回显客户端夹带的任意 `target_user_ids`。
- 系统必须通过同一套个人信箱同步团队业务重要节点进度。后端内部通知分发层统一处理 `event_key` 幂等、`action_url`、`metadata`、收件人解析和团队隔离；通知只用于需要行动、工作安排变化、失败异常、审核结果、导出完成、权限安全变化等高价值节点。数据导入完成、模板发布成功、领取成功、提交成功、AI 预审创建、钱包充值/转入/提现成功等确认型流水只保留页面状态和审计日志，不进入个人信箱。平台级个人资质审核、全局维护公告和跨团队治理通知不得借用 `target_type=team`，后续应独立设计 `scope=platform`。

## 4. API 通用契约

所有前后端实现必须遵守以下契约：

- Base URL 形态：`/api/v1/{module}/{resource}`。
- 数据格式：JSON，`Content-Type: application/json`；文件上传使用 `multipart/form-data`。
- 编码：UTF-8。
- 时间格式：ISO 8601，例如 `2026-05-20T20:49:00Z`。
- ID 格式：后端统一使用 MongoDB ObjectId 风格的 24 位十六进制字符串。
- 认证方式：`Authorization: Bearer <access_token>`。
- 成功响应统一包含 `code`、`message`、`data`、`request_id`、`timestamp`。
- 分页响应统一包含 `items` 与 `pagination.page/page_size/total/total_pages`。
- 错误响应统一包含 `code`、`message`、`detail`、`request_id`、`timestamp`。
- 通用查询参数包含 `page`、`page_size`、`sort`、`order`、`start_date`、`end_date`。

错误码分组必须保留：

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

## 5. API 模块覆盖清单

实现 API 时至少按下列模块保持覆盖，路径和语义以 `../api/*.md` 为准；旧单文件 API 文档内容已吸收到当前模块文档，不再保留独立旧文档。

### 5.1 认证 `/auth`

- `POST /auth/register`：用户注册，支持 `labeler/reviewer` 与邀请码。
- `POST /auth/login`：账号可为邮箱或用户名，返回 access token、refresh token、用户信息。
- `POST /auth/onboarding/complete`：通用注册后完成身份分流，支持标注员资料、需求方新建企业、邀请码加入企业，并返回新的 `LoginPayload`。该接口仅允许 `pending` 用户调用；已完成身份分流的账号不得重入 onboarding 改写自身角色，失败路径也不得提前改变用户角色。
- `POST /auth/refresh`：刷新 Token。
- `POST /auth/logout`：登出。
- `GET /auth/me`：获取当前用户、权限、头像等。
- `PUT /auth/password`：修改密码。
- `POST /auth/register/admin`：管理员账号注册。
- `POST /auth/register/team`：已废弃，返回 `40902` 和替代接口提示。
- `POST /auth/email/send-code`：发送邮箱验证码，覆盖注册和邮箱绑定场景。
- `POST /auth/email/confirm`：确认邮箱验证码。
- `GET /auth/oauth/{provider}/start`：GitHub / Google / Hugging Face OAuth 跳转入口。
- `GET /auth/oauth/{provider}/callback`：OAuth 回调入口。
- `POST /auth/oauth/exchange`：前端用 one-time ticket 换取登录态。
- `POST /auth/oauth/bind-email`：OAuth 首登时补绑并验证邮箱。
- `POST /auth/oauth/link-current-user`：账号管理页消费 OAuth ticket，并把第三方身份直接绑定到当前 bearer 对应账号。
- 认证链路中的 `LoginPayload.access_token` 必须携带 `sid`，并绑定到 `refresh_sessions` 中真实存在的一条会话记录；OAuth 登录、OAuth 绑定已有账号、OAuth 注册新账号和 onboarding 完成后的重签登录态都必须复用同一发 token 逻辑，避免出现未绑定 session 的 access token。

### 5.2 用户 `/users`

- `GET /users/{user_id}`：用户详情，包含企业、资质、统计。
- `PUT /users/{user_id}`：更新用户角色或状态。

### 5.3 企业 `/teams`

- `GET /teams/admin/overview`：管理员登录后查看企业概览、默认企业和通知占位。
- `POST /teams`：管理员创建企业，自动成为该企业 Team Admin，并同步创建一个系统 `Agent` 成员。
- `GET /teams/{team_id}/agent-settings` / `PUT /teams/{team_id}/agent-settings`：资源配置页中的 `Agent 设置` 入口；仅 Team Admin 可维护系统 Agent 的显示名称与头像，并写入审计日志。
- `GET /teams/{team_id}`：企业详情、成员统计、资源治理摘要。
- `PUT /teams/{team_id}`：更新企业基础信息。
- `GET /teams/{team_id}/members`：成员列表，支持角色和关键词筛选。
- `POST /teams/{team_id}/members`：Team Admin 添加已有用户为企业成员。
- `POST /teams/{team_id}/members/accounts`：Team Admin 创建可登录成员账号并加入企业。
- `POST /teams/{team_id}/invite`：Team Admin/Owner 邀请成员；邀请模式支持 `email` 与 `code`，其中 `code` 供已注册用户在 onboarding 填码加入企业。
- `POST /teams/invitations/{invite_code}/respond`：接受或拒绝企业邀请；接受邀请只写企业成员关系，既有非 `pending` 账号不得被企业角色反写为全局 `owner/reviewer/admin` 等身份。
- `PUT /teams/{team_id}/members/{user_id}`：更新成员角色、权限、审核任务。
- `DELETE /teams/{team_id}/members/{user_id}`：移除成员，不可移除自己。
- 企业成员管理中的人工可操作角色收敛为 `team_admin / owner / reviewer / labeler`；`agent` 仅保留为系统成员展示与审计语义，不再接受人工创建、邀请、编辑、禁用、删除或批量改角色。
- 企业成员的显式 `permissions` 只能收窄到目标 `team_role` 默认权限集合的子集，不得借由添加已有成员、创建成员账号、邀请、接受历史邀请或更新成员绕过 `Team Admin/Owner/Reviewer/Labeler` 角色边界。运行时鉴权必须尊重已持久化的显式收窄权限，不得再把目标角色默认权限并回去；历史未标记的成员记录可按角色默认权限兼容。
- 历史遗留的 `agent` 成员记录也必须按系统 Agent 只读处理，不能因为缺少兼容标记而重新暴露人工编辑入口。
- 历史 `agent` 旧数据需要人工清洗；运行时不得在启动、读接口或普通写接口中自动补齐 `is_system_member`、头像、显示名或档案记录。
- `GET /teams/{team_id}/points-budget`：企业积分钱包概览。
- `POST /teams/{team_id}/points-budget/recharge`：企业积分钱包模拟充值并持久化钱包余额。
- `POST /teams/{team_id}/points-budget/alerts`：企业积分钱包预警配置。
- `GET /teams/{team_id}/budget`：企业历史预算概览兼容接口。
- `POST /teams/{team_id}/budget/requests`：Agent 申请 Token 预算的历史流程接口。
- `POST /teams/{team_id}/budget/requests/{request_id}/approve`：Team Admin/Owner 审批 Token 预算申请的历史流程接口。
- `GET /teams/{team_id}/budget/requests`：Token 预算申请列表的历史流程接口。

当前前端资源配置页已进一步收敛为“企业积分钱包 + AI 资源观察”双主线：积分管理页不再保留首行统计栏和大治理卡，而是改为 `单行钱包摘要 + 操作条 + 钱包流水表`；四个主状态按真实口径展示 `积分余额 / 预扣积分 / 花销统计 / 可用余额`。其中 `预扣积分` 只统计已发布任务的奖励占用，任务一经发布即开始预扣，不需要等待被领取；`可提现余额` 与 `可用余额` 完全一致，预扣中的积分不能用于提现。积分管理底部表格的职责已经从“任务占用分析”切换为“企业钱包流水”，用于记录充值、提现和审核结算后的真实账户变化；“积分审计”继续保留为操作日志入口。AI 资源页不再承载任何预算语义，当前主路径收敛为 `AI 钱包摘要 + AI 积分充值(企业积分钱包划转) + 统一调用历史 + Provider 状态 + 成本估算`；`AI 积分充值` 只允许填写转入积分并输入企业现有支付密码，不展示微信、支付宝、对公转账或支付金额，调用历史由 AI 钱包转入流水与 AI 调用日志归一化返回。历史 AI 预算申请/审批接口继续作为后端兼容能力保留，但不属于当前活跃前端主路径。

企业会员等级 V1 纳入资源配置页主路径，作为 `会员与额度` Tab 展示和管理。套餐为 `Free / Basic / Pro / Enterprise / More`：Free 年费 0，限制 3 名真实企业成员、3 个活跃生产任务、3 GB 数据集存储；Basic 年费 999，限制 10 名真实企业成员、5 个活跃生产任务、20 GB；Pro 年费 3,999，限制 50 名真实企业成员、30 个活跃生产任务、500 GB；Enterprise 年费 19,999，限制 300 名真实企业成员、200 个活跃生产任务、2 TB；More 仅为“联系平台定制”展示入口，不写入普通企业套餐字段。V1 会员限制只覆盖成员上限、活跃生产任务数和数据集存储容量，不限制 AI Provider 数量、AI 调用额度、导出次数或模板数量；企业内置系统 `Agent` 只用于审计和 AI 资源治理展示，不计入会员成员上限或用量。购买/续费 `basic/pro/enterprise` 立即从企业积分钱包按年费全额扣费并写 `membership_fee` 流水；降级只预约到当前有效期结束后生效，不退款。到期或降级超额时既有成员、任务和数据集保留，只阻断新增成员、发布/恢复任务和继续导入超额数据集。企业信息页只展示只读会员 Tag 和到期时间，不提供购买入口。

### 5.4 资质认证 `/certifications` 与 `/cert-types`

- `GET /profile/me`：Labeler 个人中心账号资料、资质和积分概览。
- `PUT /profile/me`：更新 Labeler 个人资料。
- `POST /profile/certifications/domain`：提交领域认证申请。
- `POST /profile/certifications/education`：Labeler 选择学历并上传证明材料提交学历认证。
- `GET /profile/certifications/review-queue`：Platform Admin / 平台运营方查看资质审核队列。
- `POST /profile/certifications/{cert_id}/review`：Platform Admin / 平台运营方审核学历或领域资质。
- `GET /profile/points`：查询当前用户积分。
- `POST /profile/points`：平台管理员积分调整预留接口。
- `GET /cert-types`：平台资质类型列表，Platform Admin 管理。
- `POST /cert-types`：创建资质类型。
- `POST /certifications/apply`：Labeler 提交资质认证申请。
- `GET /certifications/my`：我的资质列表。
- `GET /certifications/review-queue`：Platform Admin 查看资质审核队列。
- `POST /certifications/{cert_id}/review`：Platform Admin 审核资质申请。
- `POST /tasks` 中 `required_certs` 与 `qualification_rules`：任务资质要求配置。
- `GET /labels/tasks/{task_id}/qualification-check`：标注员领取前资质检查。

### 5.5 任务 `/tasks`

- `POST /tasks`：创建任务，字段包含基础信息、奖励、截止时间/长期有效、领取后完成时限、配额、分发策略、模板、资质、审核员、AI 配置和任务用户协议。
- `GET /tasks`：任务列表，支持状态、关键词、owner、reviewer、标签筛选。
- `GET /tasks/{task_id}`：任务详情。
- `PUT /tasks/{task_id}`：更新任务；草稿可修改完整发布配置；收集中任务不能直接修改，必须先暂停发放，但任务管理详情页必须允许进入只读查看；已暂停任务仅允许修改 `description`、`rich_content`、`tags`；待审核和已结束任务不可修改但可只读查看。
- `POST /tasks/{task_id}/publish`：发布任务，前置条件为 draft 且已关联模板和题目。
- `POST /tasks/{task_id}/status`：状态控制，支持 `pause/resume/finish`。
- `DELETE /tasks/{task_id}`：删除任务，仅 `draft` 可删除。
- `GET /tasks/{task_id}/stats`：任务统计。

当前企业端发布任务实现补充：

- **存储红线：大体积文件、上传素材、多模态图片/音频/视频、导出结果文件不得直接以二进制或 base64 形式写入 MongoDB。后端必须把真实文件内容写入文件系统或后续对象存储，MongoDB 只保存 `storage/path/url/file_id/filename/content_type/size` 等访问链接和元数据。数据集行、`media_assets`、题目上下文、AI 上下文和 Reviewer 上下文只能引用文件 URL/文件 ID 与派生文本摘要；如果导入、补上传、表格编辑或派生列中出现 `data:*;base64,...`，后端必须拒绝保存并提示改用文件上传或外部 URL。`FILE_STORAGE_ROOT` 是上传文件、导出文件和视频预览派生文件的统一根目录；生产环境必须配置为绝对路径或挂载卷，本地相对路径按项目根目录解析，API、seed 脚本、后台任务和维护脚本必须使用同一个配置。**
- 数据集管理独立于模板，新增 `/datasets` 用于导入、解析、预览、列备注和参与映射列配置；数据集原始行不与模板强绑定。
- `POST /datasets` 支持 CSV、Excel(.xlsx)、JSON、JSONL；多模态数据进入第一期能力后，导入不再只保存一个全局素材列表，而是把图片、音频、视频、文档 URL/文件引用归一化到行级 `media`、`attachments` 和 `derived_context`。普通表格仍可直接导入；命中媒体 URL 的列自动生成行级媒体引用。推荐多模态数据使用 Manifest JSONL，每行声明 `external_id/data/media/attachments/derived_context`；ZIP + Manifest 和对象存储 URL 清单作为大文件场景入口。单独上传但无法绑定到行的素材仍保留在数据集级 `media_assets`，并标记为未绑定，不默认进入题目上下文。
- 数据集返回结构需要补充 `media_schema`、`context_schema`、`processing_summary` 和行级 `media` 摘要。`media_schema` 用于模板搭建和任务发布映射识别主媒体/上下文媒体；`context_schema` 用于声明 OCR、ASR、视频关键帧、caption、summary 等派生上下文；`processing_summary` 用于展示素材总数、已绑定数量、待处理数量和失败数量。`media`、`attachments`、`derived_context`、`_bindings` 属于系统上下文字段，只随 `rows/preview_rows` 参与 Renderer、AI 和审核上下文，不作为 `columns` 普通映射候选暴露。
- 数据集列表负责人只跟踪最新修改人：导入时 `updated_by` 初始化为创建人，后续基础信息保存、表格编辑、素材绑定和补上传合并都写入当前操作人。前端负责人列优先展示 `updated_by_name` 的真实姓名/显示名，不再在表格单元格里显示灰色“创建人”说明；旧数据缺少 `updated_by` 时回退创建人。
- 数据集可通过 `/datasets/{dataset_id}/download` 按 JSON、JSONL、CSV 下载原始行。
- 数据集详情页新增独立“表格编辑”工作区，基于 Ant Design Table 支持增删行、增删列和单元格编辑；图片、音频、视频列支持输入 URL 或上传到单元格后预览。保存表格编辑时调用 `/datasets/{dataset_id}/table`，后端重新归一化行级 `media`、`attachments`、`derived_context`，刷新 `columns`、`preview_rows`、`media_schema`、`context_schema` 和 `processing_summary`，确保模板搭建 ShowItem 映射、任务发布映射、AI 上下文和 Reviewer 上下文继续使用最新数据。若数据集已被 `pending_review/published/paused/finished` 任务引用，表格编辑应拒绝改写源数据，避免待审核、收集中、暂停或历史任务回放漂移。
- 数据集支持“补上传合并”：Owner 可上传一个补充数据集并选择主值字段（如 `row_id`、`external_id`、`sample_id`）作为对齐键，调用 `/datasets/{dataset_id}/patch-upload`。补充数据命中已有主值时更新该行字段和行级媒体，未命中时追加新行；不会因为补上传删除原行。补上传同样支持 CSV、Excel、JSON、JSONL、Manifest JSONL、外部媒体 URL 和图片/音频/视频文件，无法绑定到行的素材保留为数据集级 `media_assets`，默认不进入 AI 或 Reviewer 上下文。补上传后的存储用量按合并完成后的数据集快照重算，会员存储额度仅校验净增长，避免命中已有行时重复累加历史上传字节。若数据集已被 `pending_review/published/paused/finished` 任务引用，补上传应拒绝合并并保持原始行不变。
- 数据集管理页新增渲染变量能力：Owner 可基于来源列、默认值或表达式新增派生列，派生列写回数据集行、预览行和列定义，并可作为发布任务 ShowItem 映射候选。表达式当前支持 `{value}` 和 `{列名}` 占位替换，不执行任意代码。由于派生列会改写源数据快照，若数据集已被 `pending_review/published/paused/finished` 任务引用，应拒绝新增派生列；未被非草稿任务引用时，新增派生列后必须按最终 `rows + media_assets.size` 重算 `Dataset.storage_bytes`，会员存储额度仅校验净增长。
- 数据集详情页可把未绑定的 `media_assets` 绑定到指定行级 `media`，该操作会改写行级媒体、未绑定素材列表、列结构和多模态 schema；若数据集已被 `pending_review/published/paused/finished` 任务引用，应拒绝绑定并保持原始行和未绑定素材不变。
- 发布任务时继续通过 `column_mapping` 将模板内 `ShowItem` 组件实例 ID 映射到数据集列名，保持旧任务兼容；多模态任务新增 `mapping_config` 保存完整数据源映射，支持 `column/media/derived_context/attachment`。生成题目时优先使用 `mapping_config` 解析行级媒体和派生上下文，没有时回退到 `column_mapping`。映射允许留空，保证模板可复用。
- 模板搭建页 ShowItem 配置继续兼容 `config.content_field`；新 schema 可声明 `config.binding`，例如 `{ source_type: "media", media_type: "image", role: "primary", field: "image_url" }`。导入模板 schema 时需要校验 binding 与参考数据集是否匹配；没有参考数据集时只做结构校验并在发布映射阶段提示补齐。模板搭建 AI 生成或修改 ShowItem 时，应读取参考数据集的 `columns/media_schema/context_schema/sample_rows`，优先生成可映射的多模态 binding。图片 Mask 等图片标注物料的数据源候选只能来自图片类型普通列或 `media_schema` 中的图片来源，不显示 `media` 系统列表字段或非图片列。
- 数据集管理详情页需要新增样本视图和 AI/审核上下文预览：样本视图按行展示主媒体、上下文媒体、原始字段、派生上下文和附件；AI/审核上下文预览展示该行进入大模型助手、AI 预审、Labeler AI 辅助和 Reviewer 页面时的标准 `QuestionContext`，包括 provider 不支持音视频时的 OCR/ASR/关键帧降级文本。
- 本期分发策略枚举仍兼容 `first_come_all`、`quota_grab`、`assigned_link`，但活跃前端发布入口只展示两类：`first_come_all` = 包大小分配（与 Labeler 任务广场领取包大小配置对齐，可在该策略内通过 `assignment.enabled/expire_hours` 开启分享链接，分享有效期默认 72 小时且默认值应参与步骤校验）、`quota_grab` = 企业内流转（面向企业内 Labeler 分配，可通过 `assignment.target_labeler_ids` 指定企业内 Labeler）。`assigned_link` 仅作为历史兼容值保留，不再作为独立发布策略推荐或展示。发布结果中的分享链接和二维码必须使用完整同源 URL，未登录用户打开 `/tasks/assigned/{code}` 时应先登录并在登录后回到原分享链接。任务广场默认只展示个人 Labeler 可领取的 `first_come_all` 公开积分任务；企业内 Labeler 不能领取所在企业发布的公开积分任务，即使不携带 `X-Team-ID` 走个人公开入口也必须在列表、资质检查和领取接口中被过滤/拒绝。`quota_grab` 仅在当前企业 Labeler 携带 `X-Team-ID` 并请求 `team_scope=mine` 时作为企业内项目展示，且仅目标 Labeler 或未指定目标时的当前企业 active Labeler 可见可领；外部 Labeler 不得直接探测或领取。企业内流转的 Labeler 候选框只能展示当前企业 active、非系统成员的 Labeler；选择多位 Labeler 时必须用 `assignment.target_labeler_allocations = [{ labeler_id, quota }]` 保存每人任务分配百分比，比例覆盖所有已选 Labeler 且合计 `100%`。企业内流转不分配积分，发布页和编辑页必须隐藏积分分配、费用估算、所需资质领域、最低完成任务数、最低准确率和资质说明，并按 0 积分、空资质、0 门槛保存。任务管理行级更多菜单需提供企业内 Labeler 分配弹窗，用于修改 `quota_grab` 任务的 `assignment.target_labeler_ids` 与 `assignment.target_labeler_allocations`。
- 积分奖励暂用 `reward_rule.mode = task | item`，分别配置任务总积分或单条积分。
- 资源配置必须展示企业发布任务所需的积分管理：当前前端基于任务 `reward_rule` 聚合已承诺奖励、待结算奖励和任务引用；企业级积分池余额、冻结、扣减、冲正和低余额预警接口未接入前，页面必须明确显示 `待接入`，不能伪造企业积分池余额或绕过发布/审核结算规则。
- 企业端发布任务页已补充审核员、AI 预审、资质要求、截止日期、分类、难度和标签配置；标签在基础信息中按“输入一个 -> 添加 -> 下一行展示可删除标签”的方式维护，最终仍保存为 `tags: string[]`。任务分类不再提供单独的“多模态”选项，改为在基础信息中多选文本、图片、音频、视频，多个模态由所选标签共同表达。资质要求归入分发与奖励，但仅适用于包大小分配；企业内流转时同一区域改为维护企业 Labeler 和每人任务分配比例。审核拆为 `AI 预审` 与 `人工复审` 两个步骤，其中人工复审从手填审核员 ID/邮箱改为选择企业内 active Reviewer；选择多位 Reviewer 时可为每位 Reviewer 填写百分比分配，`reviewer_ids` 继续作为审核队列权限字段，分配比例写入 `review_config.reviewer_allocations`。`选择模板` 与 `绑定数据` 合并为 `模板与数据`，`分发策略` 与 `积分奖励` 合并为 `分发与奖励`，并新增 `用户协议` 步骤。AI 预审不再是单一 Prompt 文本框，必须按 `Provider -> 预设与自定义审核维度 -> AI 生成 Input 字段说明 -> AI 生成审核评分矩阵 -> 自动判定阈值 -> 后台 Output/function call 结构` 完整配置；发布任务时只选择企业已配置的 AI Provider，Provider 已封装 Base URL、API Key、Temperature、默认模型等参数，不在任务发布页单独选择审核模型。Input 字段说明由 AI 基于数据集、模板名称、字段样例和映射上下文推断字段含义，评分矩阵由 AI 基于用户选择维度生成定义、评分标准、扣分规则、打回条件和人工复核条件，发布者可编辑并确认；Output 要求由后台系统提示词维护，不在页面暴露。当前后端保存这些配置到任务草稿，标注员在任务广场领取时按 `任务详情 -> 签署协议 -> 领取确认` 三步完成接单，若任务要求协议必须在第二步签署并提交 `agreement_accepted=true`；领取超时已按 `claim_config.completion_hours` 接入超时释放、信誉扣减和草稿/提交拦截，Reviewer 队列、AI Worker 和 Provider 模态能力显式字段仍需继续接入这些字段。
- 基础信息支持 `claim_config.completion_hours` 设置标注员领取后完成时限，可不设置；超过领取后完成时限且仍未提交/通过的题目会释放回任务池并扣减信誉分，草稿保存和提交答案不得继续覆盖超时题目。截止日期支持长期有效，长期有效任务以 `deadline=null` 和 `claim_config.deadline_mode=long_term` 保存。
- 任务草稿支持 `auto_saved` 标记。Owner/Team Admin 在新建任务页填写任意有效配置后，前端防抖自动保存为草稿，离开新建任务页前会立即保存未落库变更；自动保存草稿本质仍是 `draft`，列表状态列以灰色 `自动保存` 展示并排在草稿列表顶部。手动保存或发布前保存会把 `auto_saved=false` 写回，自动保存版本从特殊展示中消失。
- 任务发布状态机新增 `pending_review`。Owner 点击发布后，任务先进入 `待审核`，由 Team Admin 审核通过后进入 `published/收集中`；Team Admin 自己发布任务可直接进入 `published/收集中`。`pending_review` 不进入任务广场，不允许领取。
- 资源配置必须展示企业发布任务所需的积分管理：当前前后端已提供企业积分钱包最小闭环，支持展示 `积分余额 / 预扣积分 / 花销统计 / 可用余额`，并允许通过模拟充值补充钱包余额、通过预警接口配置实际积分阈值。
- 当前企业积分钱包最小闭环已补充真实花销累计和审核通过后的企业侧扣减；冻结、冲正和自动阻断仍待补齐。页面和文档必须明确这些缺口，而不是伪造更多企业财务能力。
- AI 资源仅做 `Token + Cost + Provider` 观察与估算。真实消耗发生在 Provider 小号侧，平台侧只记录调用日志、Token 消耗和估算成本，不应以“AI 预算”名义向用户表达平台托管的真实资金池。
- 企业端发布任务页已补充审核员、AI 预审、资质门槛、截止日期、分类、难度和标签配置；当前后端保存这些配置到任务草稿，后续 Reviewer 队列、AI Worker 和领取前资质检查需继续接入这些字段。

### 5.6 题目 `/tasks/{task_id}/questions`

- `GET /tasks/{task_id}/questions`：题目列表，支持状态、标注员、分页。
- `GET /tasks/{task_id}/questions/{question_id}`：题目详情。
- `POST /tasks/{task_id}/questions/batch`：批量创建题目。
- `POST /tasks/{task_id}/questions/import`：导入 JSON/JSONL/Excel，最大 50MB，支持字段映射。
- `PUT /tasks/{task_id}/questions/{question_id}`：更新题目；题目 `content` 必须是非空对象。
- `DELETE /tasks/{task_id}/questions/{question_id}`：删除题目。
- `DELETE /tasks/{task_id}/questions/batch`：批量删除题目。
- `GET /tasks/{task_id}/questions/export`：导出题目，支持 json/jsonl/csv/excel。

### 5.7 模板 `/templates`

- `GET /templates`：模板列表，支持关键词和任务筛选。
- `POST /templates`：创建模板，产物是可序列化 JSON Schema。
- `GET /templates/{template_id}`：模板详情。
- `PUT /templates/{template_id}`：更新模板；已发布模板不可直接修改，需新版本。
- `POST /templates/{template_id}/publish`：发布模板。
- `GET /templates/{template_id}/versions`：模板版本列表。
- `GET /templates/{template_id}/preview`：返回渲染预览结构。

模板 schema 当前采用 `schema_version + tabs[] + components[]` 结构；Designer 可维护多 Tab，每个 Tab 内组件列表独立排序。`ShowItem` 只展示题目原始数据，不写入答案；其具体数据列在任务发布阶段通过列映射绑定。前端已提供独立 Renderer，根据同一份 schema 在 Designer 预览、历史版本预览和标注页渲染；Renderer 预览以完整子页面承载，不占用右侧属性配置面板。模板版本列表返回每个版本的完整 `schema` 快照，前端可按历史版本进行 Renderer 预览和 schema 导出，不能用 latest schema 代替历史版本。

Designer 属性面板已支持为文本类组件配置最小长度、最大长度和正则表达式，为选项类组件配置最少/最多选择和标签是否允许新建，为 LLM 组件配置提示词和输出字段；这些配置进入组件 `config` 后，`POST /templates/validate`、Designer 的 Renderer 预览页和 Labeler 正式提交链路已消费同一份 schema 执行基础运行时校验。`linkage_rules` 条件显示运行时已接入 Renderer 与后端校验，被隐藏组件不参与必填或格式校验；Designer 右侧属性面板已支持为当前选中组件配置单条基础条件显示规则。选项类组件作为联动触发字段时，Designer 必须让 Owner 选择并保存真实 `option.value`，不能要求手填可见文案；Renderer 与后端校验需兼容历史 schema 中误存的 `option.label`，按 value/label 别名匹配。多条件组合、联动校验和自定义表达式仍待补齐。LLM 调用链路仍需继续消费同一份 schema。模板画布删除到空状态时必须保留空态和重新添加入口，不能因为组件数组为空导致页面白屏。

模板 Designer 新增 `MarkUp 模版搭建 AI` 浮窗助手作为操作型 AI 能力。用户可用自然语言要求生成、删除、修改、优化模板字段，AI 返回结构化待应用变更；前端必须先展示变更详情、风险和预览，用户勾选并点击 `应用` 后才写入当前 Designer 本地 schema。AI 助手不直接调用模板保存或发布接口，应用后的持久化继续走现有模板自动保存/手动保存。Provider、鉴权、上传和调用日志复用 AI Resources；若真实 Provider 暂不可用，允许后端返回标记为 `mock` 或 `provider_parse_failed` 的结构化兜底方案用于完整交互测试，但不得伪装成真实模型结果。

模板删除规则以历史回放安全为边界：未被任务引用的草稿、已发布或已归档模板均可删除；一旦有任务引用该模板，后端必须拒绝删除，前端可引导用户归档以停止后续任务选择，但不能破坏已绑定的模板版本回放。

### 5.8 标注 `/labels`

- `GET /labels/tasks`：任务广场，支持关键词、类型、难度、资质、企业认证、标签、奖励区间、截止时间、快捷筛选、排序和分页。
- `GET /labels/tasks/{task_id}/qualification-check`：领取前资质检查，返回领域资质、已通过标注数量和历史通过率等检查项；领取接口复用同一规则。
- `POST /labels/tasks/{task_id}/claim`：领取任务包，请求体使用 `bundle_size`。
- 领取接口必须校验 `bundle_size` 属于任务广场返回的当前可用包大小选项；不可用包大小返回 `40003`，不得分配题目或创建草稿提交。
- 领取前资质检查和领取接口必须先校验分发策略可见性：个人公开 Labeler 只能处理可见的 `first_come_all` 公开积分任务；如果当前用户是该任务发布企业的 active Labeler，则不能领取本企业 `first_come_all` 公开积分任务。企业内 `quota_grab` 必须要求当前 `X-Team-ID` 对应任务企业且企业角色为 `labeler`，并满足 `assignment.target_labeler_ids` 指定范围；不满足时按任务不存在处理，不得返回资质细节、分配题目或创建草稿提交。
- 任务广场领取抽屉必须按 `任务详情 -> 签署协议 -> 领取确认` 三步执行；必签协议任务在第二步未勾选同意时不得进入确认或请求领取接口。领取成功后，前端必须携带 `task_id` 进入 `/workspace?page=labeling&task_id={task_id}`，标注工作台自动加载已领取任务、题目队列和草稿；不能要求用户复制或手输任务 ID 作为主路径。
- `POST /labels/questions/{question_id}/abandon`：放弃题目。
- `GET /labels/workbench/{task_id}`：获取已领取任务的标注工作台，含任务摘要、绑定模板版本 schema、题目列表、当前题目、草稿和进度。
- `GET /labels/questions/{question_id}`：单题详情，仅允许领取该题的 Labeler 访问。
- `PUT /labels/questions/{question_id}/draft`：保存草稿；前端建议每 30 秒自动保存，草稿按 `submissions.draft` 保存。
- `POST /labels/questions/{question_id}/submit`：提交答案，后端按任务绑定的已发布模板版本复用 `validate_template_answers` 做二次校验；校验失败返回 `42201` 和字段级 `field_errors`，通过后写入 `submissions` 并把题目状态更新为 `submitted`。AI 预审开启时，写入前必须复用任务 AI readiness；Provider 缺失、停用、跨企业或模型/评分矩阵配置失效时返回 `42201`，不得改写草稿、题目状态或创建 AI job。
- `POST /labels/questions/{question_id}/llm-assist`：调用 LLM 辅助。
- `GET /labels/contributions`：我的贡献统计，返回已领取题目、待处理题目、提交/通过/打回数量、历史通过率、估算积分和最近提交。
- `GET /labels/questions/{question_id}/rejection`：查看打回详情、AI 评论和历史轮次。

### 5.9 审核 `/reviews`

- `GET /reviews/queue`：审核队列，支持 stage、round、task、reviewer、assigned_only、AI 建议和 `submitted/processed/all` 状态视图。
- `GET /reviews/submissions/{submission_id}`：审核详情。
- `POST /reviews/submissions/{submission_id}`：提交审核，`decision` 为 `approved/rejected/revise`；打回时 comment 必填，`revise` 表示审核员就地修订标注答案并直接入库，必须提交修订说明和 `revised_answers`。
- `POST /reviews/submissions/batch`：批量审核。
- `GET /reviews/submissions/{submission_id}/history`：审核历史。
- `GET /reviews/stats`：审核统计。
- `GET /reviews/submissions/{submission_id}/diff`：差异对比。
- 审核详情、历史和 diff 支持 `assigned_only` 读取语义：默认仅允许 Reviewer 打开已分配范围；`assigned_only=false` 仅对当前企业具备 `submission:view` 的 Reviewer 放宽到同企业未分配提交，审核提交动作不因此放宽。

当前已实现人工审核基础闭环：待审/已处理队列、统计、详情、单条通过/打回/直接修订入库、批量通过/打回、基于审计日志的审核历史、`draft -> answers` 字段级 diff 和审计日志。AI 评语展示、真正多轮答案 diff、独立 review_records、提交级指派和多级 stage 仍是后续缺口。

### 5.10 导出 `/exports`

- `POST /exports`：创建异步导出任务，支持 json/jsonl/csv/excel、过滤、字段映射、重命名、审核记录。
- `GET /exports`：导出任务列表。
- `GET /exports/{export_id}`：导出详情和进度。
- `GET /exports/{export_id}/download`：下载文件流。
- `DELETE /exports/{export_id}`：取消导出任务。

当前导出过滤支持 `status`、`labeler_id` / `assigned_to`、`start_date`、`end_date`；`status` 在存在提交记录时按最新提交状态筛选，未提交题目才回落到题目状态；日期范围按提交记录最近更新时间过滤。导出行包含题目源内容和提交答案，Owner 可用 `status=approved` 导出审核通过数据。
字段重命名用于保留并改名已选导出字段；若两个源字段会映射到同一个输出列名，后端必须拒绝该导出请求，避免静默覆盖数据。

### 5.11 AI 审核 `/ai-reviews`

- `GET /ai-reviews/tasks`：AI 审核任务列表。
- `POST /ai-reviews/submissions/{submission_id}/trigger`：手动触发 AI 审核。
- `POST /ai-reviews/batch-trigger`：批量触发 AI 审核。
- `GET /ai-reviews/tasks/{task_id}`：AI 审核任务详情。

### 5.12 AI 资源 `/ai-resources`

- `GET /ai-resources/configs`：AI provider/model 配置列表；企业作用域读取要求当前企业内具备 `budget:view` 或 `ai_provider:manage`。
- `POST /ai-resources/configs`：Platform Admin 添加/更新 provider 配置。
- `GET /ai-resources/teams/{team_id}/budget`：企业 Token 预算详情。
- `POST /ai-resources/teams/{team_id}/budget/limit`：设置预算上限。
- `POST /ai-resources/estimate`：预估 Token 与成本。
- `GET /ai-resources/calls`：AI 调用日志和汇总；企业作用域读取要求当前企业内具备 `budget:view` 或 `ai_provider:manage`，普通 Labeler 不可访问。
- `POST /ai-resources/chat`：统一 AI 调用代理入口。
- `POST /ai-resources/batch`：批量 AI 调用。
- `GET /ai-resources/batch/{batch_id}`：批量任务状态。
- `POST /ai-resources/teams/{team_id}/budget/alerts`：历史 AI 预算预警兼容接口。
- `GET /ai-resources/teams/{team_id}/reports/cost`：成本统计报表。

### 5.13 审计、上传、WebSocket

- `GET /audit-logs`：审计日志列表，支持实体、动作、操作人、时间范围筛选。
- `GET /audit-logs/{log_id}`：审计日志详情。
- `POST /uploads`：上传图片或文档，单文件最大 1GB；无论上传分类如何，后端必须先拒绝可执行文件、脚本文件和危险 MIME 类型，再进入图片、文档或认证材料的业务格式校验。
- `wss://api.markup.example.com/ws?token=xxx`：WebSocket 连接。
- WebSocket 主题包含 `review:{submission_id}`、`export:{export_id}`、`task:{task_id}:stats`、`system:notifications`。

## 6. 状态机基线

### 6.1 任务状态

| 当前状态 | 动作 | 下一状态 | 约束 |
| --- | --- | --- | --- |
| `draft` | publish | `published` | 必须已关联模板和题目。 |
| `published` | pause | `paused` | Owner/Team Admin。 |
| `paused` | resume | `published` | Owner/Team Admin。 |
| `published` / `paused` | finish | `finished` | 可附带导出配置。 |
| `draft` | delete | deleted | 仅 draft 可删。 |

发布后任务只允许修改 `description`、`rich_content`、`tags`，其他影响数据解释的字段必须新建版本或与用户确认。

### 6.2 题目与领取状态

- 题目基础状态包含 `pending`、`claimed`、`submitted`、`approved`、`rejected`。
- 工作台示例中出现 `draft`，实现时可将草稿作为提交/作答态保存，但前端可以展示为 draft。
- 同一题目领取需要并发控制，避免多人同时领取同一份题目。
- 放弃题目后应释放占用并记录审计，是否保留草稿需后续确认。

### 6.3 提交与审核状态

需求主链路：

```text
[Labeler 提交] -> [AI 预审]
   ├─ 通过 -> [人工复审]
   │           ├─ 通过 -> [入库 / 可导出]
   │           └─ 打回 -> [Labeler 修改]
   └─ 打回 -> [Labeler 修改] / [人工复核]
```

实现注意：

- 每次提交必须生成或更新 `submission_id`，进入 AI 预审队列时状态应可追踪。
- AI 决策至少支持 `approved/pass`、`rejected`、`need_manual_review` 三类语义。
- 人工审核 `decision` 为 `approved/rejected/revise`；打回/修订必须有理由。
- 多轮审核需要保存 `current_round`、历史记录和 diff 基础数据。
- 最终可导出数据应是通过人工复审/终审后的结果，而不是仅 AI 通过。

### 6.4 异步任务状态

- AI 审核任务状态：`pending`、`processing`、`completed`、`failed`，架构中可增加内部 `retry` 但 API 输出需保持兼容。
- 导出任务状态：`pending`、`processing`、`completed`、`failed`；若实现 `cancelled`，需要与 API 文档确认。
- 批量 AI 任务状态需记录总数、完成数、失败数、等待数、预估成本和已用成本。

## 7. 模板 Designer / Renderer 基线

模板搭建是核心难点，必须满足：

- 左侧物料区 -> 中间画布 -> 右侧属性配置面板。
- 物料 schema 与渲染组件解耦。
- 搭建产物必须是可序列化 JSON Schema。
- 同一份 schema 既可在 Designer 预览，也可在 Labeler 工作台运行。
- 已发布模板不能直接修改，必须新建版本。

必须实现的物料：

| 物料 | API 类型 | 提交行为 |
| --- | --- | --- |
| 展示项 | `ShowItem` | 展示题目原始数据，不参与提交。 |
| 单行输入 | `TextInput` | 采集文本。 |
| 多行文本 | `TextArea` | 采集长文本。 |
| 单选 | `SingleSelect` | 枚举单选。 |
| 多选 | `MultiSelect` | 枚举多选。 |
| 标签选择 | `TagSelect` | 标签选择，可配置是否允许创建。 |
| 富文本编辑器 | `RichEditor` | 带格式长文本。 |
| 文件上传 | `FileUpload` | 上传文档类素材。 |
| 图片上传 | `ImageUpload` | 上传或预览图片。 |
| JSON 编辑器 | `JsonEditor` | 结构化数据编辑与校验。 |
| LLM 交互组件 | `LLMComponent` | 字段级模型调用，输出可作为参考或预填。 |

进阶能力：字段联动、条件显示、联动校验、自定义校验函数、分组容器、多 Tab 布局、Schema 版本管理。

## 8. AI Agent 与 AI 资源注意事项

- Owner 配置审核 Prompt 模板和评分维度，例如相关性、准确性、格式合规、安全性。
- Labeler 提交后自动入队，AI Agent 异步调用大模型。
- LLM 输出必须优先使用 Function Calling 或结构化输出，避免裸文本解析。
- 结果必须入库，并能在审核工作台查看 AI 评语、评分维度、原始 Prompt 或 Prompt 版本。
- AI 调用必须统一经过 `/ai-resources/chat` 或内部 AI Gateway，集中处理 provider、model、token 计数、成本、预算、日志、重试。
- 需要失败重试、幂等键和人工兜底路径。
- 预算需要支持 total/monthly/daily/per_task 限制、预警阈值、阻断阈值、预算申请与审批。
- API 示例中的模型名和价格是配置数据，不应硬编码到业务逻辑。

## 9. 导入、导出、上传注意事项

- 题目导入支持 JSON、JSONL、Excel，最大 50MB，并支持字段映射。
- 上传文件接口单文件最大 1GB，支持 image/document 与用途 category。
- 导出至少支持 JSON、JSONL、CSV、Excel 四种格式。
- 导出必须异步执行，支持进度查询、下载历史、下载次数。
- 导出字段可配置：包含字段、排除字段、重命名字段、是否包含审核记录。
- CSV/Excel 导出需要稳定处理嵌套字段，例如 `content.text`、`answers.xxx`。

## 10. 中途测试关注点

后续每个阶段至少保留以下可测能力：

- Auth：注册、登录、刷新 Token、获取当前用户、权限拦截。
- Owner：建任务、建模板、导入题目、发布、暂停、恢复、结束。
- Labeler：任务广场、资质检查、领取、工作台、草稿、提交、查看打回。
- AI：提交后入队、结构化评分、失败重试、预算扣减、调用日志。
- Reviewer：审核队列、详情、通过/打回/修订、批量审核、历史、diff。
- Export：创建导出、查看进度、下载、字段映射验证。
- Audit：关键状态迁移、权限变更、审核、导出都能追溯。

## 11. 已发现歧义与待确认问题

| 问题 | 当前处理建议 |
| --- | --- |
| 原始课题材料曾出现旧项目名。 | 已确认正式项目名为 MarkUp，中文名为马克派；后续对外文档、代码命名、页面展示统一使用 MarkUp（马克派）。 |
| 旧单文件 API 文档顶部版本为 v1.2，底部写 v1.0。 | 已将当前 API 契约拆分到 `../api/*.md`，旧文档不再作为协作入口保留。 |
| API 文档章节编号多处错位，例如资质小节出现 9.4、任务小节出现 5.1。 | 不影响接口语义，实现按路径和标题，不按章节号。 |
| 需求建议数据库为 MySQL，API 规范要求 MongoDB ObjectId，旧架构文档使用 MongoDB。 | 已按用户确认改用 MongoDB 作为后端主库；后端配置使用 `MONGODB_URL` 和 `MONGODB_DATABASE`，外部 ID 继续保持 24 位 ObjectId 风格。 |
| `qualification_rules.min_experience` 注释与 `min_completed_tasks` 语义接近。 | 先保留字段，后续确认 `min_experience` 是年限还是完成任务数。 |
| 审核流转中“复审/终审/初审”术语不完全统一。 | 内部抽象为 `stage + round`，前端按任务配置展示初审、复审、终审。 |
| `role` 与 `team_role` 同时存在。 | 用户全局角色和企业成员角色分开建模。 |
| `exports DELETE` 表示取消，但导出状态未列出 cancelled。 | 暂按删除/取消接口实现幂等取消，是否新增 `cancelled` 需确认。 |

## 12. 后续想法记录区

新增需求或讨论结论写入此处，避免口头结论丢失。

- 暂无新增用户想法；后续讨论功能细节时持续补充。

## 2026-05-31 平台运营工作台与中介服务费基线

- MarkUp 平台方作为需求方企业与标注员之间的中介运营方，新增独立 `/platform` 平台运营工作台，不混入企业 `/workspace`。
- 平台服务费由需求方额外承担，标注员审核通过后的任务奖励不被抽成；默认服务费率为 `10%`，按 `commission_rate_bps=1000` 存储。
- 财务口径复用企业工作台：`1 积分 = 1 元`，接口金额使用整数积分；当前平台工作台界面默认只展示积分，人民币同值关系只作为文档/API 兼容口径保留，不新增汇率、币种或现金余额表。
- 人工审核 `approved` 且奖励成功结算时确认平台服务费收入，服务费计算为 `ceil(reward_points * commission_rate_bps / 10000)`，流水按提交 ID 幂等。
- 标注员提现与企业积分钱包提现均按自动通过口径处理：可用余额足够且必要校验通过时立即扣减钱包并写流水，不进入平台人工审核队列；历史 `platform_payment_requests` 仅作为审计/兼容记录。
## 2026-05-31 账号命名补充约束

- `username` = 登录账号，强约束、唯一、注册后普通用户不可修改；格式统一为 `^[a-z][a-z0-9_]{3,31}$`。
- `display_name` = 页面显示名，注册必填，长度 `1-32`，允许中文与常见可见字符，不要求唯一。
- `real_name` = 真实姓名，仅用于实名、认证和严肃资料场景，不与 `username` / `display_name` 混用。
- 企业账号中心、Labeler 账号中心、顶栏身份卡、成员列表、通知收件人预览等展示位统一优先显示 `display_name`，缺失时才回退 `username`。
- 管理员单个建成员与批量导入成员时，`username` 和 `display_name` 都必须显式提交；不再允许系统自动把登录账号当作显示名回填。
## 2026-05-31 认证续链与深链接基线

- 所有用于复制、分享、邮件发送的站外深链接必须输出带域名的绝对 URL；普通站内 SPA 路由仍保持相对导航。
- 当前活跃分享链路以企业邀请码为准，标准格式为 `/onboarding?organization_action=join&invite_code=...`，对外输出时必须经统一绝对链接 helper 拼装。
- 邀请码链路必须支持“未登录先进入，再登录或注册，完成后自动回到加入企业流程”的续链体验，不允许因为认证跳转丢失邀请码上下文。
- 用户字段语义固定为：`username = 登录账号`，`display_name = 展示名`；产品展示主文案默认优先使用 `display_name`，只有缺失时才回退 `username`。
- 补充：资源配置页中的 `AI Provider` 已收敛为“单路由单模型”配置中心。企业侧维护的是可被任务直接选择的命名路由，每条记录必须显式配置 `route_name / provider_kind / model_id / pricing / capabilities / runtime_config`，并支持复制、启停、删除和真实连接测试。任务发布页继续只选择企业已配置 Provider，不再在任务页单独维护 Base URL、API Key、Temperature 或价格口径。
- 补充：任务发布向导新增 `MarkUp 任务发布 AI` 能力。该助手只能生成和应用待确认的任务发布配置变更，不能直接发布任务，不能绕过 readiness 检查；应用变更后沿用现有自动保存草稿、发布摘要和费用估算逻辑。Provider 选择继续只选择企业/平台已配置 Provider，不额外暴露模型或 Output/function call 结构。
## 2026-05-31 AI 共享路由与 AI 钱包补充基线

- 每个新企业创建时自动初始化独立的 `AI 调用积分钱包`，默认余额为 `0`。
- 企业创建时不克隆平台 Provider；平台共享可见性由 `scope=platform` 的共享路由直接提供。
- 平台可以维护多条共享路由，但全局最多只有一条 `is_platform_default=true`。
- 企业在任务发布页和后续 AI 调用入口可以直接选择平台共享路由，但平台默认路由不自动预选。
- 只有调用平台共享路由时才消耗 `AI 调用积分钱包`；企业自有 Provider 继续只做日志记录与成本估算。
- AI 钱包与企业任务奖励积分钱包完全分账，显示单位统一为 `积分`，口径固定 `1 积分 = 1 元`。
- 资源配置页中的 `AI 积分充值` 真实语义固定为“企业积分钱包向 AI 钱包划转”，必须校验企业钱包支付密码；不再提供独立的 AI 钱包直充主路径，也不得展示微信、支付宝、对公转账或提交 `payment_method`。
- 平台共享路由的扣费规则为“调用前只校验余额大于 0，调用成功后按真实 usage/cost 实扣”；若单次调用把余额扣成负数，本次仍允许成功，但后续新的平台共享路由调用必须被拦截直至充值。
- `Provider 测试连接`、`成本估算` 与未真正访问上游模型的本地校验流程不扣 AI 钱包。
- 企业侧平台共享 Provider 仅展示模型、价格与模态能力，不暴露接入细节、密钥状态、运行参数和测试详情。
- 当前最小闭环已包括：共享路由可见、默认标识、企业 AI 钱包查询、企业积分钱包向 AI 钱包划转、统一调用历史；统一业务 AI 结算层仍需逐步接入 AI 预审、辅助与聊天等真实调用入口。

## 2026-06-03 公开帮助手册基线

- `/help` 是面向终端用户的公开帮助手册，不承载平台运营工作台、API、部署或开发者文档。
- 帮助手册受众只覆盖访客、标注员、企业/Owner、Reviewer 和企业管理员会直接遇到的产品使用问题。
- 帮助手册内容采用“当前可用 + 少量建设中提示”口径；建设中能力必须明确标记，不能写成已经可操作的主路径。
- `apps/web/src/pages/help/helpContent.json` 是公开帮助页和平台问答 AI 的共同公开知识源。平台问答 AI 只能基于该公开帮助手册回答产品使用问题，不引入内部运营说明。
- 2026-06-09 起，`/help` 页面形态改为文档站阅读体验：参考 Gitea Docs 的目录/正文/本页索引/短段落/列表/callout 结构，保留 MarkUp 蓝色主色调；页面应优先帮助用户查找和阅读，不做营销 Hero 或销售页。手册正文必须按章节分页展示，每次只显示一个章节或 FAQ 页，并通过左侧文档目录、右侧本页目录和页底上一页/下一页切换，不能把所有内容堆在一个长滚动页里。桌面左侧栏只保留文档分页目录，不放置额外角色筛选说明块；页底不展示数字页码条，上一页/下一页长标题必须完整显示，不能省略或挤成多行按钮。
- 2026-06-09 起，公开帮助手册正文文字改为说明文档语气：每页一个主题，短段开头说明用途，后续用步骤、注意事项、限制条件和排查项组织；保留当前公开知识边界，不引入平台运营、API、部署或内部实现说明。
- 2026-06-09 起，公开帮助手册正文事实必须按当前已开发功能和 `docs/MarkUp-说明文档/` 同步更新，不得只调整排版。手册需覆盖个人/企业 Labeler 分流、企业内流转与分配比例、Owner 待审核发布、Team Admin 审批、Manifest JSONL、多模态上下文、模板 Designer/Renderer/版本、AI 预审最小闭环、人工审核、导出、企业会员/钱包/AI Provider 等当前可解释给终端用户的能力；Function Calling/schema 强约束、完整 review_records 多轮快照、真实导出 worker、WebSocket 自动提醒等未完成能力只能标为建设中或限制说明。
