# MarkUp（马克派）启动与部署指令

本文记录本地开发启动和生产部署建议。代码或环境变化后，必须同步更新本文和 `../planning/PROGRESS_LOG.md`。

## 本地开发启动

后端使用现有 conda 环境：

```bash
cd apps/api
conda run -n markup-api python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

前端使用 Vite：

```bash
cd apps/web
npm run dev -- --host 0.0.0.0 --port 5173
```

访问地址：

- 前端：`http://localhost:5173/`
- 后端健康检查：`http://127.0.0.1:8000/health`
- API 前缀：`http://127.0.0.1:8000/api/v1`

注意：当前环境下后端 `--reload` 可能因文件监听权限失败；本地调试优先使用非 reload 启动。

后端需要可访问的 MongoDB 实例。本地开发可在 `apps/api/.env` 中配置：

```bash
MONGODB_URL=mongodb://localhost:27017
MONGODB_DATABASE=markup
```

测试环境可使用 `mongomock://localhost`，但生产环境必须使用真实 MongoDB 服务。

## 文件存储与视频预览依赖

多模态上传、数据集媒体、导出文件和视频预览派生文件统一写入 `FILE_STORAGE_ROOT`。本地可以使用项目根目录下的 `.storage`，生产环境必须使用绝对路径或挂载卷，并确保 API、seed 脚本、后台任务和维护脚本使用同一个值。

本机开发示例：

```bash
FILE_STORAGE_ROOT=/Users/admin/markup/.storage
```

非浏览器原生可播放的视频格式（如 AVI、MKV、MOV）需要后端转码为 MP4 预览；AI Provider 读取视频时也会优先使用已生成的可播放预览。后端必须能执行 `ffmpeg` 和 `ffprobe`。如果服务进程的 `PATH` 找不到 Homebrew，可在 `apps/api/.env` 中显式配置：

```bash
FFMPEG_PATH=/opt/homebrew/bin/ffmpeg
FFPROBE_PATH=/opt/homebrew/bin/ffprobe
VIDEO_PREVIEW_MAX_WIDTH=1280
VIDEO_PREVIEW_TIMEOUT_SECONDS=600
```

启动前可检查：

```bash
/opt/homebrew/bin/ffmpeg -version
/opt/homebrew/bin/ffprobe -version
```

如果 `FFMPEG_PATH` 不可执行，视频预览接口会返回 `preview_error=ffmpeg_not_configured`；如果 `FFPROBE_PATH` 不可执行，会返回 `preview_error=ffprobe_not_configured`。不要把 `.storage`、生成的视频预览或本地 FFmpeg 二进制提交到 Git。

本地开发测试账号可通过脚本写入当前配置的 MongoDB：

```bash
cd apps/api
MONGODB_URL=mongodb://localhost:27017 \
MONGODB_DATABASE=markup \
SECRET_KEY=local-dev-secret-key-with-strong-length \
PYTHONPATH=. \
conda run -n markup-api python scripts/dev_seed_accounts.py
```

默认脚本会幂等创建/更新 `MarkitUp`、`MarkitDown` 两家企业、企业成员、个人 Labeler、团队 AI 钱包和系统 Agent，不会创建默认数据集、模板、任务、题目、提交或审核记录，也不会清空数据库。如需要重置当前配置的开发库，可显式增加 `--reset`：

```bash
PYTHONPATH=. \
conda run -n markup-api python scripts/dev_seed_accounts.py --reset
```

测试账号密码统一为 `SecurePass123!`：

| 范围 | 企业 | 角色 | 邮箱 | 用户名 | 显示名 |
| --- | --- | --- | --- | --- | --- |
| 平台 | - | Platform Admin | `platform.admin@test.local` | `platformadmin` | 平台管理员 |
| 企业 | MarkitUp | Admin | `admin@markitup.test` | `miachen` | 陈米娅 |
| 企业 | MarkitUp | Owner | `owner@markitup.test` | `owenli` | 李欧文 |
| 企业 | MarkitUp | Labeler | `labeler1@markitup.test` | `linazhao` | 赵丽娜 |
| 企业 | MarkitUp | Labeler | `labeler2@markitup.test` | `leowang` | 王利奥 |
| 企业 | MarkitUp | Reviewer | `reviewer1@markitup.test` | `reneexu` | 徐芮妮 |
| 企业 | MarkitUp | Reviewer | `reviewer2@markitup.test` | `ryanzhou` | 周瑞恩 |
| 企业 | MarkitDown | Admin | `admin@markitdown.test` | `dorahhuang` | 黄多拉 |
| 企业 | MarkitDown | Owner | `owner@markitdown.test` | `nolansun` | 孙诺兰 |
| 企业 | MarkitDown | Labeler | `labeler1@markitdown.test` | `ivylin` | 林艾薇 |
| 企业 | MarkitDown | Labeler | `labeler2@markitdown.test` | `evanqiao` | 乔伊凡 |
| 企业 | MarkitDown | Reviewer | `reviewer1@markitdown.test` | `gracetang` | 唐格蕾丝 |
| 企业 | MarkitDown | Reviewer | `reviewer2@markitdown.test` | `victorfeng` | 冯维克多 |
| 个人 | - | Labeler | `alpha.labeler@test.local` | `avayu` | 于艾娃 |
| 个人 | - | Labeler | `beta.labeler@test.local` | `benluo` | 罗本 |

