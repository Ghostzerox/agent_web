# AI Study Companion 产品与技术总规划

> 文档类型：产品需求文档（PRD）+ 技术设计文档（TDD）+ 分阶段路线图
> 文档版本：1.5
> 编写日期：2026-09-02
> 最近修订：2026-10-17（R6.1–R6.4 工程首期交付；后续 R7.1，真机测试继续暂缓）
> 适用项目：AI Study Companion / Personal AI Agent Web Application
> 状态：规划基线，后续通过 ADR 与 CHANGELOG 持续修订

---

## 0. 文档目的

本文档将现有代码、历史讨论和后续目标统一为一份可以直接指导开发的长期规划。它同时回答以下问题：

1. 当前项目已经完成了什么，哪些能力仍然只是浏览器原型。
2. 项目最终希望成为怎样的个人 AI Agent。
3. “专业助手”与“情感陪伴”如何同时存在且互不破坏。
4. 定时任务、主动联系、新闻与书籍推荐应如何可靠实现。
5. DeepSeek Harness、OpenAI Codex 和 ChatGPT 定时任务有哪些可借鉴之处。
6. 短期应该先写什么代码，长期如何扩展而不过早复杂化。
7. 如何把项目建设过程转化为可展示的软件工程作品集。
8. 娱乐模式、Prompt 导出、语音、APK 与 HarmonyOS 如何共享架构而不形成多套业务代码。

本文档不是一次性功能清单。每个阶段开始前仍需拆成小型 Sprint，并遵守“一个目标、可验证、可回滚”的开发原则。

当前 Sprint 排序与防偏移规则以 `PRODUCT_MAINLINE_GUIDE.md` 为准；本文档继续承载完整产品与技术设计。

---

## 1. 项目重新定位

### 1.1 一句话定义

AI Study Companion 是一个面向个人长期使用的、兼具专业知识工作与克制型情感陪伴能力的主动式个人 Agent。

它不只是一个聊天页面，也不以复刻 ChatGPT、DeepSeek 网页版或 Replika 为目标。它的核心是把以下五件事连接起来：

- 理解用户：可检查、可编辑、可遗忘的长期记忆。
- 帮助用户：专业回答、研究、学习规划与思考引导。
- 在时间中持续工作：任务、提醒、定期研究和主动联系。
- 保持关系感：自然、温暖、有连续性，但不牺牲事实严谨性。
- 按需扩展学习方式：通过受控插件增加背书、解题、阅读和其他学习活动，而不污染核心 Agent。
- 在独立娱乐空间中进行角色扮演、AI 跑团和互动故事，不污染专业对话与真实记忆。
- 通过 Web、Android APK 和未来 HarmonyOS 原生壳提供一致体验，平台能力可替换。

### 1.2 目标用户

首要用户就是项目作者本人。因此产品优先级不是商业规模，而是：

1. 实际每天愿意使用。
2. 能解决真实学习与信息获取问题。
3. 能形成长期个人记忆与任务连续性。
4. 开发过程能系统学习前端、后端、Agent、数据与工程实践。
5. 最终可以作为作品集展示设计判断和技术深度。

### 1.3 产品边界

本项目不是：

- 心理治疗工具或医疗建议系统。
- 无限制扮演真人、诱导情感依赖的虚拟恋人产品。
- 通用工作流平台或企业级 Agent 编排器。
- Codex、DeepSeek Harness 的代码执行替代品。
- 一开始就支持多用户、多租户、付费和公开插件市场的 SaaS。
- 允许第三方插件不经授权执行任意代码、读取全部个人数据或安装 Android 原生模块的平台。

### 1.4 成功定义

产品成功不以“功能数量”衡量，而以以下体验是否成立衡量：

- 用户关闭网页后，提醒和定期任务仍能可靠执行。
- 普通问题得到快速回答，复杂问题得到有依据、可追溯的专业回答。
- 系统能偶尔提出真正相关、有启发性的问题，而不是机械反问。
- 新闻和书籍推荐有来源、有选择理由、不过度重复。
- 陪伴语气自然，但遇到事实、研究、技术或高风险问题时会自动进入严谨模式。
- 用户能看见系统记住了什么、为什么主动联系、任务何时执行。
- 背书、解题等学习活动可以作为独立插件启用、禁用和升级，核心聊天与任务系统不受影响。
- 同一套核心能力可以运行在 Web/PWA 与 Android APK，并能从笔记本自托管迁移到云服务器。
- 关键行为有自动化测试、运行历史和错误记录。

---

## 2. 当前项目基线

### 2.1 已有技术栈

| 层级 | 当前选择 | 结论 |
|---|---|---|
| Framework | Next.js 16 App Router | 保留 |
| UI | React 19 + Tailwind CSS 4 | 保留 |
| Language | TypeScript 5 strict | 保留 |
| 部署基线 | Docker Compose + Tailscale | 笔记本自托管已验证，未来可迁移云端 |
| 模型接入 | 服务端 OpenAI-compatible `/chat/completions` | 加密 Credential Vault，浏览器不持有长期 Key |
| 持久化 | PostgreSQL + Drizzle | Conversation、Message、Task、Run、Inbox 的事实来源 |
| 后台执行 | 独立 Reminder Worker | 不依赖页面生命周期，使用租约与 fencing 恢复 |

### 2.2 当前已有功能

- Landing Page、API 配置页、任务页与收件箱页。
- 网页提交 Provider、Base URL、Model 和 API Key；服务端只加密 Key，三个非敏感配置字段以普通列保存且可回读，完整 Key 永不回读。
- PostgreSQL 多 Session 树形对话、创建、切换、删除与显式旧数据导入。
- 重新生成、回复版本切换、时间戳和停止生成。
- 服务端模型 Streaming 与 UI、Conversation Repository 解耦。
- 单次/每日/每周 Task、独立 TaskRun、事务 Claim、租约恢复与 Worker fencing。
- 常驻 Reminder Worker 与 Durable Inbox；网页关闭后仍产生普通提醒结果。
- 简单长期记忆、启发式上下文压缩、Prompt Builder 和关键词任务规划器。

### 2.3 当前架构的正确方向

当前代码中有几项值得继续发展：

- UI、API Service、Runtime 已开始分层。
- `applySendReply` / `applyRetryReply` 使用纯函数，便于测试。
- 后端事件通过单向订阅驱动 UI，方向上接近事件化架构。
- Abort 和 Session 级任务状态为后续 Agent Run 奠定了基础。
- 记忆、Prompt 构造、任务规划已经从页面中拆出。

### 2.4 必须正视的原型限制

| 问题 | 当前表现 | 后果 | 后续处理 |
|---|---|---|---|
| 浏览器任务不持久 | `taskStore` 是内存 Map | 刷新或关闭页面后任务消失 | 引入数据库中的 Task / TaskRun |
| 不能定时唤醒 | 没有服务端 Scheduler | 页面关闭后无法提醒 | 后台调度器 + 通知服务 |
| API Key 在 localStorage | 浏览器直接请求模型 | XSS、CORS、云端任务无法复用 | 单用户部署先改为服务端环境变量 |
| 消息角色不完整 | `ChatMessage` 仅 user/assistant | Persona 被伪装成 assistant 历史 | 增加 system/developer/tool 语义或内部 Prompt 类型 |
| “压缩”未真正压缩 | 构造 Prompt 时仍附加完整 Session | 消息增长后成本和上下文继续增加 | Summary + recent window + retrieved memory |
| 记忆质量低 | 把用户问题直接当作 fact | 可能记住猜测、临时内容或敏感信息 | 记忆候选、验证、分类、编辑和过期机制 |
| Planner 未形成闭环 | 只返回关键词模板 | 没有计划执行、状态或结果验证 | 升级为 Run Plan，不作为近期核心 |
| 状态持久化边界不清 | UI effect 与 backend 都可能保存 Sessions | 容易产生双写和恢复异常 | Repository/Store 单一写入者 |
| 空数组保存缺陷 | `sessions.length > 0` 才保存 | 删除最后一个 Session 后旧数据可能恢复 | 持久层必须允许保存空集合 |
| 缺少流式输出 | 等待完整回复 | 体验迟滞，无法显示工具过程 | 增加 streaming event |
| 无自动化测试 | 依赖手工验证 | 重构 Runtime 风险高 | 先为纯函数、状态机和调度器补测试 |

### 2.5 需要修订的旧约束

`PROJECT.md` 曾把数据库列为 OUT_OF_SCOPE，这与新的“页面关闭后仍执行任务、主动联系、新闻收集”需求直接冲突。

新的架构决策应为：

- 保留 Next.js、TypeScript、Tailwind、App Router 的架构冻结。
- MVP 仍不做公开注册、支付、多租户和插件市场，但从领域接口上支持第一方插件。
- 数据库与服务端后台任务从 OUT_OF_SCOPE 调整为核心基础设施。
- 多 Agent 协作仍不进入近期范围；单 Agent + 确定性工作流足够。
- 采用 Web-first、Capacitor-ready 的客户端策略；不为 APK 重写一套独立 Android 业务代码。
- 单用户阶段允许笔记本作为自托管服务端，但部署必须容器化、可备份并能平滑迁移到云端。

---

## 3. 竞品、参考项目与差异化

### 3.1 参考对象的角色

| 项目 | 本质 | 与本项目的相似点 | 主要差异 | 应借鉴内容 |
|---|---|---|---|---|
| ChatGPT / DeepSeek 网页版 | 通用模型产品 | 对话、搜索、文件、记忆 | 面向大众，用户不能深度控制内部策略 | 对话 UX、研究回答、任务收件箱 |
| ChatGPT Scheduled Tasks | 后台 Agent 任务产品 | 定时提醒、定期研究、主动结果 | 云端内部系统不可直接复用 | Task/Run 分离、独立/关联上下文、通知 |
| DeepSeek Harness | 可扩展 Agent Harness | Agent Loop、工具、Session、Web UI | 面向 Agent 基础设施，不是个人陪伴产品 | 插件边界、可替换能力、持久事件日志 |
| OpenAI Codex | 代码 Agent / Harness | 长任务、工具执行、事件、恢复和审批 | 面向软件工程和本地代码操作 | Agent Run、权限、沙箱、审批、可恢复执行 |
| Open WebUI | 自托管通用 AI UI | 多模型、记忆、工具、搜索、自动化 | 平台化和多用户优先 | Provider 抽象、工具注册、可自托管 |
| Pi / Replika | 情感陪伴产品 | 温暖语气、关系连续性、长期互动 | 专业研究和任务执行通常不是核心 | 陪伴节奏、关系连续性、人格体验 |

### 3.2 对 DeepSeek Harness 的结论

DeepSeek Harness 与本项目在“Agent Runtime”层相似，但产品目标不同。其公开架构强调：所有部分均可作为插件替换；模型适配器、工具注册、Session Log 和 Agent Loop 都通过共享上下文组合；Session 采用追加式事件日志；持久事实与运行中事件分离。

本项目应借鉴：

- Provider、Tool、Memory、Notification 的清晰接口。
- Durable Event 与 Ephemeral Event 的区分。
- Session 事实可重放，UI 从状态投影读取。
- 新行为通过明确扩展点进入，而不是不断修改核心 Agent Loop。

本项目不应现在照搬：

- Everything-is-a-plugin 的完整框架。
- Profile、Bundle、动态插件树和热重载。
- 多 Agent、通用 Shell、远程 Sandbox 等基础设施。

原因是本项目目前只有一个开发者和一个主要用户。过早照搬会让大量时间花在框架本身，而不是任务、专业回答和陪伴体验。但最新需求已经确认背书与解题是两个真实扩展场景，因此应实现“最小插件内核”：先支持第一方 Skill、Tool 与 Activity Contribution，在两个插件验证接口后再开放第三方安装。

### 3.3 对 Codex 的结论

