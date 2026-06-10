# 模板搭建页面设计稿

## 1. 页面定位

模板搭建是 MarkUp 的核心生产能力之一，负责让 Owner 通过可视化 Designer 创建可序列化 JSON Schema，并让同一份 schema 在 Renderer 预览页和 Labeler 标注工作台中一致运行。

页面必须拆成三个层级：

- 模板管理列表页：展示已有模板、版本、状态、使用情况和基础操作。
- Designer 子页面：新建或编辑某个模板版本，完成物料拖拽、页签结构、属性、校验、联动和 LLM 配置。
- Renderer 预览子页面：用完整页面形态渲染指定模板版本，验证 Labeler 真实作答体验。

设计目标不是把所有功能固定在同一屏，而是让高频搭建动作在 Designer 内清晰完成，模板列表、版本历史和完整渲染预览各自独立。

## 2. 入口与命名

### 2.1 工作台侧栏

- 侧栏条目：`模板搭建`。
- 所属分组：`数据生产`。
- 图标：继续使用滑杆/组件配置语义图标，例如 Ant Design `SlidersOutlined`。
- 点击后进入模板管理列表页，不直接进入 Designer。

### 2.2 面包屑

列表页：

```text
工作台 / 模板搭建
```

新建 Designer：

```text
工作台 / 模板搭建 / 新建模板
```

编辑 Designer：

```text
工作台 / 模板搭建 / [模板名称] / Designer
```

Renderer 预览：

```text
工作台 / 模板搭建 / [模板名称] / Renderer 预览
```

版本详情：

```text
工作台 / 模板搭建 / [模板名称] / v[版本号]
```

说明：

- 面包屑中的 `模板搭建` 可点击返回模板列表。
- `[模板名称]` 可点击返回该模板的版本概览或 Designer，按入口来源决定。
- Designer 有未保存变更时，返回列表、切换版本、进入 Renderer 预览或离开页面都必须二次确认。

### 2.3 路由建议

短期可用工作台内部状态机；后续建议演进为：

| 页面 | 建议路径 | 说明 |
| --- | --- | --- |
| 模板列表 | `/workspace/templates` | 展示当前企业所有模板。 |
| 新建模板 Designer | `/workspace/templates/new` | 创建模板草稿或第一个版本。 |
| 编辑模板 Designer | `/workspace/templates/:templateId/designer` | 编辑当前可编辑版本。 |
| Renderer 预览 | `/workspace/templates/:templateId/preview` | 完整页面预览当前版本。 |
| 指定版本预览 | `/workspace/templates/:templateId/versions/:version/preview` | 回放历史版本。 |

## 3. 用户目标

Owner 进入模板搭建后的核心目标：

1. 查看企业已有模板，判断模板状态、版本、物料完整度和被任务引用情况。
2. 新建模板，进入 Designer 完成结构搭建。
3. 修改未发布模板版本；已发布模板如需修改，必须创建新版本。
4. 管理多 Tab 标注页面结构，包括页签重命名、排序、删除和默认页签。
5. 拖拽物料到画布并配置字段属性、校验、联动和 LLM 行为。
6. 使用 Renderer 预览完整标注页面，验证 ShowItem、输入字段、校验错误和 LLM 组件表现。
7. 发布模板版本，供任务发布时绑定。
8. 导出 schema，复制模板，查看版本历史和引用任务。

## 4. 信息架构

```text
模板管理列表页
├─ 固定页面标题与主操作
├─ 模板状态概览
├─ 搜索 / 筛选 / 批量操作工具条
├─ 模板表格
├─ 版本历史抽屉
├─ 导出 schema 弹窗
└─ 删除 / 归档确认弹窗

Designer 子页面
├─ 固定子页面标题与保存 / 发布 / 预览 / 返回
├─ 版本与结构状态条
├─ Designer 工作台
│  ├─ 左侧物料区
│  ├─ 中间画布
│  │  ├─ 页签切换栏
│  │  ├─ 当前页签画布
│  │  └─ 插入槽 / 拖拽反馈 / 空态入口
│  └─ 右侧属性面板
├─ Schema / 校验 / 联动 / LLM 抽屉
└─ 发布检查抽屉

Renderer 预览子页面
├─ 固定预览标题与版本切换
├─ 预览数据选择 / 模拟题目数据
├─ 完整 Renderer 标注页
├─ 校验结果与提交模拟
└─ Schema / 运行日志 / 差异检查
```

## 5. 模板管理列表页

### 5.1 页面头部

左侧：

- 标题：`模板搭建`
- 副文案：`管理可复用标注模板、版本和渲染预览，支撑任务发布与标注工作台。`

右侧：

- 主按钮：`新建模板`，进入新建 Designer 子页面。
- 次按钮：`导入 schema`，打开导入弹窗。
- 次按钮：`刷新`。

页面标题区固定在面包屑下方，不随表格滚动离开视口。
移动端标题区必须允许操作按钮自适应换行：`刷新` 与 `导入 schema` 并排，`新建模板` 独占下一行，按钮区域不得覆盖搜索框、状态筛选或视图切换。

### 5.2 状态概览

使用紧凑状态栏：

| 指标 | 来源 | 用途 |
| --- | --- | --- |
| 模板总数 | `GET /templates` | 企业模板规模。 |
| 草稿版本 | 模板状态或版本状态 | 待完善模板。 |
| 已发布版本 | `versions.is_published` | 可被任务绑定。 |
| 被任务引用 | 任务引用统计 | 判断是否可删除或只能新建版本。 |
| 最近更新 | `updated_at` | 判断模板活跃度。 |

不要伪造使用量或通过率；后端未返回时显示 `-`。

