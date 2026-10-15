# CHANGELOG

本文档记录 AI Study Companion 项目所有 Sprint 的变更历史。

---

## R3.4 — 受控真实质量/成本对照与集成回归（2026-10-15）

- 离线扩充到 80/80，九类入口各至少 5 正常、1 边界；R3.1–R3.3 快照保留，旧 67 例与运行时指纹不变。
- 经用户批准 ¥5 上限，九类各 5 个合成工作流×两版×3 次，完成 270 次尝试；所有试跑/中断/续跑共 443 次尝试按保守口径计入约 ¥1.816，未超预算。官方 DeepSeek、固定非思考/输出上限对照，不修改日常配置或使用私人聊天。
- 新增独占逐条报告、断点续跑、源码版本/参数隔离、并发预算预留、用量/缓存/费用/耗时统计与分离盲评表。原始回答在本地忽略目录，汇总/指纹与质量限制入库，无新依赖/迁移或收费裁判模型。
- 新版整体结构化合同 101/105（96.19%），但书籍、反思、解题仍有分模块失败，学习反馈和游戏节奏有语义待验；不填假分数、不宣称 R3 全面质量通过，也不放宽校验掩盖问题。
- 最终全量 474/474、Core 25/25、部署版 Edge E2E 33/33、TypeScript/ESLint、Next.js 生产构建通过。新增任务→生成→用量→Run/Inbox 集成覆盖附加反思成本、关闭路径、失败费用与提醒零调用。
- 命令见 `PROMPT_QUALITY_AND_COST.md`，数据与发现见 `reports/R3_4_REPORT.md`、`reports/R3_4_RESULTS.json`。运行时代码未变，无需更新 Docker/APK；下一步先完成 R3.4 问题修正与语义验收收尾，再推进 R4.1。

## R3.3 — 任务、学习与独立游戏实际提示词优化（2026-10-15）

- 七种任务按业务选择稳定 System 前缀，修正前台学习误套定时任务指令；新闻/书籍标题与原校验器精确对齐，章节说明不再写入标题行。
- 实际优化新闻证据/日期、书目与投入、开放式思考问题、语义复述评分、四种解题策略/图片/工具证据、独立复习卡及三种游戏节奏、玩家控制与未决检定/状态一致性。
- 八类模板版本随 Provider 调用存入既有用量 JSONB 的可选元数据，旧记录兼容，不存正文/Key、不向模型 API 添加非标准参数；无新依赖、数据库迁移或额外模型调用。
- 原 R3.1/R3.2 基线保留，新增八类各两个质量探针，当前离线 67/67；旧样例定义不变、20 个任务/游戏请求变化，聊天不变。全量 455/455、Core 25/25、TypeScript/ESLint、Docker 构建与部署版 Edge E2E 33/33 通过。
- Docker Web/Worker 已更新，数据库与搜索保留；仅涉及服务端模板，已有 APK 不需重装。真实模型/手机真机未在本轮实测。
- 规范与成本取舍见 `TASK_PROMPT_GUIDE.md`，完整验证/部署见 `reports/R3_3_REPORT.md`。真实模型质量与费用保持未测；严格拼写、抽背/抽卡、RAG/摘要仍在后续 R4/R5。下一步 R3.4。

## R3.2 — 对话模式与主动问候实际优化（2026-10-15）

- 实际改写自动/专业/陪伴/反思指令，强调先完成请求、必要澄清、事实可核验、倾诉时不急给计划、反思少问且具体。共享 Persona 尊重本次格式/篇幅与不提问要求，不假装额外记忆。
- 主动问候继续使用确定性模板，仅调整正文；触发原因独立保留，关闭/暂停/静默/冷却/配额/未读/原因白名单与去重不变，不增加收费生成调用。
- Composer/Mode/Persona 版本升级并扩展导出兼容，旧 Envelope 不重写；独立游戏、学习、定时内容等模板留给 R3.3。
- 保留 R3.1 原始基线，新增独立 R3.2 快照及四种模式各 5 个场景：51/51 离线样例通过；原 31 样例定义不变，仅 8 个聊天请求变化。规则文本增加，不宣称节省 Token 或真实质量已提升。
- 最终全量 446/446、Core 25/25、部署版 Edge E2E 33/33、TypeScript/ESLint、Docker 生产构建与本地 Bundle/Debug APK/移动冒烟通过。高并发浏览器与 PGlite 同跑出现超时后，分开以 4 个浏览器并发全量重跑通过，未放宽断言或超时。
- Docker Web/Worker 已更新，数据库/搜索保留；新工作树 CRLF 引发迁移保护拒绝启动，逐一验证 56 份 SQL 与原文件规范字节一致后恢复 LF，新增 Git 换行约束与回归测试，未改 SQL 内容或数据库校验记录。
- 实现规范与成本变化见 `MODE_PROMPT_GUIDE.md`，交付/产物及保留验收见 `reports/R3_2_REPORT.md`。现有依赖审计告警未在本轮升级修复；下一步 R3.3。

## R3.1 — 提示词调用清单与质量基线（2026-10-15）

- 核对九类生成入口、三处 Provider.stream 和全部 16 类产品/辅助模块，区分真实调用、共用包装、非生成服务与未实现能力。
- 新增离线 `eval:prompts`：31 个合成样例经现有业务拼装/验证，保存 17 个源文件和样例/请求 SHA-256；新增调用文件需同步清单，漂移要求显式审查，不自动覆盖基线。
- 提供人工质量评分表、7 维度 0–4 分与后续对照口径；真实答案质量、Token/费用/延迟保持未测量，未读取真实 Key、调用真实模型或添加第二模型裁判。
- 记录共用定时任务 System Prompt、标题说明/验证器偏差、主动问候为规则模板、任务模板缺版本、逐字/拼写未实现与摘要待办等 6 项现状/风险，未在本轮改写运行时 Prompt。
- 全量单元/集成测试 437/437、Core 固定回归 25/25、提示词离线样例 31/31、TypeScript 与 ESLint 通过。新工作树按既有 lockfile 安装依赖并生成 Next 路由类型，未新增/升级包。
- 仅新增开发评测、命令和文档，不改 UI/API/数据库执行逻辑，无需更新 Docker/APK。使用与交付见 `PROMPT_INVENTORY_AND_BASELINE.md`、`reports/R3_1_REPORT.md`；下一步 R3.2。

## 2026-10-15 — 新增 R3/R4/R5 能力增强规划

- 新增 `CAPABILITY_ENHANCEMENT_PLAN.md`：R3 全模块提示词、R4 全模块工具与 R5 分域记忆，共 15 个待开发 Sprint；包含设计目的、技术规范、执行顺序和验收口径。
- 工具矩阵覆盖所有产品/辅助模块，不仅骰子与背书范例；区分既有能力复用/增强和新增抽卡、抽背、拼写、数据管理等候选，避免为每个页面强加模型调用。
- 记忆规划分开确认事实、知识资料、模块状态与派生索引/摘要；涵盖中文/渐进向量 RAG、分支失效、用户控制、模块特化及兼顾 AI 记忆导航/学习助记的记忆宫殿。R5.4 与 R1.3 共用摘要交付，不重复建设。
- 查阅官方上下文工程资料、ts-fsrs 与 pgvector 仓库，作为参考/候选而非已安装或已选定依赖；复制/引入前另核查许可证、固定版本和兼容性。
- 同步主线、总路线图和 R1/R2 衔接文档，所有新任务均标待开发，保留既有费用/真机/视觉与发布前验收。
- 本轮只修改规划文档；检查 Markdown 引用、Sprint/模块覆盖、编码及补丁格式，不运行应用测试、重建 Docker/APK 或调用收费模型。

## R2 — 全模式 UI 与导航优化（2026-10-02）

- 18 个主要页面共用 AppShell：桌面分组侧栏、手机单图标抽屉；聊天历史独立，新增学习入口，Web/APK 共用路由和组件。
- 专业/陪伴/反思入口先确认模式意图，不因导航生成回答或创建任务/游戏。表单与活动接入离开确认，聊天草稿按会话在内存中隔离。
- 统一页面颜色、间距、卡片、表单与焦点样式；聊天支持多行/输入法保护，长公式和代码内部滚动，来源按需展开，游戏剧情优先展示。
- 导航、历史、时间滚轮与 Prompt 导出共用原生 dialog；加入焦点循环、关闭/恢复与 Android 返回处理。移动连接提示不再遮挡输入区。
- 430/430 单元/集成测试、Core 25/25、Docker 部署版本 Edge E2E 32/32、最终相关复测 20/20、TypeScript、ESLint、Web/本地 React Bundle/Debug APK 构建与本地 Bundle 冒烟通过。
- Docker Web 已更新，PostgreSQL/搜索/Worker 保持运行；无数据库迁移、新 npm 依赖或收费模型调用。改前/改后 12 张 Mock 截图、规范与验收见 `UI_NAVIGATION_GUIDE.md`、`reports/R2_UI_REPORT.md`。
- 交付的是实现与自动验证；华为真机/软键盘/通知点击和视觉偏好仍待验收。R1 收益/摘要与现有 Next.js 严重依赖告警没有在本轮解决。

## R1.3 首轮 — 生成预算与成本验收基础（2026-10-01）

- 按业务设置输出上限，明确详解请求可提高预算；仅对已验证官方端点自动启用参数，兼容 Provider 可显式配置或关闭。
- 增加调用前文本字符护栏，不静默裁剪历史；截断/中途断流明确失败，不自动重复收费请求。记录请求字符数与预算，缺失用量不补零。
- 检索去除完全重复证据；保留发布日期及粗粒度检索日，完整抓取时间仍在引用元数据。新增七个无网络结构样例，不冒充真实 Token/计费基线。
- 全量 427/427、受影响复测 28/28、Core 25/25、生产 Edge E2E 26/26、TypeScript、ESLint、迁移检查和生产构建通过；Docker 与 Debug APK 已更新。
- R1 仅首轮交付，真实费用/质量对照及长聊天摘要净收益仍待验收，不宣称固定节省比例。保留现有 Next.js 生产依赖严重审计告警，发布前处理，不在本次自动升级。
- 交付与后续见 `reports/R1_FIRST_ROUND_REPORT.md`、`TOKEN_COST_GUIDE.md`。

## R1.2 — 缓存友好的 Prompt 前缀（2026-10-01）

- 游戏把动态状态/可信工具结果置于当前输入前，保留世界规则和分支历史的共同前缀；新闻、书籍、反思固定规则前置，日期/主题/材料后置。
- 结构化上下文稳定 JSON 序列化；检索抓取时间仍保留在引用元数据，不重复发给模型，发布日期不删除。
- Prompt Composer 升级为 `r1/cache-friendly-v1`；导出同时兼容旧 Composer，不改变模式优先级、分支隔离和真实记忆边界。
- 自检：相关 42/42 测试、TypeScript、ESLint 与 Core 25/25 回归通过。Provider 实际缓存收益待真实统计，不发送收费预热请求。R1.3 继续实施。

## R1.1 — 模型用量与成本观测（2026-10-01）

- 各实际模型入口接入共用 measured Provider，解析流式/JSON usage 与缓存 Token，记录失败、取消、DNS 请求尝试和延迟，不保存 Prompt/Key/回答。
- 新增 0027 用量元数据表与回滚；最近七天 API 和 Web/APK 共用配置页提供统计，缺失字段不当作零。
- 费用按带来源/日期的服务端价格配置计算并逐次快照，默认价格未知；实际缓存统计按 Token 加权并显示覆盖率。
- 新增 `TOKEN_COST_GUIDE.md`。相关 45/45 测试、TypeScript、Drizzle 元数据检查及新模块 ESLint 通过；真实收费基线尚未执行，不宣称节省比例。R1.2/R1.3 继续实施。

## 2026-09-30 — 收尾规划：Token 成本与全模式 UI 优化

- 根据用户需求加入待开发 R1：用量/费用基线、稳定 Prompt 前缀与 Provider 缓存兼容、分支上下文/摘要/检索/输出预算及缓存失效。
- 加入待开发 R2：统一专业/陪伴/反思/学习/娱乐切换入口、各功能页面视觉与交互、Web/APK 跨端验收。
- 新增 `EXPERIENCE_AND_COST_OPTIMIZATION_PLAN.md`，同步产品主线和总路线图；顺序为 R1 → R2 → 移动/语音验收 → Phase 5.6 → Phase 8。
- 当前仅修改规划文档，不代表优化已实现；不改业务、数据库或运行环境，不调用收费模型。验收区分实际用量与估算、Provider 缓存与应用缓存、浏览器模拟与真机结果。
- 自检与审查：六项子任务、路线图引用和编码检查通过，`git diff --check` 通过；纯文档变更未重复运行应用构建、Docker 或 APK 测试。

## Phase 6.5 — 娱乐 Activity 与首个轻量冒险规则包

**Commit**: `same delivery commit`

### 变更内容

- 新增第一方 `entertainment.quick-adventure`：两个世界模板、三个属性、10 点生命、d20 规则、角色/氛围/内容边界配置。
- 新增严格规则包描述符和统一草稿 Registry，校验插件版本、Activity 归属和宿主工具/状态契约；Prompt Layer 编译成世界规则，角色配置编译成原有角色卡。
- 复用冻结 Plugin API 1.0.0 的隔离存储，经 Capability Gateway 保存规则包配置并生成严格游戏草稿；预览不调用模型、不创建 GameSession，无新增能力或数据库迁移。
- 宿主确认组件在用户再次点击后调用现有 GameSession API，防止重复点击创建；修改配置会撤下旧预览。进入游戏时按明确 Session ID 选择会话，而非依赖列表首项。
- Web/APK 共用 `/entertainment/quick-adventure`；娱乐页与活动插件页从 Activity Registry 显示入口，配置支持跨端保存和版本冲突提示。
- 新增 `GAME_RULE_PACKS.md`、ADR-063、真实 SQL/Gateway/回合集成与移动视口 E2E；更新主线与路线图，Phase 6.1–6.5 功能交付齐备。

### 自检与交付

- 全部 406 项单元/集成测试通过；受影响模块复测 8/8；生产服务 Edge E2E 24/24；Core 回归 25/25。
- ESLint、Drizzle 元数据检查、TypeScript 和 Next.js 生产构建均通过。
- Docker Web/Worker 更新成功，Web/PostgreSQL 健康；本机规则包页 200、默认停用请求为预期 403。
- Debug APK 构建及本地 Bundle/无 `server.url`/API Origin 检查通过；产物哈希和真机清单见 `reports/PHASE_6_5_REPORT.md`。

### 当前边界

- 游戏仍由用户显式发起骰子/检定；规则包只引用既有工具和状态契约，不注册任意工具代码、额外状态或第三方动态包。
- 禁用规则包保留已创建的游戏；规则 ID/版本在草稿来源和世界规则中保留，当前不提供专用来源列或规则包升级迁移。
- 模型质量、华为通知与真机结果不由确定性测试代替；移动发布与 Phase 5.6 发布前安全封版继续按主线安排。

## Phase 6.4 — 角色、场景、物品、规则检定与检查点闭环

**Commit**: `same delivery commit`

### 变更内容

- 角色卡新增最多 20 个整数数值属性与生命上限；每条分支快照独立保存当前生命、属性与状态效果，静态角色卡更新不会反向改写历史剧情。
- 状态模型新增场景事实、出口、运行时角色和结构化物品；新物品必须同时提供定义，物品持有者必须是当前分支角色，所有补丁继续由服务端严格校验。
- 新增服务端规则检定：从分支状态读取角色属性作为修正值，调用可复现 Dice Tool，并把难度、差值和成功等级保存为不可变 `rule_check` 事件；模型只能引用可信结果。
- 新增命名剧情检查点及创建、恢复、删除 API。恢复只切换活动叶子，后续回合保留为历史分支，不执行破坏性回滚。
- `/entertainment` Web/APK 共用页面新增属性/生命编辑、规则检定配置、可信检定结果、完整分支状态与检查点管理。
- Phase 6.3 旧快照在 Repository 读取边界升级，不重写历史行；JSON 导出升级为 schema v3，并在 JSON/Markdown 中加入检查点与规则检定。
- 新增可回滚迁移 `0026_game_tabletop_loop`、ADR-062，以及规则检定、旧状态升级、检查点语义、API、导出和迁移测试。

### 当前边界

- 当前检定由用户显式选择角色、属性、骰子和难度；尚未让模型或规则包自主请求工具。
- 本阶段提供规则无关的最小跑团内核，不内置 D&D、COC 等特定系统；完整规则包与专用娱乐 Activity 留给 Phase 6.5。
- 模型回合仍在完整响应并校验后原子显示/保存，不提供逐 Token 工具过程。

### 下一步

- Phase 6.5：通过 Plugin API v1 接入娱乐 Activity / 规则包，不修改 GameSession 核心循环。

## Phase 6.3 — 可信骰子与结构化状态补丁

**Commit**: `same delivery commit`

### 变更内容

- 新增确定性 Dice Tool `fnv1a-mulberry32-v1`；每次骰子请求限制数量、面数、修正值与用途，并保存 seed、逐骰结果、总和和算法版本，可离线复算。
- 新增严格的回合输出契约：模型只能返回 `narrative` 与 `statePatch`；未知属性、伪造工具调用、非法键和值域均被拒绝。
- 每个回合保存状态补丁和应用后的完整快照；从历史节点分支时继承该节点快照，不会串入其他剧情线的场景、资源或物品。
- 新增不可变 `game_events` 骰子事件；回合、状态快照、骰子事件与活动叶子在同一数据库事务中写入，失败不产生半回合。
- `/entertainment` Web/APK 共用页面新增可选骰子面板、可信结果/复现信息和所选分支状态预览。
- JSON 导出升级为 schema v2；Markdown 导出新增骰子 seed/算法、状态补丁与回合后快照。
- 新增可回滚迁移 `0025_game_dice_state`、ADR-061，以及确定性、非法补丁、原子持久化、导出和迁移测试。

### 当前边界

- Phase 6.3 提供通用、受限的场景/目标/标记/资源/物品计数状态，但不等同于完整人物属性、规则检定或道具定义系统。
- 骰子由用户在回合前显式选择；让模型按规则自动请求骰子、角色/场景/物品闭环与检查点恢复属于 Phase 6.4。

### 下一步

- Phase 6.4：建立角色属性、场景、物品、检定和检查点恢复闭环，并复用本阶段可信事件与分支快照。

## Phase 6.2 — 可分支角色扮演 MVP

**Commit**: `same delivery commit`

### 变更内容

- 新增独立 `game_turns` 与 `game_sessions.active_leaf_turn_id`；玩家输入、AI 叙事、模型和父回合形成可追溯剧情树。
- 新增服务端娱乐 Prompt 装配与模型生成器，只读取所选父节点的祖先路径，并注入世界规则、角色控制语义与内容边界。
- 新增开始、暂停、继续和回合 API；模型成功后在事务中复核状态与 Session 版本，再原子写入回合并切换活动叶子。
- `/entertainment` Web/APK 共用页面新增回合树、当前剧情线标记、任意节点/故事开头分支、Markdown/公式渲染和生成等待状态。
- 新增包含全部分支的 JSON/Markdown 导出，Web 下载与 APK Filesystem + Share 复用既有跨端 Adapter。
- 新增可回滚迁移 `0024_game_roleplay_turns`、ADR-060，以及 Repository、Prompt 路径、API、导出、迁移和移动端 E2E 测试。

### 当前边界

- Phase 6.2 不包含骰子、结构化场景/物品状态、检定和检查点；这些能力不以自由文本伪装实现。
- 回合在模型完整返回后原子保存，当前不逐 Token 展示；模型失败不会留下持久半回合。

### 下一步

- Phase 6.3：实现可复现 Dice Tool 与受 Schema 校验的状态补丁。

## Phase 6.1 — GameSession、角色卡与世界设定

**Commit**: `same delivery commit`

### 变更内容

- 新增独立 `game_sessions` 与 `game_characters`，只关联本地用户和游戏会话，不引用普通 Conversation、Message、MemoryCandidate 或 Memory。
- 世界设定保存名称、前提、叙事语调、规则和内容边界；角色卡保存控制者、简介、性格、目标和专属边界。
- 新增严格 GameSession 请求契约、Repository 与 `/api/v1/game-sessions` CRUD；Session 和 Character 分别使用版本锁，角色变更同步推进 Session 版本。
- 新增 Web/APK 共用 `/entertainment` 页面，可创建角色扮演、AI 跑团或互动故事设定，并管理角色卡。
- MemoryCandidate 服务端提取会忽略普通聊天中的 `entertainment` 模式消息，避免虚构身份或设定进入长期记忆候选。
- 新增可回滚迁移 `0023_game_session_foundation`、ADR-059，以及 API、Repository、隔离性、迁移、移动端结构和 E2E 测试。

### 当前边界

- 本阶段只建立设定与持久化边界，不调用模型、不生成剧情、不掷骰，也不提供分支、检查点或导出。
- 普通聊天中的 `entertainment` 模式仍只是交互协议，不会自动成为 GameSession；用户需要从娱乐页面显式创建。

### 下一步

- Phase 6.2：实现角色扮演回合、暂停/继续、树形分支和记录导出，并继续保持 GameSession 与普通记忆隔离。

## Phase 7.5 — Plugin API v1 冻结

**Commit**: `same delivery commit`

### 变更内容

- 宿主 Plugin API 从实验版 `0.1.0` 冻结为 `1.0.0`；背书与解题插件统一升级为 `1.0.0` 并要求一次更新/授权复核。
- 新增代码级 v1 契约，统一执行上下文、隔离存储请求/返回、模型信封、任务草稿、学习卡内容与来源草稿 Schema，移除两个活动重复定义。
- `model.generate` 改为 `{ operation, input }` 注册操作分发。操作绑定唯一插件，未知、重复、跨插件借用或无效输入均失败；新增第一方操作不再修改中央条件分支。
- `task.create-draft` 改为稳定的 review intent + Activity ID，Adapter 校验 Activity 归属并继续只返回待用户确认的草稿。
- 新增预编译 Activity Registry；插件页从 Manifest Contribution 解析入口，不再按插件 ID 写死背书/解题按钮。
- 冻结带来源的中立学习卡草稿格式；解题卡片已经使用该 Schema，但插件私有存储继续隔离，不伪装成共享卡片数据库。
- 新增 ADR-058、`PLUGIN_API_V1.md` 与契约/归属/重复操作/兼容性测试。

### 当前边界