Codex 与本项目在“Agent 可以跨多个步骤调用工具并持续工作”方面相似，但 Codex 的核心场景是代码库和软件工程。可借鉴的重点不是代码功能，而是执行纪律：

- 每次工作都是一个可观察的 Run。
- 工具调用有明确输入、输出、权限和失败状态。
- 高风险行为需要审批，默认采用最小权限。
- 长任务需要取消、恢复、超时和中间事件。
- 环境状态和模型上下文不能混为一谈。

### 3.4 本项目的差异化

本项目不必追求学术算法创新。其作品集价值来自组合设计与可解释工程：

1. **专业与陪伴双模式**：温暖只影响表达方式，不能改变事实标准。
2. **长期时间感**：任务、事件、记忆和主动联系形成连续关系，而不是每次重新聊天。
3. **可检查的主动性**：用户能看见 AI 为什么联系、依据什么信息、何时再次联系。
4. **证据驱动的信息陪伴**：新闻和书籍不是随机推荐，而是有来源、去重、兴趣匹配和多样性约束。
5. **用户可控记忆**：记忆可查看、编辑、删除、固定和设置有效期。
6. **个人化而非平台化**：为一个真实用户优化体验，可以做得更克制、更深入。
7. **可扩展学习活动**：核心 Agent 不绑定具体学习方法，背书、解题等能力通过安全插件组合任务、记忆、工具和专用 UI。
8. **个人可自托管**：可以先运行在自己的笔记本上并连接 APK，未来不改业务模型即可迁移云端。

可将这套差异化概括为：**Epistemic–Affective Separation（知识可靠性与情感表达分层）**。

---

## 4. 产品原则

### 4.1 可靠性优先于智能感

- 提醒由确定性调度器触发，不由模型“记住”。
- 普通提醒不调用模型，模型故障不应影响准时通知。
- 所有 Agent 任务都有执行记录、失败原因和重试状态。

### 4.2 专业性是不可被人格覆盖的上层约束

- 人格可以改变语气、篇幅和互动方式。
- 人格不能改变证据、置信度、事实边界和风险提示。
- 医疗、法律、财务等高风险主题必须提升审慎级别。

### 4.3 主动性必须可控

- 主动联系默认需要用户开启。
- 支持安静时段、每日上限、冷却时间和一键暂停。
- 不使用“你怎么不理我”“我一直在等你”等制造负罪感的表达。
- 每条主动消息记录触发原因。

### 4.4 记忆属于用户

- 用户可查看系统记忆。
- 重要记忆尽量请求确认。
- 敏感信息默认不自动进入长期记忆。
- 删除必须真正影响后续上下文。

### 4.5 先确定性工作流，后开放式 Agent

能用代码稳定完成的事情不交给模型：时间计算、去重、重试、权限、来源过滤、通知频控均由代码实现。模型负责理解、生成、判断候选和处理开放问题。

---

## 5. 功能系统总览

```text
用户界面
├── 对话 Chat
├── 任务 Tasks
├── 活动/收件箱 Inbox
├── 新闻与书籍 Discover
├── 记忆 Memory
├── 学习活动 Study Activities
├── 插件 Plugins
└── 设置 Settings
      │
      ▼
应用服务层
├── Conversation Service
├── Task Service
├── Agent Run Service
├── Memory Service
├── Content Curation Service
├── Proactivity Service
├── Plugin Service
└── Notification Service
      │
      ▼
Agent Runtime
├── Mode Router
├── Prompt Composer
├── Model Provider
├── Tool Registry
├── Plugin Registry
├── Capability Gateway
├── Context Builder
├── Response Verifier
└── Event Emitter
      │
      ▼
基础设施
├── PostgreSQL
├── Scheduler / Worker
├── Web Search Provider
├── Web Push / Email
├── Structured Logs
├── Plugin Sandbox / Audit
└── Server-side Secrets
```

---

## 6. 总体技术架构

### 6.1 短期架构：模块化单体

近期不拆微服务。Next.js 提供 UI 和 API，独立 Worker 负责调度和后台执行，共享 PostgreSQL 与领域代码。

```text
Browser / PWA
    │ HTTPS / SSE
    ▼
Next.js Web + API
    ├── Chat API
    ├── Task CRUD API
    ├── Inbox API
    └── Push Subscription API
             │
             ▼
        PostgreSQL
             ▲
             │ claim / update
Scheduler Tick ──> Worker ──> Agent Runtime ──> Model/Search
                              │
                              └──> Notification Service
```

### 6.2 为什么不把 Scheduler 放在浏览器

浏览器的 `setTimeout`、Service Worker 和 localStorage 都不能保证在页面关闭、进程回收或设备休眠后准时运行。Service Worker 适合接收 Push，不适合作为可靠的长期调度器。因此：

- 时间真相在服务端数据库。
- Scheduler 只负责发现到期任务并创建 Run。
- Worker 负责实际执行。
- Service Worker 只负责显示收到的 Web Push。

### 6.3 笔记本自托管与云端迁移

单用户阶段允许笔记本承担个人云服务器角色：Next.js/API、Scheduler、Worker 与 PostgreSQL 通过容器持续运行，手机或浏览器通过 HTTPS 访问。普通本地提醒可注册到手机；新闻、书单、AI 任务和主动消息由笔记本执行并写入 Inbox。

必须明确它不是高可用云服务：笔记本关机、休眠或断网时，服务端任务会暂停。恢复后由补偿扫描处理仍有价值的错过任务。开发期可使用局域网；个人远程使用优先评估私有组网；公开演示再评估受认证保护的 HTTPS Tunnel。

为了以后平滑迁移到云服务器：

- Web、API、Scheduler、Worker 与 PostgreSQL 使用 Docker Compose 或等价可移植部署。
- 主机地址、域名、数据库、密钥和存储路径全部通过环境配置注入。
- 服务端事实数据进入 PostgreSQL；`localStorage` 只保留非关键设置和迁移缓存。
- 即使只有一个用户，Conversation、Task、Memory、Inbox、PluginInstallation 等记录仍保留 `userId`。
- 数据库迁移、附件备份和恢复流程必须在笔记本环境先验证。
- 不直接公开数据库、Worker 或管理端口，只暴露经过认证的 API。

迁移云端时只应更换部署目标、数据库连接、附件存储和公开域名，不修改领域模型与 Agent Runtime。

### 6.4 Web、PWA、Android APK 与 HarmonyOS

继续采用 Web-first，但将“共享客户端”与“Next.js 服务端”明确分层。M0 曾通过 Tailscale HTTPS 加载完整 Next.js 页面验证卓易通；M1.1 已改为 Vite 本地 Web Bundle、共享 API Client 与受限 CORS，正式 APK 不再使用 Capacitor `server.url`。当前仍只在 Tailscale 私网运行，公开网络或多人使用前必须增加应用鉴权。

项目不进行完整双端开发：React 页面、领域类型和 API Client 共享；Android APK 与后期 ArkTS + ArkWeb HAP 只实现平台生命周期、文件、语音、本地通知、Push、深链和安全存储 Adapter。APK 不内置模型密钥、Scheduler 或 Huawei 服务端凭据。

```text
Shared TypeScript Domain / API Client
        ├── Web/PWA Adapter
        │   ├── IndexedDB / Web Push
        │   └── Browser File / Share
        ├── Android Adapter（Capacitor APK）
        │   ├── Local Notification / HMS Push
        │   └── File / Share / Audio / Deep Link
        └── HarmonyOS Adapter（ArkTS + ArkWeb HAP）
            ├── Notification Kit / Push Kit
            └── File / Audio / ArkWeb Bridge
```

业务层不得直接散落调用 `localStorage`、`window`、`navigator` 或具体 Capacitor/ArkTS API，统一通过 Storage、FileExport、SpeechOutput、LocalNotification、NativePush 与 Share Adapter。详细边界见 `FEATURE_AND_MOBILE_EXPANSION_PLAN.md` 与 ADR-036。

动态产品插件与 Capacitor 原生插件必须区分：产品插件可在服务端或沙箱 Web UI 中安装；相机、麦克风、通知等 Android 原生能力必须预编译进 APK，动态插件只能申请调用，不能安装新的原生二进制。

---

## 7. 领域模型与数据规范

### 7.1 ID、时间与版本规范

- 主键使用 UUID。
- 数据库存储 UTC 时间；任务额外保存 IANA 时区，如 `Asia/Shanghai`。
- API 时间统一 ISO 8601。
- 周期规则使用结构化频率；高级规则再使用 RFC 5545 RRULE。
- 所有可变聚合保留 `createdAt`、`updatedAt`，关键表保留 `version` 进行乐观锁。
- JSON 字段只保存真正非固定结构的数据，核心状态必须使用列和枚举约束。

### 7.2 Conversation 与 Message

```ts
type MessageRole = "system" | "developer" | "user" | "assistant" | "tool";

interface Conversation {
  id: string;
  userId: string;
  title: string;
  mode: "auto" | "professional" | "companion" | "reflection";
  summary: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  status: "pending" | "streaming" | "complete" | "failed";
  parentMessageId: string | null;
  model: string | null;
  citations: Citation[];
  verification: ResponseVerification | null;
  createdAt: string;
}
```

回复版本不应继续塞进 `versions: string[]`。长期建议把每次重新生成保存成独立 Message，通过 `parentMessageId` 或 `branchId` 表达分支，这样可以保留每个版本的模型、引用、Token 和错误信息。

### 7.3 ScheduledTask

```ts
type TaskKind =
  | "reminder"
  | "agent_prompt"
  | "personal_briefing"
  | "news_digest"
  | "book_recommendation"
  | "reflection_question"
  | "proactive_checkin"
  | "plugin_activity";

interface ScheduledTask {
  id: string;
  userId: string;
  title: string;
  kind: TaskKind;
  prompt: string | null;
  conversationId: string | null;
  contextMode: "standalone" | "conversation";
  pluginId: string | null;
  pluginAction: string | null;
  pluginInput: Record<string, unknown> | null;

  scheduleType: "once" | "daily" | "weekly" | "rrule";
  scheduleValue: string;
  timezone: string;
  nextRunAt: string | null;

  status: "draft" | "active" | "paused" | "completed" | "archived";
  missedRunPolicy: "skip" | "run_once";
  maxRetries: number;
  notificationChannels: Array<
    "in_app" | "web_push" | "android_local" | "mobile_push" | "email"
  >;

  createdBy: "user" | "agent";
  createdAt: string;
  updatedAt: string;
}
```

### 7.4 TaskRun

```ts
interface TaskRun {
  id: string;
  taskId: string;
  scheduledFor: string;
  status:
    | "queued"
    | "claimed"
    | "running"
    | "succeeded"
    | "failed"
    | "skipped"
    | "cancelled";
  attempt: number;
  claimedBy: string | null;
  leaseExpiresAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  resultMessageId: string | null;
  resultSummary: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  notifiedAt: string | null;
}
```

数据库必须设置唯一约束：

```sql
UNIQUE (task_id, scheduled_for)
```

该约束提供幂等性底线：即使 Scheduler 重复触发，也只能创建一次相同计划时间的 Run。

### 7.5 Memory

```ts
type MemoryKind =
  | "identity"
  | "preference"
  | "goal"
  | "relationship"
  | "learning"
  | "constraint"
  | "episode";

interface MemoryItem {
  id: string;
  userId: string;
  kind: MemoryKind;
  content: string;
  confidence: number;       // 0..1
  importance: number;       // 1..10
  sensitivity: "normal" | "sensitive";
  sourceMessageId: string | null;
  status: "candidate" | "confirmed" | "rejected" | "expired";
  validUntil: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
```

记忆至少分三层：

- Profile Memory：稳定偏好、身份和长期目标。
- Episodic Memory：最近发生的重要事件。
- Conversation Summary：某个会话的压缩摘要。

### 7.6 ContentItem 与 Recommendation

