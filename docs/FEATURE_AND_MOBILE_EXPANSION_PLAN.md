# 功能扩展与移动端演进方案

- 状态：规划基线
- 日期：2026-09-13
- 适用范围：娱乐模式、Prompt 导出、语音、Android APK、HarmonyOS 与主动内容推送

> 排期覆盖（2026-10-17）：按用户要求暂缓真机测试，前期未完成与后续设备检查统一进入 [真机验收待办](DEVICE_ACCEPTANCE_BACKLOG.md)。本文阶段能力与操作边界保留，待验不等于通过，也不作为无关功能开发前置。

## 1. 总体结论

项目继续采用“共享服务端 + 共享 Web UI + 平台适配器”的路线，不维护两套业务逻辑：

```text
共享领域与服务端
├── Conversation / Task / Agent Run / Inbox
├── Mode Registry / Prompt Envelope / Tool Gateway
├── TTS / Content Curation / Push Provider
└── PostgreSQL + Worker
          ▲
          │ HTTPS API / SSE
          ▼
共享 React 客户端
├── Browser / PWA Adapter
├── Capacitor Android Adapter（APK，卓易通兼容验证）
└── ArkTS + ArkWeb Adapter（后期 HarmonyOS 原生壳）
```

网页、APK 和未来 HAP 共享 API 契约、领域模型、任务事实和大部分页面。平台差异只允许进入 `FileExportAdapter`、`SpeechOutputAdapter`、`LocalNotificationAdapter`、`NativePushAdapter` 等边界。Android 与 HarmonyOS 原生工程不得复制 Scheduler、模型密钥或核心 Agent 逻辑。

## 2. 模式系统的表层重构

### 2.1 从二选一改为可注册模式

不再把“专业”和“陪伴”写成散落在组件里的布尔值，而是建立 `ModeDefinition`：

| 模式 | 主要目的 | 事实标准 | 默认工具 | 持久状态 |
|---|---|---|---|---|
| `professional` | 学习、研究、解题 | 严格，引用优先 | 搜索、引用、计算 | Conversation |
| `companion` | 聊天、安慰、关系连续性 | 不降低事实要求 | 记忆、主动策略 | Conversation + Memory |
| `entertainment` | 角色扮演、AI 跑团、互动故事 | 世界内事实与现实事实分离 | 骰子、角色卡、场景状态 | GameSession |

模式负责选择交互协议，不直接获得数据库、网络或系统权限。专业性与安全策略位于模式上层，因此角色扮演不能覆盖现实风险提示、隐私规则和工具审批。

### 2.2 Prompt 分层

所有模型调用逐步统一为可版本化的 `PromptEnvelope`：

```text
不可覆盖的安全与事实策略
→ 当前 ModeDefinition
→ Persona / Voice style
→ Conversation 或 GameSession 上下文
→ 检索记忆与工具结果
→ 用户消息
```

每层具有 `id`、`version`、`source` 和可导出标记。这样娱乐模式、插件和语音不会通过拼接一段巨型 system prompt 污染专业回答。

## 3. 娱乐模式

### 3.1 角色扮演 MVP

- 用户选择或创建角色卡、世界设定和边界规则。
- 新建独立 `GameSession`，不把虚构剧情写入普通长期记忆。
- 每轮生成同时返回展示文本与受 Schema 校验的状态补丁。
- 支持暂停、继续、分支、回滚到检查点和导出记录。
- 明确标识 AI 生成内容；退出娱乐模式后恢复普通回答契约。

### 3.2 AI 跑团 MVP

新增领域对象：

- `game_systems`：规则系统、版本和允许工具。
- `game_sessions`：世界、主持风格、当前场景、状态和版本。
- `game_characters`：角色卡、属性、物品和关系。
- `game_turns`：输入、叙事结果、结构化状态补丁和父节点。
- `game_events`：骰子、检定、伤害、奖励等不可变事件。
- `game_checkpoints`：可恢复的状态快照。

随机数必须由确定性 Dice Tool 产生并记录种子/结果，不能让模型自行声称掷骰。状态补丁在事务中验证并应用；非法属性、负物品数量或越权工具调用必须拒绝。树形 `game_turns` 可复用现有对话分支思想，但不能直接塞进 `messages`，否则普通对话与游戏状态会耦合。

### 3.3 插件扩展点