- v1 是第一方 API，不是第三方代码或 UI 沙箱；市场、远程包、签名分发和动态原生扩展仍未开放。
- 中立学习卡只解决格式与来源；真正跨 Activity 导入仍需未来宿主确认流程。
- 插件升级不会删除原有数据，但用户需要在 `/plugins` 审核更新并重新确认能力。

### 下一步

- Phase 6.1：建立独立 GameSession 与普通对话/正式记忆的隔离，再实现角色扮演和 AI 跑团。

## Phase 7.4 — 解题插件 MVP

**Commit**: `same delivery commit`

### 变更内容

- 新增 `/study/problem-solving` Web/APK 共享活动，支持文字题与 JPEG/PNG/WebP 图片题；客户端先缩放压缩，服务端不持久化图片正文。
- 新增四种显式策略：先给提示、逐步引导、检查答案和完整讲解。Gateway 只接受结构化枚举，题目内容不能切换策略或调用任意 Prompt。
- 受控模型 Adapter 新增 `problem-solving.respond` 与 `problem-solving.review-card` 输入；返回严格校验的学科、题意摘要、反馈、判分、错因标签、下一步问题和复习卡。
- 新增无 `eval` 的基础四则运算解析器；工具结果与模型结果分开展示，无法适用时明确标记未独立验证。
- 解题记录、错因和复习卡通过插件隔离存储持久化；图片仅保存名称、MIME 和大小，支持带版本锁的两步确认删除。
- 用户可把任意一轮错因生成复习卡，再请求三天后的任务草稿；只有再次确认才调用核心 Task API。
- 解题插件升级为 `0.2.0`，旧安装和能力授权需要重新审核；插件页新增“审核并更新”流程。
- 新增 ADR-057、算术/多模态 Adapter/服务测试与移动端完整旅程 E2E。

### 当前边界

- 确定性工具当前仅验证基础四则运算；代数、几何、物理、化学、编程和主观题仍需用户自行复核模型结论。
- 图片不进入长期存储。首次图片分析失败或离开页面前尚未得到题意摘要时，需要重新选择图片。
- 复习卡当前保存在解题插件内，尚未冻结跨插件学习卡 API。

### 下一步

- Phase 7.5：用背书与解题两个活动复盘并冻结最小 Plugin API v1，重点处理重复 Adapter Schema、跨插件学习卡和 UI 隔离边界。

## Phase 7.3 — 背书插件 MVP

**Commit**: `same delivery commit`

### 变更内容

- 新增 `/study/memorization` Web/APK 共享活动：可粘贴材料、自动拆分知识单元，并在保存前人工校对提示与目标原文。
- 新增复述训练闭环：隐藏目标原文、提交复述、确定性评分、可选模型语义反馈、薄弱点记录、原文对照和循环切换单元。
- 新增确定性间隔规则与每单元学习记录；正文、单元和最近 40 次评价均通过 `storage.read-write` 保存在插件隔离空间，列表由隔离键前缀读取，避免跨记录索引不一致。
- 材料删除使用两步确认与存储版本锁，同时删除对应学习记录，避免达到材料上限后无法整理。
- 接入受控 `model.generate` Adapter。输入只接受 `memorization.evaluate` 结构，模型凭据不交给插件；模型未配置、未授权或不可用时自动退回本地评分。
- 接入 `task.create-draft` Adapter。插件只能得到一次性复习提醒草稿，必须由用户再次点击，才会调用核心 Task API 创建任务。
- `/plugins` 将背书训练标记为可用并提供活动入口；Capacitor 本地客户端同步增加 `/study/memorization` 路由。
- 新增 ADR-056、领域/Adapter/服务测试与移动端完整旅程 E2E。

### 当前边界

- 自动拆分为确定性段落/句子切分，AI 只参与复述语义评价；用户保存前拥有最终知识单元决定权。
- 当前间隔算法是透明的固定分段，不是完整 SM-2/FSRS；学习记录仅保留最近 40 次评价元数据，不保存每次复述全文。
- 第三方包、动态 UI、任意 Prompt/网络能力仍未开放，Plugin API 继续保持实验状态。

### 下一步

- Phase 7.4：让解题插件复用同一 Gateway，完成提示、引导、检查、讲解、错因与复习请求闭环。

## Phase 7.2 — Capability Gateway、隔离存储、配额与审计

**Commit**: `same delivery commit`

### 变更内容

- 新增固定 Capability Catalog：`model.generate`、`storage.read-write`、`task.create-draft` 具有可读说明、风险类型与 UTC 每日配额；Manifest 只能申请宿主认识的能力。
- 新增逐项授权与版本复核。声明、启用、授权相互独立；插件未启用、版本变化、能力未声明/未授权或额度耗尽时均由 Gateway 稳定拒绝。
- 新增结构化 Capability Gateway 与 Adapter Registry；前台调用必须来自用户动作，后台调用必须携带 Run ID。没有向浏览器开放通用执行端点，也不把数据库连接或模型 Key 交给插件。
- 新增 `storage.read-write` 宿主 Adapter 和按用户/插件隔离的 JSON 存储；单值 64 KiB、每插件 250 项/1 MiB，并使用乐观锁防止静默覆盖。
- 新增按用户、插件、能力和 UTC 日原子计数的配额，以及不含 Prompt、学习正文、存储值、模型响应或凭据的调用审计。
- `/plugins` Web/APK 共享页面现在可逐项授权/撤销、查看当日用量和最近审计；禁用插件后授权立即失效，已禁用状态仍可撤销授权。
- 新增可回滚迁移 `0022_plugin_capability_gateway`、ADR-055，以及迁移、Repository、Gateway、API、隔离和移动端 E2E 测试。

### 当前边界

- 本阶段交付时只有隔离存储 Adapter 可执行；模型生成与任务草稿的受控 Adapter 已在后续 7.3 接入。
- 第一方插件仍与宿主同进程，不应把当前边界描述为第三方代码沙箱。第三方包、市场、签名、UI 隔离和动态原生能力仍未开放。
- 禁用插件不删除数据或授权记录，但 Gateway 会立即拒绝；重新启用同版本可恢复既有授权，版本升级必须重新审核。

### 下一步

- Phase 7.3：使用 Gateway、隔离存储和任务草稿边界完成“材料→复述→评分→下次复习”背书闭环。

## Phase 7.1 — 第一方 Plugin Manifest、Registry 与兼容性

**Commit**: `same delivery commit`

### 变更内容

- 新增严格 Zod Manifest v1，声明插件 ID、版本、实验 Plugin API 范围、类型、来源、贡献和未来能力请求；未知字段、重复贡献、重复 ID 与不规范版本均安全拒绝。
- 新增隔离式 Registry：单个无效 Manifest 不影响其他插件或核心功能；不兼容插件仍可见，但被标记并禁止启用。
- 登记“背书训练”和“解题训练”两个随应用发布的第一方 Activity 插件基础，明确完整活动分别属于 Phase 7.3 与 7.4。
- 新增 `plugin_installations` 与 `/api/v1/plugins` 启停接口；首次写入和多端修改均使用版本 fencing，数据库不保存 Manifest 或任意插件代码。
- 新增 `/plugins` Web/APK 共享页面，展示来源、Manifest/API 版本、兼容状态、声明能力与启停状态；页面明确“声明不等于授权”。
- 新增可回滚迁移 `0021_plugin_registry`、ADR-054，以及 Manifest、Registry、Repository、API、迁移、组件和移动端 E2E 测试。

### 当前边界

- 只加载编译进仓库的第一方 Manifest；没有上传、安装包、网络市场、动态代码、热重载或 Android 原生扩展。
- 启用只保存选择。Phase 7.2 前插件不能调用模型、数据库、网络、任务、记忆、文件或通知，背书/解题活动页面也尚未开放。
- Plugin API 当前为实验 `0.1.0`，不会在两个真实插件验证完成前冻结为 v1。

### 下一步

- Phase 7.2：实现 Capability Gateway、隔离存储、配额与审计，让插件只能通过显式授权的结构化能力工作。

## 2026-09-28 — 功能优先的主线顺序调整

- Phase 5.6 情绪支持安全评测保留为必须完成的发布前门槛，但不再阻塞学习插件、娱乐模式与关键移动能力的开发。
- 当前任务切换为 Phase 7.1：第一方 Plugin Manifest、Registry、启停和兼容性检查；随后以背书与解题两个插件验证 Capability Gateway。
- 功能完成后的顺序为 Phase 5.6 安全封版，再进入 Phase 8 作品集整理与发布验收。
- 延后的是集中评测与封版，不删除现有凭据加密、受控搜索、敏感记忆确认、主动性预算等基础安全边界。

## Phase 5.5 — Proactivity Policy 与主动问候

**Commit**: `same delivery commit`

### 变更内容

- 新增默认关闭的服务端主动性偏好：可分别允许“已确认目标跟进”和“久未互动问候”，并设置每日 1–3 条预算、6–168 小时冷却、未互动阈值和暂停时间。
- 新增确定性策略引擎，依次执行暂停、北京时间安静时段、上一条未读、每日预算、冷却期和真实信号检查；被拒绝时不写 Inbox、不规划 Push。
- 目标跟进只读取用户确认、未过期且非敏感的正式目标；久未互动只读取最后一条真实用户消息时间，不从沉默推断用户情绪或处境。
- 新增独立 Proactivity Worker 循环，默认每 60 秒评估；通过偏好行锁、唯一触发键以及 Inbox/Ledger 同事务写入保证并发幂等。
- 新增 `/proactivity` Web/APK 共享页面：可开启、降频、暂停一周、手动按已保存规则检查、查看最近联系理由，并一键关闭某类原因。
- Inbox 展示主动原因和解释，并复用现有可靠 Push 链路；用户明确创建的提醒、新闻、书籍不受陪伴预算限制。
- 当前问候使用确定性无负罪感模板，不调用模型；未来模型只能在规则批准后润色措辞，不能决定触发。
- 新增可回滚迁移 `0020_proactivity_policy`、ADR-053，以及策略、Repository/API、Worker、组件、数据库和移动端 E2E 测试。

### 当前边界

- Phase 5.5 不是情绪识别系统，不根据回复速度、沉默或文本推断孤独、悲伤等状态。
- Web Push/Huawei Push 仍是可失败投递层；问候以 Inbox 为事实源。HarmonyOS 被系统清理后的可靠后台 Push 仍需后续 HMS Provider。
- 当前只提供目标跟进和久未互动两类理由；庆祝、行为预测和模型自主触发均未开放。

### 下一步（已按 2026-09-28 决策调整）

- 当前先进入 Phase 7.1 完成插件基础；Phase 5.6 延后为主要功能完成后的发布前安全封版。

## Phase 5.4 — Voice Profile 与可失败 TTS

**Commit**: `same delivery commit`

### 变更内容

- 新增服务端 `voice_profiles` 与 `/api/v1/voice-profile`，保存系统 Provider、设备音线 ID、语言、语速、音高、音量，并使用乐观版本锁处理多端编辑。
- 新增 `/voice` 响应式设置页与 APK Hash 路由，可枚举当前设备音线、刷新、试听、停止与保存；换设备缺少同一音线时按语言安全回退。
- 首个 `SpeechOutputAdapter` 使用免费的 Web Speech/设备系统语音，不引入第三方 TTS 费用，也不把回答正文上传到额外语音服务。
- 聊天中完成的 Assistant 回答新增“朗读/停止朗读”；播放时才读取最新 Voice Profile，TTS 加载或播放失败只显示局部错误，不改变、不删除文字答案。
- 新增 Speech Policy：移除 URL/Markdown 装饰，把公式标记为“公式”、省略代码块，单次限制 5000 字符并按句切分，可随时停止。
- 修复浏览器执行 `speechSynthesis.cancel()` 却不派发结束事件时的悬挂边界：Adapter 主动结算正在播放的请求。
- 新增可回滚迁移 `0019_voice_profile`，覆盖数据库约束、Repository/API、朗读策略、设备 Provider、组件与移动端页面闭环测试。

### 当前边界

- 系统音线由当前浏览器、Android WebView 或卓易通环境提供，同一个音线 ID 不保证跨设备存在；真实华为设备是否暴露 Web Speech 仍需真机确认。
- 当前仅手动朗读，不自动播放；没有音频文件、服务端音频缓存、声音克隆或第三方 TTS API。稳定云端音线等有明确 Provider 与费用选择后再接入。
- 本地系统语音无法可靠表达统一“情绪强度”，因此本阶段不保存一个名不副实的情绪参数；后续服务端 Provider 可通过版本化 Profile 扩展。

### 下一步

- Phase 5.5：实现 Proactivity Policy 与主动问候，以触发理由、每日预算、安静时段和无负罪感表达约束主动联系。

## Phase 5.3 — Persona Profile

**Commit**: `same delivery commit`

### 变更内容

- 新增服务端 `persona_profiles` 与 `/api/v1/persona-profile`，保存助手称呼、用户称呼及温暖、幽默、直接、篇幅、对话内引导五个 0–100 结构化维度，并使用乐观版本锁处理多端编辑。
- 新增 `/persona` 响应式设置页与 APK 路由，提供实时规则预览；人格入口同时出现在桌面聊天页和移动端可达的记忆页。
- 模型请求在服务端读取最新画像，并替换客户端携带的任何 Persona 文本；客户端不能借 Persona 覆盖事实、安全、引用或高风险约束。
- Persona 编译器固定加入“不自称真人、不制造依赖、不为安慰而编造、严肃场景禁用幽默”等边界；`initiative` 只控制当前对话中的追问，不授权会话外主动联系。
- Prompt Composer 更新为 `phase-5.3/v1`，Persona 层版本更新为 `persona-profile/v1`；安全 Prompt 导出反映模型真正收到的服务端画像层。
- 新增可回滚迁移 `0018_persona_profile`，覆盖数据库范围约束、Repository/API、结构化编译、客户端伪造替换、移动端 UI 和迁移回滚测试。
- Core 3.5 固定评测继续保持 25/25，确认 Persona Profile 没有改变专业策略与模式边界。

### 当前边界

- 不开放任意“自定义人设 Prompt”；称呼仅接受名称类字符，风格只通过结构化维度调整，减少注入和规则膨胀。
- 当前未调用真实模型评价主观自然度；语气体验需要在日常使用中继续校准默认值。
- “对话内引导”不是后台主动消息。安静时段、每日预算、触发理由与主动问候属于 Phase 5.5。

### 下一步

- Phase 5.4：实现 Voice Profile 与可失败的 TTS Provider，保证播放失败不影响文字答案。

## Phase 5.2 — 正式记忆管理与相关性检索

**Commit**: `same delivery commit`

### 变更内容

- `/memory` 现在同时提供正式记忆管理和候选审核：可查看来源证据、修改内容与类型、固定、设置有效期、永久删除，并导出不含凭据的 JSON。
- 模型请求前由服务端重新读取当前分支的真实用户消息，再对未过期正式记忆执行轻量关键词/中文二元组检索；客户端不能提交自定义记忆上下文。
- 每次最多选择 5 条、估算合计不超过 500 Token；固定只提高相关结果排序，不会让无关记忆强制进入 Prompt。
- 记忆以“不可信参考数据”层插入 Prompt，当前表达与旧记忆冲突时以当前表达为准；Prompt Composer 更新为 `phase-5.2/v1`。
- Prompt Run 与 `memory_usages` 使用审计在同一事务写入，并同步更新 `use_count` 与 `last_used_at`；不在审计表复制记忆正文。
- 编辑、过期或删除会在下一次请求中立即生效；删除正式记忆不会销毁候选确认历史，使用审计只保留无正文的 ID 元数据。
- 新增可回滚迁移 `0017_colorful_lorna_dane`，覆盖旧记忆敏感等级回填、管理字段、使用审计、检索、API、移动端 UI 和 Prompt 注入测试。

### 当前边界

- 采用确定性轻量检索，不引入 Embedding 或向量数据库；记忆量和真实查询积累后再评估语义检索。
- 固定记忆仍要求与当前问题有关键词关联，避免把全部个人资料无差别发送给模型。
- Phase 5.2 不改变候选写入策略：所有新记忆仍需用户确认。

### 下一步

- Phase 5.3：实现 Persona Profile，让专业/陪伴表达保持稳定，同时继续服从核心事实与安全策略。

## Phase 5.1 — MemoryCandidate 与显式确认

**Commit**: `same delivery commit`

### 变更内容

- 新增服务端 `memory_candidates` 与 `memory_items`：候选保存来源会话/消息、原始证据、类型、敏感等级、置信度、原因、状态和版本；正式记忆只能关联一个已确认候选。
- 聊天发送用户消息后只提交来源 ID，服务端重新读取数据库中的真实消息内容，客户端不能伪造候选证据。
- 高精度提取器只接受明确要求记住、稳定偏好、长期目标和有限个人资料；问题、临时陈述、普通命令以及疑似 API Key、密码或 Token 会被拒绝。
- 新增 `/memory` 候选审查页：用户可查看原始证据和提出原因、修改最终表述、确认记住或拒绝；敏感候选具有明显标签。
- 确认候选和写入正式记忆在同一数据库事务内完成；拒绝不会创建正式记忆；重复请求、乐观锁冲突和已处理候选均有稳定错误语义。
- 删除旧的自动写入路径：Context Compressor 不再把用户问题提取为 `fact`，聊天 Prompt 不再读取浏览器 `localStorage` 记忆。
- 新增可回滚迁移 `0016_happy_bug`，并覆盖提取、来源所有权、幂等、确认/拒绝、事务、迁移和移动端候选页面。

### 当前边界

- Phase 5.1 采用确定性高精度规则，不调用模型做开放式人格推断；可能漏掉隐含信息，但优先避免误记。
- 所有候选都要求确认，尚未启用“低风险自动保存”；这是有意收紧写入权限，而非缺少确认后的持久化。
- 正式记忆已持久化，但在 Phase 5.2 完成相关性检索前不会注入聊天 Prompt，避免退回“最近十条全部塞入”的旧方案。
- 本阶段只提供候选确认和最近处理记录；正式记忆的编辑、删除、过期、固定和导出属于 Phase 5.2。

### 下一步

- Phase 5.2：实现正式记忆管理页面、轻量相关性检索、Token 预算与使用记录，并保证编辑或删除后立即影响后续回答。

## Phase 4.4 — 高质量、可控的思考问题

**Commit**: `same delivery commit`

### 变更内容

- 新增独立 `reflection_question` 定时任务，并让个人简报复用同一个问题生成器；不在普通聊天回答末尾强制追问。
- 模型只负责生成 3–5 个结构化候选；代码过滤空泛、是非式、避开话题和高情绪负担候选，再按相关性、新颖性、可行动性和情绪负担评分，默认只展示最高质量的 1 个。
- 最近 90 天已交付问题参与相似度去重；选中问题及评分诊断保存到 Inbox，用户可以查看筛选依据。
- 新增服务端思考偏好：总开关、显式目标、暂不触碰话题、温和/平衡/挑战风格和每次 1–3 个问题，多端通过乐观锁安全更新。
- 关闭功能后，独立反思任务进入 `skipped`；个人简报仍会正常生成，只是不附加问题。
- 新增可回滚迁移 `0015_parched_pyro`、Web/API/移动端 Hash 路由，以及生成器、偏好、Worker、Inbox 和迁移测试。

### 当前边界

- 评分是可解释的确定性启发式，不代表心理测评，也不推断用户情绪或人格。
- 当前触发点是个人简报和显式反思任务；尚未根据聊天中的目标冲突自动插入问题。
- 目标和避开话题由用户显式填写；Phase 5 记忆上线前不从对话隐式沉淀长期信息。

### 下一步

- Phase 5.1：实现 MemoryCandidate 与确认机制，先让长期信息可见、可拒绝、可纠正，再用于陪伴和主动联系。

## Phase 4.2 — 个人简报跨期去重与反馈

**Commit**: `same delivery commit`

### 变更内容

- 个人简报只保存模型实际引用来源的规范 URL 与标题签名；未引用搜索结果不会污染历史。
- Worker 在调用模型前读取同一任务最近 30 天的签名，先做本批聚类，再过滤 URL 相同或标题高度相似的历史事件。
- 搜索结果全部重复时，TaskRun 进入 `skipped`，不调用模型、不创建 InboxItem、不规划 Push，也不计为失败。
- Inbox 新增“有帮助 / 不相关 / 内容重复”反馈；负反馈会对这些来源采用更严格的相似事件抑制阈值，再次点击可撤销。
- 简报卡片可直达对应任务的编辑状态，用户可直接调整关注主题、执行频率和时间。
- 新增可回滚迁移 `0013_aspiring_maximus`，仅扩展 `inbox_items` 的来源签名与反馈字段；回滚不影响正文快照。

### 当前边界

- 聚类使用确定性的规范 URL 与标题二元组相似度，不使用向量数据库或第二次模型调用；同事件跨语言或标题差异过大时仍可能漏判。
- 反馈限定在同一简报任务的去重信号，不自动推断长期兴趣，也不读取聊天记录。
- 删除某条 Inbox 简报会同时移除它的去重签名；这是用户主动删除历史后的可解释行为。

### 下一步

- Phase 4.3：加入有来源、有难度和推荐目的说明的书籍资料与最小阅读画像。

## Phase 4.1 — 有来源的个人简报垂直切片

**Commit**: `same delivery commit`

### 变更内容

- 新增 `personal_briefing` Task/Inbox 类型，任务页可设置一次、每天或每周执行，并填写关注主题或简报要求。
- Worker 到期后通过内部 SearXNG 检索，再复用现有 Credential Vault 与 Agent Prompt Generator 生成“今日重点 / 为什么值得关注 / 一个思考问题”。
- 生成器把搜索证据标记为不可信数据，要求已知 `[Sx]` 引用；代码校验固定章节、引用编号和单一思考问题，并附加真实可点击来源、发布日期、生成日期与订阅理由。
- 搜索与模型调用全程复用 Run 租约心跳；结果与 Run 成功状态原子写入 Durable Inbox，并复用现有 Push Delivery。
- Docker Worker 显式依赖内部 Search 服务并接收 `WEB_SEARCH_BASE_URL`；SearXNG 继续不映射宿主机端口。
- APK Local Notification 现在只同步普通提醒，AI 定时任务和个人简报只在服务端生成完成后通过 Inbox/Push 投递。
- 新增可回滚迁移 `0012_good_mantis`；回滚会把简报类型降级为普通 Agent Prompt，保留已有主题与正文。