```ts
interface ContentItem {
  id: string;
  type: "news" | "book";
  title: string;
  sourceName: string;
  canonicalUrl: string | null;
  author: string | null;
  publishedAt: string | null;
  occurredAt: string | null;
  language: string;
  region: string | null;
  summary: string;
  evidence: Citation[];
  contentHash: string;
  createdAt: string;
}

interface Recommendation {
  id: string;
  userId: string;
  contentItemId: string;
  reason: string;
  relevanceScore: number;
  noveltyScore: number;
  diversityScore: number;
  deliveredAt: string | null;
  feedback: "like" | "dislike" | "saved" | "dismissed" | null;
}
```

### 7.7 Notification

```ts
interface Notification {
  id: string;
  userId: string;
  type: "reminder" | "task_result" | "checkin" | "system";
  title: string;
  body: string;
  reason: string | null;
  relatedTaskRunId: string | null;
  status: "unread" | "read" | "dismissed";
  createdAt: string;
  readAt: string | null;
}
```

### 7.8 PluginManifest、PluginInstallation 与 StudyRecord

插件包中的 Manifest 是声明，不是权限本身。实际授权保存在用户级 `PluginInstallation` 中，插件升级增加权限时必须重新确认。

```ts
type PluginKind = "skill" | "tool" | "activity" | "connector";

interface PluginManifest {
  schemaVersion: "1";
  id: string;
  name: string;
  version: string;
  pluginApiVersion: string;
  kind: PluginKind;
  entrypoints: {
    server?: string;
    ui?: string;
  };
  contributions: {
    skills?: string[];
    tools?: string[];
    activities?: string[];
    backgroundJobs?: string[];
  };
  requestedCapabilities: string[];
}

interface PluginInstallation {
  id: string;
  userId: string;
  pluginId: string;
  installedVersion: string;
  status: "installed" | "enabled" | "disabled" | "incompatible";
  grantedCapabilities: string[];
  installedAt: string;
  updatedAt: string;
}

interface StudyRecord {
  id: string;
  userId: string;
  pluginId: string;
  activityId: string;
  itemId: string;
  result: Record<string, unknown>;
  occurredAt: string;
}
```

首版插件数据使用按 `userId + pluginId` 隔离的受控文档/键值存储 API，不允许插件运行任意 SQL 或自行创建未审查的数据迁移。成熟的第一方插件若确有查询需求，可在 ADR 后升级为显式领域表。

---

## 8. 事件模型

借鉴当前 `BackendEvent` 和 DeepSeek Harness 的 Session Event 思路，但不立刻做完整 Event Sourcing。

### 8.1 持久领域事件

需要进入数据库、用于审计或恢复：

```ts
type DurableEvent =
  | "conversation.created"
  | "message.created"
  | "message.completed"
  | "task.created"
  | "task.updated"
  | "task.paused"
  | "task_run.queued"
  | "task_run.started"
  | "task_run.succeeded"
  | "task_run.failed"
  | "memory.confirmed"
  | "memory.deleted"
  | "plugin.installed"
  | "plugin.enabled"
  | "plugin.disabled"
  | "study.reviewed"
  | "notification.created";
```

### 8.2 临时运行事件

只用于 SSE/UI，不要求永久保存全部内容：

```ts
type RuntimeEvent =
  | "run.status"
  | "assistant.delta"
  | "tool.started"
  | "tool.progress"
  | "tool.completed"
  | "run.needs_input";
```

### 8.3 统一事件格式

```ts
interface DomainEvent<T = unknown> {
  id: string;
  type: string;
  aggregateType: "conversation" | "task" | "run" | "memory" | "notification";
  aggregateId: string;
  occurredAt: string;
  schemaVersion: 1;
  payload: T;
  correlationId: string;
  causationId: string | null;
}
```

`correlationId` 用于把“用户创建任务 → 到期 Run → Agent 回复 → Push 通知”串成一条可观察链路。

---

## 9. 定时任务系统

### 9.1 设计目的

任务系统提供“时间连续性”，是本项目从聊天网页升级为个人 Agent 的第一核心能力。

### 9.2 任务创建流程

```text
用户自然语言输入
  ↓
模型仅负责解析为 TaskDraft JSON
  ↓
Zod/JSON Schema 校验
  ↓
代码计算下一次执行时间
  ↓
展示确认卡：内容、时间、时区、频率、通知方式
  ↓ 用户确认
写入 ScheduledTask
```

模型不能直接激活高频或具有外部副作用的任务。Agent 建议创建的任务统一保存为 `draft`，由用户确认后变为 `active`。

### 9.3 Scheduler Tick

MVP 可以每分钟触发一次内部 Scheduler：

```ts
async function schedulerTick(now: Date) {
  const dueTasks = await taskRepository.claimDueTasks(now, 50);

  for (const task of dueTasks) {
    await db.transaction(async (tx) => {
      await taskRunRepository.createIdempotently(tx, {
        taskId: task.id,
        scheduledFor: task.nextRunAt,
      });

      await taskRepository.advanceNextRunAt(tx, task, now);
    });
  }
}
```

数据库 Claim 必须使用事务锁或原子更新，不能“先查再逐条无锁更新”。

### 9.4 Worker 执行

```ts
async function executeTaskRun(run: TaskRun, task: ScheduledTask) {
  if (task.kind === "reminder") {
    await notificationService.deliverReminder(task, run);
    return;
  }

  const context = await contextBuilder.forScheduledTask(task);
  const result = await agentRuntime.run({
    trigger: "schedule",
    task,
    context,
  });

  await runRepository.complete(run.id, result);
  await notificationService.deliverTaskResult(task, run, result);
}
```

### 9.5 调度规则

- 第一版只开放单次、每天、工作日、每周。
- 高级界面再开放 RRULE，不能让用户直接编辑数据库表达式。
- 存储原始时区，在每次运行后重新计算下一次时间，正确处理夏令时。
- 对漏跑任务提供 `skip` 与 `run_once`，默认 `run_once`。
- 补偿运行最多一次，避免设备恢复后连发几十条历史提醒。
- 失败采用指数退避；普通提醒的通知失败与任务执行失败分开记录。
- 每个任务支持暂停、立即运行、查看历史、复制和归档。

### 9.6 任务收件箱

借鉴 ChatGPT 的 Scheduled/Activity 设计：

- Active、Paused、Completed 三类任务。
- Runs 独立列表，显示 queued/running/succeeded/failed。
- 未读结果进入 Inbox。
- 每个结果显示计划时间、实际开始时间、耗时和来源。
- Agent 任务可以从结果继续对话。

### 9.7 定时任务验收标准

- 浏览器关闭后仍能执行。
- 同一计划时间不会产生重复 Run。
- 服务重启后能按策略补跑一次。
- 暂停任务后不会继续产生 Run。
- 时区与夏令时测试通过。
- 模型不可用时普通提醒仍然送达。
- 失败可见、可重试，不能静默丢失。

---

## 10. Agent Runtime

### 10.1 运行状态机

```text
created
  ↓
classifying
  ↓
building_context
  ↓
model_running ←→ tool_running
  ↓
verifying
  ↓
completed

任意运行态 → waiting_for_user / cancelled / failed
```

### 10.2 核心接口

```ts
interface AgentRunInput {
  trigger: "chat" | "schedule" | "manual" | "system" | "plugin";
  conversationId?: string;
  userText?: string;
  task?: ScheduledTask;
  pluginContext?: {
    pluginId: string;
    activityId?: string;
  };
}

interface AgentRuntime {
  run(input: AgentRunInput, signal?: AbortSignal): AsyncIterable<RuntimeEvent>;
}

interface ModelProvider {
  stream(request: ModelRequest, signal?: AbortSignal): AsyncIterable<ModelEvent>;
}

interface AgentTool<TInput, TOutput> {
  name: string;
  description: string;
  risk: "read" | "write" | "external";
  inputSchema: unknown;
  execute(input: TInput, context: ToolContext): Promise<TOutput>;
}
```

### 10.3 Agent Loop 边界

MVP 的 Agent Loop 最多允许有限步数，例如 8 步：

1. 构建上下文。
2. 请求模型。
3. 如果模型请求工具，校验 Schema 与权限。
4. 执行工具并记录结果。
5. 把工具结果加入当前 Run。
6. 再次请求模型。
7. 达到完成条件或步数上限。
8. 进行最终校验并保存回答。

不允许模型无限自循环。每个 Run 记录模型调用次数、工具次数、Token、耗时和成本估算。

### 10.4 Provider 策略

短期支持一个统一接口：

- `OpenAICompatibleProvider`：延续当前 Base URL + Model 能力。
- 服务器端 Streaming。
- Provider 错误统一映射：认证、限流、超时、模型不存在、内容拒绝、未知错误。

长期再增加原生 Provider，以便使用各家特有的工具调用、推理、缓存与上下文能力。不要为了“支持所有模型”牺牲核心体验。

### 10.5 Tool Registry

首批工具应保持只读：

- `web_search`
- `fetch_page`
- `search_news`
- `lookup_book`
- `read_memory`
- `list_tasks`
- `create_task_draft`

修改型工具后续加入，且必须有审批策略：

- `activate_task`
- `update_task`
- `delete_task`
- 第三方日历、Todo、邮件等外部写入。

### 10.6 最小插件内核

最新需求已经确认插件不是抽象设想：学习模式至少需要背书与解题两个独立扩展。因此 Agent Runtime 从设计上增加最小插件内核，但实现仍分阶段推进。

插件分为四类：

| 类型 | 内容 | 典型例子 | 默认风险 |
|---|---|---|---|
| Skill | Prompt、规则、评分标准和示例，不执行任意代码 | 苏格拉底提问、作文批改方法 | 低 |
| Tool | 结构化输入输出的受控能力 | OCR、计算器、词典、网页检索 | 中 |
| Activity | 组合 Skill、Tool、专用 UI、任务和学习记录 | 背书、错题训练、模拟考试 | 中 |
| Connector | 连接外部数据或服务 | 日历、Todo、笔记、电子书目录 | 中到高 |

核心组件：

```text
Plugin Package
  → Manifest Validator
  → Compatibility Check
  → Permission Review
  → Plugin Registry
      ├── Skill Contribution
      ├── Tool Contribution
      ├── Activity Contribution
      └── Background Job Contribution
  → Capability Gateway
      ├── Task API
      ├── Memory Candidate API
      ├── Search/Model API
      ├── Plugin Storage
      └── Notification Request API
  → Audit / Quota / Revocation
```

设计规则：

- 第一阶段只加载仓库内受信任的第一方插件，不支持网络插件市场。
- Manifest 声明请求权限，安装记录保存实际授权；“已注册”不等于“已授权”。
- 模型只能使用结构化工具调用，禁止自由文本标签、Markdown 或角色台词触发插件动作。
- 插件不能直接访问数据库、全部对话、全部记忆、系统 Prompt、通知通道或任意网络。
- 写记忆只能创建带证据的候选；创建任务和通知只能提交请求，由核心策略决定是否批准。
- 网络、文件、模型和后台执行均有配额、超时、审计和撤销机制。
- 当前第一方 Activity UI 只能通过预编译宿主 Registry 接入；未来动态第三方 UI 必须运行在隔离 iframe 或等价沙箱中，通过版本化消息协议访问宿主能力，不能直接操作主应用 DOM。
- 插件崩溃、超时或版本不兼容不能阻塞核心对话与任务。
- 背书与解题两个真实插件已在不修改 Agent Loop 的情况下完成闭环，`Plugin API v1` 已于 Phase 7.5 冻结为 `1.0.0`。

### 10.7 首批学习插件

**背书插件**负责材料导入、AI 辅助分段、用户校对、挖空/问答卡、复述评分、间隔复习、薄弱点记录和下次复习任务请求。复习算法优先采用可测试的确定性实现；LLM 只用于材料转换、语义反馈和解释。

