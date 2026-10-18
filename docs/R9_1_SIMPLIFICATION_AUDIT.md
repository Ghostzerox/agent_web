# R9.1：现状解构与删改清单

- 日期：2026-10-18；状态：盘点与决策清单完成，**尚未实施删除、迁移或重构**。
- 源码基线：`1003470`（R9规划提交）；承接 [R9规划](PROJECT_SIMPLIFICATION_PLAN.md)。
- 可复核数据：[inventory-baseline.json](r9/inventory-baseline.json)。只读采集器：`web/scripts/r9-inventory.mjs`，在 `web` 下运行 `node scripts/r9-inventory.mjs`，仅输出 JSON，不写入文件、不调用应用 / 网络 / 模型 / 数据库。

## 1. 结论

确有已退出产品主路径、仅由旧测试维持的实现，适合先删除；还有仍在主路径中的兼容逻辑，适合统一数据后退役。**不是项目中所有复杂度都来自兼容旧版**：大容器、重复请求封装、跨层类型依赖和重复登记也增加维护成本。

最先处理的五个源文件是旧 Browser Backend、Dispatcher、关键词 Planner、空摘要占位器、探索 preset 别名，共 **258 个非空物理行**，不含配套测试。它们没有当前生产入口的静态依赖路径；同时核对了脚本、框架入口和实际源码引用，未把数据库工具误判为废代码。删除别名 / 类型前仍须统一相关测试调用者。

收益先以去除概念和维护点衡量，不承诺大幅缩小客户端包：未进入生产路径的代码本来可能没有打包；删除旧测试、快照和文档主要减少维护与仓库负担。

## 2. 当前系统解构

```text
Web：app 页面 / AppShell ──────┐
                              ├→ 同一批 UI / 领域操作 → API Clients
APK：mobile/main → MobileApp ──┘                         ↓ /api/v1
       ↓ 平台能力（文件 / 语音 / 本地通知）      Next Route → API 编排
                                                        ↓
                                              领域规则 / Repository
                                                        ↓
                                                 PostgreSQL
独立 Worker：reminder-worker → 调度 / 生成 / 投递 ─────────┘
模型：显式请求 → Persona / Memory / 检索 / Prompt → measured Provider
探索：通用引擎 ← 服务端世界模板；客户端只读公开简介

旧的孤立子图：Browser Backend ← Dispatcher ← 旧测试
             Task Planner（无调用者） / 空摘要器（仅旧测试）
构建 / 运维独立入口：Capacitor、Gradle、db-migrate / rollback、备份脚本
```

当前事实来源是 PostgreSQL，而非 Browser Backend。Web 与 APK 是共用业务的两个必要宿主，不是两套过时业务实现；path/hash、浏览器下载/原生分享、本地通知/Web Push 有真实平台差异，不能为“单一实现”把它们全部删除。

### 数量基线与测量口径

| 指标 | 基线 |
|---|---:|
| Git 已提交文件 | 918 |
| `web` 下 TS/TSX/JS/MJS 文件（不含 `.d.ts`） | 590 |
| 产品源码：`app/components/lib/mobile` | 354 文件 / 35,824 非空物理行 |
| Web 页面 / API route 文件 | 23 / 62 |
| 单元测试文件 / E2E spec 文件 | 160 / 29 |
| npm 直接依赖 / 开发依赖 / scripts | 20 / 16 / 23 |
| 数据库 up / rollback SQL | 34 / 34 |
| `docs` Markdown / R3目录历史基线 JSON | 110 / 15 |
| 静态导入边 / 其中类型边 | 1,678 / 299 |
| 产品文件：含类型可达 / 运行时静态可达 | 345 / 341 |
| 静态运行时循环 / 含类型循环组 | 0 / 5 |
| 客户端运行时图触及 `db/repositories/ai/server` 文件 | 0 |

可达性不是死代码证明：采集显式 import、export、字符串动态 import 和 import type，补录 Next manifest / 页面 / API、移动入口与 Worker。数据迁移 CLI、Capacitor 配置、原生注册另行人工核对。没有发现静态运行时循环，不应把类型循环说成运行时崩溃。

已有 R8 本地产物（**未为盘点重建**）：`mobile-dist` 2,389,131 bytes，`.next/static` 3,176,837 bytes；不含完整服务端、APK或 Docker镜像。额外 Docker 体积测量因审批服务额度故障未执行，不能据此估算镜像精简百分比。旧R8测试耗时不作为R9重新实测：最后已交付基线为659项单元/SQL、59项Web、26项React专项。

