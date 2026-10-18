# 服务端数据 API

Sprint 1.2 提供单用户 Conversation/Message Repository 和 `/api/v1` HTTP 接口。它是 Chat UI 迁移到服务端的基础，不包含模型调用、Streaming 或旧 localStorage 导入。

模型状态与 Streaming 端点已在 Sprint 1.3 加入，详见 `docs/SERVER_MODEL_PROVIDER.md`。

## 1. 使用前提与安全边界

1. 配置 `web/.env.local` 中的 `DATABASE_URL`。
2. 在 `web/` 执行 `npm run db:migrate`。
3. 启动 `npm run dev`。

当前版本没有登录系统，所有请求都映射到固定的本地用户 `00000000-0000-4000-8000-000000000001`。只允许在本机、可信局域网或经过访问控制的私有网络使用，不得直接暴露到公网。身份认证和多用户隔离不是本 Sprint 范围。

所有响应包含：

```text
Cache-Control: no-store
X-Request-Id: <uuid>
```

数据库中的 `timestamptz` 经 JSON 响应序列化为 UTC ISO 8601 字符串。

## 2. 端点

| 方法 | 路径 | 用途 |
|---|---|---|
| `GET` | `/api/v1/health` | 检查数据库 readiness 与脱敏模型配置状态 |
| `GET` | `/api/v1/conversations` | 按更新时间倒序列出会话，不携带消息 |
| `POST` | `/api/v1/conversations` | 创建会话 |
| `GET` | `/api/v1/conversations/:id` | 获取会话及完整消息树 |
| `DELETE` | `/api/v1/conversations/:id` | 删除会话并级联删除消息 |
| `PATCH` | `/api/v1/conversations/:id` | 用乐观版本锁局部更新标题或模式 |
| `POST` | `/api/v1/conversations/:id/messages` | 追加一个消息节点并将其设为活动叶节点 |
| `PATCH` | `/api/v1/conversations/:id/active-leaf` | 切换当前活动分支 |
| `POST` | `/api/v1/imports/local-storage` | 预检或确认导入浏览器旧会话 |
| `GET` | `/api/v1/persona-profile` | 读取当前用户的结构化人格设置；不存在时创建默认值 |
| `PATCH` | `/api/v1/persona-profile` | 以乐观版本锁更新人格设置 |
| `GET` | `/api/v1/voice-profile` | 读取当前用户的 Voice Profile；不存在时创建默认值 |
| `PATCH` | `/api/v1/voice-profile` | 以乐观版本锁更新系统音线、语言、语速、音高和音量 |
| `GET` | `/api/v1/proactivity` | 读取主动问候偏好、通知安静时段与最近联系账本 |
| `PATCH` | `/api/v1/proactivity` | 以乐观版本锁更新开关、原因、预算、冷却期、未互动阈值与暂停时间 |
| `POST` | `/api/v1/proactivity` | 立即按服务端已保存规则评估一次；不绕过任何策略护栏 |
| `GET` | `/api/v1/plugins` | 返回仓库内第一方插件 Manifest、兼容性和当前用户启停状态 |
| `POST` | `/api/v1/plugins/:id/enable` | 以乐观版本锁启用兼容的第一方插件基础 |
| `POST` | `/api/v1/plugins/:id/disable` | 以乐观版本锁禁用第一方插件基础 |
| `GET` | `/api/v1/plugins/:id/capabilities` | 读取逐项授权、有效状态与当日配额 |
| `POST` | `/api/v1/plugins/:id/capabilities/:capability/grant` | 以乐观版本锁授权 Manifest 已声明的能力 |
| `POST` | `/api/v1/plugins/:id/capabilities/:capability/revoke` | 撤销能力；插件已禁用时仍允许撤销 |
| `GET` | `/api/v1/plugins/:id/audit?limit=20` | 读取最近 1–50 条无业务正文的能力审计 |
| `GET` | `/api/v1/memorization` | 通过插件隔离存储读取背书材料摘要 |
| `POST` | `/api/v1/memorization` | 保存用户校对后的材料与知识单元 |
| `GET` | `/api/v1/memorization/:id` | 读取一份材料、学习进度与存储版本 |
| `DELETE` | `/api/v1/memorization/:id` | 以存储版本锁删除材料及其学习记录 |
| `POST` | `/api/v1/memorization/:id/review` | 提交复述，保存评价并返回可选任务草稿 |
| `GET` / `POST` | `/api/v1/problem-solving` | 列出或创建文字/图片题目记录；图片正文不落库 |
| `GET` / `DELETE` | `/api/v1/problem-solving/:id` | 读取或以存储版本锁删除题目、解题记录与复习卡 |
| `POST` | `/api/v1/problem-solving/:id/interactions` | 按提示/引导/检查/讲解策略请求模型并保存错因和工具证据 |
| `POST` | `/api/v1/problem-solving/:id/review-cards` | 从指定解题记录生成并保存复习卡 |
| `POST` | `/api/v1/problem-solving/:id/task-draft` | 为指定复习卡返回待用户确认的核心任务草稿 |
| `GET` / `POST` | `/api/v1/game-sessions` | 列出或创建独立游戏会话，可同时创建首张角色卡 |
| `GET` / `PATCH` / `DELETE` | `/api/v1/game-sessions/:id` | 读取、更新或删除世界设定，写入使用 Session 版本锁 |
| `POST` | `/api/v1/game-sessions/:id/characters` | 添加角色卡并推进 Session 版本 |
| `PATCH` / `DELETE` | `/api/v1/game-sessions/:id/characters/:characterId` | 以 Session + Character 双版本锁更新或删除角色卡 |
| `PATCH` | `/api/v1/game-sessions/:id/status` | 使用 Session 版本锁开始、暂停或继续游戏 |
| `POST` | `/api/v1/game-sessions/:id/turns` | 从指定父回合调用服务端模型并原子保存新回合 |
| `POST` | `/api/v1/game-sessions/:id/export` | 返回 Web/APK 文件 Adapter 可用的完整分支 JSON/Markdown Artifact |

