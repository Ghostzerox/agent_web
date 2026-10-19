# 当前技术地图

本文件只说明当前实现与代码归属；产品目标、交付状态和后续顺序统一在 [产品主线](PRODUCT_MAINLINE_GUIDE.md)。原 2,000 余行产品 / 技术总规划属于历史设计，保留于 [R9.4前冻结版本](https://github.com/Ghostzerox/agent_web/blob/ebaeecbf67dfc03e34065d25e68d51f005177095/docs/PRODUCT_TECHNICAL_ROADMAP.md)，不再逐阶段追加“当前状态”。

## 系统关系

```text
浏览器 Next.js UI ───────────┐
本地 React / Capacitor ──────┼─ /api/v1 → 业务服务 / Repository → PostgreSQL
                            │               └─ 受控模型 / 搜索
                            └─ 平台 Adapter → 本地通知 / 导出 / TTS
独立 Worker → 调度 / 生成 → 持久 Inbox → 可失败的 Push
```

默认 Compose 包含 Web/API、Worker、PostgreSQL、SearXNG。Tailscale 提供可信私网入口；手机本地 Bundle 不是数据库副本。服务器未来可换云主机，客户端 API Origin 和持久卷迁移按运维指南处理，不重写领域逻辑。

## 责任边界

| 层 | 代码归属 | 约束 |
|---|---|---|
| 路由 / UI | `web/app`、`web/components` | Next 与本地 React 共享组件；七模块目录→功能子页，次要面板折叠 |
| 跨端 API | `web/lib/api/*Client.ts`、`jsonRequest.ts` | 一份 JSON 传输；DTO 不由 SQL 私有类型反推，SSE 单独处理 |
| 模型与 Prompt | `web/lib/agent`、`web/lib/ai` | 固定规则 / 模式 / 人格 / 检索分层；受控工具与引用不证明事实正确 |
| 业务服务 | `tasks`、`proactivity`、`memorization`、`problemSolving` 等 | 模型输出不是持久事实，验证后由服务提交；系统执行不等于用户完成 |
| 游戏 | `web/lib/game`、`gameRulePacks` | 通用引擎与探索模板分离；[人物隔离](R10_ACTOR_ISOLATION_GUIDE.md)按来源过滤；[世界创作](WORLD_CREATION_GUIDE.md)与[道具 / 人物设计](ITEM_CHARACTER_DESIGN_GUIDE.md)持久草稿与发布修订，经存档绑定解析，共用祖先链 / 原子状态 / 引擎；[抽卡](ITEM_DRAW_GUIDE.md)持久认领 / 宿主随机 / 确认入库，生成定义只进分支目录 |
| 记忆 / 资料 | `web/lib/memory`、`knowledge`、`conversation` | 用户 / 模块 / 来源 / 分支 / 版本受限；宫殿保存引用，不复制所有原文 |
| 数据 | `web/lib/db`、`repositories`、`web/drizzle` | PostgreSQL 为事实来源；正式 SQL 与校验历史唯一，ORM Schema 配套维护 |
| 平台 | `web/lib/platform`、`web/mobile`、`web/android` | 共享 React 业务 + 薄原生能力；Huawei Push / ArkWeb 尚未全面实现 |
| 插件 | `web/lib/plugins` | 仅第一方 Activity 与受控 Gateway；隔离存储、授权和配额，不开放任意代码 |

API 服务与 Worker 使用相同业务实现。Web / Worker 可共享镜像层；不把两个镜像标签的 Size 相加当真实磁盘占用。依赖分类、运行脚本与构建路径见 [开发手册](DEVELOPMENT.md)。

## 数据与持久化

- 会话 / 消息是真实树形关系，客户端只选择活动路径；更早节点重生成会产生新分支。
- 任务与 TaskRun 独立；常驻 Worker 负责租约、幂等、恢复、结果入箱和 Push 尝试。
- 行动 / 打卡 / 目标保存用户行为事实；提醒关联只是辅助，不自动完成行动。
- Vault 加密 API Key；Provider / Base URL / Model 不加密。完整 Key 不从读取接口返回。
- 记忆、资料、摘要和探索状态有来源、范围与版本边界。用户可查看 / 关闭 / 删除相应数据。
- 当前37对迁移 / 回滚 SQL：R10.3增加世界草稿、发布修订和存档绑定，R10.4增加独立设计稿与可编辑世界草稿的一次性结构升级；R10.4.1追加0036抽卡回执表及会话所有权索引；前36份不改写，Docker命名卷不因构建替换。新迁移、备份与恢复见 [数据库手册](DATABASE_OPERATIONS.md)。

## 规范与待完成边界

[ADR目录](adr/) 记录设计理由，较新的决策与当前源码优先于旧阶段提案。开发 / 测试入口见 [开发手册](DEVELOPMENT.md)，模块指南见 [文档目录](README.md)。

仍保留：R1 真实净收益 / 人工质量、视觉体验、统一真机验收、移动签名发布、Huawei / ArkWeb 能力和发布前安全封版。Embedding / 自动 RAG、多区域大世界、公开插件市场等不因留有接口就视为实现，不自动扩大当前范围。
