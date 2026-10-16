# R5.1：分域记忆、来源版本与渐进迁移规范

> R5.2 更新：本文件保留 R5.1 时的设计与历史限制。当前已实现知识集合/文档/分段生命周期及个人来源清理，详见 [知识资料库指南](KNOWLEDGE_LIBRARY_GUIDE.md)。尚未接入 RAG/摘要；下文“没有知识库/未处理证据”描述的是 R5.1 状态，不是 R5.2 最新功能。

- 日期：2026-10-16；状态：R5.1 已实现，R5.2–R5.6 待实施。
- 策略版本：`memory-domain/r5.1-v1`。
- 决策：[ADR-064](adr/ADR-064-memory-domain-source-and-incremental-migration.md)。验收：[R5.1 报告](reports/R5_1_REPORT.md)。

## 1. 本阶段解决什么

让个人事实、学习资料、任务结果与游戏剧情各归其位，并为接下来可用的资料库约定来源和更新方式。复用现有 Memory/Candidate/Usage、插件存储和 GameSession，不另建通用 Agent 框架。

本次真正接入生产的是个人记忆检索的模式限制和调用前复核：专业/自动、陪伴、反思可按原规则检索已确认记忆；娱乐模式不读取个人记忆。候选提取也复用相同模式映射，未知模式默认不允许。

新建的来源引用/派生依赖校验是**纯数据契约和测试**，尚无知识库读写 API、向量索引、摘要生成或后台清理。不能把这些契约的测试结果当成 RAG 已实现。现有 UI、API 路由和插件 v1 能力不变。

## 2. 四层数据与信任关系

1. **个人事实**：用户明确确认的 MemoryItem。偏好、目标、资料、事实，带版本、敏感性与有效期；候选、模型推断不能直接检索为正式事实。
2. **知识资料**：用户选择的集合、文档、章节/片段及来源定位。是待引用材料，不是用户的人生经历，也不是 System 指令。
3. **模块状态**：任务运行、新闻去重、阅读反馈、学习记录和游戏状态；由对应服务写入，不能用通用记忆写接口覆盖。
4. **派生材料**：片段、索引、向量、摘要、位置关联。必须能追到原始来源和版本，可重建，不能成为唯一权威。

数据读取顺序：服务端确定 owner → 当前模块/已授权集合或数据集 → 会话和活动分支祖先 → 有效期/状态/版本 → 相关性排序 → 去重与预算 → 最小上下文。owner 和作用域限制必须在读取候选正文/排名之前完成，不先全库召回再在 Prompt 中遮掩。

`MemoryReadContext` 的 owner、集合授权、数据集和祖先列表只能由宿主从真实认证上下文、Repository、Capability Gateway 与树遍历产生，**不能从客户端 JSON 直接采信**。纯函数通过并不能证明伪造的服务端元数据是真实的。本阶段没有增加接受这些字段的公开接口。

当前仍是 `LOCAL_USER_ID` 单用户部署；owner 过滤和跨 owner 反例保留，不表示多用户认证/登录已交付。

## 3. 十六模块读写矩阵

个人栏为已确认个人记忆的自动注入上限。知识栏为**未来额外检索上下文的初始上限**，不是已接入的功能或整段对话预算。`5/500` 表示最多 5 条、估算 500 Token；字符估算不是模型真实计费 Token。零预算表示不主动读取该类上下文，不禁止用户主动在本次消息里提供材料。