Persona Profile 只接受名称、可选用户称呼，以及 `warmth`、`humor`、`directness`、`verbosity`、`initiative` 五个 0–100 整数。API 不接受自定义 Prompt 或硬边界文本；`initiative` 只表示当前对话中的引导强度，不代表后台主动联系。

Voice Profile 当前只接受 `provider=system`、可空的设备 `voiceId`、BCP 47 风格语言标签，以及 `rate=50..200`、`pitch=0..200`、`volume=0..100` 整数百分比和 `expectedVersion`。音线枚举与播放发生在当前设备，服务端不接收回答正文或音频；设备缺少已保存音线时客户端按语言回退。

Proactivity 默认关闭，仅支持 `goal_followup` 与 `checkin` 两类明确原因。`POST` 只触发与 Worker 相同的规则评估：暂停、安静时段、上一条未读、每日预算、冷却期或没有真实信号时返回稳定的 `skipped` 原因，不创建 InboxItem。目标跟进只读取用户确认、未过期且非敏感的正式目标；久未互动只比较最后一条真实用户消息时间，不推断情绪。任务提醒、简报和书籍推荐不计入这套陪伴预算。

插件端点只管理随应用发布的第一方清单，不接受上传 URL、压缩包、代码或自定义 Manifest。Manifest 声明、插件启用和用户授权是三个独立状态；授权请求只接受 `expectedVersion`，且插件必须兼容、已启用、安装版本与当前 Manifest 一致。插件升级会使旧授权失效，等待重新审核。Capability Gateway 没有浏览器通用调用端点：只有服务端第一方活动能请求已注册 Adapter。Phase 7.5 已冻结 Plugin API 1.0.0：模型使用插件绑定的注册操作，任务能力只返回待确认草稿，跨插件学习卡只交换带来源的中立 Schema；这些宿主内部契约不会额外暴露通用浏览器执行 API。

