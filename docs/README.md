# 项目文档目录

当前排序只有一个事实来源：[产品主线](PRODUCT_MAINLINE_GUIDE.md)。阶段报告只记录交付时的事实，不作为当前操作指南。

| 目的 | 入口 |
|---|---|
| 开发、测试、构建 | [开发手册](DEVELOPMENT.md) |
| 当前架构与技术边界 | [技术地图](PRODUCT_TECHNICAL_ROADMAP.md) |
| R9精简封版与支持范围 | [封版报告](reports/R9_5_REPORT.md)、[R9规划](PROJECT_SIMPLIFICATION_PLAN.md)、[原始盘点](R9_1_SIMPLIFICATION_AUDIT.md) |
| 启动 / 升级 / Tailscale / 备份恢复 | [自托管](SELF_HOSTING.md)、[数据库](DATABASE_OPERATIONS.md) |
| API与模型配置 | [会话API](SERVER_DATA_API.md)、[Provider](SERVER_MODEL_PROVIDER.md) |
| 任务 / 打卡 / 通知 | [定时任务](TASKS.md)、[行动闭环](TASK_ACTIONS_GUIDE.md)、[Push](WEB_PUSH.md) |
| 模式与模块入口 | [导航规范](UI_NAVIGATION_GUIDE.md)、[模块层级](R8_MODULE_UI_GUIDE.md) |
| 工具与学习插件 | [工具](TOOLS_GUIDE.md)、[插件系统](PLUGIN_SYSTEM.md)、[插件API](PLUGIN_API_V1.md) |
| 娱乐 / 探索 / 规则包 | [游戏会话](GAME_SESSIONS.md)、[探索](R7_EXPLORATION_GUIDE.md)、[规则包](GAME_RULE_PACKS.md) |
| 娱乐创作后续与语义基线 | [R10规划](ENTERTAINMENT_CREATION_AND_CHARACTER_PLAN.md)、[R10.1语义 / 审计 / 验收样例](R10_SEMANTIC_BOUNDARY_BASELINE.md)；功能实现从R10.2开始 |
| 记忆 / 资料 / 摘要 | [记忆域](MEMORY_DOMAIN_AND_SOURCE_GUIDE.md)、[知识库](KNOWLEDGE_LIBRARY_GUIDE.md)、[检索](KNOWLEDGE_RETRIEVAL_GUIDE.md)、[分支摘要](BRANCH_SUMMARY_GUIDE.md)、[宫殿](MEMORY_PALACE_GUIDE.md)、[用户控制](MEMORY_CONTROL_AND_ACCEPTANCE_GUIDE.md) |
| Prompt、Token与费用 | [当前Prompt基线](PROMPT_INVENTORY_AND_BASELINE.md)、[Token](TOKEN_COST_GUIDE.md)、[付费账本](PAID_TEST_BUDGET.md) |
| 移动构建与暂缓真机测试 | [Android](MOBILE_ANDROID.md)、[统一验收待办](DEVICE_ACCEPTANCE_BACKLOG.md) |
| 设计理由、历史与限制 | [ADR目录](adr/)、[历史证据](HISTORY.md)、[变更记录](CHANGELOG.md) |

只在所属指南维护操作规则；当前进度与后续排序不再复制到每个旧规划里。代码接口以实现和测试为准，历史付费结果不自动代表当前模型质量。
