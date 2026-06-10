# Auth API

## 2026-06-07 认证安全边界补充

- `POST /api/v1/auth/register` 公开注册仅接受 `role=pending`，并继续兼容旧的 `role=labeler`；`owner`、`reviewer` 等权限角色必须通过企业成员/审核流程授予，不能由公开注册自提。
- OAuth `redirect_after_login` 由后端归一化为安全站内目标，仅保留 `/onboarding`、`/workspace`、`/platform`、`/tasks/assigned` 前缀下的同源相对地址；外部 URL、协议相对 URL 和非白名单路径在 callback 中置空。
- OAuth provider 只有在同时返回具体邮箱且 `email_verified=true` 时，该邮箱才可作为 `suggested_email`、匹配已有账号或免验证码注册邮箱；未验证邮箱或缺失邮箱时，必须由用户提交邮箱并通过 `bind_email` 验证码后用于 OAuth 注册。
- Refresh token 必须是 `typ=refresh` 且同时携带非空字符串 `sub` 与 `jti` 的结构化凭证；缺少会话标识或用户标识的已签名异常凭证在 refresh、logout、revoke-others 链路中统一返回 `40101`，不得抛出 500。
- `POST /api/v1/auth/password/reset` 会先消费有效的 `reset_password` 邮箱验证码；目标账号不存在或 `status` 非 `active` 时保持 200 非枚举响应但不改写密码、不撤销会话、不写入重置审计。只有活跃账号才会更新密码并撤销全部 refresh session。

- `POST /api/v1/auth/onboarding/complete` 仅允许当前仍为 `pending` 的用户调用；已完成 onboarding 的 Labeler、企业成员或平台用户不得重入该接口改变自身全局角色或创建企业。企业创建失败、邀请码加入失败等错误路径不得改变用户角色。
- `POST /api/v1/auth/oauth/bind-email` 在目标邮箱不存在 MarkUp 账号并返回“请走 OAuth 注册流程”时，不得消费该邮箱验证码；前端改走 `POST /api/v1/auth/oauth/register-account` 时可继续使用同一张未过期验证码。

## 邮箱验证码

`POST /api/v1/auth/email/send-code`

用途：

- `register`：普通注册或管理员注册
- `reset_password`：忘记密码
- `bind_email`：OAuth 首登补绑邮箱

开发模式说明：`SMTP_ENABLED=false` 时，普通注册验证码可跳过真实性校验；重置密码和 OAuth 绑邮箱仍需要真实验证码记录。

## 注册与登录

`POST /api/v1/auth/register`

当前注册链路基线：

- 前端按“通用账号注册 -> 登录 -> `/onboarding` 分流”执行。
- 前端注册默认提交 `role: "pending"`。
- 后端当前仍兼容旧请求显式携带 `role: "labeler"`。
- `account` 字段用于登录账号名，当前允许最长 255 个字符。

`POST /api/v1/auth/login`

返回 `LoginPayload`：

- `access_token`
- `refresh_token`
- `expires_in`
- `token_type`
- `user`

`access_token` 当前必须绑定一条有效的 `refresh_sessions` 记录，JWT payload 内包含 `sid`（当前 refresh session id）。后端在每次访问受保护接口时，除了 JWT 签名、过期和 `typ=access` 外，还会同时校验该 `sid` 对应 session 仍存在、属于当前用户、未被撤销且未过期。缺少 `sid` 或 `sid` 对应 session 无效的旧 access token 会直接返回 `40101`，不再做兼容过渡。

用户 `role` 可为 `pending`、`labeler`、`admin`、`owner`、`reviewer`、`agent` 等。前端遇到 `pending` 应进入 `/onboarding`。

## Onboarding

`POST /api/v1/auth/onboarding/complete`

认证：需要 bearer token。

标注员：

```json
{
  "identity": "labeler",
  "labeler_profile": {
    "domains": "文本分类, 图像标注",
    "qualification": "无需资质",
    "task_types": "文本 / 图像",
    "experience": "两年文本标注经验"
  }
}
```

