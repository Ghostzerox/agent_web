# Prompt 调用清单与当前质量基线

本文件是唯一当前评测入口；历次设计和对照见 [历史索引](HISTORY.md)。

## 基线与边界

- 当前文件：`web/evals/r3/baseline-current.json`，版本 `r10/draw-item-design-v1`；R10.4.1审查后更新了已抽定物品生成的调用登记与源码指纹，原有80例的夹具 / 请求哈希均未改变，不新增平行基线。
- 80 个合成案例：66 正常、14 边界；九类生成入口各至少五正常、一边界；登记16模块及摘要 / 世界创作 / 道具人物设计 / 抽定物品补全四类辅助调用。
- 清单、版本、缺口：`web/evals/r3/promptInventory.ts`；真实拼装和夹具：`promptBaseline.ts`。
- 冻结 fixture、实际拼装消息、图片标志、消息数、文本字符数和当前源码指纹；新增调用位置必须登记。
- Mock 不访问数据库、凭据或外网；字符数不是账单 Token。通过只表示拼装 / 验证契约维持，不表示语义、自然度、缓存或费用收益签收。
- 辅助摘要、检索、探索等另有专项 SQL / 契约测试，不能冒称旧 80 例覆盖全部新增路径。

## 调用归属

| 入口 | 当前实现 |
|---|---|
| 专业 / 陪伴 / 学习 / 反思 / 娱乐聊天 | `lib/agent/promptBuilder.ts`、Mode / Policy / Persona 与受控检索 |
| 定时 AI、新闻、书籍、思考问题 | 各 Task Generator + `lib/ai/taskPromptProfiles.ts`；来源 / 输出约束仍由业务服务检查 |
| 背书评价、解题、复习卡 | 获授权插件操作和对应 Profile；抽背 / 拼写 / 算术工具不冒充模型 |
| 独立游戏 | `lib/game/gameNarrativeGenerator.ts` + 通用玩法；探索由 `exploration/turn.ts` 分离主持 / 人物调用，来源感知另有专项测试，不冒称原80例已覆盖 |
| 辅助分支总结 | `lib/conversation/summary.ts`；来源版本、分支范围、控制与原文降级另测 |
| 世界创作与道具 / 人物设计 | `lib/game/worlds/generation.ts` / `assetGeneration.ts`；复用游戏Provider，独立用途版本；`worldAuthoring.test.ts` / `assetDesign.test.ts`另测结构、锁定、确认、版本、库存及实际人物请求，不冒称80例覆盖全部新路径 |

抽卡的宿主随机 / 固定池 / 确认入库不生成回答；只有显式关键词物品补全使用 `lib/game/draws/generation.ts`，由 `gameDraws.test.ts` 单独验证持久认领、锁定、请求和结算边界，见 [抽卡指南](ITEM_DRAW_GUIDE.md)。

普通提醒、导航、设置、导出、记忆管理与设备 TTS 本身不生成回答。机器清单保存完整九类入口，不在文档重复复制版本表。

## 离线命令（web 目录）

```powershell
npm run eval:prompts
npm test -- promptBaseline.test.ts
npm run eval:prompts -- --candidate
npm run eval:prompts -- --review-sheet
```

默认只比对当前基线；漂移或失败返回非零退出码。候选 / 评审表只输出 JSON，不自动覆盖文件。修改后先审查源码、请求、夹具差异，再明确更新基线，不能为通过测试盲目刷新。历史差异用 Git 按需读取，不加入每轮回归。

## 真实质量与成本

[原始比较](reports/R3_4_REPORT.md)、[修复复测](reports/R3_4_FOLLOWUP.md)、[R4交付](reports/R4_REPORT.md) 保留原条件。七维人工签收、长期语义和 R1 净收益仍有未完成项。七维为任务完成度、可操作性、事实 / 引用、模式适配、工具诚实性、自然度、连续性；未评价保持 null，不把格式检查当人工评分。

`eval:prompts:live` 是显式付费的历史实验，不属于日常测试。运行前核对价格、源码、累计预算和 [费用账本](PAID_TEST_BUDGET.md)，不得直接照抄历史付费命令。R9.4 不调用真实模型 / Embedding / 外网搜索。