注意：系统 `Agent` 在每个种子企业创建时自动生成，不提供独立的人类测试登录账号。

## OAuth 本地配置

如果 `.env` 中 OAuth 密钥为空，点击 GitHub、Google 或 Hugging Face 登录会返回 `50002`，这是配置缺失，不是前端按钮错误。

后端本地配置文件：`apps/api/.env`

```bash
FRONTEND_OAUTH_CALLBACK_URL=http://localhost:5173/oauth/callback

GITHUB_CLIENT_ID=你的 GitHub OAuth App Client ID
GITHUB_CLIENT_SECRET=你的 GitHub OAuth App Client Secret
GITHUB_REDIRECT_URI=http://localhost:8000/api/v1/auth/oauth/github/callback

GOOGLE_CLIENT_ID=你的 Google OAuth Client ID
GOOGLE_CLIENT_SECRET=你的 Google OAuth Client Secret
GOOGLE_REDIRECT_URI=http://localhost:8000/api/v1/auth/oauth/google/callback

HUGGINGFACE_CLIENT_ID=你的 Hugging Face OAuth Client ID
HUGGINGFACE_CLIENT_SECRET=你的 Hugging Face OAuth Client Secret
HUGGINGFACE_REDIRECT_URI=http://localhost:8000/api/v1/auth/oauth/huggingface/callback
```

第三方平台后台也必须配置完全一致的回调地址：

- GitHub：`http://localhost:8000/api/v1/auth/oauth/github/callback`
- Google：`http://localhost:8000/api/v1/auth/oauth/google/callback`
- Hugging Face：`http://localhost:8000/api/v1/auth/oauth/huggingface/callback`

GitHub / Google 切换账号补充说明：

- 后端当前会在 GitHub 与 Google OAuth 授权 URL 上附加 `prompt=select_account`。
- 用户每次点击 GitHub 或 Google 登录时，应先弹出账号选择器，而不是静默沿用浏览器里的上一次账号。
- 如果浏览器插件、企业 SSO 或第三方自身会话策略仍直接跳过选择器，可先在浏览器侧退出对应第三方账号，再重新发起授权。

生产环境必须把 `localhost` 替换为真实域名，并保持后端 `.env`、第三方平台后台、前端回调地址三方一致。

邮箱返回说明：

- Google 默认请求 `openid email profile`，Hugging Face 默认请求 `openid profile email`。
- 如果第三方没有返回可信邮箱，登录后会进入 MarkUp 邮箱绑定兜底流程。

## SMTP 邮箱验证码配置

后端配置文件位置：

```text
apps/api/.env
```

开发环境默认：

```bash
SMTP_ENABLED=false
```

此时后端只记录邮件投递事件，不会真的发送邮件；为方便本地测试，注册接口会跳过邮箱验证码真实性校验，注册时 `email_code` 为空或任意值都可通过。密码重置和第三方邮箱绑定仍需要真实验证码记录，不会被该开发模式放行。要让注册验证码真实到达邮箱，需要准备 SMTP 服务，例如企业邮箱 SMTP、SendGrid、Resend、阿里云邮件推送或腾讯云 SES 的 SMTP 参数。

开启 SMTP 的 `.env` 示例：

```bash
SMTP_ENABLED=true
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USERNAME=你的 SMTP 用户名
SMTP_PASSWORD=你的 SMTP 密码或授权码
SMTP_FROM_EMAIL=no-reply@example.com
SMTP_FROM_NAME=MarkUp
SMTP_USE_TLS=true
SMTP_USE_SSL=false
```

常见配置：

- 端口 `587`：通常使用 `SMTP_USE_TLS=true`、`SMTP_USE_SSL=false`。
- 端口 `465`：通常使用 `SMTP_USE_TLS=false`、`SMTP_USE_SSL=true`。
- 很多邮箱服务要求使用“应用专用密码/SMTP 授权码”，不是邮箱登录密码。