娱乐规则包未来作为 Activity Plugin：贡献 Manifest、Prompt Layer、Tool Schema、状态 Schema 和专用 UI。插件只能通过 Capability Gateway 请求掷骰、保存状态、播放音效等能力，不能直接写数据库或访问全部个人记忆。

## 4. Prompt 导出

### 4.1 导出的对象

“给 API 的 Prompt”应指模型实际收到的 `PromptEnvelope`，而不是聊天气泡的简单拼接。导出内容包括：

- Provider 标识与模型名，不包含 API Key。
- Prompt 各层、角色、顺序和版本。
- 工具定义、温度等非敏感生成参数。
- Context 截断/压缩说明。
- 创建时间、Run ID 和内容哈希。

默认排除 API Key、数据库连接、Push Token、内部错误栈和标记为不可导出的插件私有数据。用户主动确认后才包含检索到的个人记忆。

### 4.2 格式与平台实现

- JSON：用于调试、复现和作品集。
- Markdown：用于阅读、比较 Prompt 版本。
- Web：Blob 下载，支持时优先 File System Access / Web Share。
- Capacitor：Filesystem 写入缓存或文档目录，再调用系统 Share Sheet。
- ArkTS：通过 ArkWeb bridge 调用系统文件选择/分享能力。

Core 3.2 已实现服务端 Prompt Envelope 与校验导出：模型请求进入 Provider 前，服务端生成带 Run ID、层版本、非敏感参数和 SHA-256 的 Envelope，并把 Run 状态、哈希与审计元数据写入 PostgreSQL。完整 Prompt 不写数据库，只随本次 SSE 返回客户端运行内存；导出时由服务端重新校验 Envelope 与审计记录并生成文件，客户端只负责保存或分享。

M1.2 的文件保存与系统分享 Adapter 继续复用；客户端自行重建 Prompt 文档的过渡实现已由 Core 3.2 取代。记忆仍默认脱敏，显式确认后才进入导出文件；刷新后完整 Envelope 不恢复，但数据库保留不含 Prompt 明文的长期 Run 审计记录。

## 5. AI 语音

### 5.1 分层

```text
模型文字结果
→ Speech Policy（哪些内容允许朗读）
→ TTS Provider（生成音频）
→ Audio Cache（短期、可删除）
→ SpeechOutputAdapter（Web/Capacitor/ArkTS 播放）
```

文字回答仍是事实来源，语音只是表达层。TTS 失败不得让文字回答失败。

### 5.2 Voice Profile

Phase 5.4 已落地第一阶段：`VoiceProfile` 在服务端保存 provider、设备 voice ID、语言、语速、音高和音量，Web 与 APK 共享设置页面；系统/Web Speech Provider 支持枚举、试听、停止、切换和按语言回退。聊天文字生成完成后由用户手动触发朗读，加载 Profile 或播放失败只影响按钮状态，不影响文字答案。

本地系统语音没有统一、可验证的情绪强度接口，因此不保存无法兑现的字段。需要跨设备稳定音线和情绪控制时，再接入可配置的服务端 TTS Provider，并把其 API Key 只存 Credential Vault。服务端 Provider 届时再加入音频缓存、TTL、每日额度与费用提示；当前本地 Provider 不产生可缓存音频文件，也不上传回答正文。

自定义/克隆音线必须记录声音来源与授权，不提供冒充真实人物的默认模板。服务端限制单次字符数、缓存时间和每日额度。长回答按句切分并可随时停止，避免一次生成整段后无法打断。

## 6. 通知与主动内容

### 6.1 三种语义必须分离

| 场景 | 事实与生成位置 | 首选投递 | 离线能力 |
|---|---|---|---|
| 到期普通提醒 | PostgreSQL Task；同步一份近期 occurrence 到设备 | APK Local Notification | 有，设备已同步的提醒可触发 |
| AI 主动聊天 | 服务端 Proactivity Policy + Worker | Huawei Push / Web Push | 无；当前规则与模板无需模型，但仍要求服务端 Worker 在线 |
| 每日新闻/书籍 | 服务端搜索、去重、引用和生成 | Inbox + Huawei Push | 已生成内容可缓存阅读 |

Inbox 始终是持久事实源，Push 和本地通知只是 Delivery。通知失败不能丢失任务结果。

### 6.2 APK 本地提醒同步

