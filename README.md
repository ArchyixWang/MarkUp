<p align="center">
  <img alt="MarkUp 项目介绍" src="docs/assets/intro.jpg" width="100%">
</p>

<p align="center">
  <img alt="React" src="https://img.shields.io/badge/React-TypeScript-149eca?logo=react&logoColor=white">
  <img alt="Vite" src="https://img.shields.io/badge/Vite-%E6%9E%84%E5%BB%BA-646cff?logo=vite&logoColor=white">
  <img alt="Ant Design" src="https://img.shields.io/badge/Ant%20Design-%E7%BB%84%E4%BB%B6%E5%BA%93-1677ff?logo=antdesign&logoColor=white">
  <img alt="FastAPI" src="https://img.shields.io/badge/FastAPI-%E5%90%8E%E7%AB%AF-009688?logo=fastapi&logoColor=white">
  <img alt="MongoDB" src="https://img.shields.io/badge/MongoDB-%E6%95%B0%E6%8D%AE%E5%BA%93-47a248?logo=mongodb&logoColor=white">
</p>

<h1 align="center">MarkUp 马克派</h1>

MarkUp（马克派）是一个基于 React、FastAPI 和 MongoDB 构建的数据标注平台，面向数据生产、质量审核与团队协作场景。平台支持任务市场、团队工作区、数据集管理、模板 Designer / Renderer、在线标注、AI 预审、人工审核、权限控制、操作审计和异步导出等能力。

系统围绕 Owner、Team Admin、Labeler、Reviewer 与 AI Agent 等角色设计，覆盖数据标注任务从创建、发布、领取、提交、预审、复核到导出的完整生命周期，适合用于训练数据构建、多模态数据处理、标注质量管理和企业级数据运营流程。

<p align="center">
  <a href="https://www.markuplabel.cn">
    <img alt="MarkUp 在线 Demo" src="https://img.shields.io/badge/在线%20Demo-www.markuplabel.cn-7c3aed?style=for-the-badge">
  </a>
  <br>
  <sub>访问 <a href="https://www.markuplabel.cn">https://www.markuplabel.cn</a> 体验 MarkUp 已部署演示环境；本地启动与账号说明见 <a href="docs/DEPLOYMENT.md">启动与部署</a>。</sub>
</p>

<p align="center">
  <strong>开发团队</strong>
  <br>
  <sub>三位成员围绕产品设计、工程实现、AI 能力接入、文档整理与演示交付协作完成 MarkUp。</sub>
</p>

<div align="center">
<table width="100%">
  <tr>
    <td width="33%" align="center" valign="top">
      <img src="docs/assets/wengkaile.png" alt="翁凯乐" width="100%">
      <h3 align="center">翁凯乐</h3>
      <p align="center"><strong>团队成员</strong></p>
      <a href="https://github.com/HIN233">
        <img src="https://img.shields.io/badge/GitHub-HIN233-181717?logo=github&logoColor=white" alt="翁凯乐 GitHub">
      </a>
    </td>
    <td width="33%" align="center" valign="top">
      <img src="docs/assets/wangyixn.jpg" alt="王亦昕" width="100%">
      <h3 align="center">王亦昕</h3>
      <p align="center"><strong>队长</strong></p>
      <a href="https://github.com/ArchyixWang">
        <img src="https://img.shields.io/badge/GitHub-ArchyixWang-181717?logo=github&logoColor=white" alt="王亦昕 GitHub">
      </a>
    </td>
    <td width="33%" align="center" valign="top">
      <img src="docs/assets/lihanxi.jpg" alt="李涵熙" width="100%">
      <h3 align="center">李涵熙</h3>
      <p align="center"><strong>团队成员</strong></p>
      <a href="https://github.com/cola-king-9630">
        <img src="https://img.shields.io/badge/GitHub-cola--king--9630-181717?logo=github&logoColor=white" alt="李涵熙 GitHub">
      </a>
    </td>
  </tr>
</table>
</div>

<p align="center">
  <strong>项目 Demo 视频</strong>
  <br>
  <sub>通过完整演示视频快速了解 MarkUp 的任务生产、标注作答、AI 预审、人工审核与结果交付链路。</sub>
</p>