### 当前边界

- 当前使用搜索摘要，不抓取网页全文；来源清单可追踪，但不等同于完整事实证明。
- Phase 4.1 不做跨期聚类、去重、兴趣反馈或书籍画像；这些进入 Phase 4.2–4.4。
- 不自动读取聊天或长期记忆；“关注理由”来自用户显式设置的简报主题，不虚构个性化经历。

### 下一步

- Phase 4.2：围绕个人简报建立跨期聚类、去重与轻量反馈，避免同一事件重复出现。

## Core 3.5 — 轻量质量评测封版

**Commit**: `same delivery commit`

### 变更内容

- 新增 25 项固定回归样例，分为 12 项模式边界与 13 项专业回答契约。
- 模式样例覆盖 Policy/Mode/Persona/Memory/Conversation 顺序，以及专业、陪伴、反思和娱乐模式边界。
- 专业回答样例覆盖搜索开关、时效触发、证据隔离、引用完整性、摘要支持度、日期和推断提示。
- 新增 `npm run eval:core`，输出两个分项与总分；任何样例失败都会返回非零退出码。
- 评测不调用真实模型、不访问网络、不写数据库且不消耗 API 额度；文档明确分数不等同于事实正确率或帮助度。
- 新增 `PRODUCT_MAINLINE_GUIDE.md`，将新闻/书籍/思考、记忆与陪伴重新置于产品主线，并冻结移动端横向扩张。

### 当前边界

- 当前是确定性质量契约评测，不评价自由生成答案的语义质量、情感自然度或真实用户帮助度。
- Core 3.5 不建设第二模型裁判、在线 Benchmark 或复杂评测平台；后续真实内容功能再逐步收集人工反馈样例。

### 下一步

- 进入 Phase 4 主动内容垂直切片：复用现有任务、搜索、引用、Inbox 和通知，生成有来源的个人简报与一个高质量思考问题。

## Core 3.4 — 确定性 Response Verifier

**Commit**: `same delivery commit`

### 变更内容

- 新增服务端 `core-3.4/rule-v1` Verifier，在流式回答结束后检查引用完整性、搜索摘要支持度、时效日期与推断边界。
- Verifier 不进行第二次模型调用，不增加 Token 成本，不改写或拦截原回答；空回答也不会被误标为通过。
- 检查结果使用 `pass / warning / fail / not-applicable`，并始终附带“规则检查不等于事实证明”的局限声明。
- SSE `done` 同时返回结构化 Citation 与 Verification；新增可回滚迁移，为 `messages` 增加可空 JSONB `verification`。
- Chat 新增可折叠检查面板：通过默认折叠，警告或失败默认展开；结果随树形回答分支持久化并跨设备恢复。
- API 严格校验版本、四个唯一检查项、状态和 Assistant 角色；客户端再次进行运行时校验，拒绝畸形持久化对象。
- 新增 Verifier 规则、SSE、API、Repository、迁移回滚、客户端恢复与 UI 渲染回归测试。

### 当前边界

- 摘要支持度是中英文词面启发式，只能提示人工复核，不能判定事实真伪或替代阅读原文。
- 当前不抓取网页全文，也不进行第二模型裁判；语义验证与误报/漏报测量进入 Core 3.5 评测集。

## Core 3.3 — 受控 Web Search 与 Citation Model

**Commit**: `same delivery commit`

### 变更内容

- 新增 `auto / on / off` 联网控制；自动模式只在时效、新闻、价格、现任信息或显式引用需求时检索。
- 新增服务端 `WebSearchProvider` 与 SearXNG 实现。Compose 内部启动独立搜索容器，不暴露宿主机端口且不需要第三方搜索 API Key。
- 搜索结果经过协议校验、去重、HTML 清理、数量/长度/超时限制后，作为明确的“不可信外部数据”进入 Prompt。
- Prompt 新增 Citation Policy 与 Web Search Evidence 层，Composer 升级到 `core-3.3/v1`，真实搜索证据进入 Envelope、哈希与导出。
- 模型用 `[S1]` 编号引用；服务端只回传回答实际使用的来源，Assistant Message 将结构化 Citation 保存到 PostgreSQL JSONB。
- Chat 在网页与 APK 共享界面展示可点击来源卡片；重新生成的每个回答分支独立保存自己的来源。
- 新增搜索决策、失败降级、提示注入隔离、SearXNG 归一化、SSE 引用回传、持久化与渲染测试。

### 当前边界

- 当前使用搜索摘要，不抓取完整页面；来源是否逐条支持断言由 Core 3.4 Response Verifier 继续完成。
- 搜索故障会降级为普通回答，不阻断聊天；此时回答不得视为已经联网验证。
- SearXNG 的可用性仍受本机网络和上游搜索引擎限制。

## Core 3.2 — 服务端 Prompt Envelope 与安全导出

**Commit**: `same delivery commit`

### 变更内容

- 模型 API 改为接收带 `kind/source/role` 的结构化 Prompt，由服务端生成 Provider 的实际消息，避免客户端请求与审计副本分叉。
- 新增 Prompt Envelope v1：包含 Run ID、Composer/逐层版本、层顺序、非敏感 Provider 参数、工具/生成参数占位、Context 状态和 SHA-256。
- 新增 `prompt_runs` 与可回滚迁移，只持久化版本、状态、哈希和审计元数据，不保存 Prompt、记忆或对话正文。
- 普通发送校验当前叶节点；重试校验历史节点属于同一会话，保持树形重新生成行为。
- SSE `meta` 返回服务端 Envelope；Provider 完成、失败或取消会更新 Run 状态和安全错误码。
- 新增服务端 JSON/Markdown 导出端点；导出前重新计算哈希并核对审计记录，篡改 Envelope 被拒绝。
- 记忆默认脱敏，显式确认后才能进入文件；API Key、数据库凭据、Push Token、内部错误栈和插件私有数据始终排除。

### 当前边界

- 完整 Envelope 只存在于当前客户端运行期间；刷新后保留 Run 审计，但不会从数据库恢复敏感 Prompt 明文。
- 当前未启用工具、温度自定义、Context 截断/压缩或 Token 计量，对应字段以明确的空值/false 记录，后续变更需要提升版本。

## Core 3.1.2 — 会话模式持久化与选择

**Commit**: `same delivery commit`

### 变更内容

- Chat Header 新增由 Mode Registry 驱动的自动、专业、陪伴、反思与娱乐模式选择器。
- Conversation PATCH 从单一重命名升级为标题/模式局部更新，并保留事务锁与 `expectedVersion` 乐观并发控制。
- PostgreSQL `conversation_mode` 增加 `entertainment`；升级和回滚均可执行，回滚会把无法由旧枚举表达的娱乐模式降级为 `auto`。
- 模式切换不修改消息树或活动叶节点；刷新和跨设备读取服务端模式，失败或版本冲突时重新同步会话。
- 模式只影响之后的模型请求；历史回答与已经捕获的 Prompt 快照保持原样。

### 当前边界

- 娱乐模式当前是普通 Conversation 上的交互协议，不包含人物卡、骰子、场景状态或独立 GameSession。
- M1.2 Prompt 快照仍是客户端运行期快照；服务端 Prompt Envelope、版本化与审计属于 Core 3.2。

## Core 3.1.1 — Mode Registry 与核心 Policy Layer

**Commit**: `same delivery commit`

### 变更内容

- 新增统一 `ModeRegistry`，注册自动、专业、陪伴、反思和娱乐五种交互模式，并记录事实标准、工具意图与持久化边界。
- 新增不可由模式、Persona、记忆、工具结果或插件文本替换的核心事实/安全 Policy。
- Prompt Builder 固定采用 `Policy → Mode → Persona → Memory → Conversation` 顺序；服务端持久化 mode 开始进入客户端 Session 和真实模型 Prompt。
- Registry 拒绝重复/未知模式，并复制、冻结模式定义，避免注册后的共享对象被外部修改。
- 明确模式只声明交互协议，不能直接获得工具、数据库、网络或系统权限。
- 补充 M1.2 时序结论：生成当前 AI 回复的请求不包含该回复，下一轮请求才会把它作为 Conversation 历史。

### 当前边界

- Vitest 全量 57 个文件、224 项测试通过；Microsoft Edge 9 项 E2E、ESLint、TypeScript、Next.js/Vite 生产构建与 Drizzle Schema 检查通过。
- Docker 已部署新 Prompt 链，Web/PostgreSQL 健康，Worker 正常运行。
- Core 3.1.1 是领域与 Prompt 装配基础；模式选择 UI、会话更新 API、`entertainment` 数据库迁移与 GameSession 仍属于 Core 3.1.2/6.x。
- “不可覆盖”是代码层级与权限边界，不是对 LLM 行为的形式化证明；后续 Core 3.4 需要对抗评测。

## Mobile M1.3 — Android 本地通知发布加固

**Commit**: `same delivery commit`

### 变更内容

- 新增经过结构校验的设备端最小提醒快照；只保存通知调度所需字段，不缓存任务 Prompt 或服务端凭据。
- APK 启动和恢复时优先同步服务端，网络不可用时自动使用最近一次设备快照进行原生 reconcile，并在通知页显示同步来源与缓存时间。
- 通知设置页新增精确闹钟设置入口；未授权时明确提示系统可能降级为非精确发送。
- Android Restore Receiver 新增手动校时、时区变化和应用覆盖安装广播，并保留 Capacitor 已提供的开机恢复。
- 明确“划掉最近任务”与系统“强行停止”的差异；后者会冻结普通 APK 的闹钟和广播，必须由用户重新打开应用。
- 补充 M1.2 请求时序说明：当前 AI 回复不会进入生成它的 Prompt 快照，下一轮请求才会把该回复作为历史上下文。

### 验证与边界

- 自动化覆盖在线缓存更新、离线回退、损坏缓存拒绝、精确闹钟设置入口和 Android Manifest 恢复广播。
- Vitest 全量 56 个文件、218 项测试通过；Microsoft Edge 9 项 E2E、ESLint、TypeScript、Next.js/Vite 生产构建、Drizzle Schema 检查与 Android `assembleDebug` 通过。
- 最终合并 Manifest 已确认包含开机、校时、时区变化、应用覆盖安装恢复广播，以及 `RECEIVE_BOOT_COMPLETED` 与 `SCHEDULE_EXACT_ALARM` 权限。
- Debug APK 为 5,488,191 字节，SHA-256 为 `10A71B90EE9EA5B1A60404370D5283B7191808A9060447282161ACB9A483BE66`。
- 断网、重启、系统清理、时区和华为省电策略需要新版 APK 真机验收后才能将 M1.3 标记为完成。
- AI 主动聊天、新闻和书籍推送仍需要 Huawei Push Kit，不属于本地闹钟能力。

## Mobile M1.2 — Prompt 文件导出与系统分享

**Commit**: `same delivery commit`

### 变更内容

- 在模型请求边界捕获每个会话最近一次真实 Prompt 快照，覆盖普通发送与树形分支重新生成，不使用聊天气泡二次拼接。
- SSE 元数据新增 request ID、Provider、Base URL 与 Model；API Key 和 Authorization Header 仍只存在服务端请求内部。
- 新增 JSON 与 Markdown 导出格式，包含 Prompt 层、实际 Provider messages、隐私标记和 SHA-256 内容哈希。
- 记忆上下文默认替换为脱敏占位符；只有用户在导出窗口显式勾选后才进入文件，并用 `exactRequestContent` 标识完整性。
- 实现 `FileExportAdapter`：Web 使用 Blob 下载，Capacitor 使用 Filesystem Cache + 系统 Share Sheet，不申请公共存储权限。
- 聊天页新增响应式导出入口、格式选择、隐私说明、忙碌/成功/错误状态；没有请求快照时按钮保持禁用。
- 将 Vitest worker 固定为 4，避免多个 PGlite 数据库初始化并发导致 10 秒 Hook 假超时。

### 验证与边界

- Vitest 全量 55 个文件、213 项测试通过；Microsoft Edge 9 项 E2E 全部通过，包含真实 Blob JSON 下载与内容断言。
- ESLint、TypeScript、Next.js/Vite 生产构建与 Android `assembleDebug` 通过。
- Debug APK 为 5,532,331 字节，SHA-256 为 `631C66AF5C97EA0489F5007BDCFB0E7B87F701DA509582FCFB9FC5BAA73D69F1`。
- M1.2 快照只存在当前客户端运行期，刷新后需再次发送；服务端 Prompt Envelope 与长期 Run 审计留给 Core 3.2。

## Mobile M1.1 — 本地可打包 React Client

**Commit**: `same delivery commit`

### 变更内容

- 新增 Vite 移动入口与 `mobile-dist` 构建产物，Chat、Task、Inbox、通知和凭据页继续复用现有 React 组件，没有复制第二套业务 UI。
- 正式 Capacitor 配置改为本地 Web Bundle；一键脚本会在生成配置和 APK 内双重断言不存在 `server.url`，旧 remote-shell 仅保留为显式 `spike` 配置。
- 新增共享 API Runtime：Web 使用同源 `/api/v1/*`，APK 使用构建期注入且经过 HTTPS/Origin 校验的 Tailscale 地址。
- 新增共享 Path/Hash 导航边界；网页继续普通路径，APK 使用 Hash Router，原生通知深链和任务定位可跨端工作。
- Next.js 16 Proxy 只向允许的 Capacitor `https://localhost` Origin 提供 API CORS；Compose 增加可配置的 `MOBILE_ALLOWED_ORIGINS`。
- 本地客户端无法连接笔记本时仍能启动并显示连接诊断；原生环境禁用不适用的 Web Push，任务本地通知保持独立。
- 页面按路由延迟加载，避免把所有功能装入首屏；移除生产构建对 Google Fonts 下载的依赖。

### 验证与边界

- ESLint、Next.js 生产构建、Vite Mobile 生产构建与 Android `assembleDebug` 通过。
- Vitest 全量 53 个文件、208 项测试通过；新增 API Origin、Hash 导航、CORS、Capacitor 本地/Spike 配置和 APK 构建约束测试。Microsoft Edge 8 项 E2E 全部通过。
- 构建脚本从 APK 内确认存在本地 `index.html`、`webDir=mobile-dist`、不存在 `server.url`，且本地 JS 包含预期 Tailscale API Origin。
- Debug APK 为 5,477,893 字节，SHA-256 为 `B67B6CF92B7224B13384DEDA3F052A05DEAB3EBF785D8C726DE36436644B0736`。
- 当前 API 仍无应用登录鉴权，只能在个人 Tailscale 私网使用；新版 APK 的卓易通真机回归属于 M1.1 验收剩余人工项。

## Mobile M0.4.1 — 循环时间滚轮与通知诊断

**Commit**: `same delivery commit`

### 变更内容

- 时、分滚轮改为五段循环数据并在外层区间无感回中；触摸滚动、点击和键盘均可跨越 `23 → 00`、`59 → 00` 以及反向边界。
- `/notifications` 新增轻量诊断区：显示通知权限、精确闹钟权限、待发送总数、任务提醒数和测试通知的待发送/已送达状态。
- 新增固定 ID 的 10 秒测试通知，重复测试自动覆盖；支持立即取消，可在 10 秒内验证“取消后不提醒”，不写数据库、不新增服务端接口或后台常驻进程。
- 记录真机现状：华为 HarmonyOS 5 / 卓易通在前台、普通后台可收到本地通知，使用系统清理后未收到；后续通过四组快速测试区分普通进程回收和强行停止语义。
- 修复一次交付构建误用离线配置的问题：官方移动构建脚本现在会在构建前及 APK 打包后两次核对 Tailscale Server URL，避免再次生成只显示离线兜底页的 Spike APK。

### 验证与边界

- 新增循环索引、诊断安排、状态读取、取消和安全深链测试；全量 Vitest 共 50 个文件、198 项。
- Microsoft Edge 390×844 移动视口验证循环边界与任务 CRUD。
- ESLint、Next.js 生产构建、Capacitor Sync、Android 单元测试与 `assembleDebug` 通过；Debug APK 为 4,589,758 字节，SHA-256 为 `F4C0029DEB294CFB65ED50E73D622BE7F9C07B629E8594E4235A0A281E1349E8`。
- Android 的正常进程回收与“强行停止”不是同一种状态；若系统清理会取消已登记的系统闹钟，APK 代码不能依靠保活可靠绕过，需转向系统白名单、Huawei Push 或后期 ArkTS 代理提醒。

## Mobile M0.4 — 移动时间滚轮与 APK 本地通知

**Commit**: `same delivery commit`

### 变更内容

- 将任务时间输入改为手机闹钟式时/分双滚轮，支持触摸惯性滚动、自动吸附、点击、键盘方向键、取消与确认。
- 一次性任务把日期与时间拆开，日/周重复任务复用同一时间滚轮；Task API 与数据库格式保持不变。
- 新增 Capacitor Local Notifications Adapter：稳定通知 ID、增量 reconciliation、Android 通知频道、精确闹钟降级提示和安全相对深链。
- 应用启动/恢复、创建、修改、暂停、恢复、删除及重新进入任务页时同步活动任务；一次性、每天和每周任务映射到对应原生调度。
- `/tasks` 和 `/notifications` 均提供显式权限入口，不自动弹权限框；拒绝通知不影响服务端任务保存。
- 点击通知打开任务页并滚动至对应任务；新增白色单色状态栏图标和前台横幅配置。
- 记录首轮卓易通结果：登录、SSE、公式与树形对话通过，Web Push 失败后由本地通知承担已设定任务提醒。

### 安全与边界

- 通知只携带任务 ID、版本化 occurrence、任务标题与站内相对路径，不携带 Agent Prompt、API Key 或数据库凭据。
- APK 本地提醒不是 Huawei Push：AI 主动聊天、新闻和书籍等服务端新内容仍需后续 Huawei Push Provider。
- 当前仍是 Debug remote-shell；正式发布前必须完成本地 Web Bundle、Release 签名与真机回归。

### 验证方法与结果

- Vitest 限制为 4 workers 后全量 50 个测试文件、194 项测试通过；本次通知/滚轮专项 22 项通过。
- Microsoft Edge 390×844 移动视口 E2E 通过，覆盖滚轮选择 `08:30`、创建、编辑、暂停与删除。
- TypeScript、ESLint、Drizzle schema check、Next.js 本机与 Docker 生产构建通过；生产依赖审计 0 漏洞。
- Android `assembleDebug`、本地单元测试与真机测试源码编译通过；APK Debug 签名、API 24–36、通知权限、重启 Receiver、精确闹钟权限和状态栏图标均已检查。
- 新 APK 大小 4,589,758 字节，SHA-256 为 `6AB87EEB43267AC1791D92E0E023D87F5D8FED86D449E2842A7D5FCC61EFFA7A`。
- 自动验证无法证明 HarmonyOS/卓易通实际弹窗，M0.4 仍需用户安装新版 APK 后完成前台、后台、锁屏与重启验收。

### localStorage 变化

- 无。系统待处理通知由 Android/Capacitor 管理，Task 事实源仍为 PostgreSQL。

## Mobile M0.2 — Capacitor Android Debug APK

**Commit**: `same delivery commit`

### 变更内容

- 安装 Capacitor 8.5.2、Android Runtime 与 App/Filesystem/Local Notifications/Preferences/Share 官方插件。
- 生成原生 Android 工程，固定应用 ID `com.ghostzero.aistudycompanion`，minSdk 24、compile/targetSdk 36。
- 增加 Doctor、同步、Android Studio 打开和 Debug 构建 npm scripts。
- 增加可复现 PowerShell 构建脚本；远程地址仅在构建期间注入，结束后恢复无个人地址的离线配置。
- 使用 Microsoft OpenJDK 21 解决 Android Studio 2026.1 内置 JDK 25 与 Gradle 8.14.3 不兼容问题，不修改系统默认 Java。
- 新增 Android 构建、安装、重启恢复、安全边界与 M0.3 卓易通真机验收文档。

### 验证方法与结果

- Capacitor Doctor：Android 配置通过。
- Gradle `assembleDebug`：245 个 task 执行，构建成功。
- Android 本地单元测试通过，真机测试源码编译通过；包名断言使用正式应用 ID。
- APK：约 4.3 MB，Debug 证书签名验证通过，应用 ID 与 SDK 级别符合配置。
- Tailscale Serve 有效；HTTPS 健康 API 返回 200，数据库 ready，模型 Provider configured。
- Vitest 全量 47 个测试文件、183 项测试通过；ESLint、TypeScript、Drizzle schema check 与 Next.js 生产构建通过。
- `npm audit --omit=dev`：0 个生产依赖漏洞。开发依赖保留 5 个 moderate 告警，来源为 Vitest mocker 与 Capacitor CLI 的 iOS/xcode 间接依赖，未执行破坏性强制升级。
- 未连接 ADB 设备，因此安装、启动和卓易通兼容验收留给 M0.3。

### localStorage 变化

- 无。

## Product Surface + Mobile M0.1

**Commit**: `same delivery commit`

### 变更内容

- 产品表层扩展为专业、陪伴、娱乐三类模式；娱乐状态与现实对话/长期记忆隔离。
- 新增 Prompt Envelope/安全导出、Voice Profile/TTS、AI 跑团与主动内容的分阶段方案。
- 确立“共享 React 客户端 + Capacitor Android + ArkTS/ArkWeb Adapter”边界，不建立两套业务逻辑。
- 新增文件导出、语音、本地提醒和原生 Push 的 TypeScript 平台契约。
- 建立 Capacitor M0 remote-shell 配置与离线兜底页；只允许显式 Spike 配置加载 HTTPS 服务端。
- 华为路线调整为先验证 APK + 卓易通 + HMS Push，再以 ArkTS + ArkWeb 完成原生交付。
- 路线图拆分 Core Track 与 Mobile Track，Prompt 导出、语音、娱乐模式和移动端拥有独立验收条件。

### 验证方法与结果

- Capacitor 配置与自托管产物定向测试共 14 项通过。
- TypeScript、ESLint、生产构建与 `git diff --check` 通过。
- 环境审计确认 Node.js 24 已满足要求；Android Studio/SDK 尚未安装，未伪造 APK 构建成功。
- Capacitor npm 依赖下载因运行环境安全审核拒绝而未执行，仓库没有留下不完整依赖变更。

### localStorage 变化

- 无。移动端服务器地址只在构建/同步阶段由环境变量注入，不写入浏览器存储。

## Sprint 2.5 — Agent Prompt Task

**Commit**: `same delivery commit`

