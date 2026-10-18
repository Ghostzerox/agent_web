# 历史证据索引

当前产品排序以 [产品主线](PRODUCT_MAINLINE_GUIDE.md) 为准；当前操作从 [文档目录](README.md) 进入。历史材料不是现用命令或支持承诺。

## R9.4 前的冻结点

归档版本：`ebaeecbf67dfc03e34065d25e68d51f005177095`（R9.3 完成）。所有下列已退役文件均可从这个 Git 提交恢复，不删除 Git 历史。

```powershell
# 在仓库根目录读取历史文件，不覆盖工作区
git show ebaeecbf67dfc03e34065d25e68d51f005177095:web/evals/r3/baseline-r3.2.json
```

| 历史范围 | 保存位置 / 说明 |
|---|---|
| Prompt R3.1–R7 模板分离的 15 份快照 | 冻结提交的 `web/evals/r3/baseline*.json`；当前只核对 `baseline-current.json`，内容继承原 `baseline-r7-templates.json` |
| 历次源码指纹 / 请求变化断言 | 同提交的 `web/tests/promptBaseline.test.ts`；只撤下阶段对照，80 个现用夹具和当前请求 / 源码冻结继续运行 |
| 原始付费比较 / 定点复测 | [质量对照报告](reports/R3_4_REPORT.md)、[复测](reports/R3_4_FOLLOWUP.md)、[原始统计](reports/R3_4_RESULTS.json)、[复测统计](reports/R3_4_FOLLOWUP_RESULTS.json) 均保留；不改写旧结论 |
| 共享 ¥3 测试预算 | [账本](PAID_TEST_BUDGET.md) 单独维护，不因归档重新计费或重置 |

当前离线通过不表示真实模型质量通过，也不表示 Token / 缓存 / 费用收益已签收。不要直接重跑历史付费命令。

## 已从工作区归档的阶段文档

下列为交付时的历史内容，按文件名检索；当前使用请走文档目录。链接固定到上述提交，不随主分支变化。