[![点击观看演示](docs/assets/markup-封面.jpg)](【[2026字节跳动AI全栈挑战赛] MarkUp马克派 演示视频】 https://www.bilibili.com/video/BV1eRER6fEeu/?share_source=copy_web&vd_source=483d1538f141b55c15be6d29534b4976)

---

<p align="center">
  <strong>多端适配展示</strong>
  <br>
  <sub>MarkUp 面向桌面端工作台与移动端访问场景做响应式适配，保证任务管理、标注作答和审核浏览在不同设备上保持清晰可用。</sub>
</p>

<table>
  <tr>
    <td width="65%" align="center" valign="middle">
      <img src="docs/assets/laptop.png" alt="MarkUp 桌面端适配展示" width="100%">
      <br>
      <sub>Desktop / Laptop</sub>
    </td>
    <td width="35%" align="center" valign="middle">
      <img src="docs/assets/mobile.png" alt="MarkUp 移动端适配展示" width="62%">
      <br>
      <sub>Mobile</sub>
    </td>
  </tr>
</table>

---

## 目录

<p align="center">
  <a href="#项目亮点">项目亮点</a> ·
  <a href="#业务流程">业务流程</a> ·
  <a href="#系统架构">系统架构</a> ·
  <a href="#技术栈">技术栈</a> ·
  <a href="#仓库结构">仓库结构</a>
  <br>
  <a href="#启动与部署">启动与部署</a> ·
  <a href="#关键设计取舍">关键设计取舍</a> ·
  <a href="#项目时间线">项目时间线</a>
</p>

---

## 项目亮点

<p align="center">
  <strong>AI 原生 · 多模态生产 · 全链路可追溯</strong>
</p>

<table>
  <tr>
    <td width="33%" valign="top" align="center">
      <img src="https://api.iconify.design/hugeicons/ai-brain-03.svg?color=%237c3aed" alt="AI 原生能力图标" width="88">
      <h3 align="center">AI 原生生产力</h3>
      <p align="center">模板助手、发布助手、字段级 LLM 辅助与 AI 预审贯穿生产链路，把模型能力落到可确认、可审核的业务动作里。</p>
    </td>
    <td width="33%" valign="top" align="center">
      <img src="https://api.iconify.design/hugeicons/ai-image.svg?color=%230f766e" alt="多模态能力图标" width="88">
      <h3 align="center">多模态数据生产</h3>
      <p align="center">文本、图片、音频、视频、文件、富文本与 JSON 通过统一模板体系进入标注、审核和导出流程。</p>
    </td>
    <td width="33%" valign="top" align="center">
      <img src="https://api.iconify.design/hugeicons/check-list.svg?color=%23b45309" alt="可追溯能力图标" width="88">
      <h3 align="center">可追溯质量闭环</h3>
      <p align="center">任务、题目、模板版本、提交、AI 预审、人工审核、导出和治理操作都能回到明确证据链。</p>
    </td>
  </tr>
</table>

## 业务流程

MarkUp 的核心业务对象是任务、题目、提交、AI 预审记录、人工审核记录和导出结果。Owner 与 Team Admin 创建并发布任务，Labeler 围绕题目产生提交，Agent 为提交生成 AI 预审记录，Reviewer 基于原始答案与 AI 建议形成审核结论；通过的数据进入导出，打回的数据回到对应 Labeler 修订后重新提交。Platform Admin 则在平台侧处理认证、资质、申诉与 Provider 治理。

下图先给出跨角色的主链路。它强调任务从生产端进入平台后，如何被分发到企业内或公开市场，如何经过 AI 预审与人工审核，以及打回数据如何回到作答端形成修订闭环。

```mermaid
flowchart LR
  Producer["Owner / Team Admin<br/>任务生产与发布"] --> Distribution{"任务分发"}
  Distribution --> TeamLabeler["企业内 Labeler<br/>指派 / 流转 / 领取"]
  Distribution --> PersonalLabeler["个人 Labeler<br/>任务广场领取"]
  TeamLabeler --> Submit["作答提交"]
  PersonalLabeler --> Submit
  Submit --> Agent["Agent<br/>AI 预审"]
  Agent --> Reviewer["Reviewer<br/>人工审核"]
  Reviewer -->|通过| Export["结果导出"]
  Reviewer -->|打回| Revise["Labeler 修订"]
  Revise --> Submit

  PlatformAdmin["Platform Admin<br/>认证 / 资质 / 申诉 / Provider"] -. "平台治理" .-> Producer
  PlatformAdmin -. "资质与申诉" .-> PersonalLabeler
  PlatformAdmin -. "共享 Provider" .-> Agent

  classDef producer fill:#eff6ff,stroke:#2563eb,color:#1e3a8a;
  classDef labeler fill:#ecfeff,stroke:#0891b2,color:#164e63;
  classDef agent fill:#f5f3ff,stroke:#7c3aed,color:#4c1d95;
  classDef reviewer fill:#fff7ed,stroke:#b45309,color:#7c2d12;
  classDef platform fill:#fdf2f8,stroke:#be185d,color:#831843;
  classDef output fill:#ecfdf5,stroke:#16a34a,color:#14532d;
  class Producer producer;
  class TeamLabeler,PersonalLabeler,Submit,Revise labeler;
  class Agent agent;
  class Reviewer reviewer;
  class PlatformAdmin platform;
  class Export output;
```

#### 数据集入库

数据集不是简单上传文件，而是把原始样本整理成可映射、可预览、可追溯的题目来源。MarkUp 会解析列名、类型和预览行，保留文本字段、媒体素材、附件与派生上下文；Owner 与 Team Admin 可以编辑列备注、选择参与映射的字段，并新增渲染变量或派生列。

图中的“数据可用”代表数据已经具备发布条件：字段结构清晰、样本预览正常、媒体与附件引用可解析，并且参与任务展示的字段已经确定。只有到任务发布阶段，这些数据源才会被绑定到模板里的 ShowItem，进而物化成一道道题目。

```mermaid
flowchart LR
  D0([新建数据集]) --> D1[上传 CSV / JSONL / Manifest]
  D1 --> D2[解析列名 / 类型 / 预览行]
  D2 --> D3[识别媒体 / 附件 / 派生上下文]
  D3 --> D4[编辑列备注 / 映射开关]
  D4 --> D5[新增渲染变量 / 派生列]
  D5 --> D6{数据可用?}
  D6 -- 否 --> D4
  D6 -- 是 --> D7[保存数据集]
  D7 --> D8[发布时配置 ShowItem 映射]
  D8 --> D9([生成题目来源])

  classDef start fill:#0f766e,stroke:#0f766e,color:#ffffff;
  classDef step fill:#ccfbf1,stroke:#14b8a6,color:#134e4a;
  classDef decision fill:#fef3c7,stroke:#f59e0b,color:#78350f;
  class D0,D9 start;
  class D1,D2,D3,D4,D5,D7,D8 step;
  class D6 decision;
```
<p align="center">
  <img alt="MarkUp Dataset" src="docs/assets/dataset.png" width="100%">
</p>

#### 模板设计

模板决定 Labeler 看到什么、如何作答、哪些答案有效，以及不同字段之间怎样联动。Designer 从物料库选择组件，拖入画布后在属性面板配置字段、校验、联动和 LLM 辅助；Renderer 负责预览与运行时渲染。

这张图保留了模板搭建时最关键的两个回路：继续添加组件时回到物料库，校验不通过时回到属性配置。模板通过校验后会发布版本快照，任务绑定的永远是这份快照，保证标注、AI 预审和人工审核回放一致。

```mermaid
flowchart LR
  M0([新建模板]) --> M1[浏览物料库]
  M1 --> M2[拖入画布]
  M2 --> M3[配置属性]
  M3 --> M4[设置校验 / 联动 / LLM]
  M4 --> M5{继续添加?}
  M5 -- 是 --> M1
  M5 -- 否 --> M6[Renderer 预览]
  M6 --> M7{校验通过?}
  M7 -- 否 --> M3
  M7 -- 是 --> M8[发布模板版本]
  M8 --> M9[保存 Schema 快照]
  M9 --> M10([关联到任务])

  classDef start fill:#5b21b6,stroke:#5b21b6,color:#ffffff;
  classDef step fill:#ede9fe,stroke:#8b5cf6,color:#4c1d95;
  classDef decision fill:#fef3c7,stroke:#f59e0b,color:#78350f;
  class M0,M10 start;
  class M1,M2,M3,M4,M6,M8,M9 step;
  class M5,M7 decision;
```
<p align="center">
  <img alt="MarkUp Designer" src="docs/assets/designer.png" width="100%">
</p>

#### 任务发布

发布环节把数据集、模板、规则、积分预算和分发方式合并成一份可执行任务。这里的核心不是“点发布按钮”，而是确认题目来源、模板版本、ShowItem 映射、分发方式、奖励规则、资质要求、AI 预审和人工复审都已经就绪。

图里的分发分支对应两类业务场景：企业任务可以指派给成员、在企业内流转，也可以开放给企业成员领取；公开任务则进入任务广场，由个人 Labeler 在满足资质和协议后领取。

```mermaid
flowchart LR
  PUB0([创建任务]) --> PUB1[选择数据集]
  PUB1 --> PUB2[绑定模板快照]
  PUB2 --> PUB3[配置规则 / 积分]
  PUB3 --> PUB4{分发方式}
  PUB4 -- 企业 --> PUB5[指派 / 流转 / 内部领取]
  PUB4 -- 公开 --> PUB6[任务广场]
  PUB5 --> PUB7([发布运行])
  PUB6 --> PUB7

  classDef start fill:#be123c,stroke:#be123c,color:#ffffff;
  classDef step fill:#ffe4e6,stroke:#fb7185,color:#881337;
  classDef decision fill:#fef3c7,stroke:#f59e0b,color:#78350f;
  class PUB0,PUB7 start;
  class PUB1,PUB2,PUB3,PUB5,PUB6 step;
  class PUB4 decision;
```
<p align="center">
  <img alt="MarkUp Publish" src="docs/assets/publish.png" width="100%">
</p>

#### 作答提交

作答环节围绕题目、模板和素材展开。Labeler 看到的是发布时固化的模板版本和题目内容，提交的是符合 schema 的 answers；ShowItem 展示原始数据，输入组件负责收集答案，两者在数据结构上保持分离。

图中的草稿、校验、提交和审核结果构成作答闭环。校验不通过时停留在当前题目继续修改，审核打回时带着打回原因回到作答端修订；如果处理结果涉及信誉扣分且存在异议，Labeler 可以进入申诉流程。

```mermaid
flowchart LR
  ANS0([进入题目]) --> ANS1[读取素材]
  ANS1 --> ANS2[Renderer 作答]
  ANS2 --> ANS3[保存草稿]
  ANS3 --> ANS4{校验通过?}
  ANS4 -- 否 --> ANS2
  ANS4 -- 是 --> ANS5[提交审核]
  ANS5 --> ANS6{审核结果}
  ANS6 -- 通过 --> ANS7([计入贡献])
  ANS6 -- 打回 --> ANS8[按原因修订]
  ANS8 --> ANS2
  ANS6 -- 异议 --> ANS9([申诉处理])

  classDef start fill:#1d4ed8,stroke:#1d4ed8,color:#ffffff;
  classDef step fill:#dbeafe,stroke:#60a5fa,color:#1e3a8a;
  classDef decision fill:#fef3c7,stroke:#f59e0b,color:#78350f;
  class ANS0,ANS7,ANS9 start;
  class ANS1,ANS2,ANS3,ANS5,ANS8 step;
  class ANS4,ANS6 decision;
```
<p align="center">
  <img alt="MarkUp Annotation" src="docs/assets/annotation.png" width="100%">
</p>

#### Agent AI预审

Agent 只处理已经提交的标注结果，按任务评测标准调用 Provider 并生成可供 Reviewer 使用的结构化预审记录。它不是最终裁决者，而是把题目内容、模板答案、审核维度和输出要求组织成稳定的模型调用上下文。

图里的失败 / 重试分支用于处理 Provider 调用异常或结构化输出不符合要求的情况。成功时，Agent 会写入评分、风险、建议和预审结论，让 Reviewer 在同一视图里看到 AI 依据与原始答案。

```mermaid
flowchart LR
  A0([接收提交]) --> A1[读取标准]
  A1 --> A2[组装上下文]
  A2 --> A3[调用 Provider]
  A3 --> A4{调用成功?}
  A4 -- 否 --> A5[失败 / 重试]
  A4 -- 是 --> A6[评分与建议]
  A5 --> A7([写入预审记录])
  A6 --> A7

  classDef start fill:#4c1d95,stroke:#4c1d95,color:#ffffff;
  classDef step fill:#ede9fe,stroke:#7c3aed,color:#4c1d95;
  classDef decision fill:#fef3c7,stroke:#f59e0b,color:#78350f;
  class A0,A7 start;
  class A1,A2,A3,A5,A6 step;
  class A4 decision;
```
<p align="center">
  <img alt="MarkUp Aiaudit" src="docs/assets/aiaudit.png" width="100%">
</p>

#### Reviewer 人工审核

Reviewer 是最终质量裁决角色，可以通过、打回，也可以直接修订答案并入库。审核视图同时展示原始题目、Labeler 答案、AI 预审记录和历史处理信息，人工结论拥有最终效力。

图中的通过会把数据推进到可导出结果，打回会要求 Reviewer 填写明确原因并通知 Labeler 修订。直接修订适合少量可人工纠正的问题，修订后的答案同样会进入审核记录，保证结果可回放。

```mermaid
flowchart LR
  R0([进入审核队列]) --> R1[查看答案 / AI / 历史]
  R1 --> R2{审核结论}
  R2 -- 通过 --> R3[通过记录]
  R2 -- 打回 --> R4[填写打回原因]
  R2 -- 修订 --> R5[修订入库]
  R3 --> R6([可导出结果])
  R5 --> R6
  R4 --> R7[通知 Labeler]
  R7 --> R8([等待修订重提])

  classDef start fill:#78350f,stroke:#78350f,color:#ffffff;
  classDef step fill:#ffedd5,stroke:#f97316,color:#7c2d12;
  classDef decision fill:#fef3c7,stroke:#f59e0b,color:#78350f;
  class R0,R6,R8 start;
  class R1,R3,R4,R5,R7 step;
  class R2 decision;
```
<p align="center">
  <img alt="MarkUp Manualaudit" src="docs/assets/manualaudit.png" width="100%">
</p>

---

## 系统架构

MarkUp 采用前后端分离的模块化架构：`apps/web` 承载多角色工作台与动态模板运行时，`apps/api` 提供统一的 `/api/v1` REST 接口，MongoDB 保存业务文档与动态 JSON，文件存储承载上传素材和导出结果，AI Provider 通过后端网关统一接入。

```mermaid
flowchart LR
  Browser["Browser"]

  subgraph Web["apps/web"]
    Workspace["多角色工作台"]
    Designer["Designer / Renderer"]
    Client["API Client"]
  end

  subgraph API["apps/api"]
    Auth["Auth / RBAC"]
    Production["生产域<br/>Datasets / Templates / Tasks"]
    Labeling["标注与质量域<br/>Labels / AI Review / Reviews"]
    Governance["治理与导出域<br/>Teams / Certs / Points / Exports"]
    AIGateway["AI Provider Gateway"]
    Audit["通知 / 审计"]
  end

  subgraph Data["数据与文件"]
    Mongo["MongoDB"]
    Files["File Storage"]
  end

  Providers["AI Providers"]

  Browser --> Workspace
  Browser --> Designer
  Workspace --> Client
  Designer --> Client
  Client --> Auth
  Auth --> Production
  Auth --> Labeling
  Auth --> Governance
  Production --> Mongo
  Labeling --> Mongo
  Governance --> Mongo
  Production --> Files
  Labeling --> Files
  Governance --> Files
  Labeling --> AIGateway
  Governance --> AIGateway
  AIGateway --> Providers
  Production --> Audit
  Labeling --> Audit
  Governance --> Audit
  Audit --> Mongo

  classDef web fill:#e0f2fe,stroke:#0284c7,color:#0c4a6e;
  classDef api fill:#eef2ff,stroke:#4f46e5,color:#312e81;
  classDef production fill:#dcfce7,stroke:#16a34a,color:#14532d;
  classDef quality fill:#ffedd5,stroke:#f97316,color:#7c2d12;
  classDef governance fill:#fce7f3,stroke:#db2777,color:#831843;
  classDef data fill:#f1f5f9,stroke:#475569,color:#0f172a;
  classDef ai fill:#ede9fe,stroke:#7c3aed,color:#4c1d95;
  classDef audit fill:#fef9c3,stroke:#ca8a04,color:#713f12;
  class Browser,Workspace,Designer,Client web;
  class Auth api;
  class Production production;
  class Labeling quality;
  class Governance governance;
  class Mongo,Files data;
  class AIGateway,Providers ai;
  class Audit audit;
```

`apps/web` 负责所有面向用户的工作台体验。Owner、Team Admin、Reviewer、Platform Admin、Labeler 共享同一套认证与权限入口；Designer 负责生产模板 schema，Renderer 负责在预览、作答和审核场景稳定渲染同一份 schema，避免模板配置、提交答案和审核回放出现语义偏差。

`apps/api` 是业务编排中心。请求先经过认证与 RBAC，再进入生产、标注质量、治理导出等领域服务；数据集导入、模板版本、任务发布、题目领取、标注提交、AI 预审、人工审核、申诉处理和结果导出都在后端形成明确状态迁移。

AI 能力统一收口在后端网关。模板助手、发布助手、字段级 LLM 辅助和 AI 预审都通过 Provider 配置、调用日志、成本统计和结构化输出处理进入业务链路，前端不直接持有或调用 Provider 凭据。

MongoDB 承载动态业务文档，文件存储承载大体积素材与导出物。模板 schema、题目 content、Labeler answers、AI 预审结果、人工审核记录和审计日志保存在 MongoDB；上传素材、认证材料、头像、标注附件和导出文件由文件存储管理，业务文档只保留受控引用。

---

## 技术栈

MarkUp 的技术选型围绕“任务生产、模板渲染、标注提交、AI 预审、人工审核、企业治理”这条数据生产链路组织。这里仅展示架构级主栈，测试库、驱动库和安全工具不作为单独卡片展开。

<table>
  <tr>
    <td width="50%" valign="top" align="center">
      <p align="center">
        <img src="https://api.iconify.design/logos/react.svg" alt="React" height="34">
        &nbsp;&nbsp;
        <img src="https://api.iconify.design/logos/typescript-icon.svg" alt="TypeScript" height="34">
        &nbsp;&nbsp;
        <img src="https://api.iconify.design/logos/vitejs.svg" alt="Vite" height="34">
      </p>
      <h3 align="center">前端应用</h3>
      <p align="center">
        <code>React</code> <code>TypeScript</code> <code>Vite</code>
      </p>
      <p>组织 Owner 生产台、Team Admin 工作台、任务广场、Labeler 作答台、Reviewer 审核台和 Platform Admin 后台。</p>
    </td>
    <td width="50%" valign="top" align="center">
      <p align="center">
        <img src="https://api.iconify.design/logos/ant-design.svg" alt="Ant Design" height="34">
        &nbsp;&nbsp;
        <img src="https://api.iconify.design/simple-icons/antdesign.svg?color=%237c3aed" alt="Ant Design X" height="34">
        &nbsp;&nbsp;
        <img src="https://api.iconify.design/simple-icons/greensock.svg?color=%2388ce02" alt="GSAP" height="34">
      </p>
      <h3 align="center">UI 与 AI 交互</h3>
      <p align="center">
        <code>Ant Design</code> <code>Ant Design X</code> <code>Ant Design Charts</code> <code>GSAP</code>
      </p>
      <p>落在任务发布表单、模板 Designer 物料面板、Renderer 作答控件、AI 助手对话、审核图表和操作按钮上。</p>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top" align="center">
      <p align="center">
        <img src="https://api.iconify.design/logos/python.svg" alt="Python" height="34">
        &nbsp;&nbsp;
        <img src="https://api.iconify.design/simple-icons/fastapi.svg?color=%23009688" alt="FastAPI" height="34">
        &nbsp;&nbsp;
        <img src="https://api.iconify.design/simple-icons/pydantic.svg?color=%23e92063" alt="Pydantic" height="34">
      </p>
      <h3 align="center">后端服务</h3>
      <p align="center">
        <code>Python</code> <code>FastAPI</code> <code>Pydantic</code>
      </p>
      <p>提供数据集导入、模板版本、任务发布、题目领取、标注提交、人工审核、申诉处理和导出任务接口。</p>
    </td>
    <td width="50%" valign="top" align="center">
      <p align="center">
        <img src="https://api.iconify.design/logos/mongodb-icon.svg" alt="MongoDB" height="34">
        &nbsp;&nbsp;
        <img src="https://api.iconify.design/simple-icons/langchain.svg?color=%231c3c3c" alt="LangChain" height="34">
        &nbsp;&nbsp;
        <img src="https://api.iconify.design/simple-icons/openai.svg?color=%23412991" alt="OpenAI" height="34">
      </p>
      <h3 align="center">数据与 AI</h3>
      <p align="center">
        <code>MongoDB</code> <code>LangChain</code> <code>ChromaDB</code> <code>Provider Gateway</code>
      </p>
      <p>保存动态 schema、多模态业务文档、AI 预审结果和 Provider 调用记录。</p>
    </td>
  </tr>
</table>

## 仓库结构

```text
MarkUp/
├── apps/
│   ├── web/                         # React + TypeScript 前端应用
│   │   ├── src/app                  # 应用入口、路由、权限分流、工作台导航
│   │   ├── src/pages                # 公共页面、任务广场、各角色工作台、平台后台
│   │   ├── src/features             # 面向具体业务域的前端功能模块
│   │   ├── src/components           # 通用布局、表单、状态展示和基础组件
│   │   ├── src/services             # API client 与工作台服务适配
│   │   ├── src/stores               # 前端局部状态与工作台状态
│   │   ├── src/types                # API、模板 schema、任务与审核类型
│   │   ├── src/utils                # 通用工具函数
│   │   ├── public                   # 前端静态资源
│   │   └── package.json             # 前端依赖与 npm scripts
│   └── api/                         # FastAPI 后端应用
│       ├── app/main.py              # FastAPI 应用入口
│       ├── app/api/v1               # /api/v1 REST 路由
│       ├── app/core                 # 配置、数据库、安全与基础设施能力
│       ├── app/domains              # RBAC、角色权限与领域规则
│       ├── app/middleware           # 请求处理中间件
│       ├── app/models               # MongoDB 文档模型
│       ├── app/schemas              # Pydantic 请求 / 响应契约
│       ├── app/services             # 任务、模板、标注、审核、AI、导出等业务服务
│       ├── scripts                  # 开发脚本与初始化辅助
│       ├── tests                    # 后端回归测试
│       └── requirements.txt         # 后端 Python 依赖
├── docs/                            # 架构、API、设计、运营、产品和工作流文档
│   ├── api                          # API 文档
│   ├── assets                       # 演示素材
│   ├── design                       # 设计材料与界面说明
│   └── workflow                     # 标注、审核、导出等流程文档
└── README.md                        # 对外展示入口
```

`apps/web` 面向用户界面，负责把 Owner、Team Admin、Reviewer、Platform Admin、Labeler 的工作台组织成可操作页面；模板 Designer、Renderer、任务发布、作答、审核和后台治理都通过这里进入。

`apps/api` 面向业务状态，负责认证、RBAC、数据集、模板、任务、题目、提交、AI 预审、人工审核、申诉、导出、资源治理和审计记录等核心链路。

`docs` 面向项目说明与交付材料，保留架构、API、产品、设计、运营、流程和示例数据。

---

## 启动与部署

本地运行 MarkUp 需要同时启动 MongoDB、FastAPI 后端和 Vite 前端。后端读取 `apps/api/.env.example`，提供健康检查与 `/api/v1` 业务接口；前端读取 `apps/web/.env.example`，通过 Vite 代理把工作台请求转发到后端。部署环境变量与本地启动保持同一套命名，完整部署说明见 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)。