| 模块 / 策略 ID | 个人上限 | 知识预留上限 | 可读事实来源 / 范围 | 可写内容与约束 |
|---|---:|---:|---|---|
| 自动/专业 `professional` | 5/500 | 6/1800 | 已确认相关个人事实、当前对话祖先；未来仅显式专业集合 | 提议候选→用户确认；不能自动覆盖事实 |
| 陪伴/人格/主动联系 `companion` | 5/500 | 0 | 陪伴对话的 Persona、个人事实、当前祖先 | 候选确认；主动联系沿用显式原因白名单和非敏感目标筛选 |
| 反思 `reflection` | 5/500 | 3/900 | 反思聊天的个人事实、当前祖先；独立反思画像/反馈，未来反思集合 | 候选确认；画像/反馈仍由专属服务写 |
| 新闻/简报 `news` | 0 | 6/1800 | 已选搜索来源、日期、已发送来源；未来新闻集合 | 简报、引用和去重账本，不写个人事实 |
| 书籍/阅读 `reading` | 0 | 5/1500 | 显式阅读画像、书目来源、反馈；未来阅读集合 | 阅读画像/反馈/推荐记录，不推断全局喜好 |
| 任务 `tasks` | 0 | 3/900 | 已保存 Task、真实 TaskRun；未来任务集合 | 现有版本/幂等/执行状态服务，草稿须确认 |
| Inbox/通知 `inbox` | 0 | 0 | 自己的 Inbox、投递/已读状态 | 已读、投递诊断；展示结果不额外生成 |
| 背书 `memorization` | 0 | 4/1200 | `study.memorization` 数据集/材料/复习记录；未来同域集合 | 只经 Gateway 写自己插件存储；抽测/评分不成为现实事实 |
| 解题 `problem-solving` | 0 | 4/1200 | `study.problem-solving` 题目、尝试、复习卡；未来同域集合 | 只经自己 Gateway；错题不是永久能力诊断 |
| 娱乐 `game` | 0 | 4/1200 | 同 GameSession 当前祖先/状态/检查点；未来游戏规则集合 | 会话事务/版本写状态；虚构剧情不得转成个人事实 |
| 记忆管理/Persona `memory` | 0 | 0 | 用户管理页现有 owner 范围，不是模型检索入口 | 用户确认、更正、删除；Persona 配置独立 |
| 语音 `voice` | 0 | 0 | 已选择的待朗读文本、语音偏好 | 保存语音偏好；朗读不获得额外私人数据 |
| 插件 `plugins` | 0 | 0 | 现有 v1 Manifest/授权/Activity 元数据 | 仅声明并授权的 v1 能力；不新增全局记忆权限 |
| 配置/导出 `configuration` | 0 | 0 | API 配置的既有最小 DTO；已选择 Envelope | 凭据服务与现有导出；Key 永不进入检索索引 |
| 导航/双端 `navigation` | 0 | 0 | UI 路由与界面状态 | 导航不产生记忆/事实 |
| 维护 `maintenance` | 0 | 0 | 用户确认的备份/恢复范围与作业状态 | 只用明确维护权限；预演不是执行恢复 |

矩阵是读取与后续设计约束，**不是把现有管理 CRUD 禁掉，也不是给所有模块开放新接口**。`ownWrite` 描述宿主已有写入边界，并不实现写入授权。

### 现状与矩阵的必要区别

- 自动、专业、陪伴、反思聊天均通过 `retrieveForMessage`，读取数据库保存的 conversation.mode，不信任客户端临时模式。现有 Memory 检索对相关的 sensitive 记忆仍保持兼容，尚未增加按模式的敏感开关；更细粒度用户控制归 R5.6。
- 独立定时反思只读取其显式画像/输入，没有因为本矩阵而注入个人记忆。新闻可再调用反思生成，但上下文仍走各自现有流程。
- 主动联系当前是确定性模板，不是模型检索。已有 `goal_followup` 会在用户开启相应原因后，筛选同 owner、未过期、非 sensitive 的目标；本次不扩大或删除此功能。
- 旧版 entertainment 聊天仍可使用现有对话树和 Persona；本次隔离的是全局个人 Memory。它不是独立 GameSession，也不会自动获得游戏状态/RAG。
- `personal` 已确认事实可按允许的模式跨自己的会话复用；其原证据来自另一分支不等于兄弟分支泄漏。**原始消息、剧情和派生分支摘要**才必须匹配活动祖先。

## 4. 来源引用与版本契约

代码：`web/lib/memory/sourceReference.ts`。严格 Zod Schema 拒绝未知字段、缺少 revision、错配 scope/sourceKind；无版本的消息和游戏回合必须携带内容 hash。

```text
MemorySourceReference
  ownerId + sourceKind + sourceId + scope      ← 稳定身份
  revision { version | contentHash }           ← 至少一个；两者都有则都须相同
  state + sensitivity + personalKind + validUntil

MemoryReadContext（只接受宿主解析结果）
  ownerId + consumer
  collections[{module, collectionId}]
  datasets[{module, datasetId, pluginId}]
  conversation{id, ancestorNodeIds} | game{id, ancestorTurnIds}

DerivedMemoryManifest
  policyVersion + strategyVersion + authoritative sources[]
```