### 5.3 搜索与筛选

工具条：

- 关键词：模板名称、说明、组件字段名。
- 状态：草稿、已发布、已归档。
- 版本：最新版本、历史版本、有草稿版本。
- 物料类型：包含 ShowItem、LLMComponent、上传组件、JsonEditor。
- 引用状态：未引用、被草稿任务引用、被发布任务引用。
- 更新时间：日期范围。

当前 `GET /templates` 已约定支持关键词和任务筛选；其他筛选可先前端过滤，后续下沉 API。

### 5.4 模板表格与卡片视图

默认使用 Ant Design `Table`；筛选栏右侧提供 Ant Design `Segmented`，可切换为卡片扫描视图。卡片视图用于快速查看模板状态、版本、结构规模和引用情况，不能削弱版本历史、Renderer 预览和发布检查等操作入口。

建议列：

| 列 | 内容 | 交互 |
| --- | --- | --- |
| 模板名称 | 名称、简介、状态 Tag | 名称可点击进入 Designer 或版本概览。 |
| 负责人 | 模板创建人 `owner_name`，无名称时回退短 `owner_id` | 使用 Ant Design `Tag` 展示；用于判断模板来源和维护责任。 |
| 当前版本 | `v1.0`、`v1.1-draft`、schema_version | 点击查看版本历史。 |
| 结构概览 | 页签数、组件数、ShowItem 数、LLM 组件数 | 缺少 ShowItem 时提示发布任务映射受限。 |
| 校验与联动 | 必填字段数、校验规则数、联动规则数 | 规则冲突显示 Warning。 |
| 引用情况 | 关联任务数、发布中任务数 | 被发布任务引用时禁用删除。 |
| 最近更新 | 更新人、更新时间 | 支持排序。 |
| 操作 | 修改、新建版本、Renderer 预览、导出、复制、归档/删除 | 危险操作收进更多菜单。 |

最近更新时间展示必须和数据集管理、任务管理共用统一时间格式化：无时区 ISO datetime 按 UTC 解析，再转换为浏览器系统时区显示；带 `Z` 或时区偏移的字符串按原时区解析。版本历史抽屉中的创建时间也应使用同一口径。

行点击只做选中或展示摘要；进入 Designer 必须点击名称或 `修改`。

卡片视图补充：

- 卡片使用 Ant Design `Card`、`Tag`、`Dropdown`、`Modal.confirm` 和 `Pagination`。
- 卡片顶部展示发布状态、版本和更新时间；主体展示模板名称与两行描述；负责人区展示创建人；中部展示页签、ShowItem 和引用任务；底部展示进行中引用、数据绑定准备度和 `修改` / `预览` / `更多` 操作。
- 已发布模板的危险操作使用归档确认，草稿模板的危险操作使用删除确认。
- 卡片区内部滚动，底部固定分页器，支持每页条数和快速跳转。

### 5.5 列表页操作规则

| 操作 | 行为 |
| --- | --- |
| 新建模板 | 进入 `/templates/new` Designer，默认创建未发布草稿。 |
| 修改 | 未发布版本进入 Designer；已发布最新版本需要先创建新版本。 |
| 新建版本 | 基于指定版本复制 schema，生成下一个草稿版本。 |
| Renderer 预览 | 进入完整 Renderer 预览子页面，不使用弹窗挤占 Designer。 |
| 导出 schema | 导出当前版本 JSON Schema，可选择是否包含示例数据。 |
| 导入 schema | 校验 schema_version、tabs、components 后进入 Designer。 |
| 复制模板 | 新建独立模板草稿，不复制任务引用。 |
| 删除 | 仅未发布且未被任务引用的草稿模板可删除。 |
| 归档 | 对已发布或被引用模板隐藏列表默认展示，但保留历史回放。 |

当前实现补充：

- 列表页 `导入 schema` 打开 Ant Design Modal，支持通过 Ant Design `Upload` 选择 `.json` 文件，也支持粘贴完整模板对象或裸 schema；导入前校验 `schema_version`、非空 `tabs`、组件类型、组件 ID 唯一性和非 ShowItem 答案字段唯一性，通过后进入新建 Designer。
- 列表行 `导出` 会下载该模板当前 schema JSON；Designer 头部 `导出 schema` 会下载当前画布 schema，便于版本归档或跨环境迁移。
- 版本历史抽屉中的历史版本行支持 `预览` 与 `导出`；`预览` 进入完整 Renderer 子页面并使用该版本返回的 `schema` 快照，`导出` 下载该历史版本 schema，避免 latest schema 覆盖历史回放。

## 6. Designer 子页面

### 6.1 子页面头部

左侧：

- 返回按钮：`返回模板搭建`。
- 标题：新建时 `新建模板`；编辑时显示模板名称。
- 副信息：版本号、状态、schema_version、最近保存时间、创建人。

右侧：

- `保存草稿`：保存当前可编辑版本，标题栏常态只显示图标按钮，通过 Tooltip 说明。
- `Renderer 预览`：进入完整预览子页面，标题栏常态只显示图标按钮。
- `发布模板`：打开发布检查抽屉，标题栏常态只显示图标按钮。
- `导出 schema`：标题栏常态只显示图标按钮。
- `更多`：复制模板、新建版本、查看版本历史、删除草稿。

有未保存修改时显示 `有未保存修改` Tag。保存按钮 loading 时禁止重复提交。

### 6.2 版本与结构状态条

标题下方展示：

```text
v1.2-draft | 3 个页签 | 12 个组件 | 2 个 ShowItem | 1 个 LLM | 8 条校验 | 3 条联动 | Renderer 未校验
```

状态规则：

