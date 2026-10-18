# Task/TaskRun 任务系统

Sprint 2.1–2.5 建立任务、调度、Durable Inbox、Push 与 Agent Prompt Task；Phase 4.1–4.2 增加有来源、可跨期去重和反馈的个人简报。当前版本在网页关闭后仍能执行普通提醒、调用服务端模型或搜索生成简报，把结果保存到应用内收件箱，并向已授权设备尝试发送通知。

R6.1–R6.4 已于2026-10-17交付独立行动 / 打卡系统，使用 `/api/v1/actions` 和新增三张表，见 [使用指南](TASK_ACTIONS_GUIDE.md)、[报告](https://github.com/Ghostzerox/agent_web/blob/ebaeecbf67dfc03e34065d25e68d51f005177095/docs/reports/R6_REPORT.md)。`/tasks` 内“行动与打卡”是用户行动事实，“定时任务”保留本文原调度；`?task=…&edit=1` 或 `?section=scheduled` 直达后者。系统已执行 / 已送达不等于用户完成。关联普通提醒会在Inbox最终保存前复核行动资格，并为APK返回一次性下一有效时间；离线 / 真机限制见指南，原生成任务不因此改成打卡。

## 1. 使用方式

1. 执行数据库迁移：在 `web/` 运行 `npm run db:migrate`。
2. 推荐用仓库根目录的 Docker Compose 同时启动 Web、Worker 和 PostgreSQL；本机开发也可分别启动 Web 与 `npm run worker:reminders`。
3. 访问 `/tasks` 创建、编辑、暂停、恢复或删除任务，访问 `/inbox` 查看执行结果，访问 `/notifications` 启用系统通知并管理安静时段和设备。

当前支持固定单用户的 `reminder`、`agent_prompt` 与 `personal_briefing`。两种生成任务都必须填写 prompt：AI 定时任务保存任务要求，个人简报保存关注主题或简报要求；它们使用 `/api-key` 中保存的服务端模型配置，个人简报还要求内部 SearXNG 可用。可选时间规则：

| 类型 | 输入 | 含义 |
|---|---|---|
| `once` | 带时区的 ISO 8601 `runAt` | 在未来某个时刻执行一次 |
| `daily` | `HH:mm` | 每天在北京时间执行 |
| `weekly` | `weekday` 1–7 + `HH:mm` | 每周一至周日的北京时间执行 |

第一版固定使用 `Asia/Shanghai`。浏览器的 `datetime-local` 值会显式按 UTC+8 转成 ISO 字符串，因此手机和电脑处于不同时区时不会依赖设备默认时区。

## 2. 数据模型

### `scheduled_tasks`

保存用户意图和下一次计划时间：类型、标题、任务要求/简报主题、结构化时间规则、时区、`next_run_at`、状态与乐观锁版本。`active` 任务必须具有 `next_run_at`；`agent_prompt` 与 `personal_briefing` 必须具有非空 prompt；暂停任务会清空下一次时间。

### `task_runs`

保存每次计划执行的独立事实：计划时间、认领者、租约、尝试次数、执行状态、结果、错误和通知时间。`(task_id, scheduled_for)` 唯一约束是防止同一次计划被重复创建的最后一道数据库防线。

删除任务会级联删除其 Run。编辑或暂停任务会把尚未完成的旧 Run 标为 `cancelled`，防止 Worker 执行过期内容。

### `inbox_items`

保存已发生提醒或 AI 结果的来源、标题、正文快照、计划发生时间和已读状态。个人简报额外保存本次实际引用来源的规范 URL、标题签名与可选反馈；不保存未引用的搜索结果。每个 TaskRun 最多生成一条 InboxItem。删除源 Task/TaskRun 后外键设为 null，但快照继续保留，避免历史结果随任务清理而消失。

## 3. HTTP API

所有成功响应使用 `{ "data": ... }`，错误使用稳定的 `{ "error": { code, message, retryable, requestId } }`。响应设置 `Cache-Control: no-store` 和 `X-Request-Id`。

| 方法 | 路径 | 用途 |
|---|---|---|
| `GET` | `/api/v1/tasks` | 列出任务 |
| `POST` | `/api/v1/tasks` | 创建任务 |
| `GET` | `/api/v1/tasks/:id` | 读取任务 |
| `PATCH` | `/api/v1/tasks/:id` | 完整更新、暂停或恢复任务 |
| `DELETE` | `/api/v1/tasks/:id` | 删除任务 |
| `GET` | `/api/v1/inbox?filter=all|unread|read` | 按状态列出提醒 |
| `PATCH` | `/api/v1/inbox/:id` | 标为 `read`/`unread`，或为个人简报设置 `helpful`/`not_relevant`/`duplicate` 反馈 |
| `DELETE` | `/api/v1/inbox/:id` | 删除提醒 |
| `GET` | `/api/v1/push/config` | 读取 Push 公钥、偏好与脱敏设备列表 |
| `POST` | `/api/v1/push/subscriptions` | 保存或更新浏览器订阅 |
| `DELETE` | `/api/v1/push/subscriptions/:id` | 移除一台设备 |
| `PATCH` | `/api/v1/push/preferences` | 更新总开关与安静时段 |

创建每日提醒示例：

```json
{
  "title": "复习英语",
  "kind": "reminder",
  "prompt": "背诵今天的 20 个单词",
  "schedule": { "type": "daily", "time": "20:00" }
}
```

创建 AI 定时任务示例：

```json
{
  "title": "每日学习总结",
  "kind": "agent_prompt",
  "prompt": "生成一份今天值得复习的知识清单，并提出一个思考问题",
  "schedule": { "type": "daily", "time": "21:00" }
}
```

创建个人简报示例：

```json
{
  "title": "每日科技简报",
  "kind": "personal_briefing",
  "prompt": "国际人工智能政策、教育技术与值得阅读的研究",
  "schedule": { "type": "daily", "time": "08:00" }
}
```

更新请求必须带客户端最后读取到的版本：

```json
{
  "title": "复习英语",
  "kind": "reminder",
  "prompt": "背诵今天的 20 个单词",
  "schedule": { "type": "daily", "time": "21:00" },
  "status": "active",
  "expectedVersion": 2
}
```

版本过期返回 HTTP 409 `VERSION_CONFLICT`，页面会重新读取列表并要求用户再次确认操作。一次性时间必须在服务端当前时间之后。

## 4. 安全与当前边界

- API 不接受 `userId`、`nextRunAt` 或任意任务状态；`kind` 只允许 `reminder`/`agent_prompt`/`personal_briefing`，两种生成任务必须具有非空 prompt。
- Zod 使用严格对象校验，拒绝未知字段、非法 UUID、错误日期、越界星期和非法时间。
- 数据库错误不会返回连接信息或内部异常；公开错误仅暴露稳定错误码。
- 当前没有应用登录鉴权，只能通过 localhost 或 Tailscale 可信私网访问，禁止使用 Funnel 公开暴露。
- Worker 日志不输出任务标题、正文、数据库连接串或 API Key；收件箱使用安全 Markdown/KaTeX 渲染，不启用原始 HTML。
- 页面关闭不影响 Worker；但笔记本关机或休眠时无法执行。恢复后重复任务只补偿一次，避免提醒风暴。
- Inbox 是提醒事实来源，Web Push 只是可失败的提示渠道；页面打开时 `/inbox` 每 15 秒自动刷新。
- 反馈只允许写入个人简报，严格拒绝未知值；反馈和来源签名不含 API Key、用户聊天或模型 Prompt。
- 锁屏 Push 使用通用文案，不包含任务标题、正文或 prompt；完整订阅与 VAPID 私钥使用主密钥加密存库。
- 新设备不会补推订阅前的历史 InboxItem；临时错误会重试，404/410 会自动隔离失效订阅。

## 5. Worker 内部的 Scheduler Claim

认领只通过常驻 worker:reminders 执行。旧 scheduler:claim CLI 只领取、不完成任务，R9.4 已退役，避免诊断时占住租约。REMINDER_WORKER_ID 默认主机名 + PID，批量和租约配置见下节。

一次扫描先回收租约到期的 `claimed/running` Run，再锁定到期的 `active` Task。认领使用 `FOR UPDATE SKIP LOCKED`，因此多个 Worker 不会等待同一行；`(task_id, scheduled_for)` 唯一索引是第二道幂等防线。创建 Run、推进重复任务的 `nextRunAt` 或完成单次 Task 均处于同一事务。

迟到的每日/每周任务只生成一个补偿 Run，并把下一次计划推进到当前时间后的第一个规则时间，避免电脑关机数日后产生补发风暴。Task 推进使用整数版本护栏，不比较经 JavaScript 往返后可能丢失微秒精度的 PostgreSQL 时间。

Run 的 `workerId + attempt + 未过期 lease` 构成 fencing token。旧 Worker 在 Run 被重新认领后无法 start、续租或写入终态。Worker 日志不包含任务标题、提醒正文、数据库连接串或 API Key。

## 6. Reminder Worker 与 Durable Inbox

Docker Compose 的 `worker` 服务默认每 5 秒扫描一次任务与 Push，每 60 秒评估一次主动问候。Scheduler Claim 每批领取最多 20 个 Run。普通提醒无需调用模型；Agent Prompt Task 直接复用服务端 Credential Vault 与 OpenAI-compatible Provider。个人简报先调用内部 SearXNG，再读取同一任务最近 30 天实际展示的来源签名：规范 URL 相同或标题二元组相似度超过阈值的结果视为同一事件，先在本次结果内部聚类，再做跨期过滤。用户标为“不相关”或“内容重复”的历史简报使用更严格阈值。剩余证据作为不可信数据交给生成器；代码校验固定章节与引用，并附加来源、日期和订阅理由。用户 prompt 作为 `user` 消息发送，固定执行规则才是 `system` 消息。

同批 Run 并发进入执行，避免长模型调用耗尽其他 Run 的租约。AI 生成期间约每个租约三分之一周期续租，并在写结果前再次续租。临时 Provider 错误保留非终态并在租约过期后接管；配置缺失、空输出或超长输出等永久错误写为 `failed`。如果搜索结果全部属于近期已展示事件，Run 写为 `skipped`，不调用模型、不创建 InboxItem、也不规划 Push。成功结果、实际引用来源签名与 Run 终态在同一事务保存，正文最多 100,000 字符。

可选环境变量：

| 变量 | 默认值 | 限制 |
|---|---:|---|
| `REMINDER_WORKER_ID` | 主机名 + PID | 可留空自动生成 |
| `REMINDER_POLL_INTERVAL_MS` | `5000` | 1000–300000 毫秒 |
| `PROACTIVITY_POLL_INTERVAL_MS` | `60000` | 5000–3600000 毫秒 |
| `SCHEDULER_BATCH_SIZE` | `20` | 1–100 |
| `SCHEDULER_LEASE_MS` | `60000` | 5000–900000 毫秒 |

`docker compose --env-file .env.selfhost ps` 应同时显示 `postgres`、`search`、`web` 与 `worker`。Web 和 Worker 都通过 Compose 内部地址访问 Search。数据库还原脚本会同时停止 Web 和 Worker，避免还原期间继续写入。

## 7. Web Push 投递

同一个 Worker 循环会把尚未规划的 InboxItem 转换成每设备唯一的持久 Delivery。系统通知总开关默认关闭，安静时段默认是北京时间 22:00–08:00；规划和发送前都会检查静默边界。408、429、5xx 和网络错误指数退避，最多尝试 5 次；404/410 将设备标为失效。

浏览器权限必须由用户在 `/notifications` 明确点击后授予。iOS/iPadOS 16.4+ 还需要先把网站添加到主屏幕，再从主屏幕应用内启用。详细启用、数据流、安全与排障见 `WEB_PUSH.md`。

主动问候由同一 Worker 的独立低频循环触发。它不领取 TaskRun，也不影响用户明确创建的提醒、简报或书籍任务。规则通过后，InboxItem 与 Proactivity Ledger 在同一事务创建，再由既有 Push 循环规划投递；当前问候使用确定性无负罪感模板，不调用模型。访问 `/proactivity` 可启用、降频、暂停一周、关闭某类原因并查看最近为何联系。

### Android APK 本地提醒

Capacitor Android 使用 Local Notifications 作为独立的设备投递层。用户必须在 `/tasks` 或 `/notifications` 主动点击授权；已有权限时，应用启动/恢复、任务列表加载以及创建、修改、暂停、恢复、删除后都会对系统待处理通知执行 reconciliation。

- 只有普通 `reminder` 同步到 APK 本地通知；AI 定时任务与个人简报必须等待服务端生成结果。
- 一次性提醒按绝对时间调度；每天和每周提醒使用原生重复规则。
- 通知 ID 由 Task ID 稳定生成；`occurrenceId` 包含任务版本和下次执行时间，用于识别需要替换的旧调度。
- 通知正文只使用任务标题，不包含 Agent Prompt、模型密钥或服务端凭据。
- 点击通知只接受应用生成的站内相对深链，并打开对应任务。
- Android 重启恢复由 Capacitor 插件的 Boot Receiver 负责；服务端 Task/Inbox 仍是事实源。
- 本地提醒与 Web/Huawei Push 不互相伪装：前者针对已知到期时间，后者针对服务端新生成内容。

## 8. 生成任务当前边界

普通 Agent Prompt Task 是独立上下文，不自动读取聊天、长期记忆、搜索结果或插件。个人简报只读取用户显式填写的主题、本次搜索摘要，以及同一任务最近 30 天的公开来源签名与反馈；不读取聊天或长期记忆，当前也不抓取网页全文。聚类是确定性的 URL/标题近似规则，不声称理解所有事件关系；反馈只调整相似内容抑制，不自动改写用户主题。通知层仍只消费 Inbox，不直接承担生成。详细决策见 `adr/ADR-035-AGENT-PROMPT-TASK-EXECUTION.md`、`adr/ADR-045-SOURCED-PERSONAL-BRIEFING.md` 与 `adr/ADR-046-BRIEFING-DEDUPLICATION-FEEDBACK.md`。