### 变更内容

- Task/API/UI 支持普通提醒与 AI 定时任务；AI prompt 由 API 和数据库双层强制必填。
- 新增服务端 Agent Prompt Generator，复用 Credential Vault 和 OpenAI-compatible Provider，用户输入保持 `user` 角色。
- 长模型调用周期续租并在保存前再次续租；同批 Run 并发执行，保留 attempt fencing。
- 临时 Provider 错误通过租约恢复重试，永久错误写入失败 Run；单次输出限制为 100,000 字符。
- AI 结果与 Run 成功终态原子写入 Inbox，记录模型摘要，并复用 Push Provider 通知。
- Inbox 增加来源标识并复用安全 Markdown、表格和数学公式渲染。
- Worker 容器继承与 Web 一致的 `AI_*` 环境变量后备配置；首选配置仍来自服务端 Credential Vault。
- Phase 2 标记完成，当前任务推进到 Sprint 3.1。

### 验证方法与结果

- Vitest 全量 44 个测试文件、170 项测试通过。
- TypeScript、ESLint、Drizzle schema check 与生产构建通过。
- Task、Inbox 移动端关键路径 E2E 共 2 项通过。
- Docker Compose 实机运行通过：PostgreSQL/Web/Worker 正常，健康 API 返回 200，最新迁移为 `0008_oval_kang.sql`。
- 未自动调用真实付费模型，避免消耗用户额度或写入伪造个人数据；Provider 行为由受控流式测试覆盖。

### localStorage 变化

- 无；迁移 `0008_oval_kang` 扩展现有 Task/Inbox kind 约束，不新增数据表。

## Push Provider 架构 — HarmonyOS 5 适配预留

**Commit**: `same delivery commit`

### 变更内容

- `push_subscriptions` 增加 `provider`，现有订阅通过迁移自动标记为 `web-push`。
- Worker 改由 `PushProviderRegistry` 路由；Web Push 协议、VAPID 与错误分类收拢到独立 Provider。
- 预留 `huawei-push` Token/服务端配置契约及 HarmonyOS 5 V3 endpoint，不伪装为已经完成真机推送。
- 通知设置显示设备 Provider，并解释 HarmonyOS 5 浏览器限制与后续原生适配要求。
- 新增 ADR-034，明确 HAP、Push Token、服务端 JWT/V3 调用和真机验收路径。

### 验证方法与结果

- Provider、Worker、Push API、Repository 与迁移共 24 项定向测试通过。
- TypeScript、ESLint、Drizzle schema check、生产构建通过；全量 43 个测试文件、162 项测试通过。
- 通知设置移动端 E2E 1 项通过，覆盖 HarmonyOS 说明与偏好保存。
- 资源密集型数据库测试与构建改为串行，避免并发资源争用造成假超时。

### localStorage 变化

- 无；数据库迁移新增 `push_subscriptions.provider`，默认值为 `web-push`，提供对应 rollback。

## Engineering Workflow — 风险分级交付

**Commit**: `same delivery commit`

### 修改文件

- `CLAUDE.md`
- `docs/CHANGELOG.md`

### 变更内容

- 将机械的文件数/行数授权改为按产品语义、外部影响和可逆性判断。
- 增加 L0–L3 验证矩阵；低风险改动不再重复执行全量测试、Docker、审计与 E2E。
- 同一逻辑任务默认一次实现提交、一次充分验证、一次 Push，微小修正不再拆分为多次提交和 CHANGELOG。
- 仅在假设会改变产品方向、造成外部影响、破坏数据或不可逆时暂停询问。

### 验证方法与结果

- `git diff --check` 与规则冲突复核通过。

### localStorage 变化

- 无。

## Credential Vault 文档 — 可编辑配置与加密边界

**Commit**: `0090628`

### 修改文件

- `README.md`
- `docs/SERVER_MODEL_PROVIDER.md`
- `docs/PRODUCT_TECHNICAL_ROADMAP.md`
- `docs/adr/ADR-029-MODEL-CREDENTIAL-VAULT.md`
- `docs/CHANGELOG.md`

### 变更内容

- 文档同步为 Provider/Base URL/Model 可输入、可回读且不加密，只有 API Key 加密且不可回读。
- 明确单用户单配置、旧多行迁移策略，以及 Provider 目前是厂商标识而不是原生协议选择器。
- 更新 PUT 请求示例、输入限制、表单保存后的展示行为与 Credential Vault 架构修订。

### localStorage 变化

- 无。

## Credential Vault — 用户可编辑 Provider 配置

**Commit**: `3707199`

### 修改文件

- `web/components/config/ModelCredentialSettings.tsx`
- `web/lib/api/modelCredentialClient.ts`
- `web/lib/api/modelCredentialApi.ts`
- `web/lib/ai/server/modelCredentialService.ts`
- `web/lib/repositories/modelCredentialRepository.ts`
- `web/lib/db/schema.ts`
- `web/drizzle/0006_brainy_lady_bullseye.sql`
- `web/drizzle/rollback/0006_brainy_lady_bullseye.sql`
- `web/drizzle/meta/0006_snapshot.json`
- `web/drizzle/meta/_journal.json`
- `web/tests/databaseMigrations.test.ts`
- `web/tests/modelCredentialRepository.test.ts`
- `web/tests/modelCredentialService.test.ts`
- `web/tests/modelCredentialApi.test.ts`
- `web/tests/modelCredentialClient.test.ts`
- `web/tests/modelCredentialSettings.test.tsx`
- `web/e2e/credential.spec.ts`
- `docs/CHANGELOG.md`

### 变更内容

| 功能 | 说明 |
|---|---|
| 可编辑表单 | Provider、Base URL、Model 不再使用写死值，均由用户输入；无已存配置时保持空白并提供示例占位 |
| 服务端保存 | 四字段在一次请求中提交；API Key 使用 AES-256-GCM 加密，Provider/Base URL/Model 以普通文本列保存 |
| 单配置语义 | 唯一约束改为每用户一条当前模型配置；修改 Provider 原位更新，不新增不可达旧凭据 |
| 升级兼容 | 若旧库异常存在多 Provider 行，迁移确定性保留最近更新项后建立用户唯一索引，并提供回滚 SQL |
| 输入边界 | Provider 使用 1–100 字符安全标识格式；Base URL 继续要求安全 URL，禁止内嵌账号密码 |
| 协议边界 | Provider 当前是用户可配置厂商标识，实际连接仍使用 OpenAI-compatible 协议适配器 |

### 验证方法与结果

- 凭据与迁移专项测试：6 个文件、16 项通过；移动端 Microsoft Edge 凭据 E2E 通过。
- 全量 Vitest：42 个文件、157 项通过；Next.js 生产构建通过。
- `npx tsc --noEmit`、`npm run lint`、`npm run db:check`、`git diff --check`：通过。
- Docker 生产镜像重建成功，真实 PostgreSQL 已应用 `0006`；非敏感三列保持明文、Key 保持版本化密文，读取 API 不含密文字段。
- 部署后 Microsoft Edge 全套 E2E 8 项通过。

### localStorage变化

- 无；四项配置均只通过同源 API 保存到 PostgreSQL，浏览器仍会清理旧版模型配置 localStorage。

## Sprint 2.4g — 封版验证与总结报告

**Commit**: `e5149ed`

### 修改文件

- `docs/WEB_PUSH.md`
- `docs/reports/SPRINT_2_4_REPORT.md`
- `docs/CHANGELOG.md`

### 变更内容

- 记录 Sprint 目标、架构、功能、安全边界、主要文件、审查修复、提交与下一步。
- 增加 MDN、WebKit 与 web-push 官方实现依据。
- 明确区分已完成的自动化/Docker 验证与必须由用户手势完成的真机通知授权验收。

### 验证方法与结果

- 全量 Vitest：42 个文件、155 项通过；Microsoft Edge E2E：8 项通过。
- TypeScript、ESLint、Drizzle、Next.js 本机/Docker 生产构建和 `git diff --check` 通过。
- Docker 实机：PostgreSQL/Web healthy、Worker 常驻、实时 Push API/PWA 正常；生产依赖 0 漏洞。

### localStorage 变化

- 无。

## Sprint 2.4f — Web Push 运维文档与封版状态

**Commit**: `156d29c`

### 修改文件

- `README.md`
- `PROJECT.md`
- `docs/TASKS.md`
- `docs/SELF_HOSTING.md`
- `docs/WEB_PUSH.md`
- `docs/PRODUCT_TECHNICAL_ROADMAP.md`
- `docs/adr/ADR-033-WEB-PUSH-AS-BEST-EFFORT-DELIVERY.md`
- `docs/CHANGELOG.md`

### 变更内容

- 增加手机/电脑启用步骤、iOS 主屏幕限制、数据流、API、数据表、可靠性、隐私、密钥备份和排障手册。
- 记录 Inbox 为事实源、Push 为 best-effort Delivery 的架构决策及 PostgreSQL 队列取舍。
- 将路线图的 Sprint 2.4 标记完成，并把当前任务推进到 Sprint 2.5 Agent Prompt Task。
- 清理 README、任务手册和自托管手册中“尚无系统 Push”的过期描述。

### localStorage 变化

- 无。

## Sprint 2.4e — Web Push 后台投递闭环

**Commits**: `1a46e3b`, `4b979b1`

### 修改文件

- `.env.selfhost.example`
- `docker-compose.yml`
- `web/.env.example`
- `web/scripts/reminder-worker.ts`
- `web/lib/notifications/notificationWorker.ts`
- `web/lib/notifications/quietHours.ts`
- `web/lib/repositories/notificationDeliveryRepository.ts`
- `web/tests/notificationDeliveryRepository.test.ts`
- `web/tests/notificationWorker.test.ts`
- `web/tests/quietHours.test.ts`
- `web/tests/selfHostingArtifacts.test.ts`
- `docs/CHANGELOG.md`

### 变更内容

| 功能 | 说明 |
|---|---|
| 持久投递 | Reminder Worker 同时规划并消费 Push 投递；重启后仍从 PostgreSQL 恢复未完成通知 |
| 幂等与并发 | 每个 InboxItem/设备仅一条投递，使用 `FOR UPDATE SKIP LOCKED`、租约与 attempt fencing 防止多 Worker 重复完成 |
| 安静时段 | 按 Asia/Shanghai 执行跨午夜静默，规划时和发送前均检查，安静期结束后再投递 |
| 重试策略 | 408、429、5xx 与网络故障指数退避，最多尝试 5 次；404/410 立即注销失效订阅并取消其余投递 |
| 隐私载荷 | 锁屏仅显示通用提醒文案与 InboxItem ID，不发送任务标题、正文、prompt、endpoint 或密钥 |
| 历史隔离 | 新设备只接收其订阅后产生的 InboxItem，首次启用不会补推全部历史消息 |
| 容器配置 | Worker 显式接收 `CREDENTIAL_MASTER_KEY` 解密订阅/VAPID 私钥，并支持可选 `VAPID_SUBJECT` |
| 错误隔离 | Push Service 请求错误与数据库落账错误分别处理；落账失败交给租约恢复，不伪装成网络故障 |

### 验证方法与结果

- 后台投递专项测试 18 项全部通过，覆盖静默边界、退避上限、幂等、租约 fencing、410/503、落账异常、隐私载荷及历史隔离。
- `npx tsc --noEmit`、`npm run lint`、`git diff --check`：通过。

### localStorage 变化

- 无；投递、租约、重试与设备健康状态均存 PostgreSQL。

## Sprint 2.4d — PWA Push 设置体验

**Commit**: `dc26b36`

### 修改文件

- `web/lib/api/pushClient.ts`
- `web/public/sw.js`
- `web/public/icon.svg`
- `web/app/manifest.ts`
- `web/components/notifications/NotificationSettings.tsx`
- `web/app/notifications/page.tsx`
- `web/app/inbox/page.tsx`
- `web/tests/pushClient.test.ts`
- `web/tests/notificationComponents.test.tsx`
- `web/tests/selfHostingArtifacts.test.ts`
- `web/e2e/notifications.spec.ts`
- `docs/CHANGELOG.md`

### 变更内容

| 功能 | 说明 |
|---|---|
| 权限手势 | 仅在用户点击“在此设备启用”后请求 Notification 权限，不自动弹窗 |
| Service Worker | 接收 Push、显示可见系统通知，并在点击后聚焦或打开对应 InboxItem |
| PWA | 提供 standalone manifest、应用图标和 `/inbox` 启动入口 |
| 通知设置 | `/notifications` 管理全局开关、22:00–08:00 默认安静时段与设备订阅 |
| 设备控制 | 可单独移除设备；全局暂停保留订阅和 Inbox，便于恢复 |
| 移动说明 | 明确提示 iPhone/iPad 需先添加到主屏幕，再从主屏幕应用中授权 |

### 验证方法与结果

- PWA/客户端专项测试 9 项通过；Microsoft Edge E2E 8 项全部通过。
- Next.js 本机及 Docker 生产构建通过，Push API 与 PWA 路由进入生产清单。
- 真实 manifest、Service Worker、Push 配置 API 可访问；VAPID 公钥长度正确且响应未暴露私钥或密文。
- `npx tsc --noEmit`、`npm run lint`、`git diff --check`：通过。

### localStorage 变化

- 无；PushSubscription 由浏览器 PushManager 管理，服务端副本加密存 PostgreSQL。

## Sprint 2.4c — 加密 Push 订阅服务与 API

**Commit**: `2e5b4f4`

### 修改文件

- `web/lib/notifications/pushSecretCipher.ts`
- `web/lib/notifications/pushConfigurationService.ts`
- `web/lib/repositories/notificationRepository.ts`
- `web/lib/api/pushApi.ts`
- `web/app/api/v1/push/config/route.ts`
- `web/app/api/v1/push/preferences/route.ts`
- `web/app/api/v1/push/subscriptions/route.ts`
- `web/app/api/v1/push/subscriptions/[id]/route.ts`
- `web/tests/pushSecretCipher.test.ts`
- `web/tests/notificationRepository.test.ts`
- `web/tests/pushApi.test.ts`
- `docs/CHANGELOG.md`

### 变更内容

| 功能 | 说明 |
|---|---|
| 自动 VAPID | 首次读取配置时生成一次 VAPID 密钥对，公钥可供浏览器订阅，私钥加密存库 |
| 用途隔离加密 | subscription 与 VAPID 私钥使用不同 AES-GCM AAD，阻止密文跨用途替换 |
| 订阅管理 | endpoint SHA-256 去重，完整 endpoint、p256dh 和 auth 作为整体加密载荷保存 |
| 公开状态 | 只返回 VAPID 公钥、通知偏好、设备标签与健康信息，不返回 userId、endpoint、密钥或密文 |
| 偏好并发 | Push 开关和安静时段使用 expectedVersion 乐观锁，避免多端静默覆盖 |
| API 安全 | 严格校验 HTTPS endpoint、base64url key、UUID、时间与未知字段，并使用稳定脱敏错误结构 |

### 验证方法与结果

- `npm test`：37 个测试文件、137 项全部通过。
- 新增测试覆盖 VAPID 稳定性、加密防篡改/用途隔离、订阅幂等、偏好冲突与 API 脱敏。
- `npx tsc --noEmit`、`npm run lint`、`git diff --check`：通过。

### localStorage 变化

- 无；浏览器订阅与偏好通过服务端 API 保存至 PostgreSQL。

## Sprint 2.4b — Push 投递数据模型

**Commit**: `370d626`

### 修改文件

- `web/lib/db/schema.ts`
- `web/drizzle/0005_faithful_mystique.sql`
- `web/drizzle/rollback/0005_faithful_mystique.sql`
- `web/drizzle/meta/0005_snapshot.json`
- `web/drizzle/meta/_journal.json`
- `web/tests/databaseMigrations.test.ts`
- `docs/CHANGELOG.md`

### 变更内容

| 功能 | 说明 |
|---|---|
| VAPID 配置 | 每个用户保存稳定公钥和加密私钥，随 PostgreSQL 备份迁移 |
| 设备订阅 | 保存 endpoint hash、加密订阅载荷、设备标签、失效状态和失败计数 |
| 通知偏好 | 默认 Push 关闭、安静时段 22:00–08:00、时区固定 Asia/Shanghai，并带乐观锁版本 |
| 投递记录 | InboxItem/设备唯一，记录 pending/sending/sent/failed/cancelled、可用时间、attempt 与租约 |
| Inbox 规划 | `push_planned_at` 区分尚未规划与已评估但无需发送的提醒 |
| 回滚 | 最新迁移可删除 Push 相关表、枚举和 Inbox 新列，不破坏原 Inbox 数据 |

### 验证方法与结果

- PostgreSQL 兼容迁移测试覆盖 12 张表、默认偏好、投递唯一性、回滚和重新应用。
- `npm run db:check`、`npx tsc --noEmit`、`npm run lint`、`git diff --check`：通过。

### localStorage 变化

- 无；Push 配置、订阅与投递状态只存 PostgreSQL。

## Sprint 2.4a — Web Push 服务端依赖

**Commit**: `7eb39a1`

### 修改文件

- `web/package.json`
- `web/package-lock.json`
- `docs/CHANGELOG.md`

### 变更内容

| 功能 | 说明 |
|---|---|
| Web Push | 增加 `web-push` 3.6.7，负责标准 VAPID 签名、负载加密与 Push Service 请求 |
| TypeScript | 增加 `@types/web-push` 3.6.4，保持 strict 类型检查 |
| 供应链检查 | 生产依赖审计为 0 漏洞；现有测试工具 Vitest 有 2 个 moderate，修复需跨大版本升级，未进入生产依赖 |

### 验证方法与结果

- `npm audit --omit=dev`：0 vulnerabilities。
- `npx tsc --noEmit`、`git diff --check`：通过。

### localStorage 变化

- 无。

## Sprint 2.3 — Reminder Worker + Durable Inbox 封版

**Commits**: `bc3715b`, `5e48986`, `20598b2`, `c9cda10`, `1f9a807`, `0d9021f`

### 修改文件

- `README.md`
- `PROJECT.md`
- `docker-compose.yml`
- `.env.selfhost.example`
- `scripts/selfhost-restore.ps1`
- `scripts/selfhost-restore.sh`
- `docs/TASKS.md`
- `docs/SELF_HOSTING.md`
- `docs/PRODUCT_TECHNICAL_ROADMAP.md`
- `docs/adr/ADR-032-REMINDER-WORKER-AND-DURABLE-INBOX.md`
- `web/lib/db/schema.ts`
- `web/drizzle/0004_cold_medusa.sql`
- `web/drizzle/rollback/0004_cold_medusa.sql`
- `web/drizzle/meta/0004_snapshot.json`
- `web/drizzle/meta/_journal.json`
- `web/lib/repositories/inboxRepository.ts`
- `web/lib/tasks/reminderWorker.ts`
- `web/scripts/reminder-worker.ts`
- `web/worker-entrypoint.sh`
- `web/Dockerfile`
- `web/package.json`
- `web/.env.example`
- `web/lib/api/inboxApi.ts`
- `web/lib/api/inboxClient.ts`
- `web/app/api/v1/inbox/route.ts`
- `web/app/api/v1/inbox/[id]/route.ts`
- `web/components/inbox/InboxManager.tsx`
- `web/app/inbox/page.tsx`
- `web/components/chat/ChatHeader.tsx`
- `web/app/tasks/page.tsx`
- `web/app/api-key/page.tsx`
- `web/tests/databaseMigrations.test.ts`
- `web/tests/inboxRepository.test.ts`
- `web/tests/reminderWorker.test.ts`
- `web/tests/selfHostingArtifacts.test.ts`
- `web/tests/inboxApi.test.ts`
- `web/tests/inboxClient.test.ts`
- `web/tests/inboxComponents.test.tsx`
- `web/e2e/inbox.spec.ts`
- `docs/CHANGELOG.md`

### 交付结果

Sprint 2.3 已把 Sprint 2.2 的安全认领能力变成可日常使用的后台提醒闭环：独立 Worker 不依赖网页生命周期，普通提醒不依赖模型；Run 成功与 Inbox 写入保持原子性和幂等性；手机页面可读取、筛选和管理结果。系统级 Push、安静时段和通知订阅仍明确留在 Sprint 2.4。

封版审查额外发现并修复数据库还原期间 Worker 未暂停的竞态。Windows 与 Linux 还原脚本现在同时停止和恢复所有写入服务。

### 验证摘要

- 单元/集成测试：34 个文件、128 项通过。
- Microsoft Edge E2E：7 项通过，含任务与 Inbox 的 390×844 移动端流程。
- TypeScript、ESLint、Drizzle Schema 检查、Git whitespace 检查与 Docker 生产构建通过。
- 真实 Docker 链路：临时一次性 Task 被独立 Worker 自动执行，Task 进入 completed，产生唯一 unread InboxItem，随后临时数据清理完成。
- PostgreSQL、Web 容器健康，Worker 常驻运行；日志未出现提醒正文、连接串或 API Key。

### localStorage 变化

- 无。Task、TaskRun 与 InboxItem 均以 PostgreSQL 为事实来源。

### 当前结构快照

```text
web/
├── app/
│   ├── api/v1/tasks/               # Task CRUD API
│   ├── api/v1/inbox/               # Inbox 查询、已读状态与删除 API
│   ├── tasks/                       # 任务管理页面
│   └── inbox/                       # 移动端友好的提醒收件箱
├── lib/
│   ├── repositories/
│   │   ├── schedulerRepository.ts  # Claim、租约与 fencing
│   │   └── inboxRepository.ts      # Run + Inbox 原子完成
│   └── tasks/reminderWorker.ts      # 可测试的批次与常驻循环
├── scripts/reminder-worker.ts       # Worker 进程入口
└── worker-entrypoint.sh             # 容器迁移后启动 Worker
```

## Sprint 2.3e — 数据库还原期间暂停 Worker

**Commit**: `1f9a807`

### 修改文件

- `scripts/selfhost-restore.ps1`
- `scripts/selfhost-restore.sh`
- `web/tests/selfHostingArtifacts.test.ts`
- `docs/CHANGELOG.md`

### 变更内容

- Windows 与 Linux 还原脚本在重建数据库前同时停止 Web 和 Reminder Worker，成功还原后同时恢复两者。
- 避免 Worker 在 `DROP SCHEMA`、导入备份期间认领任务或写入提醒。
- 自动化断言固定“停写必须早于破坏性 SQL，Web/Worker 必须共同恢复”的顺序。