- 已发布版本显示只读状态，主操作变为 `新建版本再编辑`。
- 草稿版本显示可编辑。
- 若当前版本已被任务引用，提示“发布后任务将绑定版本快照，不会自动影响已发布任务”。

### 6.3 Designer 总体布局

桌面端使用三栏：

```text
┌──────────────┬──────────────────────────────┬────────────────┐
│ 物料区        │ 画布 + 页签切换栏              │ 属性面板          │
│ 260-300px    │ minmax(520px, 1fr)            │ 320-380px       │
└──────────────┴──────────────────────────────┴────────────────┘
```

尺寸约束：

- 左侧物料区宽度 260-300px，内部滚动。
- 中间画布最小宽度 520px，优先占用剩余空间。
- 右侧属性面板 320-380px，避免压缩画布。
- 1440px 宽度下三栏应完整可用；1280px 下右侧面板可收起为抽屉。
- Designer 桌面端固定在一个浏览器视口内，页面本身不承载上下滚动；标题栏和版本结构状态条固定，左侧物料区、中间画布和右侧属性面板分别内部滚动。
- 模板名称与参考数据集放在画布顶部同一行，使用 Ant Design `Input` / `Select` 紧凑呈现，避免占用独立表单区。
- 画布顶部提供小型折叠按钮，点击后收起子页面标题栏和版本结构状态条，让三栏工作台占用更多高度；再次点击恢复标题与概览。
- 左侧物料区与右侧属性面板的标题必须 sticky 固定在各自栏顶部，栏内内容滚动时仍能识别当前位置。
- 不把已保存模板列表塞在 Designer 下方；列表页负责模板管理。

### 6.4 左侧物料区

左侧物料区本质上是“物料注册表 + 说明面板 + 拖拽入口”。它不仅负责把可拖物料展示出来，还要把每个物料的提交语义、预览语义和多模态约束讲清楚，避免 Owner 在设计时把 `ShowItem`、答案字段和 AI 辅助块混为一谈。

当前实现中的物料分组如下：

| 分组 | 物料 |
| --- | --- |
| 原始数据展示 | `ShowItem` |
| 文本采集 | `TextInput`、`TextArea`、`RichEditor` |
| 选择类 | `SingleSelect`、`MultiSelect`、`TagSelect` |
| 多媒体与文件 | `FileUpload`、`ImageUpload`、`AudioUpload`、`VideoUpload` |
| 结构化 | `JsonEditor` |
| AI 辅助 | `LLMComponent` |
| 布局容器 | `GroupContainer`、多 Tab 容器 |

每个物料项都必须显示：

- 图标。
- 中文名称。
- API 类型与简短用途通过 `Tooltip` 展示，默认列表保持图标 + 名称的紧凑扫描形态，不把长说明直接铺在列表里。
- 是否进入答案、是否仅展示、是否需要绑定参考数据集，由物料说明和右侧属性面板共同提示。
- 多模态相关物料（文件 / 图片 / 音频）需在卡片内明确标出“可进入行级媒体绑定”，不要只写“上传文件”。

`ShowItem` 必须明确标注“只展示原始数据，不进入提交答案”。

常用组合属于快速覆盖当前页签的高风险操作，不是追加测试数据入口。点击任意常用组合后必须先弹出 Ant Design 确认弹窗，明确提示将清空当前页签已有物料并同步移除相关联动规则；只有用户二次确认后才应用组合内容。左侧物料区不再提供“加载测试模板”按钮，测试模板不作为 Owner 日常搭建主路径。

#### 6.4.1 物料注册表

物料注册表采用统一 schema 类型，但不同物料的属性、验证和运行时语义不同。建议按下面口径理解：

| 物料 | 进入答案 | 核心属性 |
| --- | --- | --- |
| `ShowItem` | 否 | `config.content_field`、`config.binding`、展示模式、空值兜底文案、只读预览 |
| `TextInput` | 是 | `placeholder`、默认值、最小/最大长度、正则、帮助文案 |
| `TextArea` | 是 | `placeholder`、默认值、行数、最小/最大长度、正则 |
| `RichEditor` | 是 | 富文本占位、默认值、长度限制、格式提示 |
| `SingleSelect` | 是 | 选项、默认值、必填、单选校验 |
| `MultiSelect` | 是 | 选项、最少/最多选择、默认值、必填 |
| `TagSelect` | 是 | 选项、允许自定义标签、最少/最多选择、默认值 |
| `FileUpload` | 是 | 接受类型、数量限制、大小限制、文件名提示 |
| `ImageUpload` | 是 | 图片预览、数量限制、大小限制、`accept=image/*` |
| `AudioUpload` | 是 | 音频预览、数量限制、大小限制、`accept=audio/*` |
| `VideoUpload` | 是 | 视频预览、数量限制、大小限制、`accept=video/*` |
| `JsonEditor` | 是 | JSON 提示、默认值、格式校验、折叠预览 |
| `LLMComponent` | 否 / 参考 | AI 辅助模式、输入字段说明、输出建议、提示文案、失败兜底 |
| `GroupContainer` | 否 | 分组标题、说明文本、展示样式；扁平 schema 中作为段落块存在，不包裹子组件 |

本版 `GroupContainer` 采用扁平组件实现：它与其他字段在同一 `tab.components` 数组中排序，用于在 Renderer 中显示段落标题和说明，不改变答案字段路径，也不引入嵌套 children。这样可以兼容现有模板发布、ShowItem 映射、AI 助手预览、Labeler 作答和历史 submission 回放。后续如需要真正嵌套布局，可在 schema 中新增 `children` 或 `layout` 版本字段，但不能破坏当前扁平组件读取逻辑。