| 真实来源 | 复用 / 后续适配方式 | 修订与定位约定 |
|---|---|---|
| `memory_items` | 复用现有表，无搬家 | item.id + version + TTL/敏感性；确认事实不受来源消息删除隐式撤销 |
| `memory_candidates` | 复用 pending/confirmed/rejected 与证据 | candidate.id/version，仅用于提议/溯源，不能作为可注入事实或唯一派生依赖 |
| `messages` | 复用现有 conversationId/parentMessageId 树 | 无独立内容 version；后续适配器 hash 规范化的 role/content/status/parent/citations 等语义字段；引用原节点 ID |
| `game_turns` / checkpoint | 复用 session/parent/状态快照 | turn.id + 语义内容 hash；校验祖先再读取；检查点不是全局个人记忆 |
| `plugin_storage_entries` | 保留 owner+plugin+key+version | datasetId 由宿主确定，引用 pluginId+key+version；材料定位到 material/unit ID，禁止另一个插件访问 |
| TaskRun/Inbox/推荐/阅读等模块表 | 保留各自权威服务 | 已有 version 则复用；可变 TaskRun 不能只用 attempt，需要状态/结果等语义内容 hash；定位 runId/recordId |
| KnowledgeCollection/Document | R5.2 确需时新增 PostgreSQL 表 | owner/module/collection/document ID、文档 version/hash、来源 URL 或文件信息、标题/段落锚点、状态 |
| Chunk/Index/Summary | R5.2–R5.4 分批新增 | 根文档/消息等版本清单 + 分块/索引/摘要策略代次；片段位置/覆盖节点必须可回到原文 |

hash 适配器应使用稳定键序 JSON 和 UTF-8 的 SHA-256，排除 useCount/lastUsedAt 等无关计数；纳入会改变语义的字段。换规范必须升级 strategyVersion。**本次只有引用 Schema，没有实际数据库记录到 hash 的新后台适配器。**

个人来源必须是 personal scope，知识只能是 collection，学习是指定 plugin 的 module，消息只能是 conversation，游戏回合只能是 game；不能改一个 sourceKind 把剧情伪装成事实。纯契约不能核实正文真实性，实际适配器必须查询真实记录，禁止接受模型提供的引用当权威。

## 5. 失效、删除和分支规则

`assessMemorySourceRead` 先检查元数据、owner、active、TTL，再检查同域授权和祖先。`assessMemorySourceRevision` 额外要求真实来源存在、身份与修订完全相符。未知、缺失、过期、删除、换版本默认不能复用，而不是“先用缓存再说”。

`assessDerivedMemoryManifest` 要求策略版本、处理策略版本及所有权威依赖都有效且不重复；拒绝只依赖 Chunk/Summary/Candidate 的清单，避免摘要套摘要失去根源。后续分块应依赖 Document，摘要依赖原始消息；模型/维度/分块配置变化应换索引代次，不能混用向量。

祖先列表必须从当前选定叶节点沿真实 parent 链得到，验证同 owner、同会话、无环和数量上限；不能让客户端声称某节点是祖先。兄弟分支不能读；公共祖先可共享。摘要覆盖节点需全部仍在当前祖先内且版本一致；规则只是复用判定，R5.4 还需实现选取/生成/失败降级。

### 现有删除行为及保留缺口

- 现在删除/更正 MemoryItem 会影响下一次检索；调用前的事务校验防止已选取的旧版本或已删 item 被记入新模型运行。测试验证失败事务不留下 PromptRun/Usage 半成品。
- 原对话/消息外键为 `ON DELETE SET NULL`。**删除对话不等于删除用户另行确认的个人事实，也不等于已清除 candidate.evidenceQuote。** 本次不暗改这一产品语义。
- R5.2 必须提供清晰的“只删来源”与“同时处理关联个人记忆/证据副本”的提示和规则，并验证候选证据、派生资料不会成为未披露的可检索副本。删除事实仍可能保留不含正文的既有使用审计 ID。
- 未来文档删除/修订先在权威源标记失效，检索从根来源检查；再异步清理片段/向量/缓存/摘要。清理失败可重试，但失效源正文不能继续召回。物理备份的保留期和旧备份恢复也需明确，不声称瞬间擦除所有副本。
- 已发送给 Provider 的在途请求无法撤回；调用前复核不能保证事务提交后发生的删除会撤回远端请求。

## 6. 渐进迁移、备份与回退