新建需求方企业：

```json
{
  "identity": "requester",
  "organization_action": "create",
  "organization_profile": {
    "company_name": "示例科技",
    "industry": "AI 数据服务",
    "contact_name": "李四",
    "contact_phone": "13800000000",
    "business_description": "需要发布文本和图像标注任务",
    "website": "https://example.com",
    "address": "上海市"
  }
}
```

加入已有企业：

```json
{
  "identity": "requester",
  "organization_action": "join",
  "invite_code": "MKP-TEAM-2026"
}
```

响应：`LoginPayload`。前端必须以响应里的用户和 token 覆盖本地 session。

说明：

- 企业邀请码的活跃消费入口是 `/onboarding`。
- 已注册并登录的 `pending` 用户在 onboarding 选择“加入公司/企业”后填写 `invite_code` 完成入组。
- 本次活跃流程不再以“注册页直接带邀请码加入企业”为主路径。

## 管理员注册与企业创建

`POST /api/v1/auth/register/admin`

仅创建全局管理员账号。旧 `POST /api/v1/auth/register/team` 已废弃，会返回 `40902` 和替代路径。

企业信息通过 `POST /api/v1/teams` 创建，创建者自动成为 `team_admin`。

## Session

- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`
- `PUT /api/v1/auth/password`
- `POST /api/v1/auth/sessions/revoke-others`
- `POST /api/v1/auth/password/reset`

Refresh token 同时支持 JSON 返回和 HttpOnly cookie。生产环境必须启用 HTTPS 与 `COOKIE_SECURE=true`。

`POST /api/v1/auth/refresh` 会沿用“旧 refresh session 撤销 + 新建 refresh session”的语义，并为新的 access token 重新写入新的 `sid`。旧 refresh session 一旦被轮换，绑定在旧 session 上的 access token 也会在下一次访问受保护接口时立即返回 `40101`。

`POST /api/v1/auth/sessions/revoke-others` 撤销当前用户除当前 refresh session 外的其他未撤销会话。请求体可传 `{ "refresh_token": "..." }`，也可依赖 refresh cookie；该凭证必须对应当前用户一条未撤销且未过期的 refresh session；如果后端无法识别当前 refresh session，则返回 `40101`，要求用户重新登录后再试，不再继续执行“全量撤销”。

```json
{
  "revoked_count": 2,
  "kept_current_session": true
}
```

该操作写入 `user_sessions_revoked` 审计日志。

由于 access token 已显式绑定 `sid`，被撤销的“其他会话”上的既有 access token 不再等待自然过期，而是在下一次任意受保护请求时立即返回 `40101`；当前保留的会话不受影响。

`POST /api/v1/auth/sessions/revoke-others` 显式携带 request body 或 cookie 中的 `refresh_token` 时，该 refresh session 必须与当前 bearer access token 的 `sid` 指向同一条 `RefreshSession`。同一用户的其他会话 refresh token 会返回 `40101`，不得被当作当前会话并反向撤销真正的当前 session。

`POST /api/v1/auth/logout` 在撤销当前 refresh session 后，当前 access token 也会在下一次请求时立即失效并返回 `40101`。
`POST /api/v1/auth/logout` 请求体或 cookie 中的 refresh token 必须属于当前 bearer 用户；若传入其他用户的 refresh token，接口返回 `40101`，不得撤销其他用户会话。
当请求体和 cookie 均未携带 refresh token 时，后端会使用当前 bearer access token 中的 `sid` 只撤销当前 `RefreshSession`；不得回退为撤销该用户全部会话。

`PUT /api/v1/auth/password` 与 `POST /api/v1/auth/password/reset` 会继续撤销该用户全部 refresh session；现在它们同时意味着该用户此前所有已签发 access token 都会在下一次请求时立即失效并返回 `40101`。

补充：`POST /api/v1/auth/logout` 如果显式携带 request body 或 cookie 中的 `refresh_token`，该 refresh session 不仅必须属于当前 bearer 用户，还必须与当前 access token 的 `sid` 指向同一条 `RefreshSession`。同一用户的其他会话 refresh token、已轮换/已撤销/已过期或无法识别的 refresh token 均返回 `40101`，不得撤销其他会话，也不得返回成功造成当前 access token 仍可用。

## OAuth

- `GET /api/v1/auth/oauth/{provider}/start`
- `GET /api/v1/auth/oauth/{provider}/callback`
- `POST /api/v1/auth/oauth/exchange`
- `POST /api/v1/auth/oauth/link-account`
- `POST /api/v1/auth/oauth/link-current-user`
- `POST /api/v1/auth/oauth/register-account`
- `POST /api/v1/auth/oauth/bind-email`
- `GET /api/v1/auth/oauth/identities`
- `DELETE /api/v1/auth/oauth/identities/{provider}`

支持 `github`、`google` 和 `huggingface`。Google 默认 scope 为 `openid email profile`，Hugging Face 默认 scope 为 `openid profile email`。若第三方没有返回可信邮箱，后端返回 `needs_email_binding=true`，前端必须引导邮箱验证码绑定后再签发 MarkUp 会话。

GitHub 和 Google 授权入口当前都会显式携带 `prompt=select_account`，用于强制展示账号选择器，避免浏览器直接沿用上一次第三方登录账号。

`GET /api/v1/auth/oauth/{provider}/start` 额外支持可选查询参数：

- `intent=login`：默认值，表示普通第三方登录 / 首登绑号流程。
- `intent=bind_current_user`：表示从账号管理页发起，OAuth 回调后必须绑定到当前 bearer 对应的 MarkUp 账号，不能切换当前会话。
- `redirect_after_login`：前端回跳目标。回调重定向到前端时会继续带回 `ticket`、`provider`、`intent` 和该字段。

当前 OAuth 首登基线：

- 若第三方身份已绑定 MarkUp 用户，则 `/auth/oauth/exchange` 直接返回 `LoginPayload`。
- 若第三方身份未绑定任何 MarkUp 用户，则后端不再自动创建账号。
- `/auth/oauth/exchange` 会返回 `needs_account_link=true`、`bind_ticket`、第三方 provider、建议用户名、可信邮箱和是否已验证邮箱，前端必须引导用户显式选择：
  - 绑定已有 MarkUp 账号：调用 `POST /api/v1/auth/oauth/link-account`
  - 注册新的 MarkUp 通用账号：调用 `POST /api/v1/auth/oauth/register-account`
- 绑定已有 MarkUp 账号时，只校验账号密码和第三方身份唯一性，不要求第三方可信邮箱与当前 MarkUp 账号邮箱一致。
- 若第三方没有返回可信邮箱，前端注册新账号时需补充邮箱并通过验证码完成校验；旧的 `POST /api/v1/auth/oauth/bind-email` 仍保留给该补邮箱链路使用。
- `POST /api/v1/auth/oauth/bind-email` 不再自动创建新账号；当邮箱不存在对应 MarkUp 用户时返回 `42201`，前端必须改走 `POST /api/v1/auth/oauth/register-account` 的显式注册流程。
- `POST /api/v1/auth/oauth/bind-email` 的 existing-user 分支必须继续校验目标 MarkUp 用户 `status=active`；停用账号即使通过邮箱验证码，也返回 `40101`，不得绑定第三方身份或签发新会话。
- OAuth 绑定规则已收紧为 “同一 provider 内一一对应”：
  - 一个 MarkUp 账号可以同时绑定多个不同 provider，例如 `GitHub + Google + Hugging Face`。
  - 但在同一个 provider 内，一个 MarkUp 账号最多只能绑定 1 个第三方账号。
  - 同一个第三方身份 `(provider, provider_user_id)` 也最多只能绑定 1 个 MarkUp 账号。
- 以上 provider 内一一对应校验统一覆盖 `POST /api/v1/auth/oauth/link-account`、`POST /api/v1/auth/oauth/bind-email` 的 existing-user 分支，以及账号管理页专用的 `POST /api/v1/auth/oauth/link-current-user`。
- `intent=bind_current_user` 生成的 OAuth ticket 不能再用于 `/auth/oauth/exchange` 登录换票；若误用，会返回 `42201`。

OAuth 账号维护：

- `GET /auth/oauth/identities` 返回当前用户已绑定 provider 列表，包含 provider、第三方用户 ID、第三方用户名/邮箱、第三方邮箱验证状态和绑定时间。
- `POST /api/v1/auth/oauth/link-current-user` 为账号管理页专用绑定接口，请求体为 `{ "ticket": "..." }`，要求当前用户已登录。
- 该接口只会把第三方身份绑定到当前 bearer 对应的 MarkUp 账号，绝不签发新登录态，也绝不切换当前账号。
- 若第三方身份已绑定其他用户，或当前账号在同一 provider 下已绑定另一个第三方身份，接口返回 `40901`，前端必须保持当前会话不变并回到账号管理页提示错误。
- 若同一 provider、同一第三方身份本就绑定在当前账号上，按幂等成功处理。
- `DELETE /auth/oauth/identities/{provider}` 解绑指定 provider，成功返回 `{ "provider": "github", "unlinked": true }`。
- 如果当前用户没有密码且只剩最后一个 OAuth 身份，解绑会返回 `42201`，避免移除最后一种可登录方式。
- 解绑写入 `oauth_identity_unlinked` 审计日志。

## 2026-05-31 OAuth 已绑定账号换票补充

- `/api/v1/auth/oauth/exchange` 对已绑定第三方身份的账号签发 `LoginPayload` 前，必须继续校验 MarkUp 用户存在、`status=active` 且 `email_verified=true`；停用、删除或邮箱未验证的账号统一返回 `40101`，不得创建新的 refresh session。
## 2026-05-31 字段语义补充

- 注册、OAuth 注册和管理员建号统一使用 `display_name + username + email + password (+ email_code)`；注册请求不再混用 `account` 作为显示名或建号字段。
- `username` 表示登录账号，长度 `4-32`，必须字母开头，只允许小写字母、数字和下划线。
- `display_name` 表示页面显示名，注册必填，长度 `1-32`，允许中文且不要求唯一。
- `GET /api/v1/auth/me`、登录成功返回的 `LoginPayload.user`、OAuth 建号成功返回的 `user` 都应包含 `display_name`；前端展示时优先 `display_name`，缺失时才回退 `username`。
- `POST /api/v1/auth/oauth/register-account` 与普通注册同规则，必须提交 `display_name` 与 `username`，不再接收旧的注册 `account` 语义。
## 2026-05-31 邀请码续链与展示名补充

- `username` 表示登录账号，`display_name` 表示页面展示名；认证返回、`GET /api/v1/auth/me`、onboarding 当前会话消费都应优先展示 `display_name`，缺失时才回退 `username`。
- 未登录用户直接访问企业邀请码链接 `https://{frontend}/onboarding?organization_action=join&invite_code=...` 时，前端不再丢弃参数并跳回首页，而是展示公开引导态。
- 公开引导态提供“登录后加入 / 注册后加入”两个入口；点击后前端会把当前站内相对地址写入 `sessionStorage` 的认证返回目标，登录、注册或 OAuth 回跳完成后优先恢复该地址。
- `pending` 用户恢复到该链接后，`OnboardingPage` 直接进入“加入公司/企业”表单，并预填 `invite_code`，无需再次手动点击身份分流。
- 如果恢复到邀请码链路的账号不是 `pending`，前端需要明确提示该邀请码仅适用于待完成 onboarding 的通用账号，然后回到工作台入口，不得静默吞掉邀请码上下文。