#### 6.4.2 参考数据集与多模态绑定

Designer 的“参考数据集”不是任务发布阶段的数据集绑定，而是模板设计时的语义辅助来源。它提供三类信息：

- `columns`：原始字段名、数据类型、备注和示例值。
- `media_schema`：图片、音频、视频、文档等行级媒体的角色和来源。
- `context_schema`：OCR / ASR / caption / summary / video keyframes 等派生上下文。

`ShowItem` 的推荐绑定要优先从这些信息中推导：

- 纯文本字段优先走 `config.content_field`。
- 媒体字段优先走 `config.binding.source_type = media`，并显式记录 `media_type`、`role`、`field`。
- 派生上下文优先走 `config.binding.source_type = derived_context`，并记录 `key`。
- 附件类素材如果只是上传但不能定位到具体行，允许暂存在数据集级素材中，但不默认进入题目上下文。

物料拖拽到画布时仍然以 `TemplateComponentSchema` 为唯一落点，绑定信息只是附着在 `config` 上，保证后续导出、导入、Renderer 预览和 Labeler 运行时都能读回同一份语义。

当前实现对接规则：

- 画布顶部的参考数据集选择只影响 Designer 预览、右侧 ShowItem 数据源选择器、模板 AI 上下文和 schema lint 提示，不会直接创建或修改任务发布阶段的数据集绑定。
- 右侧 ShowItem 的 `预览数据源` 使用同一组候选：普通列、媒体、派生上下文、行级附件。选择普通列时写入 `config.content_field` 与 `config.binding={ source_type: "column" }`；选择媒体时写入 `config.binding={ source_type: "media", media_type, role, field }`；选择派生上下文时写入 `config.binding={ source_type: "derived_context", key }`；选择行级附件时写入 `config.binding={ source_type: "attachment", key, field }`。
- 右侧 ShowItem 的展示字段选择器、搜索候选和拖拽标签必须使用同一组数据源候选。已经被 `media_schema` 声明为图片、音频或视频来源的原始 URL 列，只能作为媒体来源显示，例如 `图片 · primary · image_url`，不得再作为 `image_url · image` 普通列重复出现。
- Designer Renderer 预览和模板 AI 预览使用参考数据集第一条样例行作为 `TemplateRenderer.content`。没有参考数据集时使用结构化示例 content，避免 ShowItem 空白。
- 模板 AI 请求会携带截断后的参考数据集摘要：`columns`、`derived_columns`、`media_schema`、`context_schema` 和最多 5 行样例，不携带未绑定素材或完整大文件内容。
- 发布任务时仍由“模板与数据”步骤把 ShowItem 绑定写入 `column_mapping` / `mapping_config`。Designer 内的 `config.binding` 只是推荐语义，发布页可继承建议但必须允许 Owner 调整。

#### 6.4.3 `LLMComponent` 的设计口径

`LLMComponent` 是字段级 AI 辅助块，不是答案字段，也不是通用问答框。它在模板里承担三件事：

1. 告诉标注员当前字段可以调用 AI 参考。
2. 让 Renderer 在 Labeler 工作台中显示 AI 辅助入口。
3. 让后端识别这一组 schema 需要进入 AI 相关链路，而不是普通表单答案校验。

当前实现中，`LLMComponent` 仍保留在 schema 里，但不参与答案字段校验，渲染时也不当作提交字段。其更详细的模型、Prompt 和输出结构继续放在模板级 `llm_config` 和任务级 AI 配置中。

### 6.5 中间画布

画布由页签切换栏和当前页签组件列表组成。

#### 页签切换栏

页签的重命名、删除、排序不放在右侧属性栏，必须直接在页签切换栏完成：

- 双击页签标题：进入 inline rename。
- 页签标题右侧 `更多` 图标菜单：重命名、复制页签、删除页签、设为默认、上移/下移；常用页签操作在页签栏完成，不再依赖右侧属性栏或只靠拖拽。
- 拖拽页签：调整页签顺序。
- `+` 按钮：新增页签。
- 不保留独立的“页签操作”按钮，避免与每个页签自身的更多菜单重复。
- 至少保留一个页签；删除最后一个页签时禁用删除并提示原因。
- 删除有组件的页签时二次确认，提示会删除该页签下所有组件。
- 删除包含组件的页签时必须同步清理以这些组件为来源或目标的 `linkage_rules`，避免 schema 保留悬空依赖。
- 页签之间的插入 / 拖拽只负责结构顺序，不替代组件级的属性配置；组件的业务语义必须仍由右侧属性面板维护。

页签切换栏要清楚区分：

- 当前选中页签。
- 只读历史版本页签。
- 含校验错误页签。
- 含未映射 ShowItem 页签。

#### 画布组件

每个组件行应展示：

- 序号。
- 组件标题 / 字段名。
- API 类型 Tag。
- 是否必填、是否进入答案、是否有联动、是否有 LLM。
- 行内操作：复制、删除、上移、下移、收起/展开。
- 画布组件操作尽量使用 Ant Design 图标按钮并带 `Tooltip`，减少文本按钮挤占画布宽度。
- 中间画布按考试题目/问卷编辑器心智呈现为一张纯白页面，组件是页面被切割后的紧贴连续题块，不使用圆角矩形卡片、浮动阴影或左侧粗边框堆叠。
- 组件前后提供 Ant Design `Button + Dropdown` 驱动的蓝色分割线插入入口，点击后可直接选择物料类型；下拉候选菜单以分割线中心对齐并完整显示，不得被画布或三栏容器裁切；首个组件前、组件之间和最后一个组件后都必须是可命中的独立分隔线热区，最后分隔线用于把物料追加到画布末尾。
- 插入入口是独立于上下组件块的细蓝线，绝对定位覆盖在题块分割线上，不占用上下题块的排版高度；鼠标接近分割线、聚焦或拖拽指向时才高亮并显示小型“插入物料”标签；鼠标只停在组件块上不得触发相邻插入线，不得恢复加号按钮或宽插入槽。