操作流程：

1. 在邮件服务商控制台开启 SMTP 或创建发信域名。
2. 获取 SMTP host、port、username、password/from email。
3. 写入 `apps/api/.env`。
4. 重启后端。
5. 打开注册页，输入邮箱并点击“发验证码”。
6. 如未收到，先检查垃圾邮件，再检查后端日志中的 `email_delivery_failed`。

生产建议：

- `SMTP_FROM_EMAIL` 使用已验证域名邮箱。
- 不要在日志里输出验证码明文。
- 邮件发送失败应保留结构化日志，但不向用户暴露 SMTP 密码、host 等敏感信息。

## 账号与密码安全配置

生产环境必须设置：

```bash
ENVIRONMENT=production
SECRET_KEY=强随机值，至少 32 字节
PASSWORD_PEPPER=强随机值，至少 32 字节
VERIFICATION_CODE_PEPPER=强随机值，至少 32 字节
COOKIE_SECURE=true
COOKIE_SAMESITE=lax
FRONTEND_APP_URL=https://app.example.com
FRONTEND_OAUTH_CALLBACK_URL=https://app.example.com/oauth/callback
```

生成随机值示例：

```bash
openssl rand -base64 48
```

说明：

- 密码使用 Argon2 存储，数据库不保存明文密码。
- `PASSWORD_PEPPER` 不写入数据库，只从环境变量读取；设置后参与密码哈希。
- 邮箱验证码只保存 HMAC-SHA256 摘要，`VERIFICATION_CODE_PEPPER` 不写入数据库。
- 修改密码后会撤销该用户全部 refresh session。
- `ENVIRONMENT` 会在配置加载阶段去除前后空格并归一化为小写；当值为 `production` 或 `prod` 时，后端会拒绝使用默认 `SECRET_KEY=change-me-in-production`、短于 32 字节的 `SECRET_KEY / PASSWORD_PEPPER / VERIFICATION_CODE_PEPPER` 或 `COOKIE_SECURE=false` 启动。
- `COOKIE_SAMESITE` 仅允许 `lax`、`strict`、`none`，后端会在启动配置阶段归一化为小写并拒绝非法值，避免登录写入 refresh cookie 时才暴露运行时异常。
- `COOKIE_SAMESITE=none` 必须同时设置 `COOKIE_SECURE=true`，否则浏览器不会按跨站 cookie 语义可靠接收 refresh cookie。
- 生产环境的 `FRONTEND_APP_URL` 与 `FRONTEND_OAUTH_CALLBACK_URL` 必须是公开 HTTPS 地址，不能继续使用 `http://localhost`、`http://127.0.0.1`、单标签内网主机名，或 `.local`、`.localhost`、`.internal`、`.lan`、`.test`、`.example`、`.invalid` 等特殊用途域名。
- 如果生产环境已经有老用户，再新增 `PASSWORD_PEPPER` 会导致旧密码无法验证；正式上线前必须一次性确定该值，之后不要随意更换。

## 生产部署指令

后端建议使用 `gunicorn + uvicorn worker`，不要使用开发模式的 `--reload`：

```bash
cd apps/api
conda run -n markup-api gunicorn app.main:app \
  -k uvicorn.workers.UvicornWorker \
  --bind 127.0.0.1:8000 \
  --workers 2
```

如果暂时没有安装 `gunicorn`，可以先用 `uvicorn` 方式部署小流量环境：

```bash
cd apps/api
conda run -n markup-api python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

前端生产构建：

```bash
cd apps/web
npm ci
npm run build
```

构建产物在：

```text
apps/web/dist
```

生产部署时用 Nginx 或静态文件服务托管 `apps/web/dist`，并把 `/api/` 反向代理到后端 `127.0.0.1:8000`。

Nginx 反向代理原则：

```nginx
location / {
    try_files $uri $uri/ /index.html;
}

location /api/ {
    proxy_pass http://127.0.0.1:8000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

## 部署前检查

```bash
cd apps/web
npm run typecheck
npm run lint
npm run test
npm run build

cd ../..
conda run -n markup-api python -m pytest apps/api/tests
```

上线前必须确认：

- `SECRET_KEY` 已替换为强随机值。
- `MONGODB_URL` 指向生产 MongoDB，`MONGODB_DATABASE` 为生产库名。
- `COOKIE_SECURE=true`，并使用 HTTPS。
- GitHub、Google 与 Hugging Face OAuth 回调地址使用生产域名。
- 邮件服务不再使用开发日志占位实现。
- MongoDB 索引创建策略明确；生产数据结构变更需有可回滚的数据迁移脚本。
