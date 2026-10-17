# 娱乐 Activity 与规则包

状态：Phase 6.5 已完成；第一方规则包使用已冻结的 Plugin API `1.0.0`。

后续 R7 大世界探索已于2026-10-17加入 [专项规划](TASK_WORLD_AND_MODULE_UI_PLAN.md)，地图、装备 / 位阶、重要角色与事件 / 历史尚待开发。它将演进严格状态与规则包兼容声明，不能只改 Prompt 就让当前模板支持新系统；旧 d20 规则保留，真机检查继续暂缓合并。

## 1. 用户可用的功能

首个插件 `entertainment.quick-adventure` 提供 `/entertainment/quick-adventure`，Web 与本地 Capacitor APK 共用同一 React Activity。

使用顺序：

1. 在 `/plugins` 启用“轻量冒险规则包”，授权“插件隔离存储”。它不申请模型生成或任务创建能力。
2. 从插件页或娱乐模式的“打开轻量冒险”进入配置页。
3. 选择“雾港来信”或“星灯遗迹”，填写主角名称、专长、氛围和内容边界。
4. “保存配置并预览”将配置保存到插件隔离存储，展示世界、角色卡、完整规则与边界；此时没有创建 GameSession。
5. “确认创建游戏会话”由宿主确认组件调用现有 GameSession API；点击“进入游戏”打开刚创建的会话，再开始故事。

规则使用 1d20 + 属性，常规/困难/极难建议难度为 10/15/20，自然 20 大成功、自然 1 大失败。角色有体魄、灵巧、意志三个属性，专长 +3、其余 +1，初始生命上限 10。设定预览是确定性的，不调用模型、不消耗模型 Token；正式故事仍使用服务端配置的模型。

修改任何配置会撤下旧预览，必须重新预览后确认。多设备保存使用版本锁；冲突时提示重新加载，不静默覆盖。禁用规则包阻止后续读取/保存配置，但不删除已经创建的游戏；已保存的世界规则和角色卡仍可供核心流程继续使用。

## 2. 数据与执行边界

```text
First-party Manifest + Activity Registry
  → GameRulePackRegistry（归属、版本、宿主契约校验）
  → 专属 React 配置页
  → /api/v1/game-rule-packs/:id
  → RulePack Service → Capability Gateway → storage.read-write
  → 严格 GameSessionDraft（来源 + 现有创建请求）
  → 用户确认 → 宿主 GameSessionDraftConfirmation
  → 现有 /api/v1/game-sessions
  → 原有剧情树 / 检定 / 状态 / 检查点 / 导出
```

配置保存于现有 `plugin_storage_entries` 的 JSONB 值，按 `userId + pluginId + key` 隔离；key 为 `rule-pack/setup/<rulePackId>`。值包含 `schemaVersion`、规则包 ID/版本与配置；存储行已有版本锁。无需新增表或迁移，也无需扩充 v1 的三个能力。

草稿不持久化为游戏，不取得数据库连接或 Repository。服务端先验证配置及完整草稿，再保存插件配置。正式 GameSession 仍只在用户点击确认后建立；它使用原有独立数据边界，不与普通对话或长期记忆关联。

来源信息包含插件、Activity、规则包 ID/版本；创建时只有 `draft.session` 进入核心 API。规则包 ID/版本同时以可读规则行保存进 `worldRules`，因此随现有 JSON/Markdown 导出保留。当前没有专用 `game_sessions.rule_pack_id` 列或按规则包检索功能；将来需要可靠的结构化检索/升级时再加入可空来源字段，不用解析规则文字充当关联键。

## 3. 代码位置与契约

| 代码 | 责任 |
|---|---|
| `web/lib/plugins/firstPartyManifests.ts` | 第一方插件版本、Activity 和能力声明 |
| `web/lib/plugins/activityRegistry.ts` | Web/Android 路由与归属，支持 `/study/*` 与 `/entertainment/*` |
| `web/lib/gameRulePacks/contracts.ts` | 严格描述符、草稿、配置 API 信封 |
| `web/lib/gameRulePacks/registry.ts` | 注册定义、归属校验与统一草稿构建 |
| `web/lib/gameRulePacks/quickAdventure.ts` | 轻量冒险的输入 Schema、模板、Prompt Layer 和角色构建 |
| `web/lib/gameRulePacks/service.ts` | 仅通过 Gateway 读写配置并输出草稿 |
| `web/lib/api/gameRulePackApi.ts` / `gameRulePackClient.ts` | API 错误、严格请求与跨端客户端 |
| `web/components/gameRulePacks/QuickAdventureActivity.tsx` | 规则包专属配置与预览 UI |
| `web/components/game/GameSessionDraftConfirmation.tsx` | 宿主所有的显式游戏创建 |
| `web/mobile/MobileApp.tsx` | 本地 APK 路由登记 |