拖拽反馈：

- 被拖动项：降低透明度并显示抓手。
- 可投放位置：显示明确蓝色插入线。
- 拖拽投放只在蓝色分割线热区生效；拖到物料块本身不得高亮物料块，也不得插入到两个组件之间；分割线高亮时下方物料块仍保持常态背景。
- 拖拽悬停过程中不让其他题块上下偏移，只保留蓝色分隔线反馈；释放完成后，实际落位的物料块从原移动方向滑入最终位置，提供 150-250ms 的轻量位移动画，仅使用 `transform` 与 `opacity`，并遵守 `prefers-reduced-motion`。
- 当前选中组件：右侧属性面板同步显示其配置，画布内不常态显示蓝色高亮；点击画布空白区域可取消画布选中态。
- `插入物料` 入口只在插入区域获得焦点、键盘操作、悬停或拖拽指向时显性显示；组件 hover 主要显示组件自身操作，不使用大面积分隔线抢占焦点。

画布中间每个组件卡片必须直接展示五类信息，避免 Owner 只能点开右侧面板才能理解组件含义：

- 组件标题：取 `label`。
- 说明文字：取 `config.description`，为空时显示“暂无说明文字”。
- 绑定变量：ShowItem 展示 `config.binding` / `content_field` 的中文来源，例如“普通列 · title”“图片 · primary · image_url”“派生上下文 · asr_text”；非 ShowItem 显示“不绑定原始变量”。
- 答案字段：答案组件展示 `field`；ShowItem、LLMComponent、GroupContainer 明确标注“不参与提交 / AI 辅助参考 / 分组容器”。
- 组件类型：使用中文物料名，不展示英文 API type。
- 参考数据集的数据源候选只展示可映射业务列、`media_schema`、`context_schema` 和附件来源。`media`、`attachments`、`derived_context`、`_bindings` 等系统上下文字段不能作为普通列候选重复出现；图片 Mask 的 `图片来源` 只展示图片列和图片类型 `media_schema`，不展示文本列、音频/视频列或 `media_list`。

空态：

- 删除当前页签全部组件后，画布必须显示空态和重新添加入口。
- 空态提供 `添加 ShowItem`、`添加文本输入`、`从物料区拖入` 三个入口。
- 不允许因为组件数组为空导致白屏。

### 6.6 右侧属性面板

右侧面板只配置当前选中的组件，不负责页签重命名和删除。

面板分区：

| 分区 | 内容 |
| --- | --- |
| 基础属性 | 字段标题、字段 key、说明、占位文案、默认值、是否必填。 |
| 展示/提交行为 | 是否进入答案、是否只读、是否作为 ShowItem、是否在移动端隐藏。 |
| 校验规则 | 必填、最小/最大长度、正则、选项最少/最多选择、JSON 格式校验。 |
| 选项配置 | 单选、多选、标签选择的选项、排序、是否允许自定义标签。 |
| 上传配置 | 文件类型、大小限制、数量限制、图片预览规则。 |
| LLM 配置 | Prompt、输入字段、输出字段、是否允许预填、失败提示。 |
| 联动规则 | 条件显示、联动校验、依赖字段、触发条件。 |
| 高级 | 自定义 config JSON、组件 ID、兼容性说明。 |

右侧面板底部固定当前组件操作：

- `应用修改`
- `复制组件`
- `删除组件`

删除组件必须二次确认，尤其是被联动规则引用时。

#### 6.6.1 属性面板分层策略

属性面板按“基础属性 -> 类型属性 -> 结构联动 -> 高级兼容”四层企业，避免把所有控件堆成一列：

- 基础属性放组件标题、字段名、说明文字、是否必填、占位文案。说明文字写入 `config.description`，必须在画布卡片、Designer 预览、模板 AI 预览和 Labeler 运行时保持一致。
- 类型属性根据物料不同动态展开，例如选项、上传限制、JSON 校验、LLM 提示。
- 结构联动只处理显示 / 隐藏 / 必填联动，不把复杂逻辑藏进一个大文本框。
- 高级兼容只提供 `config` 预览、ID、版本和导入/导出兼容提示，默认收起。

#### 6.6.2 各物料的重点属性

| 物料 | 属性面板重点 |
| --- | --- |
| `ShowItem` | 数据源绑定、`content_field`、`config.binding`、空值兜底、展示格式、是否高亮媒体 |
| `TextInput` / `TextArea` / `RichEditor` | 占位、默认值、长度、正则、声明式自定义校验、辅助说明 |
| `SingleSelect` / `MultiSelect` / `TagSelect` | 选项编辑、默认值、最少/最多选择、自定义标签 |
| `Scale` | 最小值、最大值、步长、首尾标签、默认值和必填设置 |
| `Ranking` | 候选项编辑、默认排序、提交顺序说明和必填设置 |
| `FileUpload` / `ImageUpload` / `AudioUpload` / `VideoUpload` | 接受类型、最大数量、大小限制、媒体预览、绑定来源 |
| `JsonEditor` | JSON 示例、格式约束、默认值 |
| `LLMComponent` | 仅展示辅助说明、触发语义、输入字段与输出字段提示；真正的 Provider / 模型配置留在模板级 `llm_config` 或任务级 AI 配置 |
| `GroupContainer` | 分组说明、展示样式；不展示必填、默认值、答案字段校验配置 |

