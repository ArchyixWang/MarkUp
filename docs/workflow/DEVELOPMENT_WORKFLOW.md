# MarkUp 文档驱动开发工作流

## 开始工作前

1. 先执行 `git status --short`，确认是否有用户或合作者未提交改动。
2. 如用户要求拉取最新代码，执行 `git pull --ff-only`；若有本地改动阻塞，先判断来源，必要时用 stash 备份，不直接覆盖。
3. 每次拉取后查看：
   - `git log --oneline -8`
   - 相关 `git diff` 或 `git show`
   - `docs/README.md` 中列出的活跃文档
4. 写代码前至少阅读：
   - `docs/markup_requirements.md`
   - `docs/product/REQUIREMENTS_AND_NOTES.md`
   - `docs/planning/TODO.md`
   - `docs/architecture/SYSTEM_ARCHITECTURE.md`
   - 任务涉及的 `docs/api/*.md` 或 `docs/design/*.md`

## Git 分支协作流程

企业默认采用分支开发，不直接在 `main` 上叠加日常功能或 debug：

1. 开始新任务前先从最新 `main` 创建个人开发分支：

```bash
git switch main
git pull --ff-only
git switch -c your-branch-name
```

2. 每完成一个小功能、一次独立 debug 或一组可验证的页面调整后，先执行对应验证命令，再提交到当前个人分支：

```bash
git status --short
git add <changed-files>
git commit -m "type: concise change summary"
```

3. 提交时只暂存本次任务相关文件，不提交本地运行目录、缓存、数据库目录或 Playwright 临时目录，例如 `.mongo-data/`、`.playwright-cli/`、`.playwright-mcp/`。
4. 个人分支可以按需推送到远端，用于备份、协作检查或创建 Pull Request：

```bash
git push -u origin your-branch-name
```

5. 准备把个人分支合并或推送到 `main` 前，必须先同步最新 `main` 并处理冲突。若冲突涉及同一功能、同一页面、同一 API shape、状态机、权限、设计规范或文档事实来源，不直接替对方做取舍；先总结：
   - 冲突文件和冲突功能点。
   - 当前分支实现了什么。
   - `main` 或合作者实现了什么。
   - 直接保留任一侧的风险。
   - 可选合并方案。

   总结后先询问负责人确认，再继续合并实现。
6. 合并回 `main` 后再次执行必要验证，并确认 `git status --short` 只剩允许保留的本地未跟踪运行目录。

## 文档更新规则

- 产品行为变化：更新 `docs/product/REQUIREMENTS_AND_NOTES.md`。
- API 形状变化：更新对应 `docs/api/*.md`。
- 架构、模块边界、状态机变化：更新 `docs/architecture/SYSTEM_ARCHITECTURE.md`。
- UI 总体风格或页面设计变化：更新 `docs/design/`。
- 启动、部署、环境变量变化：更新 `docs/operations/DEPLOYMENT.md`。
- 阶段任务完成、测试结果、剩余风险：更新 `docs/planning/PROGRESS_LOG.md`。
- TODO 状态变化：更新 `docs/planning/TODO.md`。

## 前端实现约束

- 当前前端组件库为 Ant Design，依赖见 `apps/web/package.json`。
- 新增复杂表单、表格、弹窗、抽屉、菜单、分页等能力时优先使用 Ant Design 组件。
- 保留 MarkUp 品牌色与业务语义色，但不要绕过 Ant Design 的基础交互、可访问性和布局能力重造组件。
- 用户指定的 UI 优化链路仍适用：`ui-ux-pro-max -> hallmark -> ckm:ui-styling`；最终实现阶段以 Ant Design 为组件基础。

## 常用验证命令

前端：

```bash
cd apps/web
npm run typecheck
npm run lint
npm run test
npm run build
```

后端：

```bash
conda run -n markup-api python -m pytest apps/api/tests/test_auth_team_rbac.py
conda run -n markup-api python -m compileall apps/api/app
```

通用：

```bash
git diff --check
```

## 本地服务

启动前先检查端口：

```bash
lsof -nP -iTCP:8000 -sTCP:LISTEN
lsof -nP -iTCP:5173 -sTCP:LISTEN
```

后端：

```bash
cd apps/api
conda run -n markup-api python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

前端：

```bash
cd apps/web
npm run dev -- --host 0.0.0.0 --port 5173
```