最大模块的非空行数：`db/schema.ts` 1,543；`gameSessionRepository.ts` 746；聊天页611；`TaskManager`592；`pluginCapabilityRepository`571；`GameSessionManager`531；`GamePlayPanel`448。数字只用于排序，密集单行 JSX 不等于低复杂度。

## 3. 实际数据与支持边界

### 本机只读核对

2026-10-18 16:32（上海时间）使用数据库 `repeatable read read only` 事务，确认 `transaction_read_only=on`。只查询条数、版本与字段缺失计数，不输出正文、用户标识、密钥或配置值。为减少个人元数据落库，本报告只记必要结论，不保存聊天数量。

| 对象 | 实际观察 | 对清理的影响 |
|---|---|---|
| 数据库迁移 | 已应用34份，末条 `0033_task_actions.sql` | 保留校验链，不改写已应用 SQL |
| 服务端对话 / 消息 | 均非空 | 不得以重构为由清空；保持树形关系、引用、当前版本读写 |
| 游戏会话 / 回合 / 检查点 | 均为0 | 当前没有旧游戏快照需迁移；实施前复核，不能把空集当成旧数据升级测试通过 |
| 插件存储 / 宫殿 | 当前为空 | 没有观察到需迁移的学习材料 / 宫殿；不能因此删除仍可用的学习功能 |
| 凭据 / 环境回退 | 存在服务端保存凭据；完整 `AI_API_KEY/AI_BASE_URL/AI_MODEL` 环境回退未配置 | 可优先收敛到 Credential Vault；主密钥与数据库连接仍保留环境注入 |
| 浏览器导入收据 | 0 | 只说明此库无导入收据，不证明所有浏览器没有旧数据 |
| 浏览器 localStorage / 用户已下载文件 / 手机安装版本 | 未访问真实浏览器存储或手机 | 标为未知，不擅自清除；不要求现在进行真机测试 |

这是时点快照，不是持续保证。R9.2 只在实施相关迁移或删除兼容分支前复核受影响项；不用为每次纯源码清理重做全库检查。

### 唯一规范版本与退出策略

| 范围 | 当前规范 / 明确选择 | 退役范围 |
|---|---|---|
| 前后端 / APK | 当前配套版本；Web + 本地 React（Vite）+ Capacitor 本地打包 | 远程 `spike` 壳、无限旧 APK / 新后端组合不再维护；不重写双端业务 |
| 对话 | 服务端父子消息树；当前投影 schemaVersion=2；字段完整的 Session/Message 类型 | 旧线性消息、单消息 `versions/activeVersion`、常驻 Browser Store 转为一次性导入边界，完成后删除 |
| 模型配置 | 网页填写→Credential Vault→服务端解密调用 | 退役环境模型凭据回退和旧浏览器配置入口；`CREDENTIAL_MASTER_KEY` 不属于回退项 |
| 游戏 | 当前严格 GameState；现用 `game-state.v2` 规则包与 `exploration.v1` 是不同玩法；探索状态v1，正式模板 `fog-harbor@1.0.0` | 退役缺字段历史快照的隐式补值；启动要求显式模板版本；不把版本字样等同废弃玩法 |
| 插件 / 学习 | Plugin API `1.0.0`、Manifest schema `"1"`；背书 / 解题材料schemaVersion=1 | 不保证未知旧插件包自动兼容；现有授权检查与三项第一方Activity保留 |
| 输出文件 | 游戏 JSON v3；Prompt导出v2 / Envelope v1；记忆包v1；背书 `agent-web/memorization-v1` | 不新增不存在的旧文件导入兼容；游戏导出本来就不是恢复接口 |
| 本地通知 | 现用 `local-task-reminders-v1` 缓存与显式同步 | 缓存版本不是业务数据库版本，不与游戏 / 记忆版本强行统一 |
| 入口 | 七个R8模块、学习宫殿规范路径 `/study/memory-palaces`；知识来源仍为带保存版本的原文链接 | 退役 `palace=learning` 别名须先改背书页的实际链接；不是所有旧URL都要删除 |

