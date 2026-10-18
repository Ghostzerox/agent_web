# R9.3：模块解耦与单一实现

> 历史交付证据：下文只记录该阶段当时的结论、限制与后续建议，不是当前待办或可直接重跑的付费指令。当前状态见 [产品主线](../PRODUCT_MAINLINE_GUIDE.md)。


- 日期：2026-10-18；对照起点：`8644aab`（R9.2）。
- 范围：R9.1 的 M02–M06 与 K03 最小接口整理；不增加产品功能，不新建通用 Agent / 注册 / 重构框架。
- 已分批检查、提交并推送：`f515559`（JSON 传输）、`10f7e5f`（领域边界）、`090bd57`（登记收敛）、`a29323a`（UI 职责）。

## 1. 已完成的结构调整

### M02：一个 JSON 传输实现，保留各域错误契约

23 个 API Client 共用 `lib/api/jsonRequest.ts`。统一请求头、JSON data 解包、空 204 与安全错误解析；API Origin 仍由 clientRuntime 处理。没有自动重试写操作，没有注入模型凭据，没有把 SSE 或原生文件分享塞入 JSON 传输。

| 调用类型 | 保留行为 |
|---|---|
| Task / Inbox / Game / Memory / Plugin / 学习及各类 Profile | 原 ClientError 类、code、HTTP status 与各自业务操作仍在原 Client |
| Model Credential | 保留专属错误类、REQUEST_FAILED 默认码及 retryable；没有悄悄改成 status 错误契约 |
| Knowledge / 宫殿 / 数据控制 / 摘要 / 行动 | 保留专属失败提示、no-store 与显式写入方式 |
| Prompt 导出 | 保留“Prompt 导出失败”提示；文件下载 / Share 仍由平台 Adapter 完成 |
| Abort / 网络故障 | 原错误直接抛出，不自动重发；非 JSON 错误响应使用安全提示，不展示上游 HTML |

成功响应若是损坏 JSON 会明确失败，不伪造 data；204 统一为空结果。业务 Schema 校验与冲突恢复没有搬进万能 HTTP 层。

### M03：拆分实际职责，不把大文件整体改名

| 原容器 | 当前职责与拆出单元 |
|---|---|
| Chat page | 页面编排与发送 / 重生成落库；useChatSessions 管列表、选择、草稿与 CAS 修改；useChatRuns 管独立会话运行和取消；sessionReply 统一 send / retry 流式装配、引用及验证结果 |
| TaskManager | CRUD、列表与深链；taskForm 管纯转换 / 校验 / 标签；TaskEditor 管表单与预览；TaskLocalNotifications 管权限、同步及其状态展示 |
| GameSessionManager | 存档 / 世界 / 角色修改编排；gameForms 管纯转换；GameSessionForms 管创建、世界字段及角色编辑，保留各自草稿保护 |
| GamePlayPanel | 回合、宿主工具、探索、导出及请求回执；GameTurnHistory 管剧情树和可信事件展示；初始 GameState 直接复用领域初始化 |

合并了 send / retry 的流式协议与任务列表安装逻辑、通知权限 / 同步路径。保留同一会话草稿、早期回答兄弟分支、原有后续恢复、失败草稿、游戏重试 requestId、检查点、原始状态和 CAS。生成取消后不接受晚到模型结果；旧运行的 finally 也不会清掉较新运行的控制器。取消不承诺撤销已经被服务端接受的写入。

### M04：领域契约不再反向依赖 SQL 或实现类

- 记忆 kind / status / sensitivity 与检索输入放到 memory/types；排序只消费需要的领域字段，不拿整张 MemoryItemRecord 当算法接口。
- 资料引用元数据移到 knowledge/citationMetadata，MessageCitation 由 ai/messages 唯一定义；SQL JSON 列引用该契约，不再维护缺字段的副本。
- 拼写算法与 Schema 独立为 memorization/spelling，消除 domain 与 learningTools 的类型循环。
- PluginCapabilityAdapter 的 prepare / execute 契约独立，Gateway 与 Adapter 不互相导入实现类型。
- 宫殿、摘要与使用记录 DTO 移到所属领域；API Client 不再从 Repository、Drizzle 泛型推导返回值。摘要 / 使用记录明确 HTTP 日期为 ISO 字符串，服务端可使用 Date。
- 移动请求、授权、数据库所有权筛选、来源版本和事实 / 虚构隔离保持。没有拆散原子事务或改写已应用 SQL。

静态图的 4 组含类型循环已全部解除；运行时循环原来就是 0，不能称为修复了运行时死锁。新增架构回归检查 import 图、Client 边界、页面完整登记与活动归属；它不是动态加载 / 权限审计的替代品。