运行前确认本机已具备 Node.js、npm、Python 环境和 MongoDB。MongoDB 默认连接地址为 `mongodb://localhost:27017`，后端 Python 依赖见 `apps/api/requirements.txt`。

**启动后端**

```powershell
cd apps/api
Copy-Item .env.example .env
conda run -n markup-api python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

后端启动后，健康检查位于 `http://127.0.0.1:8000/health`，API 前缀为 `http://127.0.0.1:8000/api/v1`。常用环境变量如下：

```text
MONGODB_URL=mongodb://localhost:27017
MONGODB_DATABASE=markup
API_V1_PREFIX=/api/v1
FRONTEND_OAUTH_CALLBACK_URL=http://localhost:5173/oauth/callback
SMTP_ENABLED=false
```

**启动前端**

```powershell
cd apps/web
Copy-Item .env.example .env
npm install
npm run dev
```

前端启动后访问 `http://localhost:5173/`。本地开发默认通过以下配置把 `/api/v1` 转发到后端：

```text
VITE_API_BASE_URL=/api/v1
VITE_API_PROXY_TARGET=http://127.0.0.1:8000
```

---

## 关键设计取舍

<p align="center">
  <strong>MarkUp 在效率、自由度、开放性和可信交付之间，选择了可治理的数据生产。</strong>
  <br>
  <span>下面这些取舍决定了平台为什么不是一组标注页面，而是一条可运行、可审核、可追溯的数据生产链路。</span>