### 验证方法与结果

- `npx vitest run tests/selfHostingArtifacts.test.ts`：4 项全部通过。
- `npx tsc --noEmit`、`npm run lint`、PowerShell 脚本语法解析、`git diff --check`：通过。
- 出于数据安全考虑，未对用户当前数据库执行破坏性的真实还原。

### localStorage 变化

- 无。

## Sprint 2.3d — 提醒收件箱体验

**Commit**: `c9cda10`

### 修改文件

- `web/lib/api/inboxApi.ts`
- `web/lib/api/inboxClient.ts`
- `web/app/api/v1/inbox/route.ts`
- `web/app/api/v1/inbox/[id]/route.ts`
- `web/components/inbox/InboxManager.tsx`
- `web/app/inbox/page.tsx`
- `web/components/chat/ChatHeader.tsx`
- `web/app/tasks/page.tsx`
- `web/app/api-key/page.tsx`
- `web/tests/inboxApi.test.ts`
- `web/tests/inboxClient.test.ts`
- `web/tests/inboxComponents.test.tsx`
- `web/e2e/inbox.spec.ts`
- `docs/CHANGELOG.md`

### 变更内容

| 功能 | 说明 |
|---|---|
| Inbox API | 支持 all/unread/read 列表、已读状态切换和删除，响应禁用缓存并带 request ID |
| 安全错误 | 严格校验 UUID、筛选值和 JSON；内部数据库错误不会返回给浏览器 |
| 移动端页面 | 新增 `/inbox`，以单列卡片展示提醒，支持筛选、刷新、已读/未读和删除 |
| 自动刷新 | 页面打开时每 15 秒读取一次，手动刷新仍可立即同步 |
| 导航入口 | 对话、任务和 API 配置页均可进入收件箱；窄屏导航缩短标签避免挤压 |
| 时间语义 | 提醒时间统一按 Asia/Shanghai 展示，正文按纯文本安全渲染 |

### 验证方法与结果

- `npm test`：34 个测试文件、128 个测试全部通过。
- `npx tsc --noEmit`、`npm run lint`、`npm run db:check`、`git diff --check`：通过。
- Docker 生产构建通过；新增 Inbox 页面及两个 API 路由进入生产路由表。
- Microsoft Edge E2E：7 项全部通过，包含 390×844 移动端收件箱完整操作。
- 真实烟雾测试：HTTP 创建一次性任务后，常驻 Worker 将 Task 置为 completed 并生成 unread InboxItem；测试数据已按精确 ID 清理。

### localStorage 变化

- 无；收件箱读写全部通过服务端 API 和 PostgreSQL。

## Sprint 2.3c — 常驻 Reminder Worker

**Commit**: `20598b2`

### 修改文件

- `web/lib/tasks/reminderWorker.ts`
- `web/scripts/reminder-worker.ts`
- `web/worker-entrypoint.sh`
- `web/Dockerfile`
- `docker-compose.yml`
- `web/package.json`
- `web/.env.example`
- `.env.selfhost.example`
- `web/tests/reminderWorker.test.ts`
- `web/tests/selfHostingArtifacts.test.ts`
- `docs/CHANGELOG.md`

### 变更内容

| 功能 | 说明 |
|---|---|
| 常驻执行 | 独立 Worker 按默认 5 秒间隔扫描到期任务，浏览器关闭后仍可运行 |
| 批次隔离 | 单个 Run 暂时失败不会阻止同批其他提醒；失败项依靠租约过期后安全重试 |
| 优雅停止 | Docker 停止时响应 SIGTERM，中断等待并关闭数据库连接 |
| 容器部署 | Compose 新增 `worker` 服务，等待 PostgreSQL 健康并先迁移、后启动 Worker |
| 可配置性 | 支持 Worker ID、轮询间隔、批量大小和租约时长，默认值面向单用户部署 |
| 日志最小化 | 仅输出状态、计数、Run ID 和错误类型，不输出提醒正文或凭据 |

### 验证方法与结果

- `npm test`：31 个测试文件、121 个测试全部通过。
- `npx tsc --noEmit`、`npm run lint`、`git diff --check`：通过。
- `docker compose --env-file .env.selfhost up --build -d`：生产构建通过。
- Web/PostgreSQL 健康；Worker 完成迁移并持续运行；并发迁移锁正常工作。

### localStorage 变化

- 无；Worker 直接通过服务端数据库处理 TaskRun 和 InboxItem。

## Sprint 2.3b — 提醒完成原子事务

**Commit**: `5e48986`

### 修改文件

- `web/lib/repositories/inboxRepository.ts`
- `web/tests/inboxRepository.test.ts`
- `docs/CHANGELOG.md`

### 变更内容

| 功能 | 说明 |
|---|---|
| 原子完成 | 在同一数据库事务内写入 InboxItem 并将 TaskRun 标记为 succeeded，任一步失败都会整体回滚 |
| 租约隔离 | 仅当前 worker、当前 attempt 且租约未过期时允许完成，旧 Worker 无法覆盖新执行结果 |
| 幂等提醒 | 每个 TaskRun 最多对应一个 InboxItem，重复完成不会产生重复提醒 |
| 内容快照 | 提醒保存执行时的标题和正文；原 Task 删除后提醒仍可阅读 |
| 收件箱仓储 | 支持按未读/已读筛选、切换状态与删除，并限定为本地用户数据 |

### 验证方法与结果

- `npm test`：30 个测试文件、118 个测试全部通过。
- 新增 4 项 PostgreSQL 集成测试，覆盖原子完成、幂等、防竞态、已读状态和源任务删除后的快照保留。
- `npx tsc --noEmit`、`npm run lint`、`git diff --check`：通过。

### localStorage 变化

- 无；提醒和 Run 状态仅存 PostgreSQL。

## Sprint 2.3a — Durable Inbox 数据模型

**Commit**: `bc3715b`

### 修改文件

- `web/lib/db/schema.ts`
- `web/drizzle/0004_cold_medusa.sql`
- `web/drizzle/rollback/0004_cold_medusa.sql`
- `web/drizzle/meta/0004_snapshot.json`
- `web/drizzle/meta/_journal.json`
- `web/tests/databaseMigrations.test.ts`
- `docs/CHANGELOG.md`

### 变更内容

| 功能 | 说明 |
|---|---|
| InboxItem | 保存提醒标题、正文快照、计划发生时间、未读/已读状态和读取时间 |
| 持久性 | 删除原 Task/TaskRun 时外键设为 null，已经产生的 Inbox 提醒继续保留 |
| 幂等关联 | `task_run_id` 唯一，阻止同一 Run 生成多个 InboxItem |
| 查询索引 | 按用户、状态和发生时间支持收件箱读取 |
| 数据约束 | read 状态必须有 readAt，unread 状态必须没有 readAt；source 当前固定 reminder |
| 回滚 | `0004_cold_medusa.sql` 可独立删除 Inbox 表和枚举并重新应用 |

### 验证方法与结果

- 迁移测试覆盖 8 张表、Inbox 外键持久性、最新迁移回滚与重新应用。
- `npm run db:check`、`npx tsc --noEmit`、`npm run lint`、`git diff --check`：通过。

### localStorage 变化

- 无；Inbox 仅存 PostgreSQL。

## Sprint 2.2 — Scheduler Claim 与幂等 Run 封版

**Commits**: `116571e`, `6b72cf1`, `b9e0624`

### 修改文件

- `web/lib/tasks/schedule.ts`
- `web/lib/repositories/taskRepository.ts`
- `web/lib/repositories/schedulerRepository.ts`
- `web/scripts/scheduler-claim.ts`
- `web/package.json`
- `web/tests/schedulerRepository.test.ts`
- `web/tests/databaseMigrations.test.ts`
- `web/tests/selfHostingArtifacts.test.ts`
- `docs/TASKS.md`
- `docs/adr/ADR-031-SCHEDULER-CLAIM-LEASE-AND-CATCHUP.md`
- `docs/PRODUCT_TECHNICAL_ROADMAP.md`
- `PROJECT.md`
- `README.md`
- `docs/CHANGELOG.md`

### 变更内容

| 功能 | 说明 |
|---|---|
| 并发 Claim | `FOR UPDATE SKIP LOCKED` 让多个 Worker 安全争抢不同记录 |
| 唯一执行事实 | Task/计划时间唯一约束阻止重复 Run，Run 与 Task 推进在同一事务 |
| 崩溃恢复 | 过期租约可接管同一 Run，attempt 递增并隔离旧 Worker 写入 |
| 补偿策略 | 关机错过的重复任务合并成一次补偿，下一时间保持原规则且落在未来 |
| 用户控制 | 编辑或暂停 Task 取消未完成旧 Run |
| 运行入口 | Docker 或本机可执行 `npm run scheduler:claim` 单次扫描；不泄露任务正文或凭据 |
| 当前边界 | 未加入常驻 Worker、Inbox 和通知，因此任务仍不会自动提醒用户 |

### 验证方法与结果

- `npm test`：29 个测试文件、114 个测试全部通过。
- `npx tsc --noEmit`、`npm run lint`、`npm run db:check`、`git diff --check`：通过。
- Microsoft Edge E2E：6 项全部通过；Windows 上测试结束后残留的 Next.js 开发子进程已显式终止。
- Docker 生产构建完成 Next.js 编译和 TypeScript 检查，Web/PostgreSQL 容器健康。
- 独立 PostgreSQL 测试库中两个 Worker 并发扫描，认领数量为 `1 + 0`，Task 进入 completed 且 Run 总数为 1。
- 将该 Run 租约设为过期后，第三个 Worker 接管同一 Run ID，attempt 从 1 增至 2，Run 总数仍为 1。
- 两个明确命名的隔离测试库均已删除；主数据库已有用户任务未被测试 Worker 认领或修改。

### localStorage 变化

- 无；Scheduler 状态仅存 PostgreSQL。

### 当前结构快照

```text
web/
├── app/api/v1/tasks/                 # Task CRUD HTTP API
├── app/tasks/                        # 任务管理 UI
├── lib/repositories/
│   ├── taskRepository.ts             # 用户编辑与取消旧 Run
│   └── schedulerRepository.ts        # Claim、租约、fencing 与终态
├── lib/tasks/schedule.ts             # 时间规则与下一次计划
├── scripts/scheduler-claim.ts        # 单次安全扫描入口
└── tests/schedulerRepository.test.ts # 调度状态机集成测试
```

## Sprint 2.2c — PostgreSQL 时间精度原子性修复

**Commit**: `b9e0624`

### 修改文件

- `web/lib/repositories/schedulerRepository.ts`
- `web/tests/schedulerRepository.test.ts`
- `docs/CHANGELOG.md`

### 变更内容

| 功能 | 说明 |
|---|---|
| 根因 | PostgreSQL `timestamptz` 保留微秒，而 JavaScript `Date` 只有毫秒；用时间相等条件更新 Task 会在真实库失配 |
| 修复 | 已持有 Task 行锁时改用整数 `version` 护栏，不再比较往返后丢失精度的时间 |
| 原子回滚 | Run 插入后若 Task 未推进会抛出 `TASK_ADVANCE_FAILED`，整个事务回滚，不留下半完成状态 |
| 中断修复 | 若唯一 Run 已存在而 Task 仍停留在到期时间，扫描会推进 Task 且不创建第二个 Run |

### 验证方法与结果

- PGlite Scheduler 测试增至 6 项，新增“已有唯一 Run 时修复到期 Task”路径。
- `npx tsc --noEmit`、`npm run lint`、`git diff --check`：通过。
- 真实 PostgreSQL 首次并发验收准确暴露该问题；修复后的隔离库复验在后续部署记录中给出。

### localStorage 变化

- 无。

## Sprint 2.2b — Scheduler 单次认领命令

**Commit**: `6b72cf1`

### 修改文件

- `web/scripts/scheduler-claim.ts`
- `web/package.json`
- `web/tests/selfHostingArtifacts.test.ts`
- `docs/CHANGELOG.md`

### 变更内容

| 功能 | 说明 |
|---|---|
| 运行入口 | `npm run scheduler:claim` 执行一次到期 Run 批量认领，供 Docker 验收和下一阶段 Worker 复用 |
| 参数 | 支持 `SCHEDULER_WORKER_ID`、`SCHEDULER_BATCH_SIZE`、`SCHEDULER_LEASE_MS` 环境变量 |
| 日志边界 | 仅输出 Worker/Run/Task ID、attempt、计划时间和租约，不输出任务标题、正文、Key 或连接串 |
| 生命周期 | 命令完成后主动关闭数据库连接，不创建常驻轮询进程 |

### 验证方法与结果

- `tests/selfHostingArtifacts.test.ts` 与 `tests/schedulerRepository.test.ts` 共 9 项测试通过。
- `npx tsc --noEmit`、`npm run lint`、`git diff --check`：通过。

### localStorage 变化

- 无。

## Sprint 2.2a — 幂等 TaskRun Claim 与租约状态机

**Commit**: `116571e`

### 修改文件

- `web/lib/tasks/schedule.ts`
- `web/lib/repositories/taskRepository.ts`
- `web/lib/repositories/schedulerRepository.ts`
- `web/tests/schedulerRepository.test.ts`
- `web/tests/databaseMigrations.test.ts`
- `docs/CHANGELOG.md`

### 变更内容

| 功能 | 说明 |
|---|---|
| 到期认领 | PostgreSQL 事务使用 `FOR UPDATE SKIP LOCKED` 锁定到期 Task，并原子创建唯一 TaskRun |
| 幂等防线 | `(task_id, scheduled_for)` 冲突不重复创建；Task 推进与 Run 创建处于同一事务 |
| 错过补偿 | 迟到的重复任务只产生一个补偿 Run，下一次时间直接推进到当前时间之后，避免补发风暴 |
| 租约恢复 | `claimed/running` Run 租约过期后可由其他 Worker 重新认领并递增 attempt |
| Fencing | start、续租和结束均校验 Worker、attempt 与有效租约，旧 Worker 不能覆盖新 Worker |
| 用户修改 | Task 编辑或暂停会取消未完成的旧 Run，阻止执行过期内容 |
| 终态 | 支持 `succeeded` 与 `failed` 结果，终态清空租约并保留审计字段 |

### 验证方法与结果

- Scheduler 测试覆盖迟到重复任务、单次完成、租约回收、旧 attempt 隔离、续租、成功/失败终态及任务修改取消。
- `npm test`：29 个测试文件、113 个测试全部通过。
- `npx tsc --noEmit`、`npm run lint`、`npm run db:check`、`git diff --check`：通过。
- PGlite 迁移集成测试在全量并行时采用 10 秒上限，避免资源竞争导致原 5 秒阈值偶发超时；单独复测耗时约 1 秒。

### localStorage 变化

- 无。

## Sprint 2.1b–2.1c — 任务规则、CRUD API 与管理页面

**Commit**: `9bff029`

### 修改文件

- `web/lib/tasks/schedule.ts`
- `web/lib/repositories/taskRepository.ts`
- `web/lib/api/taskApi.ts`
- `web/lib/api/taskClient.ts`
- `web/app/api/v1/tasks/route.ts`
- `web/app/api/v1/tasks/[id]/route.ts`
- `web/app/tasks/page.tsx`
- `web/components/tasks/TaskManager.tsx`
- `web/components/chat/ChatHeader.tsx`
- `web/app/api-key/page.tsx`
- `web/playwright.config.ts`
- `web/tests/taskSchedule.test.ts`
- `web/tests/taskRepository.test.ts`
- `web/tests/taskApi.test.ts`
- `web/tests/taskClient.test.ts`
- `web/tests/taskComponents.test.tsx`
- `web/e2e/tasks.spec.ts`
- `docs/TASKS.md`
- `docs/adr/ADR-030-TASK-DOMAIN-AND-SCHEDULE-RULES.md`
- `docs/PRODUCT_TECHNICAL_ROADMAP.md`
- `PROJECT.md`
- `README.md`
- `docs/CHANGELOG.md`

### 变更内容

| 功能 | 说明 |
|---|---|
| 时间规则 | 固定 `Asia/Shanghai`，服务端计算单次、每日、每周规则的下一次 UTC 时间 |
| Repository | 固定本地用户、事务更新、乐观版本锁与级联删除 |
| CRUD API | `/api/v1/tasks` 提供严格校验的创建、列表、详情、修改、暂停/恢复和删除 |
| 管理页面 | `/tasks` 提供响应式任务表单与列表，适配 390px 手机视口 |
| 安全边界 | 不接受客户端 User ID/nextRunAt，内部错误脱敏，仍限定 localhost/Tailscale 私网 |
| 运行边界 | 本 Sprint 不自动执行任务；Scheduler、幂等 Run 与错过任务补偿留给 2.2 |

### 验证方法与结果

- `npm test`：28 个测试文件、108 个测试全部通过。
- `npm run lint`、`npx tsc --noEmit`、`git diff --check`：通过。
- Microsoft Edge E2E：6 项全部通过；其中新增 390×844 手机视口下创建、编辑、暂停、删除闭环。
- Docker 生产镜像成功完成 Next.js 编译、TypeScript 检查与页面生成；新 Web 容器健康。
- Docker PostgreSQL 已应用 `0003_aspiring_victor_mancha.sql`，Task/TaskRun 表存在；真实 API 创建、列表、暂停、删除闭环通过且验收数据已清除。
- Tailscale Serve 仍以 tailnet-only 模式把 HTTPS 根路径代理到 `http://localhost:3000`。

### localStorage 变化

- 无；Task 与未来 TaskRun 只存 PostgreSQL。

### 当前结构快照

```text
web/
├── app/api/v1/tasks/        # Task HTTP 路由
├── app/tasks/               # 任务管理页
├── components/tasks/        # 响应式 CRUD UI
├── lib/api/                 # Task API 服务与浏览器 Client
├── lib/repositories/        # PostgreSQL Task Repository
├── lib/tasks/               # 时间规则领域逻辑
└── tests + e2e/             # 规则、数据、API、UI 与手机闭环
```

## Sprint 2.1a — Task/TaskRun 数据模型

**Commit**: `8d25166`

### 修改文件

- `web/lib/db/schema.ts`
- `web/drizzle/0003_aspiring_victor_mancha.sql`
- `web/drizzle/rollback/0003_aspiring_victor_mancha.sql`
- `web/drizzle/meta/0003_snapshot.json`
- `web/drizzle/meta/_journal.json`
- `web/tests/databaseMigrations.test.ts`
- `docs/CHANGELOG.md`

### 变更内容

| 功能 | 说明 |
|------|------|
| ScheduledTask | 保存单次、每日、每周提醒的结构化计划、状态、时区和 `nextRunAt` |
| TaskRun | 保存未来每次执行的状态、租约、结果、错误与通知时间 |
| 幂等约束 | `(task_id, scheduled_for)` 唯一，阻止同一计划时间产生重复 Run |
| 调度索引 | 支持按用户、任务状态和下一次执行时间查找到期任务 |
| 数据约束 | Active 任务必须具有 `nextRunAt`，版本和执行次数必须为正数 |
| 回滚 | 最新迁移可独立删除 TaskRun、ScheduledTask 和对应枚举并重新应用 |

### 验证方法与结果

- `npm run db:check`：Schema 与迁移快照一致。
- 迁移测试覆盖 7 张表、默认值、Run 唯一约束、回滚和重新应用。
- `npm test`：23 个测试文件、94 个测试全部通过。
- `npx tsc --noEmit`、`git diff --check`：通过。

### localStorage 变化

- 无；任务数据只进入 PostgreSQL。

## 移动端 Chat — 可折叠对话抽屉

**Commit**: `c7565e6`

### 为什么

固定 256px 桌面侧栏在手机上持续占用横向空间，导致消息与输入区过窄；触屏设备也无法可靠触发依赖 hover 的会话删除按钮。

### 怎么做

- `md` 以下默认隐藏会话侧栏，在顶部提供“打开对话列表”菜单图标。
- 会话历史以 Tailwind 覆盖式抽屉呈现，支持遮罩、关闭按钮和 Escape 关闭。
- 选择或新建对话后自动收起抽屉，手机抽屉中的删除按钮始终可见。
- 桌面端继续显示固定侧栏，不改变原有会话树和分支行为。
- 缩小手机端消息区、Header 和 Composer 横向留白，并为主区域与输入框增加防溢出约束。
- 端到端测试显式模拟模型错误，不再依赖或消耗个人真实 Provider 配置。

### 修改文件

- `web/app/chat/page.tsx`
- `web/components/chat/ChatComposer.tsx`
- `web/components/chat/ChatHeader.tsx`
- `web/components/chat/MessageList.tsx`
- `web/components/chat/SessionSidebar.tsx`
- `web/e2e/chat.spec.ts`
- `web/tests/chatComponents.test.tsx`
- `docs/CHANGELOG.md`

### 验证方法与结果

- 390×844 手机视口验证侧栏默认不存在、主区宽度至少 380px、抽屉打开/新建/收起/关闭完整闭环。
- Microsoft Edge E2E：5 项全部通过，覆盖会话生命周期、移动抽屉、分支重试、数学渲染和凭据设置。
- `npm test`：23 个测试文件、93 个测试全部通过。
- `npm run lint`、`npx tsc --noEmit`、Docker 生产构建和 `git diff --check`：通过。
- Docker Web/PostgreSQL 健康，Tailscale HTTPS 地址继续代理最新 Web 容器。

### localStorage 变化

- 无。

## Provider 稳定性 — 临时 DNS 故障重试

**Commits**: `7b9f63b`, `70ee91d`

### 为什么

Docker 中的 DeepSeek 配置、Key 和模型均有效，但一次 `getaddrinfo EAI_AGAIN` 会在建立上游请求前立即终止 SSE。短暂 DNS 抖动不应直接表现为模型不可用。

### 怎么做

- 仅识别 Node.js `fetch` 的 `EAI_AGAIN` 临时 DNS 错误，聊天流与 `/api-key` Provider 测试共享同一策略。
- 首次失败后以 100ms、300ms 退避，最多执行 3 次 DNS 建连尝试。
- 用户取消会立即终止等待；认证、限流、模型不存在及其他 HTTP 响应完全不重试。
- 安全日志只记录固定错误码和尝试次数，不记录 Key、消息、URL 或上游正文。

### 修改文件

- `web/lib/ai/server/modelProvider.ts`
- `web/lib/ai/server/modelCredentialService.ts`
- `web/lib/ai/server/providerFetch.ts`
- `web/tests/modelCredentialService.test.ts`
- `web/tests/modelProvider.test.ts`
- `docs/CHANGELOG.md`

