# AI Coding 开发思路

## 1. 开发策略

MarkUp 的开发采用文档驱动和链路驱动结合的方式推进。项目首先保留完整课题需求，再将需求拆解为产品基线、API 文档、系统架构、页面设计、TODO 和进度记录，避免在长周期 AI Coding 中出现需求漂移。

主要策略包括：

1. 先读 requirements，再写代码。
2. 按 Owner、Labeler、Reviewer、AI Agent 四条主链路拆分工作。
3. 优先跑通端到端闭环，再补高级体验。
4. 每轮实现后用单元测试、接口测试或 Playwright 做局部验证。
5. 每次需求调整同步更新 docs，保持文档和实现同向。

交付整理口径：本文件记录 AI Coding 过程中形成的工程思路、阶段成果、典型问题和验证方式，不作为逐条聊天记录。答辩交付时应把过程材料整理为专业说明，并和需求、架构、API、测试记录保持一致。

## 2. 主要开发阶段

### 2.1 项目骨架与认证

早期阶段建立 React + TypeScript + Vite 前端和 FastAPI + MongoDB 后端，完成登录、注册、刷新 Token、登出、邮箱验证码、OAuth、onboarding 和会话撤销能力。

典型成果：

- `apps/web` 前端应用。
- `apps/api` 后端 API。
- `docs/api/auth.md` 认证契约。
- access token 显式绑定 refresh session `sid`，提高会话即时失效能力。

### 2.2 工作台与权限体系

开发过程中逐步将账号管理、企业管理、工作台导航和页面权限分离，形成全局角色 + 企业角色的权限模型。

典型成果：

- Team Admin / Owner / Reviewer / Agent / Labeler 动态侧栏。
- 企业 Dashboard 和 Labeler Dashboard 分流。
- `X-Team-ID` 企业作用域校验。
- 成员邀请、批量导入、角色变更和系统 Agent 只读边界。

### 2.3 任务管理与发布

任务管理从基础 CRUD 扩展到生产级状态机：草稿、自动保存、待审核、收集中、暂停、结束、复制、转交、发布检查、任务结果导出。

关键问题：

- Owner 发布需要进入待审核，Team Admin 审批后发布。
- 收集中任务不能直接修改，只能暂停发放。
- 暂停不回收已领取任务。
- 结束前必须检查未完成、待审核或打回待修改数据。

### 2.4 模板 Designer / Renderer

模板系统是本项目的核心技术难点。开发中将 Designer 和 Renderer 解耦，使用可序列化 schema 保存物料、校验、联动和布局。

典型成果：

- 物料区、画布、属性面板三栏 Designer。
- Renderer 预览、历史版本预览、Labeler 运行时复用同一渲染器。
- 模板版本管理、版本 diff、发布 readiness。
- ShowItem 多模态绑定与图片 Mask 标注。

### 2.5 数据集与多模态导入

数据集从普通表格导入扩展为多模态数据底座。实现中重点解决“媒体素材如何和行数据绑定”“如何让模板映射、AI 和 Reviewer 使用同一上下文”。

典型成果：

- CSV、Excel、JSON、JSONL、Manifest JSONL 导入。
- 行级 `media`、`attachments`、`derived_context`。
- 表格编辑、补上传合并、未绑定素材绑定。
- 图片、音频、视频素材预览。

### 2.6 Labeler 标注工作台

Labeler 链路按任务广场、领取任务、标注工作台、草稿保存、提交、打回重提逐步实现。

典型成果：

- 任务广场真实接口、筛选、分页和任务详情。
- 任务协议签署后领取。
- 基于模板版本 Renderer 渲染表单。
- 后端复用模板校验函数二次校验提交答案。

### 2.7 AI 预审 Agent

AI 预审从配置结构开始，逐步扩展到 job、触发、重试、worker 和结果展示。

典型成果：

- AI Provider 配置和平台共享 Provider。
- 任务级 AI 配置：维度、矩阵、阈值、Provider。
- Labeler 提交后自动创建 AI Review Job。
- AI Worker 最小闭环和调用日志。
- AI 预审任务概览、任务详情、结构化结果 Drawer。

### 2.8 人工审核流转

Reviewer 链路从提交队列扩展为按任务分组的审核任务管理，并增强多模态预览、Mask 展示、AI 评语和 diff。

典型成果：

- 审核任务管理页。
- 审核队列、详情、历史、字段差异。
- 批量审核。
- 图片/Mask 审核预览和放大查看。
- 打回后 Labeler 可修改重提。

### 2.9 异步导出

导出功能从简单下载扩展为任务结果 Drawer、字段配置和下载历史模型。

典型成果：

- JSON / JSONL / CSV / Excel。
- 字段 include/exclude/rename。
- include_review_records。
- 下载历史、下载次数和导出审计。
- CSV/Excel 公式注入防护。

### 2.10 AI 浮窗助手

平台已有平台问答 AI 后，又扩展模板搭建 AI 和任务发布 AI。两者都是操作型 AI：AI 只生成结构化待应用变更，用户确认后才写入当前表单或 schema。

典型成果：

