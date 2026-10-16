# R3.1：提示词调用清单与质量基线

日期：2026-10-15。状态：清单、离线拼装/验证器基线与人工质量评价口径已建立；真实模型回答质量/费用尚未测量。本阶段不改业务提示词。

基准运行源码：`31a49a296d4b4e73447b63d272be671bf73b8030`；离线基线版本 `r3.1/inventory-v1`。这个版本是评测/清单版本，不是给未版本化的运行时模板冒加版本号。

更新说明：本文保留 R3.1 盘点时的历史事实与原 31 例基线。模式与任务模板见 [`MODE_PROMPT_GUIDE.md`](./MODE_PROMPT_GUIDE.md)、[`TASK_PROMPT_GUIDE.md`](./TASK_PROMPT_GUIDE.md)。R3/R4 历史快照均未覆盖，当前默认核对 `baseline-r5.2.json`（80 例、27 个源文件），加入实际记忆读取策略及来源清理 Repository 指纹，原 R4 请求和样例 hash 全部不变。G1/G2/G4 已在 R3.3 修订；R3.4 受控真实对照与费用/质量限制见 [`PROMPT_QUALITY_AND_COST.md`](./PROMPT_QUALITY_AND_COST.md)。人工语义验收仍待完成。下文旧版本/数量/未测状态是历史记录，不作为当前运行事实。

## 1. 调用结构与完整范围

```text
Web / APK 聊天 → buildAgentPrompt → Model API
                                    → 服务端 Persona / Memory / Search / Envelope
                                    → measured Provider.stream

Scheduler / Reminder Worker
  ├─ 普通提醒：不调用模型
  ├─ Agent Prompt ───────────────────────────────┐
  ├─ 新闻：检索/去重 → 简报 Prompt ──────────────┤
  │                    └─ 可选另调用思考问题      │
  ├─ 书籍：画像/检索 → 推荐 Prompt ──────────────┤
  └─ 思考问题：偏好/上下文 → 候选 Prompt ────────┤
                                                → AgentPromptGenerator
学习 Activity → Capability Gateway             │   → measured Provider.stream
  └─ 授权的背书评价 / 解题（含图片）/ 复习卡 ─────┘

GameTurnService → 当前分支 + 世界/角色 + 可信状态/骰子
               → GameNarrativeGenerator → measured Provider.stream
```

实际生成链有 **9 类业务入口、3 处 Provider.stream 调用**，最后统一使用 `lib/ai/server/modelProvider.ts` 的 Chat Completions HTTP 传输。非聊天任务不经过聊天 Prompt Builder，也不会自动获得聊天 Persona、正式记忆或搜索能力。

### 1.1 实际业务入口

路径均相对于 `web/`；下表配合机器可读清单 `evals/r3/promptInventory.ts` 使用，后者还记录输出、上下文、回退与模板版本状态。

| ID | 实际入口/模板 | 触发和输入 | 输出/实际工具 | 记忆与失败处理 |
|---|---|---|---|---|
| chat | `lib/api/modelApi.ts`；`lib/agent/promptBuilder.ts` | `/api/v1/model/stream`；auto/professional/companion/reflection/entertainment，发送/重试和选中分支 | 流式文本/Markdown；宿主可先检索、后做引用/规则检查；不执行模式声明中的所有工具名称 | 服务端覆盖 Persona、读取相关确认记忆；可见错误/取消，不伪造完整回答 |
| agent-task | `lib/tasks/agentPromptGenerator.ts` | Worker 执行已保存 Agent Prompt；也是其他任务/学习生成的共用外层 | 独立可读文本；自身不搜索、不创建任务或操作现实世界 | 没有聊天长期记忆；配置/空输出/超长/Provider 错误显式返回 |
| news | `lib/tasks/personalBriefingGenerator.ts` 的 `evidencePrompt` | 主题、上海日期、搜索证据、近期事件去重；Worker 调用 | 精确的两个二级标题与有效 [Sn]；代码附来源，可额外生成反思 | 使用简报历史去重，不读取全局 Memory；无来源/无新内容/输出无效均失败 |
| books | `lib/tasks/bookRecommendationGenerator.ts` 的 `evidencePrompt` | 阅读画像、主题、书目证据 | 四个精确二级标题、2–3 本有引用的书；代码附来源 | 阅读画像是显式配置，不是任意会话记忆；画像/检索/格式错误不假装成功 |
| reflection | `lib/tasks/reflectionQuestionGenerator.ts` 的 `promptFor` | 独立反思任务或简报附加调用；目标/禁区/风格/截限上下文 | 3–5 个 JSON 候选，代码结合历史筛选并渲染 | 历史只用于筛选，候选 Prompt 不含历史列表；关闭/无合格候选/JSON 错误有独立语义 |
| memorization | `lib/plugins/hostCapabilityAdapters.ts` 的 `evaluationPrompt` | `memorization.evaluate`；材料、目标、复述、localScore | JSON score/feedback/missedPoints；语义改写可被接受 | 插件作用域，不读取现实人格；调用方可保留确定性评分回退，不代表已有逐字/拼写模式 |
| problem-solving | 同文件 `problemResponsePrompt` | `problem-solving.respond`；hint/guided/check/explain、题目/回答/近期上下文/工具证据，可附图片 | JSON subject/summary/response/assessment 等；算术在宿主执行，图片经多模态附件传输 | 不调用全局 Memory；无图片生成端口、结果无效或失败时不覆盖既有记录 |
| review-card | 同文件 `reviewCardPrompt` | `problem-solving.review-card`；选中题目/尝试/错因 | JSON front/back/reason/tags；独立调用，不能漏算成本 | 只使用选择的学习记录，不自动创建提醒；失败保持可见 |
| game | `lib/game/gameTurnService.ts` 的 `gamePromptMessages` | `/api/v1/game-sessions/[id]/turns`；roleplay/tabletop/interactive-story | JSON narrative/statePatch；骰子/检定由代码提供，回合服务验证状态后持久化 | 世界/角色、选中祖先链、可信快照；不读现实 Memory，不提交失败的半个回合 |

