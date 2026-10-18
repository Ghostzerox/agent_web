# AI Study Companion

## 项目简介

这是一个支持用户自定义API Key的AI Agent网站。

目标不是快速堆功能，而是完成一个长期维护、结构清晰的软件工程项目。

主要方向：

* 情感陪伴
* 学习辅导
* Prompt实践
* AI Agent开发
* 角色扮演与 AI 跑团
* Web、Android APK 与 HarmonyOS 多端体验

---

## 技术栈

Framework

* Next.js 16

Language

* TypeScript

UI

* Tailwind CSS

Deploy

* Docker Compose + Tailscale
* Vercel（可选）

Database

* PostgreSQL
* Drizzle ORM

---

## 当前开发进度

已完成：

* Phase 0 聊天 MVP 基线
* 树形对话与安全 Markdown/数学公式渲染
* PostgreSQL/Drizzle Schema 与可回滚迁移基线

已完成：

* Phase 2：可靠 Task/TaskRun 提醒与 Agent Prompt 闭环

开发中：

* Phase 3：模式、Prompt、专业回答、搜索、引用与轻量质量评测（已完成）
* Mobile Track：Capacitor Android 与 HarmonyOS 演进

Phase 4 主动内容闭环、Phase 5.1–5.5、Phase 7.1–7.5 与 Phase 6.1–6.5 已完成：可信记忆、Persona、设备语音、有约束的主动问候和 Plugin API 1.0.0 已经落地。娱乐模式已有独立 GameSession、树形回合、可信骰子、结构化状态、检查点、导出和轻量冒险规则包。当前优先精简现有实现，之后再评估移动发布 / 语音需求；Phase 5.6仍为发布前封版。

R3–R8 工程首期已交付：提示词 / 工具、分域记忆、行动 / 打卡 / 目标、叙事探索与七入口模块化UI，见 [R8指南](docs/R8_MODULE_UI_GUIDE.md)。R9.1已完成 [现状解构与26项删改清单](docs/R9_1_SIMPLIFICATION_AUDIT.md)，下一步R9.2先删确定退出的旧代码，再兼容收敛和解耦；不再默认永久维护所有旧版本。本轮未删除业务代码或数据，真机仍统一暂缓，不把自动检查当硬件或长期效果签收。

当前优先级、修订后的交付顺序与防偏移规则见 `docs/PRODUCT_MAINLINE_GUIDE.md`。运行 `npm run eval:core` 可查看模式边界、专业回答与总回归分数；该分数只表示确定性契约没有回归，不代表模型事实正确率。

Phase 1 已完成：Conversation/Message 服务端 Repository/API、模型 Streaming、显式旧数据导入和 Docker Compose 单用户自托管基线均已建立。Chat 现在以 PostgreSQL 为事实来源；浏览器旧会话只有在用户确认后才会导入，重复请求由导入收据去重。随后完成的 Credential Vault 支持从网页测试和保存自有 Key，服务端使用 AES-256-GCM 加密后写入 PostgreSQL。

---

## 数据库开发

1. 在 `web/` 下把 `.env.example` 复制为 `.env.local`，填写本机 PostgreSQL 连接串。
2. 执行 `npm run db:migrate` 升级到最新 Schema。
3. 执行 `npm run db:rollback` 事务化回滚最近一条迁移。
4. 修改 `lib/db/schema.ts` 后执行 `npm run db:generate`，审阅生成 SQL，并为新迁移补充同名 rollback SQL。

详细流程、安全约束和故障处理见 `docs/DATABASE_OPERATIONS.md`。

服务端会话 API 使用 `/api/v1/conversations` 前缀，具体端点、请求格式和并发规则见 `docs/SERVER_DATA_API.md`。当前 API 没有登录鉴权，只能在本机或可信私有网络使用，不得直接暴露到公网。

任务页面位于 `/tasks`，支持单次、每日和每周的普通提醒、AI 定时任务与个人简报。独立 Worker 在网页关闭后仍会执行到期任务，并按 `/proactivity` 保存的规则检查主动问候；问候与任务结果都先进入 `/inbox`，再向已授权设备尝试 Push。访问 `/notifications` 可管理总开关、安静时段与设备；模型、时区和运行边界见 `docs/TASKS.md`，启用与排障见 `docs/WEB_PUSH.md`。