- 服务端仍是 Task 的唯一事实来源。
- APK 在登录、任务变更、应用恢复前台时拉取未来一段时间的普通提醒 occurrence。
- `LocalNotificationAdapter.reconcile` 创建、更新并取消本地计划。
- 用 Task UUID + occurrence time 生成稳定的 32 位 native ID，并在本地保存映射避免碰撞。
- Android 13 请求通知权限；精确提醒单独检测系统设置。无法取得精确权限时明确显示“可能延迟”，不声称准点。
- 只同步普通提醒。AI 任务、新闻和主动聊天不能伪装成离线生成。

### 6.3 Huawei Push 两阶段路线

阶段 A：Capacitor APK 通过卓易通运行，增加预编译的 HMS Push 原生插件，取得 Token 后登记到现有 `huawei-push` Provider。必须真机验证卓易通环境是否完整支持 HMS SDK、后台收取和点击深链；在验证前仅标为实验能力。

阶段 B：建立 ArkTS + ArkWeb HAP。ArkWeb 继续承载共享 Web UI，ArkTS 实现通知授权、Push Token、文件、语音和深链 Adapter。服务端 Provider、Task、Inbox 和 API 契约不变。

## 7. Capacitor 起步策略

### 7.1 为什么现在不能直接得到正式 APK

当前 Next.js 项目同时包含动态页面和服务端 Route Handler；Capacitor 正式打包要求 `webDir` 内存在独立构建产物和根 `index.html`。因此不能把 `.next` 当作离线客户端直接复制。

M0 加入的 `capacitor.config.ts` 与 `mobile-shell/index.html` 是 remote-shell 验证基线：

- 未设置远程地址时只显示离线兜底页。
- Spike 构建必须显式设置 `CAPACITOR_BUILD_PROFILE=spike`。
- 只允许 HTTPS `CAPACITOR_SERVER_URL`，禁止 URL 内凭据、查询 Token 和明文 HTTP。
- APK 通过 Tailscale HTTPS 打开现有 Next.js 应用，暂时无需双写 UI 或开放 CORS。

Capacitor 官方将 `server.url` 定位为 Live Reload，而非生产发布配置。M1.1 已新增 Vite 本地客户端入口：正式 Debug APK 把共享 React 页面打入 `mobile-dist`，通过共享 API Client 调用 Tailscale 上的 Next.js API，使用 Hash Router 并将 CORS 限制为 Capacitor Origin。remote-shell 仅保留为显式 `spike` 调试配置。

### 7.2 是否双端开发

结论是“一个产品客户端，多个薄平台壳”，不是两个独立产品：

- React 页面、API Client、领域类型和状态机共享。
- Next.js 保留服务端、SEO/网页入口和 API Route。
- Capacitor/ArkWeb 只实现系统能力 Adapter 与生命周期。
- 只有平台权限、通知、文件、音频、深链和安全存储允许原生代码分叉。
- 当某一页面确实需要原生性能时再局部替换，不能先复制整个 UI。

## 8. 任务规划

### Core Track

| Sprint | 内容 | 验收 |
|---|---|---|
| 3.1 ✅ | Mode Registry + Policy Layer | 注册表、核心策略、可回滚枚举迁移、乐观锁更新 API 与模式选择 UI 已完成 |
| 3.2 ✅ | Prompt Envelope + Export | 服务端 Envelope、无明文 Run 审计、哈希校验 JSON/Markdown 导出与敏感字段测试已完成 |
| 3.3 ✅ | Web Search + Citation | 已完成：自动/强制/关闭检索、证据隔离与可点击持久化来源 |
| 3.4 ✅ | Response Verifier | 已完成：引用、摘要支持、时效与推断边界检查可见并随回答持久化 |
| 3.5 ✅ | 轻量质量评测封版 | 25 个固定样例覆盖模式边界与专业回答契约，不调用真实模型并输出稳定分数 |
| 4.1 ✅ | 有来源的个人简报 | Worker 搜索并生成日期、来源、理由和一个思考问题，原子进入 Inbox |
| 4.2 ✅ | 简报去重与反馈 | 30 天跨期事件聚类、无新事件静默跳过、轻量反馈与任务调整入口已完成 |
| 4.3–4.4 ✅ | 书籍与反思质量 | 已完成：推荐目的清晰，问题少而精，并支持阅读画像、历史去重与反馈控制 |
| 5.1–5.5 ✅ / 5.6 ⏸ | 记忆、Persona、TTS、主动性 | 可见功能已完成；情绪支持安全评测延后为整体功能完成后的发布前封版 |
| 7.1 ✅ | 第一方插件清单与注册 | 背书/解题可发现、启停和兼容性拒绝；启用不自动授予能力 |
| 7.2 ✅ | 能力网关与隔离 | 逐项授权、插件版本复核、Run 上下文、隔离存储、每日配额和无正文审计已完成 |
| 7.3–7.5 ✅ | 学习插件验证 | 背书、解题和 Plugin API 1.0.0 冻结已完成 |
| 6.1 ✅ | GameSession、角色卡与世界设定 | 独立表、严格 API、版本锁和 Web/APK 管理页已完成；普通对话与长期记忆保持零写入 |
| 6.2 ✅ | 角色扮演 MVP | 服务端生成并原子保存回合；支持暂停/继续、树形分支及 Web/APK JSON/Markdown 导出 |
| 6.3–6.5 ✅ | AI 跑团扩展 | 可信骰子、分支角色/场景/物品、服务端检定、检查点与首个轻量冒险规则包已完成；规则包使用冻结 v1 的隔离存储和宿主确认草稿，Web/APK 共用 Activity |