自定义校验不执行任意 JS / Python 代码。属性面板提供安全声明式规则：`contains`、`not_contains`、`starts_with`、`ends_with`，写入 `config.custom_validation={ operator, value, message }`。后端发布前检查校验 operator 与必填值，Labeler 提交时由 `validate_template_component_answer` 执行同一规则。

`ShowItem` 的属性必须和参考数据集联动：

- 选中参考数据集后，右侧显示可绑定列搜索框。
- 对媒体来源、上下文来源和普通列分开提示，避免 Owner 把图片、音频、视频 URL 误绑成普通文本；若媒体字段已进入 `media_schema`，属性面板和拖拽候选只展示对应媒体来源，不再展示同名普通列。
- 右侧 `预览数据源` 切换后，必须立即用参考数据集第一条样例通过 `TemplateRenderer` 渲染真实预览；图片、音频、视频、文档链接、派生上下文和附件都按运行时语义展示，而不是只显示字段名。
- 没有参考数据集时，只允许做结构校验，不阻止模板搭建继续进行。

### 6.7 Schema 与校验抽屉

Designer 提供 `查看 schema` 按钮，打开 Drawer：

- JSON Schema 只读预览。
- Schema lint 结果。
- 物料注册表检查。
- 字段 key 重复检查。
- 联动依赖缺失检查。
- ShowItem 未映射风险提示。
- 导出 schema。

编辑 JSON 原文属于高级能力，默认不开放直接修改；如开放必须经过 schema 校验后再回写画布。

### 6.8 多模态 schema 与统一渲染链路

同一份 `TemplateSchemaPayload` 必须同时服务三个场景：

1. Designer 预览。
2. 模板搭建 AI 的变更预览。
3. Labeler 工作台和审核侧的运行时渲染。

链路建议统一为：

```text
Dataset import / normalize
  -> reference dataset (columns + media_schema + context_schema + sample_rows)
  -> Designer schema (tabs + components + linkage_rules + llm_config)
  -> publish mapping (column_mapping + mapping_config)
  -> question content materialization
  -> TemplateRenderer
```

关键规则：

- `ShowItem` 只负责展示，不进入答案字段校验。
- `column_mapping` 仍兼容旧任务，负责把 `ShowItem` 绑定到数据列。
- `mapping_config` 负责多模态任务中的 `column / media / derived_context / attachment` 绑定。
- `production_service.materialize_question_content` 以 `mapping_config` 优先、`column_mapping` 兜底生成题目内容。
- Designer 预览、AI 助手预览和 Labeler 工作台都使用同一套 `TemplateRenderer` 语义，只切换 `variant` 和 `content`。

`TemplateRenderer` 的运行时渲染口径需要保持一致：

- ShowItem 优先解析 `config.binding`，再回退 `config.content_field`、`component.field` 和 `component.id`。
- `config.binding.source_type=column` 时从题目 content 的列名取值。
- `config.binding.source_type=media` 时从 content.media 中按 `type / role / field` 匹配行级媒体，匹配不到时回退同名字段。
- `config.binding.source_type=derived_context` 时从 content.derived_context 中按 `key` 取 OCR、ASR、caption、summary 等派生上下文。
- `config.binding.source_type=attachment` 时从 content.attachments 中按 `key / field / name` 匹配附件。
- 字符串 URL 命中图片 / 音频 / 视频后，直接按媒体预览。
- 数组按每个元素递归渲染；媒体对象显示为图片 / 音频 / 视频 / 文件链接，普通对象显示为 JSON 预览。
- ShowItem 多字段展示中的文本说明、字段标签和媒体播放器必须限制在当前字段卡片内；音频等横向控件在 Renderer 中按列式自适应布局，允许中文说明和素材标题换行，不得溢出覆盖相邻字段。
- `ImageMaskAnnotation` 的底图同样消费行级媒体对象；当图片来自 `/api/v1/uploads/{file_id}/download` 这类受保护上传地址时，运行时必须通过认证请求生成 object URL 后渲染，避免 `<img>` 丢失 `Authorization` / `X-Team-ID`，但提交答案中的 `image_source` 仍保存原始媒体引用而不是临时 blob URL。
- `ImageMaskAnnotation` 在 Designer Renderer 预览和 Labeler 正式答题中复用同一套 `TemplateRenderer` 组件。底图画板必须按图片自然宽高比例显示；当可视高度受限时缩窄画板宽度，不得用固定高度或 `max-height` 把图片拉伸变形，避免 mask 坐标和真实图片比例错位。
- `FileUpload` / `ImageUpload` / `AudioUpload` 在运行时显示上传控件与文件列表。
- `LLMComponent` 在 Labeler 工作台显示为 AI 辅助入口，但不作为提交答案字段。
- `GroupContainer` 在 Designer 预览、模板 AI 预览和 Labeler 工作台显示为分组段落，不作为提交答案字段、审核字段或 AI 答案生成目标。

后端对接点：

- 数据集导入由 `normalize_multimodal_dataset_rows` 生成行级 `media`、`attachments`、`derived_context`、`media_schema`、`context_schema`。
- 发布任务生成题目时 `materialize_question_content(row, column_mapping, mapping_config)` 优先消费 `mapping_config`，并把解析到的行级媒体、附件、派生上下文和 `_bindings` 写入题目 content。
- 前端 `TemplateRenderer` 不重新推断任务权限或数据来源，只消费题目 content 中已经物化好的值；这保证 Designer 预览、模板 AI 预览和 Labeler 工作台使用同一套 renderer，而不是三套不同逻辑。

## 7. Renderer 预览子页面