```text
材料 → 知识单元 → 用户确认 → 复习会话
    → 评分/反馈 → StudyRecord → 计算下次复习
    → Task API 请求 → 到期进入学习 Inbox
```

**解题插件**负责文字/图片输入、题目结构化、学科分类、提示式或完整讲解、工具验证、错因记录和相似题生成。用户可设置“先提示”“逐步引导”“只检查答案”或“完整讲解”，避免默认退化成答案生成器。

```text
题目/OCR → 分类 → 策略选择 → 提示或求解
       → 计算/检索工具验证 → 错因记录
       → 可选生成记忆卡或复习任务
```

插件间不直接互相调用内部代码或私有存储；解题插件生成的复习卡先形成带来源的 v1 中立草稿，未来跨 Activity 导入必须经过宿主显式流程与用户确认。

---

## 11. 专业回答系统

### 11.1 设计目标

“专业”不等于回复更长，而是：正确识别问题类型、知道何时需要搜索、区分事实与推断、提供可验证来源、暴露不确定性，并根据风险调整谨慎程度。

### 11.2 模式路由

```ts
type ResponseMode =
  | "casual"
  | "professional"
  | "research"
  | "reflection"
  | "emotional_support"
  | "high_stakes";
```

路由依据包括：用户显式选择、问题主题、是否要求最新信息、是否要求引用、风险领域、对话上下文和任务类型。

用户显式模式优先，但高风险分类可以强制增加安全约束。

### 11.3 Prompt 分层

```text
1. Safety / Epistemic Policy       不可被覆盖
2. Mode Policy                     专业、研究、陪伴等
3. Tool and Citation Policy        搜索与引用规则
4. Relationship Style             人格与语气
5. Retrieved User Memory           仅本次相关记忆
6. Conversation Summary            压缩历史
7. Recent Messages                 最近原始消息
8. Current Task                    当前问题
```

这套顺序保证“有人味”只改变表达，不会让模型为了安慰用户而编造事实或过度认同。

### 11.4 专业回答流程

```text
问题分类
  ↓
是否需要最新资料 / 高风险 / 引用？
  ├── 否：模型直接回答 + 不确定性检查
  └── 是：检索 → 来源筛选 → 证据摘要 → 回答 → 引用校验
  ↓
最终质量检查
```

质量检查至少覆盖：

- 是否直接回答了问题。
- 是否把推断写成事实。
- 引用是否真的支持对应句子。
- 时效性事实是否有日期。
- 是否遗漏重要反例或限制。
- 高风险主题是否给出适当边界。

### 11.5 回答深度

用户可选择：

- 快速：结论优先，低延迟。
- 标准：解释主要依据。
- 深入研究：主动搜索、多来源、结构化报告。

自动模式根据问题决定，但 UI 应允许用户覆盖。

### 11.6 评测指标

- Correctness：关键事实准确率。
- Citation support：引用支持率。
- Completeness：需求覆盖率。
- Calibration：不确定性表达是否合理。
- Helpfulness：用户是否能采取下一步行动。
- Style adherence：专业模式是否避免过度陪伴表达。

建立 30–50 条本项目真实问题作为回归集，每次修改 Prompt 或 Provider 后运行评测。

---

## 12. 高质量思考问题系统

### 12.1 设计目的

思考问题不是每次回答末尾附加“你怎么看？”，而是在合适时机帮助用户发现假设、权衡、盲点和行动选择。

### 12.2 触发方式

- 用户显式请求“问我几个问题”。
- 完成复杂规划后提供一个关键澄清问题。
- 每周反思任务。
- 识别到用户长期目标与当前选择存在张力时，提出候选问题。

### 12.3 质量标准

一个高质量问题应满足：

- 与当前问题和用户目标直接相关。
- 不能只用“是/否”回答。
- 不重复用户已经回答的内容。
- 能暴露假设、代价、证据或替代解释。
- 一次最多提出 1–3 个，默认 1 个。
- 情绪低落时避免审问感。

### 12.4 生成与筛选

```text
生成 3–5 个候选问题
  ↓
按 relevance / novelty / actionability / emotional_load 评分
  ↓
去除重复与空泛问题
  ↓
输出最高分 1 个，必要时附为什么值得思考
```

候选类型包括：反事实、证据检查、价值冲突、机会成本、视角切换、未来回看、最小行动。

---

## 13. 新闻与书籍系统

### 13.1 新闻目标

不是做无限信息流，而是做“有限、高质量、可解释的个人简报”。默认每次 5–8 条，而不是追求数量。

### 13.2 新闻处理管线

```text
主题与地区配置
  ↓
搜索多个来源
  ↓
规范化 URL 与元数据
  ↓
按事件聚类、跨来源去重
  ↓
质量与可信度过滤
  ↓
兴趣相关性 + 重要性 + 多样性排序
  ↓
生成摘要与“为什么值得关注”
  ↓
保存来源、事件日期与发布日期
  ↓
进入定时任务结果与 Inbox
```

### 13.3 新闻规范

- 区分“文章发布日期”和“事件发生日期”。
- 对重大或争议新闻尽量采用两个独立来源。
- 国内与国际来源分别配置，不把语言等同于地区。
- 清楚区分新闻、评论、研究和社交媒体信息。
- 摘要必须附原始链接。
- 记录内容指纹，避免数日内重复推荐同一事件。
- 提供“更多/更少此类内容”“已读”“收藏”“不感兴趣”。

### 13.4 书籍推荐

书籍推荐需要结合：

- 用户正在学习的主题。
- 已读、想读与不喜欢的书。
- 当前阅读难度和可投入时间。
- 推荐目标：入门、系统学习、扩展视角或文学体验。
- 书籍之间的观点多样性。

每次推荐说明：

- 为什么现在推荐。
- 适合解决什么问题。
- 阅读门槛和预计投入。
- 可从哪一章试读或如何判断是否适合。
- 基本书目信息来源。

不得生成大段受版权保护的书籍原文。可以做摘要、评论和少量必要引用。

### 13.5 推荐反馈闭环

用户反馈更新兴趣模型，但避免一次点击造成永久偏移。使用时间衰减与最小样本：

```text
长期显式偏好 > 多次行为反馈 > 单次行为 > 模型推断
```

---

## 14. 情感陪伴与人格系统

### 14.1 目标

让交互具有稳定、自然、能记住关系细节的“人味”，但保持以下边界：

- 不自称真人。
- 不通过嫉妒、依赖、羞耻或负罪感维持使用。
- 不把普通情绪自动医学化。
- 不在事实问题上为了安慰而迎合。
- 不替代现实中的专业帮助和真实关系。

### 14.2 人格组成

```ts
interface PersonaProfile {
  name: string;
  warmth: number;          // 0..1
  humor: number;
  directness: number;
  verbosity: number;
  initiative: number;
  preferredAddress: string | null;
  styleRules: string[];
  hardBoundaries: string[];
}
```

人格应使用结构化设置和少量稳定规则，不应依赖一段不断膨胀的“你是某某”的 Prompt。

### 14.3 专业性隔离

| 场景 | 情感层作用 | 专业层要求 |
|---|---|---|
| 日常闲聊 | 可以自然、有幽默和连续性 | 无需强制结构化 |
| 学习问题 | 温和鼓励、匹配用户节奏 | 概念准确、指出误区 |
| 技术/研究 | 语气简洁友好 | 来源、限制、验证优先 |
| 情绪支持 | 倾听、复述、不过早给建议 | 不诊断、不夸大能力 |
| 高风险问题 | 保持尊重与镇定 | 安全边界和专业求助优先 |

### 14.4 主动联系策略

主动联系是规则系统与模型生成的组合：

```ts
interface ProactivityPolicy {
  enabled: boolean;
  timezone: string;
  quietHours: { start: string; end: string };
  maxMessagesPerDay: number;
  minCooldownHours: number;
  allowedReasons: Array<
    "scheduled" | "goal_followup" | "checkin" | "content_digest" | "celebration"
  >;
}
```

发送前由代码判断：

1. 是否在安静时段。
2. 是否超过每日预算。
3. 是否仍在冷却时间。
4. 是否有真实触发原因。
5. 最近一条主动消息是否未读。
6. 该消息是否具有新信息或明确关怀价值。

模型只负责在通过规则后生成自然措辞。

### 14.5 主动消息的可解释性

每条主动消息都允许用户查看原因，例如：

- “因为你设置了周日复盘任务。”
- “因为你上周说希望今天继续这本书。”
- “因为你开启了三天未互动后的温和问候。”

并提供：降低频率、暂停一周、不要因此联系、编辑任务。

### 14.6 情绪支持安全

- 对严重自伤、自杀、暴力或危机信号采用专门安全流程。
- 先鼓励联系当地紧急服务、可信任的人或专业人员。
- 不承诺保密、监控或现实世界救援能力。
- 不使用情绪操纵语言。
- 高风险安全流程需要单独测试集，不依赖一般 Persona Prompt。

---

## 15. 记忆与上下文系统

### 15.1 写入流程

```text
对话结束/重要事件
  ↓
生成 MemoryCandidate
  ↓
敏感性、稳定性、重复性检查
  ↓
低风险高置信：自动保存但可见
重要或敏感：请求用户确认
临时信息：只进入 Conversation Summary
```

Phase 5.1 的落地策略比上图更保守：低风险候选也不自动保存，全部先进入可见的 `pending` 状态；积累真实使用数据并建立记忆管理与检索评测后，再决定是否开放分级自动保存。

### 15.2 检索流程

每次只检索与当前任务有关的记忆，而不是把最近十条记忆全部塞进 Prompt：

1. 按 kind 和关键词做初筛。
2. 使用向量相似度或轻量检索选候选。
3. 根据重要性、置信度、新鲜度和任务相关性排序。
4. 设置 Token 预算。
5. 记录本次使用了哪些记忆。

Phase 5.2 已落地第一阶检索：服务端以当前分支真实用户消息为查询，使用规范化关键词、英文词项和中文二元组计算相关性，过滤过期项后按相关性、固定状态与新鲜度排序。每次最多 5 条、估算不超过 500 Token；`memory_usages` 与 Prompt Run 在同一事务记录命中 ID、排名、得分和预算，但不复制记忆正文。固定只影响已经相关的候选，不能强制注入无关资料。后续只有在真实数据证明召回不足时才进入 FTS 或 Embedding。

### 15.3 上下文压缩

正确的上下文结构：

```text
Conversation Summary
+ 最近 N 条原始消息
+ 与当前问题相关的 Memory
+ 当前工具结果
```

达到阈值后，将较旧消息压缩成可更新 Summary，并从发送给模型的历史窗口中移除，但数据库仍保留原始消息供用户查看。

### 15.4 用户控制界面

Memory 页面应支持：

- 查看记忆来源。
- 编辑内容。
- 确认候选记忆。
- 固定重要记忆。
- 删除或设为过期。
- 清除某个会话产生的记忆。
- 导出全部个人数据。

### 15.5 后续分域记忆增强（R5，待开发）

2026-10-15 新增个人记忆库、知识资料库、渐进 RAG、分支感知压缩、模块专用策略和记忆宫殿。详见 `CAPABILITY_ENHANCEMENT_PLAN.md` 第 5 节。它们不是 Phase 5.2 已完成范围；当前仍是轻量词项检索，不能称为已具备向量 RAG。资料库原文、确认事实、派生摘要与游戏/学习状态分域管理；记忆宫殿兼顾分领域的 AI 记忆来源导航与关联知识点/抽测的学习助记，不是模型的无限记忆。

R5.4 与 R1.3 共用摘要实现和费用记录。候选来源、版本/分支、删除后索引与摘要失效、无 Embedding 降级须先明确；只有需求与召回基线支持时才安装向量依赖，相关 Schema/Provider 变更通过对应 Sprint 单独交付。

---