- [LEGACY_DATA_IMPORT.md](https://github.com/Ghostzerox/agent_web/blob/ebaeecbf67dfc03e34065d25e68d51f005177095/docs/LEGACY_DATA_IMPORT.md)
- [MODE_PROMPT_GUIDE.md](https://github.com/Ghostzerox/agent_web/blob/ebaeecbf67dfc03e34065d25e68d51f005177095/docs/MODE_PROMPT_GUIDE.md)
- [TASK_PROMPT_GUIDE.md](https://github.com/Ghostzerox/agent_web/blob/ebaeecbf67dfc03e34065d25e68d51f005177095/docs/TASK_PROMPT_GUIDE.md)
- [PROMPT_QUALITY_AND_COST.md](https://github.com/Ghostzerox/agent_web/blob/ebaeecbf67dfc03e34065d25e68d51f005177095/docs/PROMPT_QUALITY_AND_COST.md)
- [FEATURE_AND_MOBILE_EXPANSION_PLAN.md](https://github.com/Ghostzerox/agent_web/blob/ebaeecbf67dfc03e34065d25e68d51f005177095/docs/FEATURE_AND_MOBILE_EXPANSION_PLAN.md)
- [EXPERIENCE_AND_COST_OPTIMIZATION_PLAN.md](https://github.com/Ghostzerox/agent_web/blob/ebaeecbf67dfc03e34065d25e68d51f005177095/docs/EXPERIENCE_AND_COST_OPTIMIZATION_PLAN.md)
- [CAPABILITY_ENHANCEMENT_PLAN.md](https://github.com/Ghostzerox/agent_web/blob/ebaeecbf67dfc03e34065d25e68d51f005177095/docs/CAPABILITY_ENHANCEMENT_PLAN.md)
- [TASK_WORLD_AND_MODULE_UI_PLAN.md](https://github.com/Ghostzerox/agent_web/blob/ebaeecbf67dfc03e34065d25e68d51f005177095/docs/TASK_WORLD_AND_MODULE_UI_PLAN.md)
- [R8_1_MODULE_ENTRY_DESIGN.md](https://github.com/Ghostzerox/agent_web/blob/ebaeecbf67dfc03e34065d25e68d51f005177095/docs/R8_1_MODULE_ENTRY_DESIGN.md)
- [REFERENCE_PROJECT_STUDY.md](https://github.com/Ghostzerox/agent_web/blob/ebaeecbf67dfc03e34065d25e68d51f005177095/docs/REFERENCE_PROJECT_STUDY.md)
- [PHASE_1_COMPLETION_REPORT.md](https://github.com/Ghostzerox/agent_web/blob/ebaeecbf67dfc03e34065d25e68d51f005177095/docs/PHASE_1_COMPLETION_REPORT.md)
- [reports/PHASE_6_5_REPORT.md](https://github.com/Ghostzerox/agent_web/blob/ebaeecbf67dfc03e34065d25e68d51f005177095/docs/reports/PHASE_6_5_REPORT.md)
- [reports/R1_FIRST_ROUND_REPORT.md](https://github.com/Ghostzerox/agent_web/blob/ebaeecbf67dfc03e34065d25e68d51f005177095/docs/reports/R1_FIRST_ROUND_REPORT.md)
- [reports/R2_UI_REPORT.md](https://github.com/Ghostzerox/agent_web/blob/ebaeecbf67dfc03e34065d25e68d51f005177095/docs/reports/R2_UI_REPORT.md)
- [reports/R3_1_REPORT.md](https://github.com/Ghostzerox/agent_web/blob/ebaeecbf67dfc03e34065d25e68d51f005177095/docs/reports/R3_1_REPORT.md)
- [reports/R3_2_REPORT.md](https://github.com/Ghostzerox/agent_web/blob/ebaeecbf67dfc03e34065d25e68d51f005177095/docs/reports/R3_2_REPORT.md)
- [reports/R3_3_REPORT.md](https://github.com/Ghostzerox/agent_web/blob/ebaeecbf67dfc03e34065d25e68d51f005177095/docs/reports/R3_3_REPORT.md)
- [reports/R5_1_REPORT.md](https://github.com/Ghostzerox/agent_web/blob/ebaeecbf67dfc03e34065d25e68d51f005177095/docs/reports/R5_1_REPORT.md)
- [reports/R5_2_REPORT.md](https://github.com/Ghostzerox/agent_web/blob/ebaeecbf67dfc03e34065d25e68d51f005177095/docs/reports/R5_2_REPORT.md)
- [reports/R5_4_REPORT.md](https://github.com/Ghostzerox/agent_web/blob/ebaeecbf67dfc03e34065d25e68d51f005177095/docs/reports/R5_4_REPORT.md)
- [reports/R5_5_REPORT.md](https://github.com/Ghostzerox/agent_web/blob/ebaeecbf67dfc03e34065d25e68d51f005177095/docs/reports/R5_5_REPORT.md)
- [reports/R5_6_REPORT.md](https://github.com/Ghostzerox/agent_web/blob/ebaeecbf67dfc03e34065d25e68d51f005177095/docs/reports/R5_6_REPORT.md)
- [reports/R6_REPORT.md](https://github.com/Ghostzerox/agent_web/blob/ebaeecbf67dfc03e34065d25e68d51f005177095/docs/reports/R6_REPORT.md)
- [reports/R7_REPORT.md](https://github.com/Ghostzerox/agent_web/blob/ebaeecbf67dfc03e34065d25e68d51f005177095/docs/reports/R7_REPORT.md)
- [reports/R7_TEMPLATE_SEPARATION_REPORT.md](https://github.com/Ghostzerox/agent_web/blob/ebaeecbf67dfc03e34065d25e68d51f005177095/docs/reports/R7_TEMPLATE_SEPARATION_REPORT.md)
- [reports/R8_1_REPORT.md](https://github.com/Ghostzerox/agent_web/blob/ebaeecbf67dfc03e34065d25e68d51f005177095/docs/reports/R8_1_REPORT.md)
- [reports/R8_REPORT.md](https://github.com/Ghostzerox/agent_web/blob/ebaeecbf67dfc03e34065d25e68d51f005177095/docs/reports/R8_REPORT.md)
- [reports/SPRINT_2_4_REPORT.md](https://github.com/Ghostzerox/agent_web/blob/ebaeecbf67dfc03e34065d25e68d51f005177095/docs/reports/SPRINT_2_4_REPORT.md)
- [reports/SPRINT_2_5_REPORT.md](https://github.com/Ghostzerox/agent_web/blob/ebaeecbf67dfc03e34065d25e68d51f005177095/docs/reports/SPRINT_2_5_REPORT.md)

旧 Drizzle 生成元数据（`web/drizzle/meta/`，最后 0017）、`drizzle.config.ts` 及 `scheduler-claim.ts` 也可从同一提交读取。34 对正式 SQL 原样保留，应用读取的是 SQL 与数据库内 `app_internal.schema_migrations`，不是这些生成快照。