描述符声明 `id/pluginId/activityId/version/name/description/promptLayer/hostContracts`。Registry 要求插件 Manifest 存在、版本一致、Activity 归属正确且声明隔离存储；重复规则包 ID 或未知宿主契约会失败。包版本当前与所属插件版本同步发布。

规则包引用宿主已有的工具/状态契约，而非提交可执行工具代码：

| 描述符引用 | 代码事实源 | 使用方式 |
|---|---|---|
| `dice.roll.v1` | `gameDiceRequestSchema` / `gameDiceRollSchema` | 用户发起，服务端产生可信骰子事件 |
| `rule-check.v1` | `gameRuleCheckRequestSchema` / `gameRuleCheckSchema` | 用户指定角色属性与难度，服务端读分支属性并计算 |
| `game-state.v2` | `gameStateSchema` / `gameStatePatchSchema` | Phase 6.4 的结构化场景、角色、物品状态形状 |

`game-state.v2` 是规则包对宿主状态形状的兼容声明，不是 JSON 导出版本（现有导出仍为 v3）。`stateFields` 声明包使用的宿主字段，不能给宿主新增任意字段。声明工具仅说明兼容性，不自动授权工具或允许模型执行它们；规则提示只会建议检定，玩家仍在宿主 UI 显式选择。世界规则进入原有 Prompt 装配，受宿主通用规则与内容边界约束。

配置 API：

| 方法 | 路径 | 结果 |
|---|---|---|
| `GET` | `/api/v1/game-rule-packs/:id` | `{ setup: null或配置, storageVersion }` |
| `POST` | 同上 | 输入 `{ setup, expectedVersion }`，返回 `{ draft, storageVersion }` |

403 表示插件未启用、未授权或需要版本复核；409 表示版本冲突/保存的配置不兼容；429 表示每日存储配额用尽。API 不接受客户端自选插件 ID、用户 ID 或直接创建标记。已保存配置若无法通过当前输入 Schema，会返回冲突并保留原值；它不会被默认配置自动覆盖。

## 4. 新增规则包的方式

1. 添加纯规则包模块：严格输入 Schema、描述符和 `buildSession(setup)`。输出必须能通过原有 `createGameSessionSchema`。
2. 在第一方 Manifest 和 Activity Registry 登记版本、能力、路由；在 RulePack Registry 加入定义。
3. 添加专属配置/预览页，复用 RulePack API Client 和宿主确认组件；在 MobileApp 登记同一路由。
4. 用测试验证草稿、归属、未知输入、版本锁、用户确认和现有游戏流程兼容。

这四步不需要在 Agent Loop、GameTurnService、GameSession Repository 或状态机里添加规则包 ID 判断。测试另注册了一个不同世界的规则包，通过相同 Registry 生成合法草稿；集成测试使用真实迁移、Gateway、PostgreSQL 兼容数据库、GameSession API 与原有回合流程验证首个包。

当前扩展范围是既有骰子、检定、状态形状之内的玩法。不同判定算法、自动工具选择、额外状态 Schema、完整 D&D/COC、多人实时同步和第三方动态包仍需后续设计；不能只在 Prompt 里写新算法便宣称已实现。

## 5. 验收与后续

自动验证覆盖：规则模板/草稿校验、冻结 v1 兼容、配置隔离与冲突、预览不创建游戏、显式创建后接入原有模型 Prompt/检定/状态、禁用插件后游戏继续、移动视口和 APK 路由/构建。

真机需要覆盖安装最新 Debug APK 后，验证插件启用授权、配置跨 Web/APK 保存、两种模板预览、创建后进入正确会话，以及一次故事检定。华为通知可靠性继续沿用 Mobile M1.3 保留清单，不能用桌面浏览器测试代替真机结论。

Phase 6.1–6.5 完成后按产品主线指导评估移动发布、语音完善和作品集交付，Phase 5.6 保留为发布前统一安全封版；没有在本阶段引入第三方插件市场。