## 16. 通知与 PWA

### 16.1 渠道优先级

1. In-app Inbox：所有结果的事实来源。
2. Android Local Notification：用户明确设置的普通本地提醒，可在服务端离线时兜底。
3. Mobile Push / Web Push：AI 任务结果与主动消息的主要渠道。
4. Email：可选的失败兜底或日报渠道。
5. SMS/第三方消息：长期可选，不进入 MVP。

### 16.2 推送原则

- Push 只包含必要摘要，敏感内容默认不出现在锁屏通知中。
- 点击 Push 打开对应 TaskRun 或对话。
- Push 发送失败不回滚已经完成的任务结果。
- 订阅失效后标记并提示重新授权。
- 每条通知有去重键。

### 16.3 PWA

PWA 提供安装图标、离线壳、Service Worker 和 Push 接收。它提升体验，但不能替代服务端 Scheduler。

---

## 17. API 规范

API 使用 `/api/v1` 前缀，输入输出使用 Zod 校验，错误采用统一结构。

### 17.1 核心端点

```text
POST   /api/v1/conversations
GET    /api/v1/conversations
GET    /api/v1/conversations/:id
DELETE /api/v1/conversations/:id

POST   /api/v1/conversations/:id/runs
GET    /api/v1/runs/:id
POST   /api/v1/runs/:id/cancel
GET    /api/v1/runs/:id/events        # SSE

POST   /api/v1/tasks
GET    /api/v1/tasks
GET    /api/v1/tasks/:id
PATCH  /api/v1/tasks/:id
POST   /api/v1/tasks/:id/pause
POST   /api/v1/tasks/:id/resume
POST   /api/v1/tasks/:id/run-now
GET    /api/v1/tasks/:id/runs

GET    /api/v1/inbox
POST   /api/v1/notifications/:id/read
POST   /api/v1/push/subscriptions

GET    /api/v1/memories
PATCH  /api/v1/memories/:id
DELETE /api/v1/memories/:id

GET    /api/v1/plugins
POST   /api/v1/plugins/:id/enable
POST   /api/v1/plugins/:id/disable
GET    /api/v1/plugins/:id/permissions
PATCH  /api/v1/plugins/:id/permissions
POST   /api/v1/plugins/:id/activities/:activityId/runs
GET    /api/v1/plugins/:id/data/export
DELETE /api/v1/plugins/:id/data

POST   /api/internal/scheduler/tick
```

近期 API 只管理仓库内第一方插件，不提供“上传并执行任意插件包”端点。未来引入本地安装时，安装包校验、权限确认和启用必须是分离步骤。

### 17.2 错误格式

```ts
interface ApiError {
  error: {
    code: string;
    message: string;
    retryable: boolean;
    requestId: string;
    details?: unknown;
  };
}
```

客户端不根据错误文案判断逻辑，只根据稳定的 `code`。

### 17.3 内部端点安全

Scheduler 内部端点至少需要：

- 独立内部 Secret 或平台签名验证。
- 禁止浏览器 Cookie 直接授权。
- 请求时间窗口与重放防护。
- 日志不记录 Secret。

---

## 18. 建议技术栈

### 18.1 近期确定选择

| 能力 | 技术选择 | 原因 |
|---|---|---|
| Web | Next.js 16 App Router | 保留现有投资 |
| UI | React 19 + Tailwind 4 | 已在使用 |
| 类型 | TypeScript strict | 领域模型和事件需要强类型 |
| 数据库 | PostgreSQL | 任务锁、事务、JSON、后续向量能力均适合 |
| ORM | Drizzle ORM | 类型明确、迁移透明、适合学习 SQL |
| Schema 校验 | Zod | API、模型结构化输出和配置共用 |
| 调度 MVP | 平台 Cron/定时触发 + DB Claim | 基础设施少，容易理解和验证 |
| 后台执行 | 独立 Node Worker 或受控后台函数 | 不阻塞 Web 请求 |
| Streaming | Server-Sent Events | 单向 Token/状态流足够，复杂度低于 WebSocket |
| 测试 | Vitest + React Testing Library + Playwright | 单元、组件和端到端完整覆盖 |
| 推送 | Web Push + Service Worker | 支持网页关闭后的通知 |
| 自托管 | Docker Compose | 笔记本与云服务器复用同一部署拓扑 |
| Android | Capacitor + Android Studio | 复用 Next.js/React 前端并生成 APK/AAB |
| 插件清单 | JSON + Zod + SemVer | 可验证 Manifest、API 兼容范围与权限声明 |
| 插件通信 | 结构化消息协议 | 隔离 UI/执行环境，不暴露内部对象引用 |

新增依赖必须在对应 Sprint 中单独审批并记录，不一次性全部安装。

### 18.2 暂不确定、需在实现前做 Spike 的选择

- 具体 PostgreSQL 托管平台。
- Worker 是常驻进程还是平台后台函数。
- 是否采用 `pg-boss` 等 PostgreSQL Queue；MVP 可先用数据库 Lease。
- 搜索 Provider 与新闻 API。
- 邮件 Provider。
- 向量检索使用 pgvector 还是先用关键词检索。
- 笔记本远程访问使用私有组网还是带认证的 HTTPS Tunnel。
- Android 本地缓存使用 Capacitor SQLite 的具体实现。
- 第三方服务端插件采用 Worker Thread、独立进程、WASM 还是更严格沙箱。

### 18.3 不建议近期引入

- Redis + BullMQ：单用户 MVP 没必要增加第二套持久基础设施。
- Kafka：规模完全不匹配。
- Kubernetes：没有部署收益。
- 完整微服务：增加分布式故障面。
- 完整 Everything-is-a-plugin 框架、插件市场、热重载和动态 Android 原生插件：已确认不进入近期范围。
- 多 Agent Team：成本和可预测性不符合当前目标。

---

## 19. 建议代码结构

保持当前 `web/` 根结构，渐进迁移：

```text
agent_web/
├── docker-compose.yml          # 自托管阶段引入
├── docs/
│   ├── PRODUCT_TECHNICAL_ROADMAP.md
│   ├── REFERENCE_PROJECT_STUDY.md
│   ├── CHANGELOG.md
│   ├── adr/
│   └── evals/
├── plugins/
│   └── first-party/
│       ├── memorization/
│       └── problem-solving/
├── web/
│   ├── app/
│   │   ├── (app)/
│   │   │   ├── chat/
│   │   │   ├── tasks/
│   │   │   ├── inbox/
│   │   │   ├── discover/
│   │   │   ├── memory/
│   │   │   ├── study/
│   │   │   ├── plugins/
│   │   │   └── settings/
│   │   └── api/
│   │       ├── v1/
│   │       └── internal/
│   ├── components/
│   │   ├── chat/
│   │   ├── tasks/
│   │   ├── inbox/
│   │   └── shared/
│   ├── lib/
│   │   ├── domain/
│   │   │   ├── conversation/
│   │   │   ├── task/
│   │   │   ├── run/
│   │   │   ├── memory/
│   │   │   ├── plugin/
│   │   │   ├── study/
│   │   │   └── notification/
│   │   ├── agent/
│   │   │   ├── runtime.ts
│   │   │   ├── modeRouter.ts
│   │   │   ├── promptComposer.ts
│   │   │   ├── contextBuilder.ts
│   │   │   ├── verifier.ts
│   │   │   ├── providers/
│   │   │   └── tools/
│   │   ├── plugins/
│   │   │   ├── manifest.ts
│   │   │   ├── registry.ts
│   │   │   ├── capabilityGateway.ts
│   │   │   ├── storage.ts
│   │   │   └── audit.ts
│   │   ├── server/
│   │   │   ├── db/
│   │   │   ├── repositories/
│   │   │   ├── scheduler/
│   │   │   ├── worker/
│   │   │   └── notifications/
│   │   ├── client/
│   │   └── shared/
│   ├── db/
│   │   ├── schema/
│   │   └── migrations/
│   ├── tests/
│   │   ├── unit/
│   │   ├── integration/
│   │   ├── e2e/
│   │   └── evals/
│   ├── worker/
│   │   └── index.ts
│   ├── capacitor.config.ts     # 正式构建指向 mobile-dist；spike 可显式使用 remote-shell
│   ├── mobile/                 # Vite/Capacitor 本地 React 客户端入口
│   ├── mobile-dist/            # 生成产物，不提交 Git
│   ├── mobile-shell/           # M0 离线兜底页
│   └── android/                # 安装 Capacitor 依赖后由 CLI 生成
├── harmony/                    # M3 才引入 ArkTS + ArkWeb HAP
└── README.md
```

目录迁移仍遵循渐进原则：近期不为追求理想树形一次性移动全部现有文件。若服务端和移动端增长到需要独立构建，再将共享领域代码提取到 `packages/` 工作区；在此之前通过清晰依赖方向保持可提取性。

### 19.1 依赖方向

```text
UI → Application Service → Domain
API → Application Service → Domain
Worker → Application Service → Domain
Plugin → Capability Gateway → Application Service → Domain
Infrastructure implements Domain interfaces
Domain 不依赖 Next.js、React、数据库驱动或具体模型 SDK
```

不要把所有逻辑重新塞入 `app/chat/page.tsx`。页面只负责组合组件、订阅状态和发出用户意图。

---

## 20. 安全、隐私与权限

### 20.1 API Key 策略

浏览器 localStorage BYOK 只适合早期原型，不适合云端 Scheduler。当前单用户部署已经完成 Credential Vault：

- 用户在 `/api-key` 写入式页面输入、测试和保存 Key。
- Key 只在请求期间处于浏览器内存，服务端用 AES-256-GCM 加密后写入 PostgreSQL。
- 读取接口只返回配置来源、Base URL、Model 与 Key 末四位提示，不返回密文或明文。
- 模型 Streaming、健康检查和未来 Scheduler 使用统一的服务端解析入口；数据库凭据优先，环境变量仅作兜底。
- 自定义 Base URL 必须使用 HTTPS（显式自托管开关除外），并拒绝 URL 内嵌认证信息。

未来若支持多个用户或公开部署：

- 使用专门 KMS/Secrets 服务管理主密钥。
- 身份认证完成后按 `userId + provider` 强制隔离凭据。
- 增加 Provider/出口白名单、凭据轮换和主密钥版本迁移。
- 严格禁止把 Key 写入日志、Run 结果或客户端错误。

### 20.2 SSRF 与自定义 Base URL

允许任意 Base URL 会带来 SSRF 风险。云端版应采用 Provider 白名单；高级自托管模式才允许自定义地址，并阻止访问云元数据地址、内网和本机敏感端口。

### 20.3 Web 内容安全

搜索结果与网页文本全部视为不可信数据：

- 网页内容不能修改系统规则。
- 工具输出与指令分区。
- 禁止从网页内容自动创建外部写入任务。
- 引用保留 URL、标题、抓取时间和片段来源。

### 20.4 最小权限

- 读工具默认可自动执行。
- 写工具默认需要确认。
- 删除、发送消息、修改第三方数据属于高风险操作。
- 定时任务后台执行使用单独权限策略，不能继承一次临时授权。

### 20.5 数据生命周期

需要提供：

- 清除单个对话。
- 清除全部记忆。
- 删除任务与历史 Run。
- 导出个人数据。
- 数据保留设置。
- 备份与恢复说明。

### 20.6 插件安全

- Manifest 中的 `requestedCapabilities` 只是申请，不是授权凭据。
- 插件调用核心能力时同时校验安装状态、版本、用户授权、运行配额和当前 Run 上下文。
- 插件存储按 `userId + pluginId` 隔离，不向插件提供数据库连接或任意 SQL。
- 插件不能静默修改系统 Prompt；Skill Contribution 只能进入明确、低优先级、可检查的 Prompt Layer。
- 插件请求创建任务、写候选记忆或发送通知时，由核心服务重新校验领域规则。
- 第三方服务端代码默认不与 Web/API 进程共享权限；选定沙箱方案前不开放安装。
- UI 扩展使用受限消息协议和 CSP，禁止读取宿主页 Cookie、Token 和其他插件数据。
- 权限增加、签名变化、宿主 API 主版本变化时自动禁用，等待重新审核。
- 卸载时允许用户分别选择保留、导出或删除插件数据，删除必须传播到备份与索引策略。