数据库行的 `version` 多为并发控制版本，不是旧格式；来源修订、模板版本、Prompt策略版本和文件格式版本含义不同，不能为了精简全部合并成一个版本号。

## 4. 删改决策登记表

“删除”表示后续实施方向，**不是本轮已经删掉**。R9.2按下表分批执行；涉及未知浏览器数据或功能取舍的门槛单独列出。

| ID / 处置 | 对象与源码证据 | 删改、收益与影响 | 门槛 / 验证 / 阶段 |
|---|---|---|---|
| D01 删除 | `lib/runtime/backend.ts`、`lib/agent/dispatcher.ts`：只有彼此和 `tests/backend.test.ts` 导入，当前聊天直接使用服务端Client | 删除旧任务Map / Hook / localStorage会话写入引擎及只为该引擎服务的测试；保留取消与异步删除的现用聊天测试 | 不改PostgreSQL；搜索所有入口无调用，聊天生命周期 / 取消 / 删除回归；R9.2首批 |
| D02 删除 | `lib/agent/taskPlanner.ts`：源码零导入，关键词“计划”示例不被当前调度器使用 | 删除无作用的步骤生成器，不删除真实Scheduler/TaskRun | 全仓符号 / 动态入口核对；R9.2首批 |
| D03 删除 | `lib/agent/contextCompressor.ts`：明确Deprecated，`compress`恒返空，仅旧测试引用 | 删除占位 API、阈值和测试；真实分支摘要继续使用 `conversation/summary.ts` / Repository | 分支摘要与原文保留测试不删；R9.2首批 |
| D04 删除 | `lib/game/exploration/preset.ts`：仅两个测试文件调用；catalog的 `fogHarbor` 再导出亦供测试 | 测试直接使用公开模板目录 / 私有测试定义；删兼容转出口，不改模板版本或剧情 | 模板隔离、完整雾港旅程回归；R9.2首批 |
| D05 删除并迁移类型 | `lib/agent/memory.ts`：产品只作类型依赖，`addMemory/getMemory/clearMemory/summarizeSession`仅旧测试执行；聊天传入 `memory:[]` | 移除旧浏览器记忆读写及截断摘要器；移走必要DTO或移除无生产用途的客户端memory参数；服务端确认记忆流程保留 | 旧 `agent_memory_store` 是否含数据未知：不读不删该Key；如要导入须审核，不能自动变正式记忆。Prompt / 候选 / 删除失效回归；R9.2 |
| M01 合并 | `lib/config.ts` 同时包含现用Session类型和旧存储；`ai/messages.ts`有可选id及旧versions字段；`tree.ts`每轮尝试normalize | 把当前类型与一次性Legacy格式分离；当前路径不再反复接受旧结构；保留树操作而非删树结构 | 先完成X01；修订旧格式测试夹具，不用旧夹具强迫当前类型长期可选；R9.2 |
| X01 一次性迁移 | 聊天页旧导入提示；`legacyImportClient/Api/Repository`、`/api/v1/imports/local-storage`；收据表当前为空 | 选择一次性本地导出 / 显式导入窗口，完成后去掉常驻UI与HTTP导入；已导入的正常对话不删 | 真实浏览器存储未知，先确认是否要保留旧数据；无需为检查Key读取正文。无数据可直接退役，不再加永久新兼容层；R9.2 |
| X02 一次性清理 | `LegacyApiConfigCleanup` 在api-key页，聊天也调用清理旧 `agent_api_*` Key | 收敛一次性清理入口，完成后移除配置读取时代残留 | 删除清理器不能遗留旧明文Key；只删除明确旧凭据Key，不擦除当前数据库凭据 / 其他localStorage；R9.2 |
| D06 收敛配置 | `ai/server/modelConfig.ts`、`modelCredentialService.ts`、Compose环境fallback；当前Vault有值而环境回退未配置 | 以Vault为唯一用户模型配置来源，去掉stored/environment双源分支；保留URL规范化、凭据保护与运行预算配置 | 清除已存凭据后应明确“未配置”，不能悄悄恢复环境模型；健康 / 保存 / 删除 / Worker取配置回归；R9.2 |
| D07 删除旧打包轨 | `capacitor.config.ts` 的spike分支、`mobile-shell/index.html`、`mobileServerUrl.ts`、`mobile:sync:spike`及专项测试 | 只保留本地React→mobile-dist→Capacitor；不是删除APK或CORS | 更新脚本 / 示例 / 指南引用，构建不含server.url；真机继续汇总，不现在装包；R9.2 |
| X03 格式收敛 | `game/state.ts::normalizeGameState` 会补characters/items/sceneFacts/sceneExits；当前游戏数据为空 | 规范读取改为严格当前Schema；旧补值仅在有真实旧存档时一次性执行，不保留每轮隐式升级 | 实施前复核回合与检查点；当前空集不代表旧迁移已验；合成旧数据 / 当前新局 / 分支 / 导出回归；R9.2 |
| D08 收敛请求 | `explorationAction.start.templateVersion` 可省略，TurnService从会话标记补版本 | 当前客户端要求显式版本；统一测试 / HTTP检查脚本；去掉旧客户端补齐分支，保留模板绑定检查 | 仅保留当前模板和显式请求；版本固定不是多余兼容，不能把“取最新版”作为简化；R9.2 |
| D09 删除入口别名 | `memoryView.ts` / `workspaceNavigation.ts`支持 `palace=learning`；背书页仍有实际链接 | 先改背书页到规范学习路径，再删别名解析与其专项断言，去掉模块归属特殊情况 | 明确旧书签不再支持；真实知识引用不是该别名，不能一起删；材料→宫殿 / 返回回归；R9.2 |
| M02 合并传输胶水 | 多个 `lib/api/*Client.ts`各自JSON解包、请求头、204及错误解析，仍共享底层apiFetch | 一个轻量JSON请求助手，业务Client保留类型和错误映射；SSE / 下载不强行塞进去 | 先列各错误契约差异，禁止悄悄移除code/status/retryable或自动重试写操作；R9.3 |
| M03 分解大容器 | `app/chat/page.tsx`611行；TaskManager592；GameSessionManager531；GamePlayPanel448 | 把会话/草稿/流式请求生命周期与展示按职责拆开；消除重复刷新 / 冲突处理，减少理解范围 | 保留取消、非最后消息重生成、草稿、分支、CAS和请求回执；不提取只换名字的hook层；R9.3 |
| M04 收拢类型与边界 | 5组含类型环：config↔tree、messages↔citations、memorization domain↔learningTools、Gateway↔Adapter及schema/memory/knowledge八文件组 | 纯契约放中性模块，避免领域类型从db schema / Repository倒流；schema可按域组织但维持唯一表定义 | 当前运行时环为0，不宣称修复了运行时死锁；类型检查及原SQL/权限测试；R9.3 |
| M05 收敛登记 | Web页面、MobileApp路由、workspaceNavigation、ActivityRegistry、Manifest、模板公开/私有目录 | 同一事实减少重复维护；活动声明引用已有ID，导航可复用小型描述表；私有世界和公开简介必须继续分开 | 路由归属不等于授权；不得为“统一”把隐藏剧情打进客户端或把所有Registry合成权限框架；R9.3 |
| M06 解开跨域工具依赖 | 背书 `learningTools.ts` 为抽测导入 `game/dice.ts`；游戏导出从TurnService取路径函数 | 仅把真实共用的随机 / 路径纯函数提到中性位置，保留各域语义 | 相同种子结果与牌堆 / 抽背回归，不引入新工具平台；R9.3 |
| M07 精简评测历史 | `evals/r3`15份baseline；当前CLI用 `baseline-r7-templates.json`，测试导入多份历史，另有只在文档提及的快照 | 当前契约保留一份有效基线，旧变更证据进入Git/历史索引；不每轮重比所有历史源码指纹 | 80样例与当前请求/夹具冻结、费用账本保留；必要行为测试不靠删测绕过；R9.4 |
| M08 整理文档 | 110份Markdown；README仍写“下一步R8”，多处历史规范交叉指向 | 一份主线+当前操作指南，阶段报告保留历史标签或归档索引；去掉失效“当前”说明 | 链接 / 事实 / 编码检查；本轮先纠正README和主线，批量整合R9.4；不用删除现用运维说明来凑数 |
| M09 工具链与镜像 | 23个npm脚本；Docker runner复制全node_modules和scripts，Worker/迁移命令仍依赖tsx | 移除确认无用入口，评估运行依赖/产物分离；Web与Worker可共享构建产物，不能宣称现有重复标签等于双倍磁盘 | 先确认启动依赖；不能直接prune开发包导致tsx启动失败。镜像体积本轮未测；R9.4 |
| K01 保留 | 34份up/rollback及校验和；`db-migrate.ts/db-rollback.ts`、`postgresMigrationDatabase.ts`由启动脚本调用 | 非页面可达不等于废弃；先不做迁移历史压平，不改已应用SQL | 生产已有34份记录；数据库升级 / 新库安装 / 恢复说明留存；R9.2–R9.5保护项 |
| K02 保留 | Web/React宿主、path/hash、API Base URL、Capacitor文件 / 语音 / 通知、Web Push、CORS | 真实跨端实现，不属于旧版本双轨；允许去重通用部分，不强行共享平台行为 | 23页、原生桥和离线快照契约；真机仍未签收 |
| K03 保留最小接口 | `PushNotificationProvider`和Huawei契约；Huawei只被测试引用，尚无真实Provider注册；capabilities中部分聚合类型未使用 | 按用户既定需求保留小型推送扩展边界，可移除未用聚合类型 / 空属性；不扩建Huawei运行服务 | 保留接口不等于推送已实现；具体SDK/端点正确性本轮未外部核验，后续接入前验证；R9.3 |
| K04 保留 / 待取舍 | 轻量冒险、d20、牌堆、规则包与R7探索都有活动 / UI / 测试入口 | 默认保留当前功能；如要“只留探索”需用户明确功能取舍，不能以库里零存档替代决定 | 确认后才可删除整种玩法；零存档只降低数据迁移负担，不代表功能冗余 |
| K05 保留 | 凭据加密、分域记忆、来源版本、并发控制、幂等回执、模型预算、草稿保护 | 是当前约束而非纯旧版兼容；只合并重复实现 | 不为行数删除失败处理或把系统执行当用户完成；按改动定点回归 |

