# GameSession 与角色扮演回合

状态：Phase 6.1–6.5 已完成

R7.1–R7.7 已于2026-10-18交付 [叙事探索首区](R7_EXPLORATION_GUIDE.md)，包括地图、装备、独立字典、NPC / 重要角色、承诺、事件 / 史诗 / 来源历史与局部 UI。在后端回合 JSONB 的可选 `exploration.v1` 中保存，无新增迁移，旧 d20 / JSON export v3 不变。以下保留 Phase 6 规则说明，新动作 / 公共投影 / 上下文与限制以新指南为准；不自动改变旧规则或重写旧存档。

GameSession 是娱乐模式的独立事实源。它保存世界设定、内容边界、角色卡和剧情回合树，但不保存普通聊天消息，也不会创建 MemoryCandidate 或正式 Memory。

## 1. 数据边界

```text
users
  └── game_sessions
        ├── game_characters
        ├── game_turns ── parent_turn_id → game_turns.id
        │     └── game_events（不可变 dice_roll / rule_check）
        └── game_checkpoints ── turn_id → game_turns.id

users
  ├── conversations ── messages
  └── memory_items
```

`game_sessions`、`game_characters` 与 `game_turns` 只通过本地用户和彼此关联，不含 Conversation、Message、MemoryCandidate 或 Memory 外键。删除游戏会话会级联删除角色卡和剧情回合，不影响普通对话和长期记忆。

普通聊天仍可选择 `entertainment` 交互模式，但服务端 MemoryCandidate 流程会忽略该模式下的消息；即使文字看起来像“请记住”，也不会成为长期记忆候选。

GameSession 保存：

- 会话名称、玩法类型和准备/运行状态。
- 世界名称、前提、叙事语调与显式规则。
- 整个游戏会话的内容边界。
- 乐观锁版本与创建/更新时间。
- 当前剧情叶子 `active_leaf_turn_id`。

角色卡保存名称、身份、控制者、简介、性格、目标、角色专属边界、数值属性和生命上限。控制者仅是叙事语义，不授予模型、插件或工具权限。每条剧情分支的运行时角色状态另存于回合快照，包括当前生命、属性和状态效果；因此旧分支不会被后来修改的角色卡反向改写。

一个 `game_turn` 原子保存一次玩家输入和对应的 AI 叙事、模型名称、父回合、受校验状态补丁、应用后状态快照与创建时间。父指针构成树；从历史回合继续时创建新子节点，不改写既有后续内容。新分支以父节点状态快照为基线，不能继承其他分支的状态。模型 Prompt 只包含所选父回合的祖先路径，并用字符预算优先保留最近剧情，不能读取同级或其他分支剧情。

`game_events` 保存不可变可信事件。`dice_roll` 记录用途、骰子表达式、seed、算法版本、逐骰点数与总和；`rule_check` 还绑定分支中的角色、属性修正、难度、差值和成功/失败结果。属性值与结果均由服务端读取和计算，模型只能引用结果，不能伪造或修改。

状态由场景文本、场景事实、出口、目标、标记、资源、物品数量、结构化物品定义与运行时角色组成。物品可记录名称、说明、持有角色和标签；模型不能给不存在的角色分配物品，也不能只增加数量而省略新物品定义。模型每回合严格返回 `narrative + statePatch`，服务端拒绝未知字段、非法状态键、越界生命/数值、负资源/物品结果和伪造工具调用。补丁验证与应用发生在持久化前；回合、快照、可信事件和活动叶子随后在单个数据库事务中写入。

检查点保存名称、备注、目标回合和当时的状态快照。恢复检查点只把 `active_leaf_turn_id` 切回目标回合，既有后续回合不会删除，而是保留为可再次访问的历史分支。Phase 6.3 的旧快照在 Repository 读取边界补齐新字段，不重写不可变历史数据。

## 2. API

| 方法 | 路径 | 作用 |
|---|---|---|
| `GET` / `POST` | `/api/v1/game-sessions` | 列表或创建 GameSession，可同时建立首张角色卡 |
| `GET` / `PATCH` / `DELETE` | `/api/v1/game-sessions/:id` | 读取、更新或删除世界设定 |
| `POST` | `/api/v1/game-sessions/:id/characters` | 添加角色卡 |
| `PATCH` / `DELETE` | `/api/v1/game-sessions/:id/characters/:characterId` | 更新或删除角色卡 |
| `PATCH` | `/api/v1/game-sessions/:id/status` | 开始、暂停或继续游戏 |
| `POST` | `/api/v1/game-sessions/:id/turns` | 从指定父回合生成并保存下一回合 |
| `POST` | `/api/v1/game-sessions/:id/checkpoints` | 为当前活动叶子创建命名检查点 |
| `POST` | `/api/v1/game-sessions/:id/checkpoints/:checkpointId/restore` | 恢复检查点对应的续写位置 |
| `DELETE` | `/api/v1/game-sessions/:id/checkpoints/:checkpointId` | 删除检查点，不删除剧情回合 |
| `POST` | `/api/v1/game-sessions/:id/export` | 导出包含全部分支的 JSON 或 Markdown |

创建、更新和删除均使用严格 Schema。世界规则、内容边界、角色目标和角色边界会去重并限制数量。Session 和 Character 分别使用版本锁；状态、角色和回合变更都会推进 Session 版本，使多个设备不会静默覆盖当前剧情线。暂停状态拒绝新增回合；继续后才可生成。

## 3. 客户端

Web 和 Capacitor APK 共用 `/entertainment` React 页面与 API Client。当前页面支持：

- 创建角色扮演、AI 跑团或互动故事设定。
- 编辑世界前提、语调、规则和内容边界。
- 添加、编辑和删除用户、AI 或共同控制的角色卡。
- 为角色配置数值属性和生命上限，并查看各分支中的生命、属性和状态效果。
- 开始、暂停和继续角色扮演。
- 以树形缩进展示全部剧情节点，标记当前剧情线和当前叶子。
- 从任意历史回合或故事开头创建新分支。
- 使用与 Chat 相同的安全 Markdown、代码和数学公式渲染。
- Web 下载、APK Filesystem + Share 导出完整 JSON/Markdown 记录。
- 可选 2/4/6/8/10/12/20/100 面服务端可信骰子，并查看 seed 与算法版本。
- 按分支角色属性发起服务端规则检定，查看难度、修正、差值与成功等级。
- 查看所选分支的场景事实、出口、目标、标记、资源和结构化物品；分支切换时状态随节点切换。
- 创建、恢复和删除命名检查点；恢复后从旧节点继续会自然形成新分支。
- JSON 导出 schema v3 与 Markdown 均包含检查点、结构化状态和可信事件。
- 娱乐 Activity / 规则包：从插件注册表进入轻量冒险，配置两个世界模板和主角，预览后显式创建 GameSession；支持 Web/APK 共用 UI 和跨端配置保存。

## 4. 当前不包含

Phase 6.5 已用轻量冒险验证规则包扩展点，但当前仍是最小内核，不是完整 D&D/COC 等桌游系统。检定由用户显式选择角色、属性与难度；模型不能自主调用规则工具。当前模型响应在服务端完成并通过严格 JSON 校验后原子写入，不提供逐 Token 的中间显示。

规则包的 Prompt、工具/状态兼容声明、配置隔离和用户确认边界见 `GAME_RULE_PACKS.md`。下一阶段排序以产品主线和 R6–R8 专项规划为准；真机回归暂缓并入统一待办，Phase 5.6 仍为发布前统一安全封版。