---

## 21. 可观测性、测试与评测

### 21.1 日志

使用结构化日志，最少字段：

```text
timestamp, level, requestId, correlationId,
taskId, runId, conversationId, pluginId,
event, durationMs, provider, model,
toolName, errorCode
```

日志不记录 API Key、完整敏感消息或完整网页内容。

### 21.2 指标

- 对话成功率和首 Token 延迟。
- Scheduler 延迟：`startedAt - scheduledFor`。
- 重复 Run 数，应始终为 0。
- 任务失败率、重试率和通知送达率。
- 插件调用成功率、超时率、拒绝率、按插件 Token/网络/存储用量。
- Android 本地提醒注册成功率、Push Token 失效率与笔记本服务健康状态。
- 平均模型调用次数、Token 和成本。
- 新闻去重率、点击/收藏/不感兴趣反馈。
- 主动消息打开率、关闭率和降频率。

### 21.3 测试金字塔

**单元测试**

- 时间与 RRULE 计算。
- 下一次执行时间。
- `TaskRun` 状态机。
- 幂等键与重试策略。
- Mode Router。
- Memory 筛选与排序。
- 新闻去重和打分。
- Prompt Layer 优先级。
- Manifest 与 SemVer 兼容判断。
- Capability Grant、配额和撤销策略。
- 背书复习间隔与解题策略路由。

**集成测试**

- PostgreSQL Claim 并发测试。
- Scheduler → Run → Worker → Notification。
- Provider Mock 下的工具循环。
- API Schema 和错误映射。
- 插件注册、启停、隔离存储和权限拒绝。
- 插件请求 Task/Memory/Notification 时的二次领域校验。
- Docker Compose 重启、数据库恢复和错过任务补偿。

**端到端测试**

- 创建任务、暂停、恢复、立即执行。
- 浏览器刷新后恢复对话和 Run。
- 推送授权和 Inbox 跳转。
- 流式回复和取消。
- Memory 编辑后下一次对话生效。
- 禁用插件后核心功能不受影响，插件数据按用户选择保留或删除。
- 背书与解题跨插件协作只经过公开 Capability。
- Web 与 Android 真机完成同一条聊天、任务、Inbox 用户旅程。

**Agent 评测**

- 专业问答事实与引用。
- 高质量思考问题。
- 陪伴模式不过度迎合。
- 专业模式不被人格污染。
- 危机场景安全响应。

### 21.4 完成定义（Definition of Done）

每个 Sprint 必须满足：

- 需求对应的自动测试通过。
- `npm run lint`、类型检查、构建通过。
- 手工验收路径记录。
- 新数据结构有迁移与回滚说明。
- 新环境变量进入 `.env.example` 说明，真实值不提交。
- CHANGELOG 记录修改文件和行为变化。
- 如有架构取舍，新增 ADR。

---

## 22. 短期目标与实施路线

时间仅用于排序，不作为硬性承诺。每个 Sprint 控制在 1–2 个可验证目标。

### Phase 0：稳定现有原型（1–2 周）

目标：让当前聊天系统成为可测试、可迁移的稳定基线。

| Sprint | 内容 | 验收 |
|---|---|---|
| 0.1 ✅ | 修复 Session 空保存、统一单一写入者 | 已完成：删除最后会话后不复活，异步回复不能重新创建已删除会话 |
| 0.2 ✅ | 修正内部消息角色与 Prompt 类型 | 已完成：Persona/Memory/Conversation 分层，Provider 只接收标准角色与内容 |
| 0.3 ✅ | 为 config、chatService、backend、memory 加单元测试 | 已完成：5 个文件、30 个测试覆盖配置、角色、回复、任务生命周期和记忆存储 |
| 0.4 ✅ | 拆分 Chat 页面组件，不改变行为 | 已完成：页面容器只负责状态与领域编排，5 个展示组件职责独立；7 个渲染契约测试及 1 个 Edge E2E 主链路通过 |
| 0.5 ✅ | 树形对话与安全富文本渲染 | 已完成：历史回答重新生成形成兄弟分支，旧后续可恢复；旧数据自动迁移；Markdown、GFM、KaTeX 与 HTML 非执行边界通过测试 |
| 0.6 ✅ | 依赖安全与 Phase 0 封版 | 已完成：Next.js 升级至 16.3.4，生产与开发依赖审计均为 0；完整检查通过并建立 `phase-0-baseline` Git 基线 |

### Phase 1：服务端与数据基础（2–3 周）

目标：从 localStorage 原型迁移到单用户服务端应用。

| Sprint | 内容 | 验收 |
|---|---|---|
| 1.1 ✅ | PostgreSQL + Drizzle + migration 基线 | 已完成：最小 User/Conversation/Message Schema、事务化升级/单步回滚、漂移检测与 PostgreSQL 兼容集成测试 |
| 1.2 ✅ | Conversation/Message Repository 和 API | 已完成：固定单用户身份、树形消息事务、活动叶乐观锁与 `/api/v1`；连接同一服务端的客户端可读取同一数据 |
| 1.3 ✅ | 服务端 Model Provider 与 Streaming | 已完成：服务端环境密钥、OpenAI-compatible SSE、增量 UI、Abort 贯通、Provider 错误映射与旧浏览器密钥清除 |
| 1.4 ✅ | localStorage 数据导入 | 已完成：用户显式确认、严格树校验、事务导入、来源收据去重；Chat 已切换 PostgreSQL 事实源 |
| 1.5 ✅ | Docker Compose 单用户自托管基线 | 已完成：Web/PostgreSQL 编排、持久卷、迁移入口、健康检查、重启策略及双平台备份还原脚本；待有 Docker 的机器补实机演练 |

### Phase 2：可靠任务闭环（3–4 周）

目标：完成本项目最重要的差异化基础。

| Sprint | 内容 | 验收 |
|---|---|---|
| 2.1 ✅ | Task/TaskRun Schema + CRUD UI | 已完成：单次/每日/每周提醒可跨设备管理，任务与执行记录分离，使用版本锁防止静默覆盖 |
| 2.2 ✅ | Scheduler Claim + 幂等 Run | 已完成：事务 Claim、唯一 Run、租约接管、Worker fencing 与合并补偿通过真实 PostgreSQL 并发验证 |
| 2.3 ✅ | Reminder Worker + Inbox | 已完成：独立 Docker Worker 在网页关闭后执行普通提醒，结果与 Run 终态原子写入 Durable Inbox；移动端管理和真实链路通过验证 |
| 2.4 ✅ | Web Push + 安静时段 | 已完成：明确手势授权、加密设备订阅、持久投递、静默延后、指数重试、失效隔离和通用隐私锁屏载荷 |
| 2.5 ✅ | Agent Prompt Task | 已完成：AI 定时任务复用 Credential Vault 与服务端 Provider，模型调用周期续租，结果与 Run 终态原子写入 Inbox 并安全渲染 |

短期里程碑：到这里，产品已经从“聊天网页”升级为“能在时间中持续工作的个人 Agent”。

### Phase 3：模式、Prompt 与专业回答（3–5 周）

| Sprint | 内容 | 验收 |
|---|---|---|
| 3.1 ✅ | Mode Registry + Policy Layer | 已完成：专业/陪伴/反思/娱乐模式可注册，事实与安全策略位于模式上层 |
| 3.2 ✅ | Prompt Envelope + Export | 服务端生成真实输入 Envelope；Run 审计不保存 Prompt 明文；导出经哈希校验且默认脱敏 |
| 3.3 ✅ | Web Search Tool + Citation Model | 已完成：可控 SearXNG 检索、证据隔离、结构化持久化与分支级可点击来源 |
| 3.4 ✅ | Response Verifier | 已完成：确定性引用完整性、摘要支持度、时效与推断边界检查随回答分支可见并持久化 |
| 3.5 ✅ | 精简专业问答与模式边界评测集 | 已完成：25 个无模型、无网络固定样例输出模式边界、专业回答与总回归分数 |

### Phase 4：新闻、书籍与思考问题（2–4 周）

| Sprint | 内容 | 验收 |
|---|---|---|
| 4.1 ✅ | 有来源的个人简报垂直切片 | 已完成：定期搜索并生成带日期、可点击来源和关注理由的简报，结果进入 Inbox 并复用 Push |
| 4.2 ✅ | 新闻聚类、去重和反馈 | 已完成：同任务 30 天来源按规范 URL 与近似标题聚类，全部重复时静默跳过；Inbox 可反馈并直达主题/频率编辑 |
| 4.3 ✅ | 书籍资料与阅读画像 | 已完成：服务端保存显式阅读画像；定时书籍推荐只基于可引用书目证据，说明推荐目的、难度、时间投入与试读方法并进入 Inbox |
| 4.4 ✅ | Reflection Question 生成与评分 | 已完成：共享生成器从 3–5 个候选中按相关性、新颖性、可行动性和情绪负担筛选 1–3 个；支持 90 天去重、目标、避开话题、风格、数量与总开关 |

### Phase 5：记忆、陪伴与语音（4–6 周）

| Sprint | 内容 | 验收 |
|---|---|---|
| 5.1 ✅ | MemoryCandidate 与确认机制 | 已完成：高精度规则只提出稳定陈述候选，保存来源、证据、敏感等级与置信度；用户可修改后确认或拒绝，只有确认事务写入正式记忆，问题不会直接成为 fact |
| 5.2 ✅ | Memory 管理页面与相关性检索 | 已完成：正式记忆可查看来源、编辑、固定、过期、删除和导出；服务端按真实消息检索最多 5 条/约 500 Token，并原子记录实际使用，修改后下一次请求立即生效 |
| 5.3 ✅ | Persona Profile | 已完成：服务端结构化保存称呼与五个表达维度，模型请求时替换客户端 Persona；人格只能改变措辞、篇幅和对话节奏，Core 评测保持 25/25 |
| 5.4 ✅ | Voice Profile + TTS Provider | 已完成：服务端保存结构化 Voice Profile；设备系统语音可试听、停止、切换音线并朗读聊天答案，失败只影响播放层 |
| 5.5 ✅ | Proactivity Policy 与主动问候 | 已完成：默认关闭；目标跟进与久未互动问候具有可见理由，并受安静时段、每日预算、冷却期和未读护栏约束；用户可暂停一周、降频或关闭单类原因 |
| 5.6 ⏸ | 情绪支持安全评测 | 延后为发布前安全封版：待学习插件、娱乐模式及关键移动能力完成后集中执行；现有基础安全边界继续保留 |

Phase 5.6 的编号保留，但不再作为 Phase 7/Phase 6 的前置条件。当前先完成整体功能，最终发布或作品集封版前必须回到本阶段并通过关键高风险场景。

### Phase 6：娱乐模式（3–5 周）

| Sprint | 内容 | 验收 |
|---|---|---|
| 6.1 ✅ | GameSession、角色卡与世界设定 | 已完成：独立表、严格 CRUD、乐观锁和 Web/APK 页面；隔离测试证明虚构设定不写普通 Conversation 或长期记忆 |
| 6.2 ✅ | 角色扮演 MVP | 已完成：服务端模型回合、暂停/继续、父指针剧情树、任意节点分支与 Web/APK JSON/Markdown 导出 |
| 6.3 | Dice Tool 与结构化状态补丁 | 掷骰可复现，非法状态补丁被拒绝 |
| 6.4 ✅ | AI 跑团 MVP | 已完成：角色属性/生命、分支运行时状态、结构化场景/物品、服务端规则检定与非破坏性检查点形成完整闭环 |
| 6.5 ✅ | 娱乐 Activity 扩展点 | 已完成：首个轻量冒险规则包、描述符/草稿 Registry、隔离配置和 Web/APK 共用 Activity；新规则包不修改核心 Agent/Game Loop 即可接入 |