### 验证方法与结果

- 容器内实际调用 DeepSeek `/chat/completions` 返回 HTTP 200，确认现有 Base URL、Key 与模型名可用。
- 新增“首次 EAI_AGAIN、第二次成功”的流式响应测试，并验证仅执行一次安全告警。
- `npm test`：23 个测试文件、94 个测试全部通过。
- `npm run build`、`npm run lint`、`npx tsc --noEmit`、`git diff --check`：通过。

## Credential Vault 3/3 — 前端设置页与 Docker 集成

**Commit**: `57d229c`

### 为什么

数据层与服务端 API 完成后，仍需要一个用户可操作但不可回读明文的配置入口，并确保 Docker 自托管环境具备独立的凭据主密钥。该任务完成从网页测试、加密保存到模型运行时使用的闭环。

### 怎么做

- 将 `/api-key` 从只读环境状态页改为写入式凭据设置页，支持测试、保存、替换和删除。
- 表单明文只保留在 React 组件状态和当次请求内，保存成功后清空；页面只展示末四位提示。
- 增加类型化前端 Client、状态反馈、危险删除确认和旧 localStorage 凭据清理。
- Docker Compose 强制要求 `CREDENTIAL_MASTER_KEY`，模型 `AI_*` 变量改为可选兜底。
- 自托管示例加入主密钥占位，且真实 `.env.selfhost` 继续由 Git 忽略。

### 修改文件

- `.env.selfhost.example`
- `docker-compose.yml`
- `web/.env.example`
- `web/app/api-key/page.tsx`
- `web/components/config/ModelCredentialSettings.tsx`
- `web/e2e/credential.spec.ts`
- `web/lib/api/modelCredentialClient.ts`
- `web/tests/modelCredentialClient.test.ts`
- `web/tests/modelCredentialSettings.test.tsx`
- `web/tests/selfHostingArtifacts.test.ts`
- `docs/CHANGELOG.md`

### 代码与功能

| 功能 | 说明 |
|------|------|
| 凭据设置页 | 填写 Base URL、Model、Key；测试不落库，保存后清空 Key 输入 |
| 公开状态 | 只显示配置来源、Provider、模型、Base URL、版本与 Key 末四位 |
| 删除与回退 | 删除存储凭据后，若服务器存在完整 `AI_*` 则回退环境变量 |
| Docker 主密钥 | 容器启动时强制注入 `CREDENTIAL_MASTER_KEY`，不烘焙进镜像 |
| 防泄露验证 | 真容器写入一次性假 Key 后，数据库仅出现 AES-GCM 信封且不含明文 |

### 验证方法与结果

- `npm test`：23 个测试文件、92 个测试全部通过。
- `npm run test:e2e`（Microsoft Edge）：4 个端到端测试全部通过，其中包括凭据测试、保存和删除闭环。
- `npm run build`、`npm run lint`、`npx tsc --noEmit`、`npm run db:check`、`git diff --check`：通过。
- Docker Desktop 实机构建、迁移 `0002_goofy_smasher.sql`、双容器健康检查和 API/数据库集成检查通过；一次性假凭据已在验证后删除。

### localStorage 变化

- 不新增 Key；旧 `agent_api_key`、`agent_api_base_url`、`agent_api_model` 会被清理。

## Credential Vault 2/3 — 安全凭据 API 与模型运行时

**Commit**: `ac006c0`

### 为什么

加密表本身不能形成产品能力；浏览器需要一个严格、不可回读明文的服务端接口，聊天、健康检查和未来 Scheduler 也必须统一从同一个解析边界取得模型配置，避免再次依赖前端逐请求携带 Key。

### 怎么做

- 新增凭据状态、保存、删除和 Provider `/models` 连接测试接口。
- 严格校验 JSON、字段数量、长度、HTTPS URL，并拒绝 URL 内嵌账号密码。
- Provider 测试限制 10 秒，只返回连接与模型可用性，不转发上游响应正文。
- 模型流与健康检查异步解析数据库凭据；没有存储记录时兼容回退服务端环境变量。
- 状态、错误与日志均不返回 API Key、加密信封、数据库细节或上游正文。

### 修改文件

- `web/app/api/v1/model/config/route.ts`
- `web/app/api/v1/model/credentials/route.ts`
- `web/app/api/v1/model/credentials/test/route.ts`
- `web/lib/ai/server/modelConfig.ts`
- `web/lib/ai/server/modelCredentialService.ts`
- `web/lib/api/healthApi.ts`
- `web/lib/api/modelApi.ts`
- `web/lib/api/modelCredentialApi.ts`
- `web/tests/healthApi.test.ts`
- `web/tests/modelApi.test.ts`
- `web/tests/modelCredentialApi.test.ts`
- `web/tests/modelCredentialService.test.ts`
- `web/tests/modelProvider.test.ts`
- `docs/CHANGELOG.md`

### 代码与功能

| 功能 | 说明 |
|------|------|
| `GET /api/v1/model/credentials` | 返回来源、Provider、Base URL、Model、Key 末四位提示和版本 |
| `PUT /api/v1/model/credentials` | 接收一次明文输入，在服务端加密并只返回公开状态 |
| `DELETE /api/v1/model/credentials` | 删除数据库凭据；环境变量兜底不受影响 |
| `POST /api/v1/model/credentials/test` | 用临时输入查询 Provider 模型列表，不写数据库 |
| 运行时解析 | 存储凭据优先、环境变量兜底；后台任务可复用同一入口 |
| 故障隔离 | 凭据存储异常时健康检查返回安全 503，配置接口返回稳定错误结构 |

### 验证方法与结果

- `npm test`：21 个测试文件、89 个测试全部通过。
- API 测试覆盖未知字段、HTTP/内嵌认证 URL、主密钥缺失和响应不泄密。
- Service 测试覆盖加密保存、服务端解密、模型列表检测和上游认证错误映射。
- `npm run lint`、`npx tsc --noEmit`、`npm run build`、`git diff --check`：通过。

### localStorage 变化

- 无；明文 Key 只存在于设置请求和短暂服务端内存中。

## Credential Vault 1/3 — 加密凭据数据层

**Commit**: `42aabd7`

### 为什么

模型配置此前只能从服务端环境变量读取，未实现项目原始的 BYOK 设置流程；直接恢复浏览器 localStorage 又会重新引入 XSS、跨设备和后台任务无法取 Key 的问题。本任务先建立只在服务端解密的持久化地基。

### 怎么做

- 新增单用户、按 Provider 唯一的 `model_credentials` 表及可回滚迁移。
- API Key 使用 AES-256-GCM、随机 96-bit IV、128-bit Auth Tag 和固定 AAD 加密，密文采用带版本信封格式。
- 数据库只保存密文、末四位提示、加密主密钥版本与乐观版本，不保存明文。
- Repository 提供读取、原位 upsert 与删除，并始终约束固定本地用户和 `openai-compatible` Provider。

### 修改文件

- `web/drizzle/0002_goofy_smasher.sql`
- `web/drizzle/meta/0002_snapshot.json`
- `web/drizzle/meta/_journal.json`
- `web/drizzle/rollback/0002_goofy_smasher.sql`
- `web/lib/ai/server/credentialCipher.ts`
- `web/lib/db/schema.ts`
- `web/lib/repositories/modelCredentialRepository.ts`
- `web/tests/credentialCipher.test.ts`
- `web/tests/databaseMigrations.test.ts`
- `web/tests/modelCredentialRepository.test.ts`
- `docs/CHANGELOG.md`

### 代码与功能

| 功能 | 说明 |
|------|------|
| 加密信封 | `v1.iv.authTag.ciphertext`，认证加密可拒绝篡改或错误主密钥 |
| Schema | 用户/Provider 唯一、级联删除、正数版本约束和完整时间戳 |
| Repository | 单用户凭据读取、替换和删除；更新不产生重复行 |
| 回滚 | 最新迁移可独立删除 `model_credentials` 并重新应用 |

### 验证方法与结果

- `npm test`：19 个测试文件、80 个测试全部通过。
- 加密测试：明文不进入信封、正确解密、篡改拒绝、非法主密钥拒绝。
- Repository 测试：唯一记录 upsert、版本递增、删除幂等、存储值无测试明文。
- `npm run db:check`、`npm run lint`、`npx tsc --noEmit`、`npm run build`：通过。

### localStorage 变化

- 无；API Key 不恢复到浏览器存储。

## Sprint 1.5.1 — Docker 迁移入口兼容修复

**Commit**: `c91a58d`

### 为什么

首次真实 Docker Desktop 演练发现，生产镜像中的 `tsx` 将迁移入口按 CommonJS 输出处理，原有顶层 `await` 无法转换，导致 Web 容器在数据库健康后循环重启。此前静态 Compose 检查、PGlite 迁移测试与宿主机构建均未覆盖这一容器运行时差异。

### 怎么做

- 将迁移与回滚入口收进显式异步 `main()`，避免依赖顶层 `await`。
- 在入口末尾统一捕获错误并设置失败退出码，同时继续通过 `finally` 关闭数据库连接。
- 增加自托管制品回归断言，防止迁移入口重新引入 CommonJS 不兼容写法。

### 修改文件

- `web/scripts/db-migrate.ts`
- `web/scripts/db-rollback.ts`
- `web/tests/selfHostingArtifacts.test.ts`
- `docs/CHANGELOG.md`

### 代码与功能

| 功能 | 说明 |
|------|------|
| 容器启动 | PostgreSQL 健康后可执行全部迁移并启动 Next.js，不再循环重启 |
| 回滚入口 | 与迁移入口保持相同的 CommonJS 兼容生命周期和失败退出语义 |
| 回归保护 | 静态检查两个命令入口均使用 `main()` 和显式错误捕获 |

### 验证方法与结果

- `npm test`：17 个测试文件、76 个测试全部通过。
- `npm run lint`、`npx tsc --noEmit`：通过。
- `npm run build`：受限网络首次因 Google Fonts 获取失败；在允许网络后通过。
- `docker compose --env-file .env.selfhost up --build -d`：真实 Docker Desktop 构建并启动成功。
- PostgreSQL 容器 `healthy`；Web 容器 `healthy`，仅映射 `127.0.0.1:3000`。
- 容器日志确认应用 `0000_easy_joystick.sql`、`0001_perfect_typhoid_mary.sql` 后启动 Next.js。
- `/api/v1/health` 返回 `degraded`：数据库 `ready`，模型凭据按计划尚未配置。

### localStorage 变化

- 无。

## Sprint 1.5 — Docker Compose 单用户自托管基线

**Commit**: `c42bbdc`

### 为什么

开发服务器与独立 localStorage 无法让笔记本稳定承担个人服务端，也不能形成可重复的云迁移、健康检查和备份恢复流程。本 Sprint 把 Web/API 与 PostgreSQL 组合为默认安全的单机部署单元。

### 怎么做

- Compose 编排 Next.js 与 PostgreSQL；数据库只在内部网络提供服务并使用命名卷。
- Web 默认绑定 localhost，等待数据库健康，入口脚本先执行版本化迁移再启动生产服务。
- 新增不泄密的 readiness 健康端点，区分 healthy、degraded 与 unhealthy。
- 提供 PowerShell/POSIX `pg_dump` 备份与显式确认恢复脚本，恢复期间停止 Web 写入。
- 真实环境文件和备份被 Git/Docker build context 排除，Shell 文件固定 LF。

### 修改文件

- `.env.selfhost.example`
- `.gitattributes`
- `.gitignore`
- `PROJECT.md`
- `README.md`
- `docker-compose.yml`
- `docs/CHANGELOG.md`
- `docs/DATABASE_OPERATIONS.md`
- `docs/PHASE_1_COMPLETION_REPORT.md`
- `docs/PRODUCT_TECHNICAL_ROADMAP.md`
- `docs/SELF_HOSTING.md`
- `docs/SERVER_DATA_API.md`
- `docs/adr/ADR-028-COMPOSE-SELF-HOSTING-BASELINE.md`
- `scripts/selfhost-backup.ps1`
- `scripts/selfhost-backup.sh`
- `scripts/selfhost-restore.ps1`
- `scripts/selfhost-restore.sh`
- `web/.dockerignore`
- `web/.gitignore`
- `web/Dockerfile`
- `web/app/api/v1/health/route.ts`
- `web/docker-entrypoint.sh`
- `web/lib/api/healthApi.ts`
- `web/tests/healthApi.test.ts`
- `web/tests/selfHostingArtifacts.test.ts`

### 代码与功能

| 功能 | 说明 |
|------|------|
| Compose 拓扑 | Web/PostgreSQL 健康依赖、重启策略和持久卷；数据库无宿主机端口 |
| 安全默认 | Web 默认 `127.0.0.1`，密钥由未提交环境注入，容器启用 no-new-privileges |
| 启动迁移 | 数据库 ready 后先运行 `db:migrate`，失败时不启动不兼容应用 |
| 健康检查 | 数据库决定 readiness；模型缺失为 degraded；错误与 Secret 不进入响应 |
| 备份 | Windows 与 POSIX 脚本生成带时间戳的 plain SQL dump |
| 恢复 | 文件存在/非空校验、显式确认、停止 Web、重建 Schema、SQL 失败即停、成功后重启 |
| 云迁移 | 同一容器、环境变量和 Schema 可迁移，公网鉴权/TLS 仍明确在范围外 |

### 验证方法与结果

- `npm test -- --run`：17 个测试文件、75 个测试全部通过。
- 自托管专项测试：验证数据库无端口、持久卷、localhost 默认、健康依赖、迁移顺序、Secret 排除和恢复确认。
- `npx tsc --noEmit --pretty false`、`npm run lint`、`npm run build`：通过。
- `npm run db:check` 与 `npm run db:generate`：通过且无未生成 Schema 变化。
- Compose 由 PyYAML 成功解析为 `postgres`、`web` 两个服务。
- 两份 PowerShell 脚本由 PowerShell AST Parser 成功解析。
- `npm prune --offline --ignore-scripts`：审计 542 个包，0 项已知漏洞。
- 当前机器没有 Docker；WSL/Bash 启动被系统拒绝，因此容器启动、重启恢复、真实 `pg_dump/psql` 与 POSIX 语法仍需在有 Docker 的环境补做实机演练，不能记为通过。

### localStorage 变化

- 本 Sprint 无新增 localStorage 键值变化；服务端事实源沿用 Sprint 1.4 结果。

### 项目结构快照

```text
agent_web/
├── docker-compose.yml              # Web + private PostgreSQL
├── .env.selfhost.example           # 无效示例配置
├── scripts/                        # 跨平台备份/恢复
├── docs/                           # API、迁移、自托管、ADR 与完成报告
└── web/
    ├── app/api/v1/                 # conversations/imports/model/health
    ├── app/chat/                   # PostgreSQL 事实源 Chat UI
    ├── drizzle/                    # 两条 forward/rollback 迁移
    ├── lib/api/                    # 服务端 API 与浏览器 API Clients
    ├── lib/repositories/           # Conversation 与 Legacy Import 边界
    ├── tests/                      # 17 个单元/组件/数据库/部署测试文件
    ├── Dockerfile
    └── docker-entrypoint.sh
```

### 下一步

- Phase 2 Sprint 2.1：建立 Task/TaskRun Schema 与 CRUD UI；在公开网络或多人使用前先完成鉴权。

---

## Sprint 1.4 — 显式旧数据导入与服务端 Chat 事实源

**Commit**: `46231b7`

### 为什么

Sprint 1.2 的数据库与浏览器 localStorage 并行存在，无法跨设备读取同一会话；自动上传旧历史又会违反用户确认原则。本 Sprint 提供安全迁移并结束双事实源状态。

### 怎么做

- Chat 改用 Conversation API 完成读取、创建、删除、消息追加、自动标题与分支切换。
- 浏览器旧会话只用于迁移提示，用户确认前不上传、不删除。
- 导入 API 严格校验树、角色、数量与文本上限，为旧 ID 生成 UUID 映射。
- 新增 `conversation_imports` 收据和唯一约束，重复导入直接跳过。
- 每个会话、消息树、活动叶与收据在同一事务提交；失败保留 localStorage 源。

### 修改文件

- `PROJECT.md`
- `README.md`
- `docs/CHANGELOG.md`
- `docs/DATABASE_OPERATIONS.md`
- `docs/LEGACY_DATA_IMPORT.md`
- `docs/PRODUCT_TECHNICAL_ROADMAP.md`
- `docs/SERVER_DATA_API.md`
- `docs/adr/ADR-027-EXPLICIT-LEGACY-DATA-IMPORT.md`
- `web/app/api/v1/conversations/[id]/route.ts`
- `web/app/api/v1/imports/local-storage/route.ts`
- `web/app/chat/page.tsx`
- `web/drizzle/0001_perfect_typhoid_mary.sql`
- `web/drizzle/meta/0001_snapshot.json`
- `web/drizzle/meta/_journal.json`
- `web/drizzle/rollback/0001_perfect_typhoid_mary.sql`
- `web/e2e/chat.spec.ts`
- `web/lib/api/conversationApi.ts`
- `web/lib/api/conversationClient.ts`
- `web/lib/api/legacyImportApi.ts`
- `web/lib/api/legacyImportClient.ts`
- `web/lib/db/schema.ts`
- `web/lib/repositories/conversationRepository.ts`
- `web/lib/repositories/legacyImportRepository.ts`
- `web/tests/conversationApi.test.ts`
- `web/tests/conversationClient.test.ts`
- `web/tests/databaseMigrations.test.ts`
- `web/tests/legacyImport.test.ts`
- `web/tests/legacyImportClient.test.ts`

### 代码与功能

| 功能 | 说明 |
|------|------|
| 服务端 Chat | PostgreSQL 成为会话事实源，浏览器刷新后重新读取完整消息树 |
| 标题持久化 | 首条问题通过带 `expectedVersion` 的 PATCH 保存，避免刷新退回默认标题 |
| 显式迁移 | preview 展示可导入/已导入数量，确认按钮才触发服务端写入 |
| 树保真 | 新 UUID 映射保留父子节点、兄弟回答和活动叶路径 |
| 输入安全 | 拒绝未知字段、重复 ID、缺失父节点、自引用、环路、非法叶和特权消息角色 |
| 幂等收据 | `(user_id, source, source_id)` 唯一，重复请求不复制会话 |
| 失败恢复 | 只有服务端成功后删除 `agent_chat_sessions`，失败可安全重试 |
| 浏览器回归 | HTTP 模拟服务端证明 UI 不再依赖 localStorage 运行时写入 |

### 验证方法与结果

- Sprint 1.4 封版时：15 个测试文件、69 个测试全部通过。
- PGlite 集成覆盖两条真实迁移、树保真、活动分支、重复导入、preview 与非法输入拒绝。
- Conversation API 覆盖标题更新与过期版本冲突；浏览器 Clients 覆盖映射、请求体和失败保留本地源。
- Microsoft Edge E2E 3/3 通过：服务端会话刷新、早期回答分支、显式导入后 KaTeX 渲染。
- TypeScript、Lint、生产构建、Drizzle check/generate 均通过。
- 本 Sprint 未改变依赖锁；沿用 Sprint 1.3 对同一 lockfile 的 0 漏洞结果，并在最终审计再次得到 0。

### localStorage 变化

- `agent_chat_sessions` 不再接收运行时会话写入，只在检测到旧数据时作为待确认迁移源。
- 用户选择“暂不导入”时保留原值；服务端确认导入成功后删除该键。
- 历史模型配置键仍按 Sprint 1.3 规则清除。

### 下一步

- Sprint 1.5：用 Docker Compose 提供可重启、可检查、可备份恢复的笔记本自托管基线。

---

## Sprint 1.3 — 服务端 Model Provider 与 SSE Streaming

**Commit**: `563097e`

### 为什么

此前浏览器直接保存并携带模型 API Key，请求路径既会暴露密钥，也难以统一处理 Provider 差异、流式取消和安全错误。Sprint 1.3 将模型访问收口到 Next.js 服务端，为后续自托管、移动端和多 Provider 扩展建立稳定边界。

### 怎么做

- 用服务端环境变量读取 API Key、Base URL 和模型名，浏览器只能读取脱敏后的配置状态。
- 新增 OpenAI-compatible Provider Adapter，在服务端发起请求并解析 SSE 或 JSON fallback。
- 新增内部 `/api/v1/model/stream` SSE 接口，统一 `meta`、`delta`、`done`、`error` 事件。
- 将浏览器取消信号传播到上游 Provider，并为流式增量使用稳定 assistant 消息 ID，避免重复消息节点。
- 清除历史浏览器模型配置键，配置页改为只读服务端状态页。
- 对输入规模、URL 协议、Provider 状态码和外部错误信息建立显式安全边界。

### 修改文件

- `PROJECT.md`
- `README.md`
- `docs/CHANGELOG.md`
- `docs/PRODUCT_TECHNICAL_ROADMAP.md`
- `docs/SERVER_DATA_API.md`
- `docs/SERVER_MODEL_PROVIDER.md`
- `docs/adr/ADR-026-SERVER-MODEL-STREAMING.md`
- `web/.env.example`
- `web/app/api-key/page.tsx`
- `web/app/api/v1/model/config/route.ts`
- `web/app/api/v1/model/stream/route.ts`
- `web/app/chat/page.tsx`
- `web/components/config/LegacyApiConfigCleanup.tsx`
- `web/e2e/chat.spec.ts`
- `web/lib/ai/chatService.ts`
- `web/lib/ai/server/modelConfig.ts`
- `web/lib/ai/server/modelProvider.ts`
- `web/lib/api/modelApi.ts`
- `web/lib/config.ts`
- `web/tests/chatService.test.ts`
- `web/tests/config.test.ts`
- `web/tests/modelApi.test.ts`
- `web/tests/modelProvider.test.ts`

### 代码与功能

| 功能 | 说明 |
|------|------|
| 服务端密钥 | `AI_API_KEY` 只在 Node.js Runtime 中读取，不进入客户端 bundle、请求体或 localStorage |
| Provider Adapter | 兼容 OpenAI Chat Completions，隔离鉴权、URL、模型和上游响应解析 |
| 内部 SSE | 浏览器仅访问同源接口，以稳定事件协议接收增量文本、完成和安全错误 |
| 取消传播 | 客户端中止读取时，服务端 AbortController 会取消上游请求 |
| 流式 UI | 同一 assistant 节点持续更新，完成后保持相同 ID 和树关系 |
| 错误契约 | 鉴权、限流、模型不存在、请求拒绝、不可用、非法响应使用稳定错误码 |
| 配置安全 | Base URL 默认要求 HTTPS；状态接口只返回 Origin、模型名和缺失字段 |
| 旧配置清理 | Chat 和配置页挂载时移除浏览器中遗留的三个模型配置键 |