GameSession 端点管理独立的虚构世界、角色卡与剧情回合树，不创建普通 Conversation、Message、MemoryCandidate 或 Memory。回合端点使用服务端凭据调用模型，Prompt 只装配所选分支的祖先路径；模型成功后再次以 Session 版本锁原子写入回合和活动叶子。世界规则与边界、角色目标与边界均使用受限数组。完整边界见 `docs/GAME_SESSIONS.md`。

### 创建会话

```json
{
  "title": "事务学习",
  "mode": "professional"
}
```

`title` 可省略，默认“新对话”；`mode` 可选 `auto`、`professional`、`companion`、`reflection`、`entertainment`，默认 `auto`。成功返回 `201` 和 `Location`。

### 追加消息

```json
{
  "parentMessageId": "父消息 UUID，首条消息可为 null",
  "role": "user",
  "content": "什么是数据库事务？",
  "status": "complete",
  "model": null,
  "citations": []
}
```

`role` 支持 `system`、`developer`、`user`、`assistant`、`tool`；`status` 支持 `pending`、`streaming`、`complete`、`failed`。省略字段使用 `parentMessageId=null`、`status=complete`、`model=null`、`citations=[]`。

Repository 会锁定目标会话，确认父消息存在且属于同一会话，然后在同一事务中写入 Message、推进 `activeLeafMessageId`、更新时间并递增版本。任何一步失败都不会留下半条消息。

### 更新会话设置

```json
{
  "title": "新的会话标题",
  "mode": "professional",
  "expectedVersion": 3
}
```

`title` 和 `mode` 至少提供一个，可以单独或同时更新。设置更新与活动分支切换使用相同的乐观版本规则；成功后版本递增，但消息树与 `activeLeafMessageId` 不变。Chat 在首条用户消息持久化后更新自动标题，用户选择的模式也会在刷新页面或更换设备后恢复。模式变更只影响之后构造的模型请求，不重写历史回答。

### 切换活动分支

```json
{
  "messageId": "目标叶消息 UUID",
  "expectedVersion": 4
}
```

目标消息必须属于该会话且没有子节点。`expectedVersion` 必须等于客户端最近读取到的 Conversation `version`；不一致返回 `409 VERSION_CONFLICT`，客户端应重新读取会话后再决定是否重试。只有尚无消息的空会话可以使用 `messageId=null`；非空会话必须指向真实叶节点。

## 3. 响应格式

成功响应使用：

```json
{
  "data": {}
}
```

删除成功返回 `204`，没有响应正文。

失败响应使用稳定结构：

```json
{
  "error": {
    "code": "VERSION_CONFLICT",
    "message": "Conversation version does not match.",
    "retryable": false,
    "requestId": "request uuid",
    "details": []
  }
}
```

客户端只能根据 `code` 分支，不应解析 `message`。当前错误码：

| HTTP | Code | 说明 |
|---|---|---|
| 400 | `INVALID_JSON` | 请求正文不是合法 JSON |
| 400 | `INVALID_REQUEST` | UUID、字段、枚举或长度校验失败 |
| 404 | `CONVERSATION_NOT_FOUND` | 会话不存在 |
| 404 | `MESSAGE_NOT_FOUND` | 父消息或目标叶节点不存在 |
| 409 | `INVALID_MESSAGE_PARENT` | 消息节点属于另一会话 |
| 409 | `INVALID_ACTIVE_LEAF` | 目标节点有子节点，不是真正叶节点 |
| 409 | `VERSION_CONFLICT` | 客户端 Conversation 版本已过期 |
| 500 | `INTERNAL_ERROR` | 未预期的服务端或数据库错误；内部细节不会返回客户端 |

## 4. 当前边界

- API 返回整棵消息树，由客户端根据 `activeLeafMessageId` 计算活动路径。
- 单用户阶段暂不分页；数据量增长前必须给会话列表和消息树增加游标策略。
- API 不接受客户端指定 User ID，避免伪造其他身份。
- Chat 页面已经通过这些端点创建、读取、删除、重命名会话，追加消息和切换树分支。
- 旧浏览器导入已于 R9.2 退役，不读取、不迁移、不清空 localStorage；服务端数据保留，历史见 [归档索引](HISTORY.md)。