Renderer 预览必须是完整子页面，不是 Designer 右下角小预览，也不挤在右侧属性栏。

Renderer 预览继承 Designer 的固定视口和图标化操作风格：标题栏操作常态只保留图标按钮并通过 Tooltip 说明；预览数据选择栏提供与 Designer 一致的小型“收起标题与概览”按钮，收起后隐藏页面标题和结构概览，仅保留数据选择、模拟标注页和运行检查面板。

### 7.1 页面头部

左侧：

- 返回 Designer 或返回模板列表。
- 标题：`Renderer 预览`
- 副信息：模板名、版本号、schema_version、预览数据来源。

右侧：

- `切换版本`
- `选择预览数据`
- `运行校验`
- `返回 Designer`

### 7.2 预览数据

Renderer 需要模拟 Labeler 工作台中真实题目数据：

- 选择数据集样例行。
- 手动填写 mock content。
- 使用任务发布阶段的 `column_mapping` 预览 ShowItem。
- 无数据时使用结构化占位，但必须标注“示例数据”。

当前实现补充：

- Renderer 预览页顶部提供 `预览数据集` 与 `样例行` 选择器；切换数据集或样例行会重置当前校验结果，并用选中的 `preview_rows[n]` 作为 ShowItem 和表单校验的模拟 content。
- 从版本历史进入 Renderer 预览后，返回按钮回到模板列表并重新打开该模板版本历史，便于继续对比或导出。

### 7.3 完整渲染区

渲染区按照 Labeler 作答页面体验呈现：

- 顶部任务说明占位。
- 多 Tab 表单。
- ShowItem 原始数据展示。
- 采集字段输入。
- LLMComponent 辅助输出区域。
- 草稿保存状态占位。
- 提交按钮和校验错误展示。

Renderer 预览只模拟提交，不写入正式 submission。

Renderer 的数据源必须与 AI 预览和 Labeler 工作台同源：Designer 预览和模板搭建 AI 预览都优先用参考数据集样本行或手动 mock content，Labeler 工作台则直接使用 `currentQuestion.content`。同一份 schema 不应出现一套渲染规则在 Designer 能看、Labeler 不能跑的情况。

当前 Renderer 已消费 schema 中的 `linkage_rules` 条件显示规则。规则命中后会按 `show` / `hide` 动作显示或隐藏目标组件；被隐藏组件的字段错误不会在前端显示，后端 `POST /templates/validate` 也不会对隐藏组件执行必填或格式校验。可视化联动规则编辑器仍属于后续高级能力，当前可通过 schema 中的 `linkage_rules` 承载运行时行为。

Designer 右侧属性面板已提供基础条件显示配置：选中目标组件后可启用联动，选择触发字段、条件、匹配值和显示/隐藏动作，保存时写入 schema 顶层 `linkage_rules`。当前一个目标组件优先维护一条条件显示规则；多条件组合、跨页联动可视化、联动校验和自定义表达式仍为后续高级能力。

### 7.4 校验与差异

右侧或底部展示运行检查：

- 必填未填。
- 文本长度 / 正则不通过。
- 选项数量不通过。
- JSON 格式不通过。
- 联动条件触发结果：展示当前规则命中、目标组件显示/隐藏和被跳过校验的字段。
- LLM 组件输入字段缺失。
- Designer schema 与 Renderer 渲染组件是否一致。

Renderer 预览通过后，Designer 状态条可显示 `Renderer 已校验`。

## 8. 版本管理

模板迭代必须按版本号管理。

### 8.1 版本规则

- 新建模板默认 `v0.1-draft` 或 `v1.0-draft`，具体命名可按后端约定统一。
- 发布后版本变为不可编辑的 `v1.0`。
- 已发布模板不能原地修改；点击修改时必须生成 `v1.1-draft` 或下一个草稿版本。
- 任务发布时绑定具体模板版本，不绑定会变化的 latest 指针。
- submission 必须记录 `template_version_id`，保证历史数据可回放。

### 8.2 版本历史抽屉

从模板列表或 Designer 打开：

| 字段 | 内容 |
| --- | --- |
| 版本号 | v1.0、v1.1-draft |
| 状态 | 草稿、已发布、已归档 |
| 变更摘要 | 手动填写或系统生成 |
| 组件统计 | 页签数、组件数、ShowItem、LLM |
| 引用任务 | 任务数和发布中任务数 |
| 创建人/发布时间 | 审计信息 |
| 操作 | 预览、复制为新版本、导出、对比 |

版本对比：

- 展示新增/删除/修改组件。
- 展示字段 key 变化。
- 展示校验和联动规则变化。
- 对 ShowItem 和答案字段变化做高风险提示。

当前实现补充：

- `GET /api/v1/templates/{template_id}/versions` 返回每个版本的完整 `schema` 快照；版本历史的 `预览` 和 `导出` 都必须使用对应版本的 `schema`。
- 历史版本 Renderer 预览保持完整页面体验，不在版本历史抽屉内嵌小预览。

### 8.3 发布检查

发布模板前打开 Drawer：

| 检查项 | 阻塞规则 |
| --- | --- |
| 至少一个页签 | 无页签阻塞。 |
| 至少一个可提交字段 | 只有 ShowItem 时警告，按业务可允许展示型模板。 |
| 字段 key 唯一 | 重复阻塞。 |
| 组件类型合法 | 未注册物料阻塞。 |
| 校验规则合法 | 正则错误、长度范围错误、自定义校验 operator / value 错误阻塞。 |
| 联动规则合法 | 依赖字段不存在阻塞。 |
| LLM 配置合法 | 启用 LLM 但缺 Prompt 或输出字段阻塞。 |