### 验证方法与结果

- `npm test -- --run`：12 个测试文件、58 个测试全部通过。
- Provider/API 测试：覆盖密钥不出服务端、HTTP 显式开关、跨 chunk SSE、EOF 尾帧、JSON fallback、限流映射、严格输入校验和取消传播。
- `npx tsc --noEmit --pretty false`：通过。
- `npm run lint`：通过。
- `npm run db:check`：迁移元数据一致。
- `npm run db:generate`：无未生成 Schema 变化；本 Sprint 无数据库迁移。
- `npm run build`：通过；模型配置与流式接口均为 Node.js 动态路由。
- Playwright：3 条 Microsoft Edge 主链路断言全部通过；Windows 下 Next 开发服务在断言完成后保留句柄，测试协调进程由人工结束，因此没有把该次进程退出码记为成功。
- `npm audit --audit-level=high`：0 项已知漏洞。

### localStorage 变化

- 启动时删除 `agent_api_key`、`agent_api_base_url`、`agent_api_model`。
- `agent_chat_sessions` 的结构和读写方式暂时不变；其显式导入将在 Sprint 1.4 完成。

### 下一步

- Sprint 1.4：实现用户确认的 localStorage 会话树导入、幂等去重，并让 Chat UI 使用服务端 Conversation API 作为事实来源。

---

## Sprint 1.2 — Conversation/Message Repository 与 API

**Commit**: `9e522d0`

### 为什么

Sprint 1.1 只有 PostgreSQL Schema 与迁移，Route、未来 Worker 和模型 Runtime 仍缺少统一的数据访问边界。本 Sprint 建立单用户服务端事实数据入口，并把对话树归属、活动叶节点和并发版本规则集中到 Repository，避免各层直接拼接 SQL。

### 怎么做

- 用固定 UUID 建立幂等的本地用户，不允许 API 接收或伪造 `userId`。
- 使用 Drizzle Repository 提供会话创建、列表、详情、删除、消息追加和活动分支切换。
- 消息追加在一个事务中完成 Conversation 行锁、父节点归属校验、Message 写入、active leaf 推进和版本递增。
- 活动分支切换验证同会话、真实叶节点与 `expectedVersion`，拒绝静默并发覆盖。
- Next.js Node.js Route Handler 提供 `/api/v1`，Zod 负责严格输入校验，统一错误结构、Request ID 和 `no-store`。
- 保持现有 Chat/localStorage 不变；旧数据导入仍由 Sprint 1.4 显式处理。

### 修改文件

- `PROJECT.md`
- `README.md`
- `docs/CHANGELOG.md`
- `docs/DATABASE_OPERATIONS.md`
- `docs/PRODUCT_TECHNICAL_ROADMAP.md`
- `docs/SERVER_DATA_API.md`
- `docs/adr/ADR-025-CONVERSATION-REPOSITORY-AND-API.md`
- `web/app/api/v1/conversations/route.ts`
- `web/app/api/v1/conversations/[id]/route.ts`
- `web/app/api/v1/conversations/[id]/messages/route.ts`
- `web/app/api/v1/conversations/[id]/active-leaf/route.ts`
- `web/lib/api/conversationApi.ts`
- `web/lib/db/client.ts`
- `web/lib/repositories/conversationRepository.ts`
- `web/package-lock.json`
- `web/package.json`
- `web/tests/conversationApi.test.ts`
- `web/tests/conversationRepository.test.ts`

### 代码与功能

| 功能 | 说明 |
|------|------|
| 数据库客户端 | 延迟读取 `DATABASE_URL`，复用 Postgres.js 连接池，避免构建阶段连接数据库和开发热更新重复建池 |
| 本地用户 | 固定 UUID + `ON CONFLICT DO NOTHING`，重复请求只保留一个单用户身份锚点 |
| Conversation Repository | 提供列表、创建、完整树详情和级联删除，所有查询限定本地用户 |
| Message 事务 | 校验父节点存在且属于同一会话；消息和活动叶/版本更新共同成功或共同回滚 |
| 分支一致性 | 只允许选择同会话且无子节点的真实叶；非空会话不能清空 active leaf |
| 并发控制 | Conversation 使用行锁和 `version` 乐观锁，过期客户端收到 `VERSION_CONFLICT` |
| HTTP API | 新增 4 个动态路由，覆盖 6 个 Conversation/Message 操作 |
| 输入校验 | 新增并固定 `zod@4.5.4`，严格验证 UUID、枚举、长度、URL 和未知字段 |
| 错误契约 | `{ error: { code, message, retryable, requestId, details? } }`；数据库内部错误不返回客户端 |
| 安全文档 | 明确当前无登录鉴权，只能在本机或可信私有网络使用，不得直接暴露公网 |
| 架构记录 | ADR-025 固化 Repository 边界、固定单用户、树事务、乐观锁和分阶段迁移策略 |

### 验证方法与结果

- `npm test`：10 个测试文件、53 个测试全部通过。
- Repository 集成测试：覆盖跨实例读取、树形兄弟分支、父节点归属、失败回滚、乐观锁、叶节点约束和级联删除。
- API 集成测试：覆盖创建/列表/详情/删除、消息追加、输入错误、版本冲突、Request ID 和数据库初始化失败的安全响应。
- `npm run db:check`：迁移元数据一致。
- `npm run db:generate`：没有未生成的 Schema 变化；本 Sprint 无新增数据库迁移。
- `npx tsc --noEmit --pretty false`：通过。
- `npm run lint`：通过。
- `npm run build`：通过；新增 4 个 Node.js 动态 API 路由，原 4 个静态页面正常生成。
- Playwright：3 个 Microsoft Edge 既有主链路断言全部通过；受限网络下 Google Fonts 使用 fallback。Windows 本机复用的 Next 开发服务器在断言结束后仍保持句柄，本次手动结束测试协调进程，未终止不属于本次任务的既有 Node 进程。
- `npm audit`：0 项已知漏洞。

### localStorage 变化

- 键名和值结构均无变化。
- Chat UI 仍使用 `agent_chat_sessions`；数据库 API 与浏览器数据暂时并行，避免未经确认上传旧会话。

### 项目结构快照

```text
web/
├── app/
│   ├── api/v1/conversations/       # 会话、消息与活动分支 Route Handlers
│   ├── api-key/                     # 浏览器 API 配置页
│   └── chat/                        # 当前 localStorage Chat UI
├── components/chat/                 # Chat 展示与安全 Markdown 渲染
├── drizzle/                         # forward/rollback SQL 与快照
├── lib/
│   ├── agent/                       # Prompt、Memory 与 Dispatcher
│   ├── ai/                          # 当前浏览器 Provider 适配
│   ├── api/                         # HTTP 校验、响应与错误契约
│   ├── conversation/                # 浏览器树形领域操作
│   ├── db/                          # Schema、连接与迁移基础
│   ├── repositories/                # 服务端领域持久化边界
│   └── runtime/                     # Browser Backend
├── scripts/                         # 数据库 migrate/rollback 命令
└── tests/                           # 单元、组件、数据库与 API 集成测试
```

### 下一步

- Sprint 1.3：把 Model Provider 和 API Key 移到服务端，实现可取消的 SSE Streaming，并复用本 Sprint Repository 保存 user/assistant 消息。

---

## Sprint 1.1 — PostgreSQL + Drizzle + Migration 基线

**Commit**: `96649c8`

### 为什么

Phase 0 的 localStorage 只能支持单浏览器原型，无法作为跨设备会话、可靠定时任务、后台 Worker 与未来云端迁移的事实来源。本 Sprint 先建立可审阅、可升级、可回滚的数据地基，不提前接入 Repository/API 或改动现有 Chat 行为。

### 怎么做

- 以 PostgreSQL 为服务端事实数据库，以 Drizzle TypeScript Schema 为结构源，以版本化 SQL 为部署制品。
- 使用显式配对的 forward/rollback SQL；自定义 Runner 提供事务、迁移历史、排他锁、幂等执行和 SHA-256 漂移检测。
- 使用 PGlite 执行仓库中的真实 PostgreSQL SQL，覆盖当前机器没有 PostgreSQL/Docker 时的自动化迁移回归。
- `active_leaf_message_id` 保留为列但暂不建立循环外键；Sprint 1.2 Repository 必须验证活动叶节点属于同一 Conversation。

### 修改文件

- `PROJECT.md`
- `README.md`
- `docs/CHANGELOG.md`
- `docs/DATABASE_OPERATIONS.md`
- `docs/PRODUCT_TECHNICAL_ROADMAP.md`
- `docs/adr/ADR-024-POSTGRES-DRIZZLE-MIGRATIONS.md`
- `web/.env.example`
- `web/.gitignore`
- `web/drizzle.config.ts`
- `web/drizzle/0000_easy_joystick.sql`
- `web/drizzle/meta/0000_snapshot.json`
- `web/drizzle/meta/_journal.json`
- `web/drizzle/rollback/0000_easy_joystick.sql`
- `web/lib/db/migrations.ts`
- `web/lib/db/postgresMigrationDatabase.ts`
- `web/lib/db/schema.ts`
- `web/package-lock.json`
- `web/package.json`
- `web/scripts/db-migrate.ts`
- `web/scripts/db-rollback.ts`
- `web/tests/databaseMigrations.test.ts`

### 变更内容

| 功能 | 说明 |
|------|------|
| 最小数据模型 | 新增 `users`、`conversations`、`messages`，使用 UUID、`timestamptz`、Enum、JSONB、外键、索引和乐观锁版本列 |
| 树形持久化 | `messages.parent_message_id` 使用自引用外键，`conversations.active_leaf_message_id` 保存当前分支位置 |
| Drizzle 基线 | 新增 Drizzle 配置、Schema、生成 SQL、快照与 `db:generate` / `db:check` 命令 |
| 事务化升级 | `db:migrate` 按序应用待执行迁移，同一事务写入 `app_internal.schema_migrations`，重复执行幂等 |
| 显式回滚 | rollback SQL 单独存放，`db:rollback` 每次事务化回滚最新一条迁移，避免 down SQL 被前向工具误执行 |
| 漂移与并发保护 | 已应用 SQL 使用 SHA-256 校验；历史表排他锁避免两个进程重复迁移 |
| 配置安全 | 提交无效凭据的 `.env.example`，继续忽略 `.env.local` 等真实环境文件 |
| 依赖安全 | 新增 Drizzle/Postgres/PGlite/tsx；覆盖 Drizzle Kit 的旧 esbuild 传递依赖后，完整与生产审计均为 0 |
| 操作文档 | 新增环境准备、生成、升级、回滚、事务、安全和后续迁移规范；ADR-024 固化架构取舍 |

### 验证

- `npm test`：8 个测试文件、46 个测试全部通过。
- 数据库集成测试：真实执行首次建库、默认值写入、重复升级、单步回滚、回滚后重建与迁移漂移拒绝。
- `npm run db:check`：Drizzle migration 元数据一致。
- `npm run db:generate`：Schema 无未生成变更。
- `npx tsc --noEmit --pretty false`：通过。
- `npm run lint`：通过。
- `npm run build`：通过，4 个静态路由成功生成。
- `npm run test:e2e`：3 个 Microsoft Edge 主链路全部通过；网络受限时 Google Fonts 使用既有 fallback，不影响用例。
- `npm audit` 与 `npm audit --omit=dev`：均为 0 项已知漏洞。
- 当前机器未安装 PostgreSQL、Docker 或 `psql`，因此未连接外部数据库；迁移 SQL 由进程内 PostgreSQL 兼容引擎验证。标准 Docker 环境仍按路线图在 Sprint 1.5 引入。

### localStorage 变化

- 键名和值结构均无变化。
- Chat UI 仍由 `agent_chat_sessions` 提供数据；Sprint 1.2 接入 Repository/API，Sprint 1.4 再提供无重复导入。

### 下一步

- Sprint 1.2：实现单用户身份引导、Conversation/Message Repository、事务化活动分支更新和服务端 API。

---

## Sprint 0.6 — 依赖安全与 Phase 0 封版

**Commit**: `c57a612`

### 修改文件
- `web/package.json`
- `web/package-lock.json`
- `web/AGENTS.md`
- `PROJECT.md`
- `docs/PRODUCT_TECHNICAL_ROADMAP.md`
- `docs/CHANGELOG.md`

### 变更内容
| 功能 | 说明 |
|------|------|
| Next.js 安全升级 | 将 Next.js 与 `eslint-config-next` 从 `16.2.9` 升级并固定到 `16.3.4`，修复 App Router、Turbopack、Server Actions 及传递依赖公告 |
| 传递依赖修复 | 使用不带 `--force` 的兼容补丁升级，修复 PostCSS、Sharp、Nano ID、Browserslist、JS-YAML 与 Brace Expansion 等公告 |
| 框架规则同步 | 接受 Next.js 16.3.4 首次启动时自动更新的 `web/AGENTS.md` 规则块，避免每次开发启动产生脏工作区 |
| Phase 0 封版 | 路线图将 Sprint 0.6 标记完成，项目状态转入 Phase 1 准备阶段，并建立 `phase-0-baseline` Git 标签 |

### 验证
- `npm audit`：生产与开发依赖均为 0 项已知漏洞
- `npm test`：7 个测试文件、44 个测试全部通过
- `npx tsc --noEmit --pretty false`：通过
- `npm run lint`：通过
- `npm run build`：通过，4 个静态路由成功生成
- `npm run test:e2e`：3 个 Microsoft Edge 端到端测试全部通过
- localStorage 键值：无变化

### Phase 0 基线
- 基线标签：`phase-0-baseline`
- 回滚方式：`git switch --detach phase-0-baseline` 可只读检查封版状态；需要开发时应从该标签创建新分支
- 下一 Sprint：1.1 PostgreSQL + Drizzle + migration 基线

---

## Sprint 0.5.1 — KaTeX 分数排版兼容修复

**Commit**: `8534c3a`

### 修改文件
- `web/package.json`
- `web/package-lock.json`
- `web/e2e/chat.spec.ts`

### 变更内容
| 功能 | 说明 |
|------|------|
| KaTeX 版本一致性 | 将直接依赖从 `0.18.5` 固定为 `0.16.47`，与 `rehype-katex` 和 `remark-math` 实际使用的版本一致 |
| 依赖去重 | 移除两份嵌套 KaTeX 运行时，确保生成公式 DOM 的代码与页面载入的 CSS、字体来自同一版本 |
| 分数回归测试 | Edge 页面用例新增普通分数与嵌套分数，验证行内、块级公式及 `.mfrac` 结构均能渲染 |

### 验证
- `npm test`：44/44 通过
- `npm run lint`：通过
- `npm run test:e2e`：3/3 用例通过（Edge）
- `npm run build`：通过
- localStorage 键值：无变化

---

## Sprint 0.5 — 树形对话与安全富文本渲染

**Commit**: `803470b`（Phase 0 汇总提交）

### 修改文件
- `web/lib/conversation/tree.ts`
- `web/lib/ai/messages.ts`
- `web/lib/config.ts`
- `web/lib/runtime/backend.ts`
- `web/lib/ai/chatService.ts`
- `web/lib/agent/promptBuilder.ts`
- `web/lib/agent/dispatcher.ts`
- `web/app/chat/page.tsx`
- `web/app/layout.tsx`
- `web/app/globals.css`
- `web/components/chat/MessageList.tsx`
- `web/components/chat/MarkdownMessage.tsx`
- `web/tests/conversationTree.test.ts`
- `web/tests/chatService.test.ts`
- `web/tests/backend.test.ts`
- `web/tests/chatComponents.test.tsx`
- `web/e2e/chat.spec.ts`
- `web/package.json`
- `web/package-lock.json`
- `docs/adr/ADR-023-CONVERSATION-TREE-AND-RICH-CONTENT.md`
- `docs/PRODUCT_TECHNICAL_ROADMAP.md`
- `docs/CHANGELOG.md`

### 变更内容
| 功能 | 说明 |
|------|------|
| 树形消息 | 新增 `parentId`、`schemaVersion` 和 `activeLeafId`，以消息父子关系表达真实对话分支 |
| 历史 Retry | 重新生成任意 Assistant 回答会创建兄弟节点，新分支不会继承旧回答的后续消息 |
| 分支恢复 | 切回旧回答版本时恢复其已有后续路径；再次切换新版本时旧路径保持隐藏但不删除 |
| Prompt 一致性 | Provider 与记忆压缩只读取当前活动路径，不再混入其他分支内容 |
| 旧数据迁移 | 线性消息转为父子链，旧 `versions[]` 转为兄弟节点，原 active 版本承接后续 |
| Markdown | 新增 CommonMark、GFM、代码块和安全外链渲染 |
| 数学公式 | 使用 `remark-math` 与 `rehype-katex` 支持行内和块级 LaTeX |
| 定界符兼容 | 在 Markdown 解析前将 prose 中的 `\\(...\\)` / `\\[...\\]` 转换为 KaTeX 可识别格式，代码区保持原样 |
| HTML 边界 | 不启用原始 HTML 解析；HTML 代码默认只展示，不进入宿主 DOM 执行 |
| 架构决策 | ADR-023 固化数据库映射、ContentBlock/Artifact 方向和 iframe 沙箱要求 |

### localStorage 变化
- 键名保持 `agent_chat_sessions` 不变。
- Session 值升级为 `schemaVersion: 2`，消息增加 `parentId`，Session 增加 `activeLeafId`。
- 首次读取旧数据时自动迁移并回写；旧 active 版本继续承接原后续消息，其他版本转为兄弟叶节点。

### 项目结构快照
```text
web/
├── app/                       # 页面、全局样式与根布局
├── components/chat/           # Chat 展示组件与 Markdown 渲染器
├── e2e/                       # Playwright 浏览器主链路
├── lib/
│   ├── agent/                 # Prompt、Memory、Compressor、Dispatcher
│   ├── ai/                    # Provider 适配与消息传输类型
│   ├── conversation/          # 树形会话领域操作
│   └── runtime/               # Browser Backend 与任务事件
└── tests/                     # 单元与组件渲染测试
```

### 验证
- `npm test`：7 个测试文件、44 个测试全部通过。
- `npm run test:e2e`：3 个 Microsoft Edge E2E 测试通过，覆盖历史分叉、路径恢复和真实页面公式渲染。
- `npx tsc --noEmit`：通过。
- `npm run lint`：通过且无警告。
- `npm run build`：通过，4 个静态路由成功生成。
- `npm audit --omit=dev`：新增渲染依赖未增加生产公告；仍为 Next.js 16.2.9 链路的 4 个既有高危项，留待 Sprint 0.6。

### 范围说明
- 本 Sprint 不执行模型返回的 HTML；可运行网页将作为独立 Artifact 和沙箱预览在后续实现。
- 本 Sprint 不引入数据库；树形领域模型与 localStorage 解耦，Phase 1 将映射到 `parent_message_id`。
- Next.js 16.2.9 的既有生产依赖安全升级安排在 Sprint 0.6。

---

## Sprint 0.4 — Chat 页面组件化

**Commit**: `803470b`（Phase 0 汇总提交）

### 修改文件
- `web/app/chat/page.tsx`
- **新建** `web/components/chat/ChatHeader.tsx`
- **新建** `web/components/chat/ChatErrorBanner.tsx`
- **新建** `web/components/chat/SessionSidebar.tsx`
- **新建** `web/components/chat/MessageList.tsx`
- **新建** `web/components/chat/ChatComposer.tsx`
- **新建** `web/tests/chatComponents.test.tsx`
- **新建** `web/e2e/chat.spec.ts`
- **新建** `web/playwright.config.ts`
- `web/vitest.config.ts`
- `web/.gitignore`
- `web/package.json`
- `web/package-lock.json`
- `docs/PRODUCT_TECHNICAL_ROADMAP.md`
- `docs/CHANGELOG.md`

### 变更内容
| 功能 | 说明 |
|------|------|
| 页面容器 | `ChatPage` 仅保留 Session 选择、任务状态、AI 调用和领域操作编排 |
| 展示组件 | Header、错误提示、会话侧栏、消息列表和输入区拆为独立组件 |
| 状态边界 | Session 与 Backend 仍由页面容器统一连接，展示组件只通过类型化 Props 接收数据与操作 |
| 客户端边界 | 复用页面顶层的 Client Component 边界，子组件不重复声明 `use client` |
| 行为保持 | 保留新建/删除会话、发送/停止、Retry、回复版本切换及所有原有样式和文案 |
| 组件回归 | 静态渲染测试覆盖 Header、错误、侧栏空状态、消息空状态、版本导航、Retry、加载态和输入区模式 |
| E2E 基线 | 引入 Playwright 并复用本机 Edge，覆盖新建、刷新恢复、配置校验、删除及空状态持久化主链路 |

### 验证
- `npm test`：6 个测试文件、37 个测试全部通过。
- `npm run test:e2e`：1 个 Microsoft Edge 端到端测试通过。
- `npx tsc --noEmit`：通过。
- `npm run lint`：通过。
- `npm run build`：通过，4 个静态路由成功生成。

### 范围说明
- 本 Sprint 只调整展示层结构，不改变 Session 数据模型、持久化方式、Prompt、Memory 或 Provider 行为。
- E2E 使用空白 localStorage 和缺失 API 配置运行，不读取用户密钥，也不会向模型 Provider 发送请求。
- Next.js 16.2.9 的既有安全升级任务仍待独立处理。

---

## Sprint 0.3 — 核心单元测试基线

**Commit**: `803470b`（Phase 0 汇总提交）

### 修改文件
- `web/lib/config.ts`
- `web/lib/runtime/backend.ts`
- `web/lib/agent/dispatcher.ts`
- `web/tests/config.test.ts`
- `web/tests/chatService.test.ts`
- `web/tests/backend.test.ts`
- **新建** `web/tests/memory.test.ts`
- **新建** `web/tests/helpers/browserStorage.ts`
- `docs/PRODUCT_TECHNICAL_ROADMAP.md`
- `docs/CHANGELOG.md`