</p>

<table>
  <tr>
    <td width="33%" valign="top">
      <p align="center">
        <img src="https://api.iconify.design/hugeicons/workflow-square-02.svg?color=%232563eb" alt="Schema 契约图标" width="54">
      </p>
      <h3 align="center">模板自由度 vs 数据可治理</h3>
      <p><strong>选择：</strong>用 schema 约束 Designer、Renderer、answers 和导出。</p>
      <p><strong>代价：</strong>模板建模更严格。<br><strong>换来：</strong>复杂任务可复用，审核回放稳定。</p>
    </td>
    <td width="33%" valign="top">
      <p align="center">
        <img src="https://api.iconify.design/hugeicons/git-branch.svg?color=%237c3aed" alt="模板版本图标" width="54">
      </p>
      <h3 align="center">快速热改 vs 历史一致</h3>
      <p><strong>选择：</strong>任务绑定发布瞬间的 TemplateVersion 快照。</p>
      <p><strong>代价：</strong>已发布任务不随草稿漂移。<br><strong>换来：</strong>题目、答案、AI 预审和人工审核按同一版本追溯。</p>
    </td>
    <td width="33%" valign="top">
      <p align="center">
        <img src="https://api.iconify.design/hugeicons/ai-brain-04.svg?color=%23db2777" alt="AI 质检图标" width="54">
      </p>
      <h3 align="center">AI 效率 vs 结果可信</h3>
      <p><strong>选择：</strong>AI 进入模板、作答辅助和预审，但不替代 Reviewer。</p>
      <p><strong>代价：</strong>不追求全自动闭环。<br><strong>换来：</strong>模型建议可解释，质量责任可复核。</p>
    </td>
  </tr>
  <tr>
    <td width="33%" valign="top">
      <p align="center">
        <img src="https://api.iconify.design/hugeicons/shield-key.svg?color=%230f766e" alt="权限边界图标" width="54">
      </p>
      <h3 align="center">开放市场 vs 企业边界</h3>
      <p><strong>选择：</strong>个人 Labeler、企业成员、任务广场和企业任务分层流转。</p>
      <p><strong>代价：</strong>权限判断更细。<br><strong>换来：</strong>公开劳动力与企业协作可以共存。</p>
    </td>
    <td width="33%" valign="top">
      <p align="center">
        <img src="https://api.iconify.design/hugeicons/database-sync-01.svg?color=%23f97316" alt="多模态数据图标" width="54">
      </p>
      <h3 align="center">多模态表达 vs 结果纯净</h3>
      <p><strong>选择：</strong>题目 content、素材引用和 Labeler answers 分开保存。</p>
      <p><strong>代价：</strong>数据结构更清晰也更复杂。<br><strong>换来：</strong>文本、图片、音视频、文件和 JSON 都能稳定审核与导出。</p>
    </td>
    <td width="33%" valign="top">
      <p align="center">
        <img src="https://api.iconify.design/hugeicons/audit-02.svg?color=%23ca8a04" alt="审计追溯图标" width="54">
      </p>
      <h3 align="center">快速流转 vs 全链路追溯</h3>
      <p><strong>选择：</strong>积分、Provider、导出、认证、申诉和状态变化都进入记录。</p>
      <p><strong>代价：</strong>状态与审计成本更高。<br><strong>换来：</strong>发布、领取、预审、审核、打回、申诉和导出都有证据链。</p>
    </td>
  </tr>