旧版 `agent_chat_sessions` 的预检、确认、树形迁移、去重和失败恢复规则见 `docs/LEGACY_DATA_IMPORT.md`。

模型配置首选 `/api-key` 写入式设置页：Provider、Base URL 与 Model 均由用户输入并以普通字段保存，Key 只在保存/测试请求中短暂经过浏览器内存并由服务端加密，状态接口只返回末四位提示。`AI_API_KEY`、`AI_BASE_URL`、`AI_MODEL` 仅保留为没有数据库凭据时的管理员兜底；Streaming、凭据端点与错误码见 `docs/SERVER_MODEL_PROVIDER.md`。

笔记本自托管的启动、健康检查、凭据主密钥、重启恢复、备份还原与 Tailscale 私有访问见 `docs/SELF_HOSTING.md`。默认只绑定 localhost，当前无应用登录鉴权，不可使用 Funnel 或端口转发直接暴露公网。

移动端采用“共享 React 客户端 + 薄平台壳”：Mobile M1.1 已把复用 Web 页面与 API Client 的 Vite 本地 Bundle 打入 Capacitor APK，正式构建不再使用 `server.url`，经 Tailscale HTTPS 调用笔记本服务端。之后加入 Prompt 文件导出、语音与 HMS Push，最终以 ArkTS + ArkWeb HAP 替换 HarmonyOS 平台能力而不重写服务端。娱乐模式、移动端和语音的设计见 `docs/FEATURE_AND_MOBILE_EXPANSION_PLAN.md`。

娱乐模式入口位于 `/entertainment`，支持世界/角色、剧情树、可信骰子与检定、结构化状态、检查点及 Web/APK 导出。`/plugins` 可启用轻量冒险，授权隔离存储后在 `/entertainment/quick-adventure` 选择模板并预览，确认后创建游戏；具体边界、API 和新增规则包方式见 `docs/GAME_SESSIONS.md` 与 `docs/GAME_RULE_PACKS.md`。

Android Debug APK 已可构建；当前安装路径、重建命令、JDK/SDK 边界与 M0.3 真机清单见 `docs/MOBILE_ANDROID.md`。该 APK 是个人兼容性测试版本，不是正式发布包。

Mobile M0.4 已加入循环式手机闹钟时间滚轮和 Capacitor 本地任务提醒：APK 可在创建、修改、暂停、恢复或删除任务后同步 Android 系统调度；通知页提供 10 秒发送/取消测试及待发送、已送达诊断。Web Push 继续负责服务端生成内容，两者保持独立。

Mobile M1.1 已加入本地可打包 React Client、Hash Router、共享跨端 API Client、严格的 Capacitor Origin CORS 与离线连接诊断。构建脚本会同时检查生成配置和 APK 内容，确保交付包内含本地页面且没有 `server.url`。

Mobile M1.2 已支持导出最近一次真实模型请求：JSON 用于复现和调试，Markdown 用于阅读；Web 使用文件下载，APK 使用 Capacitor Filesystem + Share 调起系统分享面板。个人记忆默认脱敏，API Key 等凭据永不进入导出文件。

Mobile M1.3 已进入真机验收：Android 会缓存最小提醒快照供服务端离线时恢复，并在开机、校时、时区变化和覆盖安装后重新注册提醒；通知页提供精确闹钟设置入口并明确华为强行停止的系统限制。

---

## 项目原则

保持简单。

保持稳定。

保持可运行。

每次只完成一个小目标。

---

## 项目目录

agent_web/

├── README.md

├── CLAUDE.md

├── PROJECT.md

├── prompts/

└── web/

---

## 开发流程

规划

↓

编码

↓

验证

↓

Commit

↓

继续下一任务

---

## 长期目标

完成一个可以部署、持续迭代并运行于 Web、Android APK 与 HarmonyOS 的个人 AI Agent；在专业性不被人格影响的前提下，支持任务、主动内容、语音、娱乐活动和受控插件扩展。