### 变更内容
| 功能 | 说明 |
|------|------|
| 配置测试 | 覆盖完整/缺失 API 配置、损坏 JSON、空 Session、旧消息迁移和非法消息过滤 |
| 消息校验 | 新增 `isChatMessage`、`isSession` 运行时类型守卫，持久层不再盲目信任类型断言 |
| Chat Service | 覆盖 Provider 请求、缺失配置、HTTP 错误、空回复、发送回复、Retry 版本与不可变性 |
| Backend 生命周期 | 覆盖 running/done/error/aborted 事件、完成 Hook、取消和异步删除安全 |
| 领域边界 | 通用 Backend 不再把任意含 `id` 的结果当作 Session；Dispatcher 验证后再请求写入 |
| Memory 测试 | 覆盖排序、去重、清空、损坏存储恢复和摘要长度边界 |
| 测试工具 | 提取内存版 Browser Storage，统一 Node 测试中的 `window/localStorage` 环境 |

### 验证
- `npm test`：5 个测试文件、30 个测试全部通过。
- `npx tsc --noEmit`：通过。
- `npm run lint`：通过。
- `npm run build`：通过，4 个静态路由成功生成。

### 范围说明
- 当前启发式 Compressor 会把用户问题提取为 `fact`，这是路线图中已记录的记忆质量缺陷；本 Sprint 没有用测试固化该行为，留待 MemoryCandidate 阶段修正。
- Next.js 16.2.9 的既有安全升级任务仍待独立处理。

---

## Sprint 0.2 — 内部消息角色与 Prompt 分层

**Commit**: `803470b`（Phase 0 汇总提交）

### 修改文件
- **新建** `web/lib/ai/messages.ts`
- `web/lib/agent/promptBuilder.ts`
- `web/lib/ai/chatService.ts`
- `web/lib/config.ts`
- **新建** `web/tests/promptBuilder.test.ts`
- **新建** `web/tests/chatService.test.ts`
- `docs/PRODUCT_TECHNICAL_ROADMAP.md`
- `docs/CHANGELOG.md`

### 变更内容
| 功能 | 说明 |
|------|------|
| 消息边界 | 持久化 `ChatMessage` 只允许 `user/assistant`，系统指令与上下文不进入会话历史 |
| Prompt 类型 | 新增带 `kind/source/role` 的 `PromptMessage`，区分 Persona、Memory 与 Conversation |
| 正确角色 | Persona 从伪造的 `assistant` 历史改为 `system` instruction；Memory 改为独立 context |
| 记忆防注入提示 | Memory 以 JSON 参考数据进入 Prompt，并明确声明可能过期且不得视为指令 |
| Provider 边界 | 请求前投影为标准 `{ role, content }`，内部 `kind/source` 不发送给第三方接口 |
| 历史兼容 | 原 `ChatMessage` 从 `config.ts` 重新导出，现有 Session/localStorage 结构无需迁移 |

### 验证
- `npm test`：4 个测试文件、8 个测试全部通过。
- `npx tsc --noEmit`：通过。
- `npm run lint`：通过。
- `npm run build`：通过，4 个静态路由成功生成。

---

## Sprint 0.1 — Session 持久化一致性

**Commit**: `803470b`（Phase 0 汇总提交）

### 修改文件
- `web/lib/config.ts`
- `web/lib/runtime/backend.ts`
- `web/app/chat/page.tsx`
- `web/app/api-key/page.tsx`
- `web/package.json`
- `web/package-lock.json`
- **新建** `web/vitest.config.ts`
- **新建** `web/tests/config.test.ts`
- **新建** `web/tests/backend.test.ts`
- `docs/PRODUCT_TECHNICAL_ROADMAP.md`
- `docs/CHANGELOG.md`

### 变更内容
| 功能 | 说明 |
|------|------|
| 空 Session 持久化 | `[]` 现在是合法事实状态；删除最后会话后不会被旧消息重新迁移 |
| 单一写入者 | Browser Backend 统一负责运行期 Session 创建、更新、删除和 localStorage 快照写入 |
| 外部 Store 订阅 | Chat 使用 `useSyncExternalStore` 读取稳定快照，UI 不再通过 Effect 二次持久化 |
| 删除安全 | 删除会话会中止所属运行任务，迟到的异步回复不能复活已删除会话 |
| React 规则清理 | API 配置页改为 hydration 后初始化表单，清除原有同步 Effect setState 错误 |
| 测试基线 | 引入兼容 Node 20 的 Vitest 3.2.6，覆盖空数组、旧数据迁移、完整快照和异步复活回归 |

### 验证
- `npm test`：2 个测试文件、5 个测试全部通过。
- `npx tsc --noEmit`：通过。
- `npm run lint`：通过。
- `npm run build`：通过，4 个静态路由成功生成。
- `npm audit --omit=dev`：仍报告 Next.js 16.2.9 及其生产依赖的 4 个高危公告；修复建议涉及升级到 16.3.4，应作为独立依赖维护 Sprint 验证，不在本次状态修复中使用 `--force`。

---

## Planning 1.1 — 插件体系、Android 与自托管路线修订

**Commit**: `803470b`（Phase 0 汇总提交）

### 修改文件
- `docs/PRODUCT_TECHNICAL_ROADMAP.md`
- `docs/REFERENCE_PROJECT_STUDY.md`
- `docs/CHANGELOG.md`

### 变更内容
| 功能 | 说明 |
|------|------|
| 产品范围 | 将可扩展学习活动、Android APK 和笔记本自托管纳入明确方向，仍排除近期公开插件市场 |
| 插件模型 | 定义 Skill、Tool、Activity、Connector，以及 Manifest、Installation、StudyRecord 与持久事件 |
| 安全边界 | 增加 Capability Gateway、结构化调用、隔离存储、配额、审计、撤销和 UI 沙箱 |
| 首批插件 | 将背书与解题设计为两个第一方插件，验证 Plugin API 后再允许外部安装 |
| 移动端 | 确立 Web-first + PWA + Capacitor APK，共享领域代码并使用平台 Adapter |
| 自托管 | 设计笔记本 Docker Compose 运行环境、离线补偿、备份恢复和未来云迁移约束 |
| 路线图 | 新增 Phase 6 插件验证与移动交付，作品集化顺延为 Phase 7，并补充 ADR-016 至 ADR-022 |

---

## Research 1.0 — 爱语与相关开源项目架构学习

**Commit**: `803470b`（Phase 0 汇总提交）

### 修改文件
- **新建** `docs/REFERENCE_PROJECT_STUDY.md`
- `docs/PRODUCT_TECHNICAL_ROADMAP.md`
- `docs/CHANGELOG.md`

### 变更内容
| 功能 | 说明 |
|------|------|
| 爱语结构学习 | 基于静态分析任务，归纳对话、主动消息、记忆、外部接入、语音/形象、模块和成本可观测性 |
| 开源项目对照 | 分析 DeepSeek Harness、Codex、Trigger.dev、Warashi、YuriOS、Letta、Mem0、Open-LLM-VTuber 等项目 |
| 架构修订 | 增加 Act/Interrupt 双门控、Durable Inbox、记忆检索阶梯、结构化工具权限和表达层 Adapter |
| 技术验证 | 设计 Scheduler、记忆检索、主动性、安全红队和语音延迟五类实验 |
| 学习路线 | 制定 30/60/90 天实施顺序、源码阅读路径与作品集表达方式 |

---

## Planning 1.0 — 产品与技术总规划

**Commit**: `803470b`（Phase 0 汇总提交）

### 修改文件
- **新建** `docs/PRODUCT_TECHNICAL_ROADMAP.md`
- `docs/CHANGELOG.md`

### 变更内容
| 功能 | 说明 |
|------|------|
| 产品定位 | 明确专业知识工作、学习成长、主动任务与克制型情感陪伴的统一定位 |
| 当前基线 | 盘点已有 Chat、Browser Runtime、Memory、Prompt 与 Planner，并记录原型限制 |
| 参考架构 | 分析 ChatGPT Scheduled Tasks、DeepSeek Harness、OpenAI Codex 与同类产品的可借鉴边界 |
| 总体架构 | 设计 Next.js 模块化单体、PostgreSQL、Scheduler、Worker、Agent Runtime 与通知系统 |
| 技术规范 | 定义 Conversation、Message、Task、TaskRun、Memory、Content、Notification 与事件格式 |
| 功能设计 | 详述专业回答、思考问题、新闻、书籍、人格、主动联系、记忆与 PWA 通知 |
| 工程规范 | 增加 API、权限、安全、可观测性、测试、Agent Evals 和 Definition of Done |
| 路线图 | 给出 Phase 0–6 的短期 Sprint、6/12 个月目标、长期愿景与作品集 Demo |

---

## Phase 9.2 — Browser Backend Layer

**Commit**: `803470b`（Phase 0 汇总提交）

### 修改文件
- **新建** `web/lib/runtime/backend.ts`
- `web/lib/ai/chatService.ts`
- `web/app/chat/page.tsx`

### 变更内容
| 功能 | 说明 |
|------|------|
| Backend 执行引擎 | `backend.ts`：通用异步任务队列，`runTask(id, fn)` + `subscribe/notify`，零领域知识 |
| 领域 Action 分离 | `chatService.ts`：`executeSend` 和 `executeRetry` 独立函数，不共享 mode 参数 |
| UI 订阅模式 | `page.tsx`：删除 `useRef`/`currentRequestRef`/callback，改为 `subscribe(backend)` 同步状态 |
| 职责分离 | Backend=执行引擎，chatService=API+领域Action，UI=订阅+dispatch |
| 删除 Runtime 混合代码 | `activeRequests` Map、`executeBackgroundRequest`、`RequestMode` 全部删除 |

### 架构
```
UI (React) → subscribe/notify → Backend (runTask) → chatService (executeSend/Retry) → localStorage
  ↑ 订阅 + dispatch              ↑ 通用执行引擎               ↑ 领域 Action（独立函数）
```

---

## Sprint 9 — Chat Runtime Model + Background Execution

**Commit**: `803470b`（Phase 0 汇总提交）

### 修改文件
- `web/lib/config.ts`
- `web/lib/ai/chatService.ts`
- `web/app/chat/page.tsx`

### 变更内容
| 功能 | 说明 |
|------|------|
| Runtime Layer | `executeBackgroundRequest(requestId, messages, sessionId, mode, onComplete)` 模块级单例，后台执行 AI 请求并直接写 localStorage |
| request registry | `activeRequests: Map<string, boolean>` 全局管理请求生命周期 |
| 后台执行 | UI 不再 `await sendChatMessage`，改为 fire-and-forget + callback 同步 |
| 版本系统 | `ChatMessage.versions?: string[]` + `activeVersion?: number` |
| 统一模型 | assistant 永远只有一条，Send 追加新 assistant，Retry 只更新 versions |
| 版本切换 UI | ◀ 版本 N/M ▶ 按钮，切换显示不同版本内容 |
| Retry 增强 | 每条 assistant 消息可独立 retry，confirm 确认 |

### 架构升级
```
旧: UI await sendChatMessage() → setSessions
新: UI → executeBackgroundRequest(mode) → Runtime → chatService → localStorage → 回调同步 UI
```

---

---

## Phase 9.3 — 执行隔离 + Abort + Session 级 loading

**Commit**: `803470b`（Phase 0 汇总提交）

### 修改文件
- `web/lib/runtime/backend.ts`
- `web/lib/ai/chatService.ts`
- `web/app/chat/page.tsx`

### 变更内容
| 功能 | 说明 |
|------|------|
| Abort 支持 | `runTask(id, sessionId, fn)` → fn 接收 `AbortSignal`，传入 `fetch(url, { signal })` |
| 停止生成按钮 | loading 时 "发送" 变为红色 "停止生成"，调 `abortTask(id)` |
| aborted vs error | `TaskStatus` 新增 `"aborted"`，`AbortError` 单独处理，不显示错误 |
| Session 级 loading | `getTasksBySession(sessionId)` 替代全局 `getAllTasks()`，不串台 |
| API/LocalStorage 分离 | `sendChatMessage(messages, signal)` + `applySendReply` / `applyRetryReply` |

---

## Phase 9.4 — 状态一致性收敛（Event Log 架构）

**Commit**: `803470b`（Phase 0 汇总提交）

### 修改文件
- `web/lib/runtime/backend.ts`
- `web/lib/ai/chatService.ts`
- `web/app/chat/page.tsx`

### 变更内容
| 功能 | 说明 |
|------|------|
| Event Log 架构 | `BackendEvent = task_update \| session_update`，`emit(event)` 替代 `notify()` |
| sessionStore | Backend 拥有 `Map<string, Session>` 缓存，`saveSessions` 仅 backend 调用 |
| signal.aborted 守卫 | `runTask.then/catch` 中 `if (signal.aborted) return`，真正终止控制流 |
| chatService 纯函数 | `applySendReply/Retry(session, reply)` 只算不写，入参变为 Session |
| UI 事件消费 | `subscribe(event)` → 增量 merge：`session_update` 更新 sessions，`task_update` 更新 tasks |
| loading 事件驱动 | `Object.values(tasks).some(t => t.status === "running" && sessionId)` |
| 消除三份真相源 | backend 单写 → 事件单向流动 → React state 只读 |

### 架构
```
Backend (唯一写入者)
  ├─ taskStore
  ├─ sessionStore
  └─ emit(event) → UI subscribe → 增量 merge
       ↑ 事件单向流动，无漂移
```

---

## Phase 10 — Browser Agent Core System

**Commit**: `803470b`（Phase 0 汇总提交）

### 新建文件
- `web/lib/agent/memory.ts` — 长期记忆系统（`agent_memory_store`）
- `web/lib/agent/contextCompressor.ts` — 上下文压缩（阈值 20 条消息）
- `web/lib/agent/promptBuilder.ts` — 唯一 prompt 构造器（SSOT）
- `web/lib/agent/taskPlanner.ts` — 任务规划器（关键词匹配）
- `web/lib/agent/dispatcher.ts` — Domain hook 注册（idempotent）

### 修改文件
- `web/lib/runtime/backend.ts` — `taskType` + 按类型分类的 `registerTaskCompleteHook`
- `web/app/chat/page.tsx` — `buildAgentPrompt` + `initAgentDispatcher`

### 变更内容
| 功能 | 说明 |
|------|------|
| Memory System | `addMemory/getMemory/clearMemory`，localStorage 持久化，自动去重 |
| Context Compressor | 超过 20 条消息自动压缩为首 3+尾 5+用户事实 |
| Prompt Builder | 显式参数 `{ session, memory, persona? }`，输出 `[system, memory_ctx, ...messages]` |
| Task Planner | 关键词匹配（总结/分析/计划/比较）→ 步骤列表 |
| Hook Registry | `registerTaskCompleteHook(taskType, fn)` 按类型分类，domain pipeline |
| UI 纯渲染 | subscribe 只做 setSessions/setTasks，零 domain logic |

### Agent 数据流
```
sendMessage → buildAgentPrompt(session, getMemory())
  → sendChatMessage(agentContext)
  → backend.runTask.then
    → emit + taskCompleteHook("chat_completion")
      → compress(session) → addMemory()
```

---

## Sprint 8 — Chat State Reliability Layer

**Commit**: `39157b2 step7`

### 修改文件
- `web/app/chat/page.tsx`

### 变更内容
| 功能 | 说明 |
|------|------|
| requestId 追踪 | 新增 `useRef<string \| null>`，每次请求生成 `crypto.randomUUID()` |
| 卸载安全 | `useEffect` cleanup 将 `currentRequestRef.current = null`，stale 响应跳过 setState |
| sendMessage 防护 | try/catch/finally 中校验 requestId，stale 时跳过 |
| Retry 保留旧结果 | 旧 assistant 消息不再删除，新回复追加到 `[...s.messages, newAssistant]` |
| Retry 确认 | `window.confirm("确定要重新生成回复吗？")` |
| Delete 确认 | `window.confirm("确定要删除这个对话吗？")` |

---

## Sprint 7.5 — Chat UX Incremental Upgrade

**Commit**: `39157b2 step7`

### 修改文件
- `web/lib/config.ts`
- `web/app/chat/page.tsx`

### 变更内容
| 功能 | 说明 |
|------|------|
| 删除 Session | 侧栏每项 hover 显示 ✕ 按钮，immutable filter 删除 |
| Retry 重新生成 | 最后一条 assistant 旁 "重新生成" 按钮，复用 loading/error state |
| 消息时间戳 | `ChatMessage.createdAt?: number`，UI 显示 HH:MM |
| 换行支持 | `whitespace-pre-wrap` CSS，保留 `\n` 换行 |
| 气泡间距 | `space-y-6` 加大消息间距 |

---

## Sprint 7 — AI Service Layer

**Commit**: `39157b2 step7`

### 修改文件
- **新建** `web/lib/ai/chatService.ts`
- `web/app/chat/page.tsx`

### 变更内容
| 功能 | 说明 |
|------|------|
| chatService.ts | `sendChatMessage(messages): Promise<string>` 纯函数，零 React 依赖 |
| UI 解耦 | `page.tsx` 删除所有 `fetch` 直接调用，改为 `sendChatMessage(updatedMessages)` |
| 导入清理 | 删除 `getApiKey/getApiBaseUrl/getApiModel`，UI 不再直接读配置 |

**架构分层**:
```
UI Layer (page.tsx) → Service Layer (chatService.ts) → Config Layer (config.ts)
```

---

## Sprint 6 — Chat Session System

**Commit**: `a073631 step6`

### 修改文件
- `web/lib/config.ts`
- `web/app/chat/page.tsx`

### 变更内容
| 功能 | 说明 |
|------|------|
| Session 数据结构 | `Session = { id, title, messages, updatedAt }` |
| localStorage | `agent_chat_sessions` 数组替代单 `agent_chat_messages` |
| 左侧 Session 列表 | `w-64` 侧栏，新建/切换/高亮 |
| 数据迁移 | `migrateOnce()` 自动将旧 `agent_chat_messages` 转为 "历史对话" session |
| 状态强约束 | 仅 `sessions` + `activeSessionId` 两个 state，messages 为派生值 |
| 不可变更新 | 所有更新通过 `setSessions(prev => prev.map(...))` |

---

## Sprint 5 — 多轮对话 + 持久化

**Commit**: `0df7b1b step 5`

### 修改文件
- `web/lib/config.ts`
- `web/app/chat/page.tsx`

### 变更内容
| 功能 | 说明 |
|------|------|
| 完整上下文 | API 请求从单条消息改为发送完整 `messages` 历史 |
| localStorage 持久化 | 新增 `getChatMessages()` / `saveChatMessages()` |
| 消息去重 | `updatedMessages = [...messages, userMessage]` 一次性构建，state 与 API 同源 |
| 空状态升级 | "开始你的第一段对话" + "输入问题，AI 将为你提供帮助" |

---

## Sprint 4 — UX 闭环 + 双向导航

**Commit**: `fff1847 step4 patch1`

### 修改文件
- `web/app/chat/page.tsx`
- `web/app/api-key/page.tsx`

### 变更内容
| 功能 | 说明 |
|------|------|
| Chat 错误引导 | 未配置时显示完整提示 + "前往配置" 按钮（Link） |
| API Key 返回入口 | header 右侧 "返回对话" 链接 |
| 双向导航闭环 | `Chat ⇄ API Key` 形成完整 UX 闭环 |

---

## Sprint 3 — AI API 集成

**Commit**: `fff1847 step4 patch1` / `b984602 step4`

### 修改文件
- `web/lib/config.ts`
- `web/app/api-key/page.tsx`
- `web/app/chat/page.tsx`

### 变更内容
| 功能 | 说明 |
|------|------|
| API Key 三合一配置 | API Key + Base URL + Model 三类字段管理 |
| localStorage config | `agent_api_key` / `agent_api_base_url` / `agent_api_model` |
| Chat 真实 API 调用 | `fetch` → OpenAI-compatible `/chat/completions` |
| Loading 状态 | "AI 思考中..." + 禁用输入/按钮 |
| Error 处理 | 配置缺失 / 网络失败 / 非 200 响应 |
| API 配置入口 | Chat header 右侧 "API 配置" 链接 |

---

## Sprint 2.5 — UI 结构重构

**Commit**: `64cca8d step3`

### 修改文件
- `web/app/page.tsx`

### 变更内容
- 删除三个功能卡片（情感助手/学习助手/自带 API Key）
- 删除 Footer
- "开始对话" 按钮改为 `<Link href="/chat">` 跳转
- Landing Page 精简为纯产品入口

---

## Sprint 2 — Chat UI (Mock)

**Commit**: `64cca8d step3` / `e43621c step2`

### 修改文件
- **新建** `web/app/chat/page.tsx`
- `web/app/api-key/page.tsx`

### 变更内容
- Chat 页面：消息列表 + 输入框 + 发送按钮
- Mock AI 回复："（模拟回复）我正在等待接入 AI 模型..."
- API Key 页面基础实现（输入/保存/删除）

---

## Sprint 1 — 项目初始化

**Commit**: `22c63f8 step 1` / `e43621c step2`

### 修改文件
- `web/app/page.tsx`
- `web/app/layout.tsx`

### 变更内容
- Landing Page v1：标题 AI Study Companion + 副标题 + Start Chat 按钮 + 三列功能卡片 + Footer
- 全站中文化：UI 文案改为中文优先，metadata 中文化
- Tailwind CSS v4 响应式布局

---

## Day 1-2 — 项目搭建

**Commit**: `0f7641e Day 2` / `5f30f4e Day 1`

- `create-next-app` 脚手架
- 配置 TypeScript + Tailwind CSS v4 + App Router
- 初始化 CLAUDE.md / PROJECT.md / README.md

---

## 当前项目结构

```
web/
├── app/
│   ├── layout.tsx          # 根布局，metadata 中文
│   ├── page.tsx            # Landing Page（产品入口）
│   ├── api-key/
│   │   └── page.tsx        # API 三合一配置页
│   └── chat/
│       └── page.tsx        # 多 Session 聊天系统
├── lib/
│   ├── config.ts           # localStorage 配置 + Session 数据层
│   └── ai/
│       └── chatService.ts  # AI API 调用抽象层
├── components/             # (预留)
└── hooks/                  # (预留)
```

## localStorage 键值

| Key | 类型 | 用途 |
|-----|------|------|
| `agent_api_key` | string | API Key |
| `agent_api_base_url` | string | API Base URL |
| `agent_api_model` | string | Model 名称 |
| `agent_chat_sessions` | Session[] | 多会话数据（已替代旧 `agent_chat_messages`） |