- 模板搭建 AI：根据指令生成、删除、修改、优化模板字段。
- 任务发布 AI：补全任务标题、奖励、AI 预审、人工复审、协议和发布检查。
- Provider 选择、附件、变更确认、预览和应用。
- 清除对话、停止生成、未应用变更关闭确认。

### 2.11 移动端与体验修复

后期围绕手机端、Ant Design 组件一致性、表格固定列、弹窗/Drawer、自适应布局、AI 助手关闭逻辑、音视频预览等做了大量体验修复。

典型成果：

- 首页重做和 GSAP 克制动效。
- 工作台移动端布局。
- 任务管理表格固定列与拖拽列宽修复。
- 数据集新建弹窗和表格编辑全屏。
- 人工审核提交历史滚动和通知组件替换。

## 3. AI Coding 使用方式

### 3.1 需求分析

每次用户给出新需求后，先回到 `docs/README.md`、`docs/product/REQUIREMENTS_AND_NOTES.md`、`docs/planning/TODO.md` 和相关 API 文档确认边界。对冲突需求先写明调整方案再实现。

### 3.2 代码阅读

针对每个需求先读取相关页面、服务和后端路由。例如：

- 任务发布：`OwnerProductionPages.tsx`、`tasks.py`、`production.md`。
- 模板搭建：Designer、Renderer、`templates.py`。
- 数据集：`datasets.py`、数据集管理页、多模态渲染组件。
- 审核：`reviews.py`、人工审核页面、AI review 页面。

### 3.3 方案设计

复杂功能先形成产品/技术文档，如任务发布 AI、移动端适配、首页重做、多模态数据集等，再进入代码实现。

### 3.4 代码实现

实现时优先沿用当前技术栈：React、TypeScript、Vite、Ant Design、FastAPI、MongoDB。对于前端复杂 UI 尽量复用 Ant Design Table、Drawer、Modal、Form、Tabs、Upload、Select 等组件。

### 3.5 Bug 修复

典型 Bug 修复包括：

- AI 助手关闭确认弹层被遮挡。
- 表格固定列与表头错位。
- 数据集保存后清空。
- 视频数据集导入失败。
- 图片 Mask 审核预览比例错误。
- 平台时间日志时区问题。
- 音频播放条过短和点击区域问题。

### 3.6 测试验证

使用过的验证方式包括：

- `npm run typecheck`。
- Vitest 定向测试。
- FastAPI pytest 定向测试。
- `python -m compileall apps/api/app`。
- Playwright 浏览器链路测试。
- 分辨率检查：390×844、1280×800、1920×1080 等。

### 3.7 文档同步

每轮功能或边界变化需要同步写入：

- `docs/product/REQUIREMENTS_AND_NOTES.md`。
- `docs/api/*.md`。
- `docs/architecture/SYSTEM_ARCHITECTURE.md`。
- `docs/planning/PROGRESS_LOG.md`。
- `docs/design/`。

## 4. 典型问题与解决

### 4.1 动态表单 schema 设计

问题：标注模板需要可视化搭建、运行时渲染、历史回放和后端校验。

解决：使用 schema 保存 tabs、components、validation_rules、linkage_rules，并把 Designer 与 Renderer 解耦。任务绑定已发布模板版本快照，避免模板后续修改影响历史任务。

### 4.2 多模态数据映射

问题：图片、音频、视频不应只是附件列表，而要进入每一行题目的上下文。

解决：将多模态数据归一化为行级 `media`、`attachments`、`derived_context`，并生成 `media_schema` / `context_schema` 供 ShowItem、任务映射、AI 和 Reviewer 使用。

### 4.3 AI 结构化输出

问题：AI 返回纯文本难以可靠进入审核系统。

解决：任务发布阶段生成评分矩阵和输出 schema，AI job 结果按结构化 JSON 写回。AI 助手也必须返回结构化变更列表，并经过用户确认应用。

### 4.4 审核状态机

问题：提交、AI 预审、人工复审、打回和重提容易产生状态混乱。

解决：保持提交状态、题目状态和审计日志同步；AI 只辅助人工审核，人工审核动作才改变最终结果。打回必须写原因，Labeler 重提后重新进入待审核。

### 4.5 时区问题

问题：数据集、模板、任务、审核等修改时间和提交时间显示不一致。

解决：统一后端 ISO 时间和前端展示格式，避免把 UTC 时间直接按本地文本误展示。最终应继续用统一时间工具处理所有页面。

### 4.6 图片 Mask 坐标错位

问题：审核页图片预览如果未按真实宽高比例渲染，会导致 Mask 与图片错位。

解决：预览组件按图片原始比例布局，Mask 坐标使用归一化坐标回放，并支持放大查看。

### 4.7 导出任务异步化

问题：导出可能耗时且需要历史追踪。

解决：前端使用导出任务 + 下载历史模型；后端当前同步生成但保留 `export_jobs`、状态、进度和下载接口，后续可接 worker。

### 4.8 Ant Design 适配

问题：复杂表格、弹窗、Drawer 在桌面和手机端容易错位或遮挡。

解决：统一优先使用 Ant Design 组件能力，例如 Table 固定列、Drawer、Modal、Form、Tabs、Upload、Select，并补充 scoped CSS 做响应式与间距修复。