</table>

---

## 项目时间线

<p align="center">
  <strong>时间线对应 MarkUp 从平台底座到完整数据生产闭环的落地过程。</strong>
  <br>
  <span>项目能力按“身份与组织、数据与模板、任务与协作、AI 质检与交付”逐步收束，最终形成可演示、可运行、可追溯的完整平台。</span>
</p>

<p align="center">
  <img alt="MarkUp 项目时间线" src="docs/assets/timeline.jpg" width="94%">
</p>

<table>
  <tr>
    <td width="25%" valign="top" align="center">
      <img src="https://api.iconify.design/hugeicons/user-group.svg?color=%232563eb" alt="身份组织图标" width="42">
      <h3 align="center">身份与组织</h3>
      <p align="center">认证、RBAC、团队成员、平台后台与企业治理底座。</p>
    </td>
    <td width="25%" valign="top" align="center">
      <img src="https://api.iconify.design/hugeicons/database-02.svg?color=%230f766e" alt="数据模板图标" width="42">
      <h3 align="center">数据与模板</h3>
      <p align="center">数据集入库、字段映射、Designer、Renderer 与模板版本快照。</p>
    </td>
    <td width="25%" valign="top" align="center">
      <img src="https://api.iconify.design/hugeicons/task-01.svg?color=%23f97316" alt="任务协作图标" width="42">
      <h3 align="center">任务与协作</h3>
      <p align="center">任务发布、任务广场、指派领取、标注工作台与打回修订。</p>
    </td>
    <td width="25%" valign="top" align="center">
      <img src="https://api.iconify.design/hugeicons/ai-brain-04.svg?color=%237c3aed" alt="AI 交付图标" width="42">
      <h3 align="center">AI 质检与交付</h3>
      <p align="center">LLM 辅助、AI 预审、人工审核、申诉、导出与审计追溯。</p>
    </td>
  </tr>
</table>

---

<p align="center">
  <img src="apps/web/public/color_logo.svg" alt="MarkUp" width="180">
</p>

<p align="center">
  <sub>MarkUp马克派 · AI 开启数据标注新时代</sub>
</p>
