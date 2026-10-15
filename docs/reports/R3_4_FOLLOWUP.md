# R3.4 修复与复测

本轮补齐五项已知问题：书单明确两本即合约、禁止脚注式编号；官方 DeepSeek 的结构化业务启用 JSON Output（其他兼容服务维持原契约），解题数学优先美元符号；反思不复述禁区且负面边界不作为相关性目标；语义复述模型评分不再与字面覆盖分混合；游戏无需角色卡也可开场。

保留原 R3.4 v1 基线和 270 次比较，新增 v2 快照，不重写历史成功率。首轮 42 个离线用例通过。真实复测按 `PAID_TEST_BUDGET.md` 新增合计 ¥3 额度，只使用合成题；定点复测不冒充完整 270 次比较。七维主观盲评仍需用户验收，不用结构通过率代替自然度。

依据：[DeepSeek JSON Output](https://api-docs.deepseek.com/zh-cn/guides/json_mode/)、[2026-10-16 核对价格](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/)。JSON 模式仍需本地 Zod 校验，不承诺事实正确，不添加自动付费修复。