### M05 / M06 / K03：少量真实共享边界

- appRoutes 是当前页归属与 AppRoute 类型来源；MobileApp 不再另外手写两套路径 union，静态页面加载表由类型检查保证完整。导航归属不是授权，Next 文件路由与移动静态加载仍由各宿主维护。
- 第一方 Manifest 的 activities 从已登记的活动归属生成，保留严格归属检查与原 Capability 审核。没有把导航、权限、插件和私有世界混成一个 Registry；模板公开简介 / 私有定义继续分开。
- shared/random 是学习与游戏实际共用的确定性随机函数；抽测不再调用游戏骰子。算法标识不变，固定了 R9.2 的三组序列，骰子、牌堆、抽测可复现。
- game/turnTree 供生成、导出、历史搜索及 UI 共用，导出不再依赖 GameTurnService；错误类亦与 Repository 实现分开。
- 删除未使用的 ClientPlatformAdapters 聚合与仅供它使用的平台 ID 类型；保留文件、语音、本地通知和 Huawei NativePush 最小接口。没有假称 Huawei Push 已接通。

## 2. 规模与边界对照

与 R9.2 同口径，非空物理行包含类型与注释，不代表复杂度或速度：

| 指标 | R9.2 | R9.3 |
|---|---:|---:|
| 产品源码文件 | 342 | 360 |
| 产品非空物理行 | 34,661 | 34,276 |
| 含类型循环组 / 运行时循环组 | 4 / 0 | 0 / 0 |
| 未解析内部 import / 客户端运行时服务端文件 | 0 / 0 | 0 / 0 |
| Chat page | 539 | 290 |
| TaskManager | 592 | 200 |
| GameSessionManager | 531 | 308 |
| GamePlayPanel | 448 | 327 |
| 页面 / API route | 23 / 61 | 23 / 61 |
| 运行 / 开发依赖；npm 脚本 | 20 / 16；22 | 20 / 16；22 |
| 单测文件 / 用例 | 153 / 623 | 157 / 638 |

净少 385 个产品非空行；文件数因职责拆分增加 18，而非声称“文件越少越好”。行数含 import 整理，收益主要是重复实现退出、依赖方向清楚和修改归属明确，不声称运行性能、模型质量或 Token 费用因此改善。体积 / 工具链最终对照留到 R9.4–R9.5。

## 3. 自检与验收

- 638 / 638 单测，157 文件；完整回归 120.88 秒。新增 JSON 传输、确定性序列、边界 / 登记、统一生成协议的有效覆盖，没有删除现用用例。
- 80 个离线 Prompt 样例通过，请求和夹具哈希不变。仅更新当前基线源码指纹；旧阶段比较允许额外源码重构，当前源码与请求仍做精确冻结。历史快照整合仍属于 R9.4。
- ESLint、TypeScript、diff 空白检查通过；Next.js webpack 生产构建及 Vite 本地 React 构建通过；Docker Turbopack 构建通过。
- Edge Web 最终 62 / 62（39.1 秒），React Bundle 26 / 26（31.2 秒）；保留现用旅程，并新增停止 / 删除生成后晚到答案不能保存、删除会话不复活的浏览器验收。
- 初次新增停止测试因侧栏标题与正文同文导致定位多匹配，收窄为正文后定点及全量复测通过。中间类型 / Lint / 空白问题均已修正，不把失败算为通过，也未用禁用规则绕过。
- Docker 已更新，Web / PostgreSQL healthy、Worker 运行；11 项 HTTP 检查通过，Vault 配置和已有会话仍可读取，R9.2 退役接口仍 404。继续挂载原 agent-web_postgres-data，不清库、不读取私人正文或打印密钥。
- 没有改变 SQL 表结构或 34 份迁移历史，没有新依赖，没有真实模型 / Embedding / 搜索调用；本轮测试费用 ¥0，共享预算不重置。
- 未构建 APK、未做华为真机验证；继续按统一待办合并。已有依赖安全告警未在本轮重新审计或修复，不把工程回归通过当发布安全封版。

## 4. 下一步与边界

下一阶段为 R9.4：依赖与工具链核对、历史 Prompt 快照 / 测试夹具 / 阶段文档瘦身。保留当前 80 样例及费用账本，不要求继续维护每一份历史源码指纹。R9.5 再做最终指标 / 集成封版。

大 Repository 与 SQL 表定义本轮没有为了行数被强拆：现有事务、Owner 筛选和启动迁移是必要约束。若后续仍有真实修改痛点，再按领域拆分，而不是新建空策略层、再次维护 R9 旧版兼容或扩大插件权限。