全部通过后调用 `POST /templates/{template_id}/publish`。

## 9. 与任务发布和 Labeler 工作台的关系

- 模板 Designer 只定义结构和字段，不直接绑定具体数据集。
- `ShowItem` 在模板中只声明展示位置和展示方式；具体数据列在任务发布阶段通过 `column_mapping` 绑定，多模态字段则通过 `mapping_config` 绑定到媒体、上下文或附件来源。
- Designer 预览、模板搭建 AI 预览和 Labeler 工作台使用同一份 Renderer 语义，只是喂入的 `content` 来源不同。
- 发布任务后模板变更不会影响已发布任务，除非创建新任务或明确迁移版本。
- 模板版本删除或归档不能破坏历史 submission 回放。

## 10. 空态、错误与权限

### 10.1 列表空态

无模板时显示：

- 标题：`还没有模板`
- 说明：`新建一个标注模板，配置 ShowItem、采集字段、校验和 LLM 辅助后，即可在任务发布时复用。`
- 主按钮：`新建模板`
- 次按钮：`导入 schema`

### 10.2 Designer 错误

- 模板不存在：显示 `模板不存在或已被删除`，提供返回列表。
- 版本只读：显示 `该版本已发布，请新建版本后编辑`。
- 权限不足：显示 `没有模板管理权限`。
- 保存冲突：如果后续接入乐观锁，显示当前版本已被他人更新，提供对比和重新加载。
- 组件错误：错误定位到具体页签和组件。

### 10.3 权限

- Team Admin 可管理企业全部模板。
- Owner 可管理授权范围内模板。
- Reviewer / Labeler 默认只读或不可见。
- 删除、发布、新建版本必须写入审计日志。

## 11. API 对应关系

| 前端功能 | API |
| --- | --- |
| 模板列表 | `GET /api/v1/templates` |
| 新建模板 | `POST /api/v1/templates` |
| 模板详情 | `GET /api/v1/templates/{template_id}` |
| 保存草稿 | `PUT /api/v1/templates/{template_id}` |
| 发布模板 | `POST /api/v1/templates/{template_id}/publish` |
| 复制模板 | `POST /api/v1/templates/{template_id}/copy` |
| 归档模板 | `POST /api/v1/templates/{template_id}/archive` |
| 删除草稿模板 | `DELETE /api/v1/templates/{template_id}` |
| 版本历史 | `GET /api/v1/templates/{template_id}/versions`，返回历史版本 schema、结构统计和引用统计 |
| Renderer 预览结构 | `GET /api/v1/templates/{template_id}/preview` |
| 任务引用 | 短期可由任务列表聚合，后续建议增加模板引用统计接口。 |
| 审计日志 | `GET /api/v1/audit-logs` |

模板删除与归档规则：

- 草稿模板可删除；如果已被任务引用，后端必须拒绝删除。
- 已发布模板不可删除，列表操作应使用归档，归档后不再作为任务发布候选。
- 归档不能删除历史版本，必须保证历史任务和 submission 可按 `template_version_id` 回放。
- 复制模板生成新的草稿模板和独立版本序列，不继承源模板的发布状态。

## 12. Ant Design 组件建议

| 区域 | 组件 |
| --- | --- |
| 模板列表 | `Table`、`Input.Search`、`Select`、`Tag`、`Dropdown`、`Popconfirm` |
| 版本历史 | `Drawer`、`Timeline` 或 `Table` |
| Designer 头部 | `Button`、`Tag`、`Segmented`、`Dropdown` |
| 页签切换栏 | `Tabs` + 自定义 tab label 菜单 |
| 物料区 | `Collapse`、`Button`、`Tooltip` |
| 画布 | 自定义拖拽列表，后续接入 dnd-kit |
| 属性面板 | `Form`、`Input`、`Select`、`Switch`、`InputNumber`、`Collapse` |
| Renderer 预览 | `Tabs`、`Form`、`Alert`、`Descriptions` |
| 发布检查 | `Drawer`、`Steps`、`Alert`、`List` |

不要引入新的组件库替代 Ant Design；如需拖拽能力，优先评估 dnd-kit。

## 13. Hallmark 反模板化检查

本页必须避免：

- 把模板列表做成通用卡片墙，导致版本、引用和物料统计不可扫描。
- 把 Designer、模板列表和 Renderer 预览全部塞在一个页面角落。
- 把页签重命名、删除放在右侧属性栏，造成用户误以为在编辑组件属性。
- 把 Renderer 预览做成小弹窗或右侧栏，无法验证真实 Labeler 作答体验。
- 已发布模板直接原地修改，破坏任务和历史 submission 可追溯性。
- 只提供视觉拖拽，不展示 schema、字段 key、校验和联动错误。
- 用颜色单独表达状态；状态必须配文字、图标或 Tag。

## 14. 实施优先级

第一阶段：

- 模板列表页、搜索筛选、表格操作、空态。
- 新建/修改 Designer 子页面框架。
- 页签切换栏 inline 重命名、删除、复制、排序。
- Designer 三栏布局尺寸修正。
- Renderer 预览改为完整子页面入口。

第二阶段：

- 版本历史抽屉、新建版本、已发布版本只读。
- 发布检查抽屉。
- Schema 检查抽屉和导出 schema。
- Renderer 预览数据选择和校验运行。

第三阶段：

- 版本对比、任务引用统计、乐观锁并发保护。
- 字段联动规则编辑器已支持单目标基础条件显示；仍需补多条件组合、联动校验和自定义表达式。
- Labeler 工作台与 Designer Renderer 一致性测试。
- 历史 submission 按旧模板版本回放。