**连接检查不是生成**：凭据测试读取 Provider `/models`；Prompt 导出不重新生成内容。**主动问候不是生成**：`proactivityWorker` / `proactivityRepository` 使用既有政策与模板。普通通知、规则提取 MemoryCandidate、设备语音、规则包配置预览亦不调用文本生成模型。

### 1.2 16 类模块覆盖

| 模块 | 是否生成 | 当前情况 |
|---|---|---|
| 自动/专业问答 | 是 | chat |
| 陪伴/人格/主动联系 | 混合 | 陪伴是 chat；主动联系是规则模板 |
| 反思对话/思考问题 | 是 | chat 与 reflection 两条不同链 |
| 新闻/个人简报 | 是 | news，可追加 reflection 调用 |
| 书籍/阅读画像 | 混合 | books 生成；画像 CRUD 不生成 |
| 任务/定时 AI | 混合 | 四类 AI 任务生成；提醒/调度不生成 |
| Inbox/通知 | 否 | 保存、展示、投递既有内容 |
| 背书/记忆训练 | 混合 | 可调用评价；材料/本地评分/间隔规则不生成 |
| 解题/复习卡 | 是 | 回应与复习卡分别调用；算术校验不生成 |
| 角色扮演/跑团/规则包 | 混合 | chat 或独立 game；骰子/配置/检查点不生成 |
| 记忆管理/Persona | 否 | 当前候选提取/检索/配置为规则与数据服务 |
| 语音 | 否 | 设备 TTS，不等于模型生成回答 |
| 插件/Activity | 混合 | 仅三个获授权模型操作，其余存储/任务草稿不生成 |
| API 配置/Prompt 导出 | 否 | 连接测试、用量统计、脱敏导出 |
| 首页/导航/Web/APK | 否 | 共享 UI/路由，不因导航调用模型 |
| 数据与维护 | 否 | 确定性业务服务 |

### 1.3 版本、边界与实际缺口

- chat 沿用 Composer `r1/cache-friendly-v1`、模式 `mode-registry/v1`、Persona `persona-profile/v1`、Memory `memory-context/v2`、搜索 `web-search-context/v2` 等既有 Envelope 版本。其他 8 类入口未声明独立模板版本，清单如实记为空，以源文件 SHA-256 和样例请求指纹固定基准。
- **G1**：Agent Prompt、新闻、书籍、反思、背书、解题和复习卡都继承“你正在执行用户预先安排的定时任务”外层。前台学习也如此；这是真实源码现状，尚未证明对质量的影响，R3.3 修订。
- **G2**：新闻/书籍标题说明包含括号解释，但输出验证器只接受精确标题。存在格式偏差风险，不能把它写成“实测模型经常失败”。R3.3 对齐提示与格式规范。
- **G3**：主动问候当前是规则模板，这是现有设计而非漏装一个 Prompt；R3.2 先明确需优化模板还是另立受控生成需求。
- **G4**：非聊天模板没有独立版本字段，后续优化应补齐可追踪性，不要求先建设第二套 Prompt 平台。
- **G5**：背书允许同义复述，严格逐字/拼写检查是 R4.3 待开发能力。
- **G6**：当前 chat 没有经过验证的分支摘要；旧首尾截取不作为语义压缩质量基线，仍交 R5.4/R1.3。

这里记录的是现状、风险和待办，不是本轮已经修复的问题。

## 2. 已固定的离线基线