| 阶段 | 实际变动 | 验证与回退 |
|---|---|---|
| R5.1 当前 | TS 策略/契约、检索模式检查、调用前复核；**0 SQL 迁移** | 现有 28 份迁移保持字节/校验记录；代码回退不涉及数据回滚，但会恢复旧娱乐读取缺口 |
| R5.2 | 新增集合/文档/必要片段表；旧 Memory 不批量搬迁 | 修改 schema 与新增 migration/down，隔离测试库演练旧数据升级、备份恢复；原表兼容读取，按稳定 source key 幂等导入，失败记录状态，不双写两套事实 |
| R5.3 | 先词项索引；语义有收益才引入可选向量代次 | 原文表为权威；索引可重建、离线可降级；新增镜像/扩展需专门兼容验证，不默认改 PG 镜像 |
| R5.4 | 分支摘要与依赖元数据；共用 R1.3 | 关闭摘要即回现有窗口策略并明确截断/限制；保留原消息，不用摘要覆盖正文 |
| R5.5–R5.6 | 轻量 Palace/关联/路由与用户控制 | 关联仅作视图；删布局不删原文；导入恢复须先预演和确认 |

每次未来数据迁移前：记录当前应用 commit/迁移版本 → 对真实 PG 做带校验的逻辑备份并保密保存 → 在隔离库恢复验证 → 记录各表规模、孤儿/失效来源数量 → 升级演练 → 再执行部署。不能把临时文件列表当备份验证；不在命令/日志中打印 DATABASE_URL、Key 或正文。删表 down 不是可靠数据回退，已有新资料时先导出/保留新表，优先回退兼容应用版本；实际 down 需明确授权，禁止 `down -v` 清空持久卷。

多人迁移继续沿用 owner 字段，届时才把 LOCAL_USER_ID 替换成可信会话主体，并对 Repository/API/任务执行/插件一起验收，不能只换前端账号。

## 7. 后续检索评测：规模、标注和门槛

目前没有完整知识库，**真实用户数据规模和 RAG 指标未测**。不为了设计读取私人正文。R5.2 接入后记录 owner 授权范围内的文档/片段/存储字节统计，先报告统计再决定索引策略。

R5.3 固定合成基准建议为 100 篇文档、约 1,000 片段，另设 10 倍规模压力层；学习插件首期仍受现有 12 材料×24 单元、64 KiB 存储上限约束，不拿压力层当已支持的插件容量。另在授权的实际规模上复测，两种结果不混算。

固定 80 查询：中文直问 16、中文同义改写 12、缩写/中英 8、多来源 8、无答案 12、旧版/删除 8、跨 owner/跨域/兄弟分支 16。标注 query/consumer/grants/活动叶/source ID+revision/答案位置/应无答案，由人工核对金标；划分调参集与冻结验收集，不以模型自己打分代替来源标签。

| 指标 | 暂定验收门槛（不是本次测量） |
|---|---|
| Recall@5 | 有答案集总体 ≥85%，并逐类报告；记录原算法基线，不牺牲隔离换召回 |
| 无答案误召回 | ≤5%；小样本报告分子/分母，12 个无答案例需 0 误召回才能达标 |
| 来源定位正确率 | ≥95%；命中源 ID、版本、原文锚点均正确才算，旧引用不可凑数 |
| 跨 owner/域、兄弟分支、删除后正文泄漏 | **0**；任意一例阻断交付 |
| 旧版本/过期命中 | **0**；根来源版本改变立即不可复用 |
| 检索延迟 | 上述基础规模本机热 P50 ≤100ms/P95 ≤300ms，冷 P95 ≤1000ms；记录机器/索引/并发，超出则解释并评估，不隐藏冷启动 |
| 成本/上下文 | 记录实际输入输出与检索/Embedding/重排/摘要/重试总成本；离线检索费用 0，估算预算不能称实测省钱 |

指标先在相同数据、相同检索预算和固定版本比较。人工确认摘要约束/未决事项是否保留、陪伴是否连续、联想是否有用另行验收。后续所有付费测试共用原 ¥3 台账，R5.1 消费 ¥0；未经许可不把私人材料发给 Embedding 服务，也不假设当前 chat Base URL 有 Embedding。

## 8. 实现入口和下一步

- 策略：`web/lib/memory/domainPolicy.ts`；来源/派生依赖契约：`sourceReference.ts`。
- 生产接入：`memoryRepository.ts`、`memoryCandidateService.ts`、`promptRunRepository.ts`。无新增缓存、不改调用次数、不增加收费模型。
- 反例：`web/tests/memoryDomainPolicy.test.ts`、`memoryRepository.test.ts`；Prompt R4 历史快照保留，当前 `baseline-r5.1.json` 加入真实记忆读取边界的源码指纹，原 80 个请求/样例 hash 不变。
- 下一步 R5.2：先交付可见的集合/文档文本与 Markdown 导入、列表/来源、更正/删除，以及个人记忆来源删除提示；再推进 R5.3 检索。不是继续搭空框架。