### Mobile Track

| Sprint | 内容 | 验收 |
|---|---|---|
| M0.1 ✅ | 平台契约、HTTPS remote-shell 配置与离线兜底 | Web 构建不受影响，危险 URL 被拒绝 |
| M0.2 ✅ | 安装 Capacitor 8、Android Studio、SDK 与兼容 JDK；生成 Android 工程 | Debug APK 构建、签名检查与 HTTPS 服务端健康检查通过 |
| M0.3 ✅ | 卓易通首轮兼容矩阵 | 登录、SSE、公式与树形对话通过；Web Push 失败已归类为平台能力差异 |
| M0.4 | 循环时间滚轮 + 本地提醒 | 任务 CRUD 与 10 秒发送/取消诊断已完成，系统清理后的送达待继续验证 |
| M1.1 ✅ | 本地可打包 React Client 边界 | 不使用生产 `server.url`，共享 API Client，无业务双写 |
| M1.2 ✅ | 文件导出与 Share Adapter | Prompt JSON/Markdown 能保存/分享，记忆默认脱敏 |
| M1.3 🧪 | Local Notification 发布加固 | 设备快照、离线回退、精确闹钟入口和系统恢复广播已实现，等待华为真机回归 |
| M1.4 | Speech Output Adapter | 试听、播放、停止、锁屏/耳机行为通过真机验证 |
| M2.1 | HMS Push Capacitor Plugin Spike | 卓易通中 Token、后台 Push 和深链得到实测结论 |
| M2.2 | Huawei 服务端投递 | 主动聊天、新闻、书籍复用 Durable Inbox 和 Huawei Provider |
| M3.x | ArkTS + ArkWeb 原生壳 | 共享 UI/API，替换系统能力 Adapter，不重写服务端 |

## 9. 当前状态与前置条件

- Node.js 24 与 Capacitor 8.5.2 已安装，满足 Node 22+ 要求。
- Android Studio 2026.1、Android SDK 36/37 与 Build Tools 35/36 已安装；真机最低 API 24。
- Android Studio 自带 JDK 25 超出 Gradle 8.14.3 的运行支持范围，构建使用独立 Microsoft OpenJDK 21 LTS，不覆盖系统 Java。
- 首个 Debug APK 已在华为手机/卓易通完成登录、SSE、公式与树形对话验证；Web Push 未弹窗，M0.4 改由 Capacitor 本地通知处理已设定任务。
- M1.1 本地 Web Bundle 已进入 Debug APK；正式发布仍需要 Release Keystore、版本策略、应用鉴权和真机回归，当前包不可公开分发。
- 不在 APK 内保存 Provider API Key、华为服务端密钥或数据库凭据。

## 10. 参考

- [Capacitor 安装要求](https://capacitorjs.com/docs/getting-started)
- [Capacitor 配置与 remote server 警告](https://capacitorjs.com/docs/config)
- [Capacitor Android 环境](https://capacitorjs.com/docs/getting-started/environment-setup)
- [Capacitor Local Notifications](https://capacitorjs.com/docs/apis/local-notifications)
- [Huawei Push Kit](https://developer.huawei.com/consumer/en/hms/huawei-pushkit)
- [HarmonyOS 开发能力总览](https://developer.huawei.com/consumer/en/harmonyos/develop/)