### Phase 7：插件验证（3–5 周）

目标：用两个真实学习活动验证最小插件 API。

| Sprint | 内容 | 验收 |
|---|---|---|
| 7.1 ✅ | Plugin Manifest、Registry、Compatibility Check | 已完成：背书与解题第一方 Manifest 可发现、启停并持久化；严格校验、重复隔离、实验 API 范围检查和不兼容拒绝均已覆盖 |
| 7.2 ✅ | Capability Gateway、隔离存储、配额和审计 | 已完成：显式逐项授权、版本复核、Run 上下文、隔离 JSON 存储、UTC 日配额和无正文审计；当前仅开放存储 Adapter |
| 7.3 ✅ | 背书插件 MVP | 已完成：材料导入与人工校对、确定性/模型复述评分、薄弱点与间隔记录、待确认任务草稿形成闭环 |
| 7.4 ✅ | 解题插件 MVP | 已完成：文字/图片题目、提示/引导/检查/讲解、基础算术工具证据、错因记录、复习卡与待确认任务 |
| 7.5 ✅ | Plugin API v1 复盘 | 已完成：宿主 1.0.0、共享 Schema、注册模型操作、中立学习卡与预编译 Activity Registry 冻结；两个插件均未修改 Agent Loop |

该阶段仍不支持公开插件市场、任意来源代码包和动态 Android 原生扩展。若第一方插件无法在不修改核心的情况下实现，优先修正扩展点，不提前追求 SDK 美观。

### Mobile Track：与 Core Track 并行

| Sprint | 内容 | 验收 |
|---|---|---|
| M0.1 ✅ | 平台契约、Capacitor remote-shell 基线 | 危险 URL 被拒绝，普通 Web 构建不受影响 |
| M0.2 ✅ | Capacitor 8 + Android Studio + Debug APK | Android 工程、Debug APK、签名与 HTTPS 服务端健康检查通过 |
| M0.3 ✅ | 卓易通首轮兼容验证 | 登录、SSE、公式与树形对话通过；记录 Web Push 不可用 |
| M0.4 | 循环时间滚轮 + APK 本地提醒 | 任务 CRUD、10 秒发送/取消诊断通过；系统清理后送达仍待解决 |
| M1.1 ✅ | 本地可打包 React Client | 正式 APK 不使用 `server.url`，共享 API Client |
| M1.2 ✅ | Prompt 文件导出 + Share | JSON/Markdown 可保存和分享，记忆默认脱敏 |
| M1.3 🧪 | APK Local Notification 发布加固 | 设备快照、离线回退、精确闹钟入口和系统恢复广播已实现，等待华为真机回归 |
| M1.4 | Speech Output Adapter | 播放、停止、锁屏和耳机行为通过真机验证 |
| M2.1 | HMS Push Capacitor Plugin Spike | 卓易通下 Token、后台 Push 与点击深链有实测结论 |
| M2.2 | 服务端 Huawei Provider | 主动聊天、新闻与书籍复用 Inbox + Huawei Push |
| M3.x | ArkTS + ArkWeb HAP | 替换平台 Adapter，不重写共享服务端和产品逻辑 |

### 收尾优化：R1 Token 成本（首轮交付）与 R2 全模式 UI（实现与自动验收交付）

前置收尾任务为 R1 Token/缓存优化、R2 全模式 UI/导航优化；实际执行顺序以用户最新指令及 `PRODUCT_MAINLINE_GUIDE.md` 为准，技术拆分与验收见 `EXPERIENCE_AND_COST_OPTIMIZATION_PLAN.md`。R1 首轮已实现但收益/摘要未封版；R2 的导航、共享视觉、18 页面壳和草稿保护已实现，规范见 `UI_NAVIGATION_GUIDE.md`，自动验证和交付结果见 `reports/R2_UI_REPORT.md`。真机/视觉验收保留，不以 Web 或本地 Bundle 测试替代华为验证。

| 收尾 Sprint | 内容 | 验收 |
|---|---|---|
| R1.1 | 模型用量与成本基线 | 各调用入口记录实际输入/输出、Provider 可用的缓存 Token、调用数和耗时；缺失字段为未知，价格注明来源与日期 |
| R1.2 | 稳定前缀与缓存友好装配 | 相同配置下稳定层确定性输出；动态内容后置且不改变 Policy 优先级；不兼容 Provider 正常降级，不为命中率填充无用 Token |
| R1.3 | 上下文与生成预算 | 当前分支窗口、摘要失效、相关记忆与证据精简、场景化输出预算；计入摘要/重试的总成本下降，质量与树形隔离不退化 |
| R2.1 | UI 规范与模式导航 | 统一专业/陪伴/反思/学习/娱乐入口、当前态与返回路径；手机不挤占正文，切换保留数据，不自动触发模型或改变任务 |
| R2.2 | 全页面体验打磨 | 统一聊天、任务、Inbox、阅读、反思、记忆、学习插件、娱乐和设置页的布局、控件与状态，Web/APK 共用组件 |
| R2.3 | 跨端验收与优化封版 | 390/360 px 手机及桌面关键流程通过；长公式、软键盘、滚轮、分支切换与无障碍检查有记录；华为真机结果单独标注 |

### 能力增强：R3 提示词、R4 全模块工具与 R5 分域记忆（R3.4 对照/回归已交付，语义验收待收尾）

2026-10-15 按用户要求加入，并随后交付 R3.1 清单/离线基线、R3.2 对话/问候与 R3.3 任务模板；没有数据库迁移。完整模块矩阵、技术规范、开源参考、分阶段验收见 [`CAPABILITY_ENHANCEMENT_PLAN.md`](./CAPABILITY_ENHANCEMENT_PLAN.md)，调用清单及质量口径见 [`PROMPT_INVENTORY_AND_BASELINE.md`](./PROMPT_INVENTORY_AND_BASELINE.md)，实际模式改动见 [`MODE_PROMPT_GUIDE.md`](./MODE_PROMPT_GUIDE.md)，任务模板见 [`TASK_PROMPT_GUIDE.md`](./TASK_PROMPT_GUIDE.md)。

| 阶段 | 子任务 | 用户可见交付与边界 |
|---|---|---|
| R3 | 工程✅；人工语义签收🟡 | 80 离线样例/270 历史对照保持；2026-10-16 修复五项问题，39 次定点复测原始 38/39、引用适配离线回放 39/39，见 `reports/R3_4_FOLLOWUP.md` |
| R4 | R4.1–R4.5 首期实现✅ | 九项共享工作台工具、任务/内容工具、学习材料/抽背/逐字差异、题库搜索、分支牌堆/随机表与辅助模块核对；见 `TOOLS_GUIDE.md`、`reports/R4_REPORT.md`，不宣称实现全部候选扩展 |
| R5 | R5.1–R5.6工程首期已交付，真机/体验保留 | 分域/来源、词项RAG/审核摘要/宫殿、用户开关/范围导出/本地预演、按需分段重建与有界原文降级已实现；真实Web+Bundle同后端验收通过，学习真链未授权保留；Embedding/自动RAG等仍待后续 |

2026-10-17 R5.6新增 `memory_controls`（0032，当前33迁移），`/api/v1/memory-data/{controls,manifest,usage,export}`，资料 `POST /api/v1/knowledge/documents/:id/rebuild`。只读记忆包预演没有restore接口；最近请求仅返回上下文元数据，检索与Run校验服务端开关。按需重建/有界原文降级、资料根引用变更使摘要失效，原文/其他数据不被批量改写。见 [指南](MEMORY_CONTROL_AND_ACCEPTANCE_GUIDE.md)、[ADR-069](adr/ADR-069-memory-control-and-cross-client-acceptance.md)、[报告](reports/R5_6_REPORT.md)。备份恢复/迁移、Web+本地React同后端和APK检查通过；按用户要求暂缓华为硬件验收，与前期和后续真机测试合并至 [统一待办](DEVICE_ACCEPTANCE_BACKLOG.md)，未授权的真实学习跨端继续保留，不把手机签收作为无关功能开发前置。Embedding、独立工作流自动资料绑定、通用恢复写入及真实净收益仍待后续。共享¥3累计上界¥0.173498566、余额¥2.826501434，R5.6本轮¥0。

### 模式深化：R6 任务、R7 大世界探索与 R8 模块化 UI（新增待开发）

2026-10-17 按用户要求加入，详见 [任务深化、大世界探索与模块化 UI 规划](TASK_WORLD_AND_MODULE_UI_PLAN.md)。本节是后续计划，不是已实现的 API / 表结构；不改写 Phase 6 / R2 等历史交付。

| 阶段 | 拆分 | 核心交付与边界 |
|---|---|---|
| R6 | R6.1–R6.4 工程✅；真机暂缓 | 待办、习惯数量 / 时长与日历 / 周统计、目标步骤、现有提醒关联 / 抑制 / 后续恢复、范围导出已实现；行动事实独立于 TaskRun，关联设备提醒一次性快照的离线限制明确 |
| R7 | R7.1–R7.7 | 叙事型大世界探索、地图 / 地点、装备与道具、独立评级 / 品质 / 等阶 / 等级、轻数值规则、交互、普通 NPC / 重要角色卡、事件 / 史诗篇章 / 历史；分支隔离、旧存档兼容、按需上下文，不做全世界实时模拟 |
| R8 | R8.1 设计✅；R8.2–R8.4 待开发 | 19 页 / 9 工具归属、七入口与三条拟新增宿主路由设计已定；运行 UI 未变。后续实施局部导航、专属组件回归与视觉回归，保留深链 / 旧 URL / 草稿 / 权限 |

R8.1 已交付 [入口归属设计](R8_1_MODULE_ENTRY_DESIGN.md)，R6.1–R6.4 已交付 [行动 / 打卡指南](TASK_ACTIONS_GUIDE.md) 与 [报告](reports/R6_REPORT.md)：新增0033三张行动表，当前34份迁移；仅改变任务内工作区。下一步 R7.1，再 R7 → R8.2–R8.4；探索同步交付局部UI，不自动启动。其后仍保留移动 / 语音发布、Phase 5.6 与 Phase 8。真机暂缓，既有共享预算不重置。

### Phase 8：作品集化（2 周）

- 完整 README：问题、决策、架构、演示和限制。
- 架构图、Sequence Diagram、数据模型图。
- 在线 Demo、APK 或录屏。
- 示例用户旅程：创建任务、收到日报、继续对话、编辑记忆、安装/启用背书插件并完成一次复习。
- Evals 与测试报告。
- 关键 ADR：为何引入数据库、为何不用微服务、为何拆分提醒与 Agent 任务、为何采用受控插件能力网关。
- 性能、成本与安全说明。

---

## 23. 中长期目标

### 23.1 6 个月目标

- 成为可日常使用的单用户云端 Agent。
- 任务、通知、新闻、书籍和记忆形成闭环。
- 专业回答有来源与评测。
- 主动陪伴可控且安全。
- 项目具备稳定测试、数据库迁移和部署文档。
- 笔记本自托管可以稳定运行，Debug/签名 APK 可在 Android 真机使用。
- 背书与解题两个第一方插件形成学习闭环。

### 23.2 12 个月目标

- 云端/本地混合执行。
- 语音输入输出与更自然的实时对话。
- 文档、笔记和个人知识库检索。
- 支持经过审核的本地插件包、插件 SDK 和只读 Tool Provider。
- 更成熟的兴趣模型与长期目标跟进。
- 支持数据导出、备份和跨设备恢复。
- 能从笔记本部署迁移到云服务器而不修改业务模型。