登记表共26项：D类9、M类9、X类3、K类5。编号为稳定跟踪标识，处置可能带前置迁移或与相邻项合批；不是26个新Sprint。

## 5. 依赖与误删排除

36个直接npm依赖中，有10个在本次静态源码图中没有import记录，**不能据此删掉**：`@capacitor/android`由Gradle `capacitor.settings.gradle`引用；`@capacitor/cli`由cap命令使用；`@tailwindcss/postcss`由配置字符串启用、Tailwind由CSS启用；`@types/*`由类型系统使用；tsx由Worker/迁移脚本使用；TypeScript由编译/检查工具使用。当前未证明某个包可无条件卸载，不编造“无用依赖”清单。

静态未从生产根可达的9个产品文件中：五个是首批删除对象；`huaweiPushContract`是明确保留的扩展约定；`mobileServerUrl`服务于拟退役spike构建；`migrations`与`postgresMigrationDatabase`是必要运维入口。旧 `agent/memory`另属仅类型可达，不能用“整文件无引用”方式直接删除。

## 6. 实施次序、未知项与验收

建议下一轮直接做 **R9.2第一批 D01–D04**：删除五个确定对象，统一相关测试进口，保留当前聊天 / 摘要 / 模板旅程。随后D07旧打包轨、D06配置收敛、D08显式版本；D05/M01/X01/X02按旧浏览器数据门槛合批，X03只在受影响数据复核后执行，D09先更新实际链接。无需等待所有未知项才能做第一批。

后续仅有以下选择可能需要用户决定：是否保留尚未核实的旧浏览器聊天 / 记忆；是否放弃仍可用的d20/规则包玩法；是否另有未披露的外部API消费者。默认不清空浏览器存储、不删现用玩法、不承诺未知消费者兼容。未披露消费者不是无限维护旧接口的理由，应在明确停止支持的发布说明中列出。

本轮检查：采集器语法与ESLint通过；静态内部import解析无未解决项；定点51项测试通过（Backend、旧摘要占位、config、树、旧memory、Prompt基线、Capacitor配置、模块导航）。这些通过只证明现状及证据可复核，不代表已完成删除或测试数量应永远不减。新增报告 / JSON / 脚本检查与Git交付状态见本轮提交。

没有重跑全量构建、Docker更新、APK构建或真机；没有付费模型 / Embedding调用。Docker额外体积诊断被自动审批服务额度故障阻断，未执行，也没有绕过；不影响已完成的源码与先前获准的只读数据核对。若同一环境限制阻止Git提交/推送，将据实报告，不宣称远端已更新。