- 31 个合成样例：18 个正常、13 个边界；覆盖九类入口、五种聊天模式、四种解题策略、图片附件和三种游戏玩法。
- 捕获 **28 个模拟 Provider 请求**；无来源的新闻/书籍及关闭的反思各 0 次。真实模型/外网搜索/数据库调用均为 0。
- 样例实际调用既有 Model API、业务生成器、插件 operation registry、游戏 Prompt 与叙事生成器，注入 Mock Provider/搜索/Repository，而非手写一套相似模板。
- 正常模板拼装与验证器拒绝路径分开：空输出、无来源、伪造引用编号、错误标题、无效 JSON/Schema，以及聊天祖先链、记忆移除/搜索拼装均有记录。
- 游戏样例捕获实际 Prompt 与生成传输；不把它当作完整状态事务验证。该部分沿用既有 GameSession 测试，不虚构本轮新增覆盖。
- 合成书目、图像占位和回答仅用于验证格式/传输；不提供给真实用户作书籍推荐，不代表图片识别或答案质量。

`evals/r3/baseline.json` 保存 17 个规范化换行后的源文件 hash、31 个样例定义/请求 hash、消息数、输入文本字符数和图片标志。它不包含 API Key、真实用户对话或真实输出。字符数不含图片字节，不等于 Token、缓存命中或费用。源文件 hash 包含相应模块的非模板代码，因此只改相关逻辑也可能触发复核；漂移是审查信号而非自动证明质量变差。

## 3. 质量评分与后续对照口径

离线结果只判定“提示词拼装/验证契约是否维持”。**实际正确率、自然度、任务质量、真实延迟、Token 与费用全部尚未测量**，命令使用 `not-measured`、`not-run` 或 `null`，不得填零分/零费用冒充测量。

人工维度：任务完成度、可操作性、事实/引用、模式适配、工具诚实性、自然度、上下文连续性。每个样例带 `input` 与针对性 `criteria`；0–4 分按以下统一尺度：

| 分数 | 评价含义 |
|---|---|
| 0 | 任务失败或明显违背该维度 |
| 1 | 严重缺陷，需要主要重写 |
| 2 | 部分满足，用户仍需显著补救 |
| 3 | 达到可用要求，仅少量问题 |
| 4 | 准确、贴合且清楚，无明显问题 |

不适用的维度标 `not-applicable` 并说明理由；未评价保持 `null`。无来源编造、假工具/假成功、兄弟分支/虚构现实混入等为关键失败，不能用平均分掩盖。

后续 R3.2/R3.3 的比较规则先固定如下，R3.4 汇总，不事后改门槛迎合新模板：

1. 固定题目、上下文、资料/工具结果、Provider/模型、生成参数与评审尺度；记录模板/源码/样例指纹、日期及模型实际标识。模型版本或检索结果变化另列，不能当提示词收益。
2. 正常任务至少每类扩充到 5 个有代表性的案例，覆盖已有失败/负反馈；同条件至少 3 次，说明模型随机性。格式错误 Mock 是验证器样例，不直接算作真实模型失败率。
3. 关键失败数为 0；受影响确定性回归不退化；真实结构化输出合同通过率至少 95%；至少 80% 适用正常案例的人工均分达 3.2/4，其余案例不得低于 3/4。对照中任何维度明显退化须解释并重新确认，不以总平均掩盖。
4. 人工比较尽量隐藏新旧标签，保存评分理由和失败例。性能/总费用单列：包含额外反思、卡片、检索/摘要/重试等调用，不只看主回答 Token；R3.1 不承诺固定节省比例。
5. 真实调用、外部数据传输和预算须先获同意；本工具没有付费开关。不为取得评分自动读取用户 Key、发送历史或引入第二模型裁判。

## 4. 如何复跑与维护

在 `web/` 中运行：

```powershell
npm run eval:prompts
npm run eval:prompts -- --review-sheet
npm run eval:prompts -- --candidate
npx --no-install vitest run tests/promptBaseline.test.ts
npm run eval:core
```

- 默认命令打印检查结果并比对已提交基线；合同失败或源/样例/请求漂移返回非零状态，不改文件。
- `--review-sheet` 打印待填写的人工评分表，所有实际分数/费用初始化为 null；不生成真实答案、不把 Mock 当作模型回答。
- `--candidate` 仅打印待审查的新基线 JSON；**不自动覆盖旧基线**，合同失败仍非零。后续改模板须先查看差异、跑回归并记录理由，再显式更新基线。
- 新增 `stream/generate/generateWithImage` 调用文件时测试要求同步清单。这个轻量检查是词法扫描，配合人工调用链审查使用；不是能证明任意动态执行路径的静态分析器。
- 后续做前后真实质量对比时，用 R3.1 交付提交重建旧模板，避免仅有旧 hash 却无法重现旧请求。源模板和合成输入均保存在 Git 中。

本阶段只新增离线评测、脚本与文档，不改变应用运行路径；无需重建 Docker 或 APK。依赖仅按已有 lockfile 安装，未增加或升级包。后续进入 **R3.2：自动/专业/陪伴/反思及主动联系模板优化**。