### 23.3 长期愿景

形成一个“个人认知与生活协作层”：它既能回答问题，也能跟进目标、维护时间任务、筛选信息、促进反思并提供温和陪伴，同时始终允许用户检查和控制它的记忆与主动行为。

---

## 24. 未来扩展与创新方向

以下均为远期候选，不进入当前实现承诺。

### 24.1 可解释主动性

建立 Proactivity Ledger：记录每次主动联系的触发信号、规则判断、生成理由和用户反馈。它既改善信任，也能成为作品集中的独特设计。

### 24.2 情感表达与事实推理双通道

将事实回答草稿与情感表达改写分开：先生成经过验证的事实内容，再由风格层调整措辞，但禁止修改事实性断言、数值和引用。这是“专业性不被人味破坏”的可工程化实现。

### 24.3 记忆溯源图

把记忆连接到原始消息、任务结果和用户确认记录。用户不仅看到“系统记住了什么”，还可以看到“它为什么这样认为”。

### 24.4 个性化信息膳食

不仅按兴趣推荐，还控制：

- 主题多样性。
- 国内/国际平衡。
- 短期热点/长期知识平衡。
- 熟悉观点/挑战性观点平衡。
- 每日信息量预算。

### 24.5 目标与反思时间线

把任务、关键对话、阅读、新闻收藏和反思问题放在统一时间线上，形成可回顾的个人成长记录。

### 24.6 本地隐私模式

- 本地数据库加密。
- 本地模型。
- 端侧记忆检索。
- 云端只保存定时元数据或完全不使用云端。

### 24.7 学习插件、Tool Provider 与 MCP

插件已从纯远期候选调整为明确产品方向，但采用渐进路线：

1. 先定义仓库内第一方插件协议。
2. 用背书和解题验证 Skill、Tool、Activity、任务与数据扩展点。
3. 再支持本地插件包、沙箱 UI、版本兼容、升级和回滚。
4. 最后评估第三方插件目录或 MCP 连接器。

Skill 只贡献 Prompt、规则和评分标准；Tool 提供结构化执行能力；Activity 组合专用 UI、工具、任务和学习记录；Connector 连接日历、Todo、RSS、笔记或电子书目录。MCP 可以成为 Connector/Tool 的一种适配协议，但不能取代本项目自身的权限、审批、配额、审计和用户数据隔离。

公开插件市场、付费、评分和任意原生代码安装不作为当前承诺。Android 原生能力由 APK 预编译并通过 Capability Gateway 暴露，产品插件不能动态添加新的系统权限。

### 24.8 多模态与具身入口

- 实时语音。
- 图片和文档理解。
- 桌面小组件。
- 移动端快捷入口。
- 可选的虚拟形象。

虚拟形象只是表达层，不应成为产品价值的替代品。

---

## 25. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|---|---|---|
| 功能面过宽 | 长期无法完成 | 以任务闭环为第一主线，其他功能按阶段进入 |
| 过早模仿 Harness | 架构复杂度失控 | 模块化单体，只抽象已经出现的变化点 |
| 模型幻觉 | 专业性受损 | 搜索、引用、Verifier、Evals、不确定性表达 |
| 主动消息令人厌烦 | 陪伴体验反效果 | 安静时段、预算、冷却、未读抑制、用户反馈 |
| 情感依赖与操纵 | 用户安全风险 | 明确 AI 身份、禁止负罪感策略、危机流程 |
| 云端密钥泄漏 | 严重安全问题 | 服务端 Secrets、日志脱敏、Provider 白名单 |
| Scheduler 重复/漏跑 | 失去信任 | 唯一约束、DB Lease、补偿策略、监控 |
| 新闻偏见和重复 | 信息质量下降 | 多来源、事件聚类、观点多样性、反馈闭环 |
| 成本不可控 | 无法长期自用 | 普通提醒不调用模型、模型分级、Token 预算、缓存 |
| Prompt 修改导致退化 | 行为不稳定 | 版本化 Prompt + 回归评测集 |
| 数据迁移损坏 | 丢失长期记录 | Migration 测试、备份、可回滚 |
| 插件越权或提示注入 | 泄露个人数据、执行非预期动作 | Manifest 不是授权；Capability Gateway、Schema、沙箱、审批、配额与审计 |
| 插件 API 过早冻结 | 后续背书/解题需要绕过核心 | 用两个真实第一方插件验证后才发布 v1 |
| 插件故障拖垮核心 | 聊天、任务不可用 | 超时、隔离执行、熔断、可禁用、核心不依赖插件启动成功 |
| 笔记本休眠或断网 | 任务延迟、远程不可用 | 禁止睡眠、健康检查、补偿扫描、本地提醒兜底、定期备份 |
| APK 与 Web 逻辑分叉 | 双倍维护成本 | 共享领域/API Client，平台能力统一走 Adapter，真机回归测试 |
| 公开家庭服务端 | 密钥和个人数据暴露 | HTTPS、设备认证、只暴露 API、数据库不公网、日志脱敏 |

---

## 26. 架构决策记录建议

建议建立 `docs/adr/`，至少记录：

1. ADR-001：保留 Next.js 模块化单体。
2. ADR-002：数据库从 OUT_OF_SCOPE 变为核心依赖。
3. ADR-003：Task 与 TaskRun 分离。
4. ADR-004：普通提醒不调用 LLM。
5. ADR-005：专业策略优先于 Persona 风格。
6. ADR-006：PostgreSQL Claim 取代浏览器定时器。
7. ADR-007：服务端密钥取代云端版 localStorage BYOK。
8. ADR-008：MVP 使用 SSE 而不是 WebSocket。
9. ADR-009：主动行为采用 Act Gate 与 Interrupt Gate 两阶段决策。
10. ADR-010：工具只接受结构化调用，禁止自由文本标签触发能力。
11. ADR-011：Inbox 是后台结果事实源，通知是可失败的 Delivery。
12. ADR-012：记忆采用 Core → FTS → Semantic 的检索阶梯。
13. ADR-013：语音与虚拟形象作为 Embodiment Adapter。
14. ADR-014：通过限时 Spike 选择 PostgreSQL Claim 或 Durable Job 平台。
15. ADR-015：所有外部内容默认不可信，并保留来源与信任标记。
16. ADR-016：学习能力通过 Activity Plugin 扩展。
17. ADR-017：声明式 Skill 与可执行 Plugin 分离。
18. ADR-018：插件只能通过 Capability Gateway 访问核心能力。
19. ADR-019：动态插件不得包含未预编译的 Android 原生代码。
20. ADR-020：背书与解题验证完成前不冻结 Plugin API v1；该条件已在 Phase 7.5 满足。
21. ADR-021：采用 Web-first + Capacitor-ready 的移动端策略。
22. ADR-022：单用户笔记本部署与未来云端使用同一容器和数据迁移模型。

ADR 模板：

```md
# ADR-xxx 标题

## 状态
Proposed / Accepted / Superseded

## 背景
为什么需要决策。

## 决策
选择什么。

## 备选方案
考虑过什么。

## 后果
获得什么、付出什么。
```

---

## 27. 下一步执行建议

当前优先级遵循 [产品主线指导](PRODUCT_MAINLINE_GUIDE.md)。Core 3.1–3.5、Phase 4.1–4.4、Phase 5.1–5.5、Phase 7.1–7.5 与 Phase 6.1–6.5 已完成；R3/R4 与 R5.1–R5.6 工程首期已交付，真实体验、长期收益及后移能力不等于已完成。

1. **真机排期已调整**：2026-10-17 按用户要求暂缓，把 M0.4、M1、语音、R2 UI、学习 / 娱乐与 R5.6 检查合并到 [真机验收统一待办](DEVICE_ACCEPTANCE_BACKLOG.md)。后续设备场景按组追加；恢复测试时用最新同批 APK 集中验收，不要求逐轮装包、不阻塞无关开发。
2. R8.1 设计与 R6.1–R6.4 任务深化已交付，详见 [专项规划](TASK_WORLD_AND_MODULE_UI_PLAN.md)、[R6报告](reports/R6_REPORT.md)。下一步 R7.1 大世界探索设计，再 R7 与 R8.2–R8.4 UI 实施，不自动开始。之后评估语音 / 移动发布需求，正式移动发布前完成适用设备门槛，再 Phase 5.6 发布前安全门与 Phase 8 作品集。不把长期学习 / 打卡收益、真机或 R1 净收益视为已签收。
3. 继续复用既有搜索 / 引用 / Verifier、Memory、Persona、Speech Adapter 与 Task / Inbox；语音是文字结果的可失败表达层，不另建 Agent 框架。
4. 背书与解题已验证 Capability Gateway 并冻结 Plugin API 1.0.0；新增 Activity 继续沿用受控能力与授权。娱乐保留独立 GameSession，虚构状态不混入普通长期记忆。
5. Mobile 已有本地 React Bundle 与本地提醒；Huawei Push、正式签名、ArkTS + ArkWeb 按实际需求推进，未实现项不提前记通过，不重写共享业务。

第一个可以对外演示的关键版本应是：

> 用户在对话中说“每周日晚上八点提醒我复盘本周学习”，确认任务后关闭网页；到时间收到 Push；点击后进入 Inbox，完成复盘，并由 Agent 提出一个高质量思考问题。

这一条用户旅程能够同时展示自然语言理解、结构化输出、数据库、调度器、Worker、通知、对话上下文和 Agent 体验，是本项目最合适的作品集核心 Demo。

第二条作品集旅程用于证明扩展性：

> 用户启用背书插件，导入一段学习材料并完成复述；插件记录薄弱点并请求核心 Task 系统安排下次复习。随后启用解题插件，把一道错题转成复习卡。两个插件都通过 Capability Gateway 工作，禁用后核心聊天、任务和历史仍然正常。

---

## 28. 参考资料

以下资料用于形成设计判断，不表示需要复制其全部架构：

进一步的爱语 2.9.5 静态结构分析、相关开源项目横向对照、架构修订、实验计划和 30/60/90 天学习路线，见 [`REFERENCE_PROJECT_STUDY.md`](./REFERENCE_PROJECT_STUDY.md)。该研究补充提出了主动行为双门控、Durable Inbox、渐进式记忆检索、结构化工具权限和 Embodiment Adapter 等设计。

- [DeepSeek Harness GitHub](https://github.com/deepseek-ai/deepseek-harness)
- [DeepSeek Harness Architecture](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md)
- [Capacitor 官方文档](https://capacitorjs.com/docs)
- [Next.js Static Exports](https://nextjs.org/docs/app/guides/static-exports)
- [OpenAI Codex GitHub](https://github.com/openai/codex)
- [OpenAI Codex 官方文档](https://developers.openai.com/codex)
- [ChatGPT Scheduled Tasks](https://learn.chatgpt.com/docs/automations)
- [ChatGPT Notifications](https://learn.chatgpt.com/docs/notifications)
- [Open WebUI Features](https://docs.openwebui.com/features/)
- [Pi](https://hey.pi.ai/)
- [Replika 官方说明](https://help.replika.com/hc/en-us/articles/115001070951-What-is-Replika)

说明：OpenAI 没有公开 ChatGPT 定时任务后端的完整内部实现。本文对 Scheduler、Queue、Worker 和通知解耦的描述，是基于官方公开行为与常见可靠任务系统设计作出的工程方案，不代表 OpenAI 内部源码结构。

---

## 29. 文档维护规则

- 产品方向发生变化时先更新本文件的目标、范围和路线图。
- 已做出的架构决策通过 ADR 记录，不直接覆盖历史原因。
- 每个 Sprint 完成后更新 CHANGELOG。
- 数据结构变化同步更新第 7 节和数据库迁移。
- API 变化同步更新第 17 节或迁移到独立 OpenAPI 文档。
- 每完成一个 Phase，重新评估后续优先级，不机械执行过时计划。
