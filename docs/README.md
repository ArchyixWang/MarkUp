# MarkUp 文档中心

本目录是 MarkUp（马克派）的唯一活跃文档入口。开发前先从本文确认文档分类和当前事实来源；不要从旧归档或聊天记录直接推断需求。

## 文档分类

### 1. 核心交付需求

| 文档 | 作用 |
| --- | --- |
| `markup_requirements.md` | 项目整体需求和交付标准，完整保留，是产品验收的最高优先级来源。 |

### 2. 产品与协作基线

| 文档 | 作用 |
| --- | --- |
| `product/REQUIREMENTS_AND_NOTES.md` | 产品基线、约束、偏差处理协议、状态机和待确认问题。 |
| `workflow/DEVELOPMENT_WORKFLOW.md` | 文档驱动协作流程、拉取代码后的检查要求、常用验证命令。 |
| `workflow/NEW_WINDOW_PROMPT.md` | 启动新 Codex 窗口时可直接使用的项目提示词。 |
| `workflow/WORKSPACE_APP_MIGRATION_PROMPT.md` | 将旧工作台功能迁移到当前 WorkspaceApp 新框架时，可直接交给 AI 代码助手使用的中文提示词。 |

### 3. 架构

| 文档 | 作用 |
| --- | --- |
| `architecture/SYSTEM_ARCHITECTURE.md` | 系统架构、角色权限、模块边界、数据模型、关键工作流和扩展点。 |

### 4. API

| 文档 | 作用 |
| --- | --- |
| `api/README.md` | API 总入口、通用响应规范和模块索引。 |
| `api/auth.md` | 注册、登录、OAuth、onboarding、密码与邮箱验证码。 |
| `api/team-profile.md` | 用户、企业、成员、资质、积分。 |
| `api/production.md` | 数据集、模板、任务、题目、Owner 生产链路。 |
| `api/labeling.md` | 任务广场、接单、标注工作台、草稿、提交、贡献。 |
| `api/review-ai-export.md` | 人工审核、AI 预审、AI 资源、导出、审计、上传、WebSocket。 |

### 5. 前端设计

| 文档 | 作用 |
| --- | --- |
| `design/FRONTEND_DESIGN_STYLE.md` | 全站前端视觉与交互规范；当前组件库基线为 Ant Design。 |
| `design/pages/README.md` | 页面级设计稿目录说明。 |
| `design/pages/public-solutions.md` | 公开解决方案销售页设计稿，覆盖企业数据标注方案、套餐展示和 `/publish` 兼容入口。 |
| `design/pages/owner-production.md` | Owner 数据集、模板、发布任务生产页设计稿。 |

### 6. 运维部署

| 文档 | 作用 |
| --- | --- |
| `operations/DEPLOYMENT.md` | 本地启动、环境变量、OAuth、SMTP、测试账号、生产部署和上线检查。 |

### 7. 计划与进度

| 文档 | 作用 |
| --- | --- |
| `planning/TODO.md` | 阶段任务、验收脚本和测试清单。 |
| `planning/PROGRESS_LOG.md` | 需求变更、架构调整、实现进度、测试结果和剩余风险。 |

### 8. 素材

| 路径 | 作用 |
| --- | --- |
| `assets/` | 原始需求 PDF、UI 示意截图和参考图片。 |

## 开发前必读顺序

1. `docs/README.md`
2. `docs/markup_requirements.md`
3. `docs/product/REQUIREMENTS_AND_NOTES.md`
4. `docs/planning/TODO.md`
5. `docs/architecture/SYSTEM_ARCHITECTURE.md`
6. 本次任务涉及的 `docs/api/*.md`、`docs/design/*.md` 或 `docs/operations/DEPLOYMENT.md`
7. `docs/planning/PROGRESS_LOG.md`

## 当前代码基线

- 前端：React + TypeScript + Vite + Ant Design。
- 后端：FastAPI + MongoDB。
- 当前远端最新确认提交：`f7d45d1 Refactor workspace layout to use sidebar padding and slide home hero`。
- 最近远端协作重点：Ant Design 组件库替换、任务广场真实接口、onboarding 完成接口、Owner 生产页主链路。

## 文档维护规则

1. 产品行为变化：更新 `product/REQUIREMENTS_AND_NOTES.md`。
2. API 形状变化：更新对应 `api/*.md`。
3. 架构、状态机、权限或模块边界变化：更新 `architecture/SYSTEM_ARCHITECTURE.md`。
4. 设计系统或页面交互变化：更新 `design/`。
5. 环境、启动或部署变化：更新 `operations/DEPLOYMENT.md`。
6. 阶段任务、测试结果和剩余风险：更新 `planning/TODO.md` 与 `planning/PROGRESS_LOG.md`。
7. 临时 handoff、过期计划和旧接口草案不要作为当前实现依据；若确有保留价值，应先合并到上述活跃文档。

## App 级说明

| 文档 | 作用 |
| --- | --- |
| `../apps/web/README.md` | 前端应用开发说明。 |
| `../apps/api/README.md` | 后端应用开发说明。 |
