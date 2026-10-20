# R10.6 有界合成质量探针

这不是第二份 Prompt 冻结基线；唯一冻结文件仍为 `../r3/baseline-current.json`。这里复用生产草稿服务、模型请求组装、校验器、库存和事件引擎，在一次性 PGlite 世界中执行8步旅程。全部资料为合成，真实业务库不写入。

在 `web` 目录执行 `npx tsx scripts/r10-quality-live.ts` 只做离线演练，不读取真实凭据、不调用网络。`npm test -- r10CreationQuality.test.ts r10CreationJourney.test.ts` 另外覆盖请求边界及冷重启 / 分支恢复。

真实模式不属于日常检查。先核对 `docs/PAID_TEST_BUDGET.md` 的**跨阶段剩余额度**、当日官方价格和配置；临时复用 `scripts/prompt-quality-worker.mjs` 放到现有 Docker 容器 `/tmp/r3-prompt-quality-worker.mjs`。`--execute --budget-cny <本批上限> --pricing-reviewed-on <上海当日日期>` 才开启真实调用，脚本单批最多¥0.50。不要照搬历史额度；先在共享账本预留并在结束后结算，失败费用也保留。密钥只在容器中解析。

`--resolved-address` 仅供确认官方DNS异常后的显式IPv4旁路，Host / SNI / TLS验证不变，不改应用默认网络配置。桥接采用非思考模式、输出3072 tokens，仅为受控探针；不是生产默认设置或账单预测。无批次自动重试，底层 Provider 原有DNS重试次数另记 `telemetry.attempts`。历史artifact的 `automaticRetries:false` 指无批次重跑，不代表没有底层尝试。

每次真实运行独占创建JSONL，保留请求哈希、合成完整请求 / 输出、用量、费用与最后状态，不覆盖失败记录。`review.by:null` / `assessment:null` 表示没有用户人工评分；开发代理对单例的定性复盘见阶段报告，不能据此声称整体自然程度或长期一致性通过。

2026-10-20 四个原始批次：

| artifact | 调用 / 结果 | 费用上界CNY |
|---|---|---|
| `quality-live-1792486013308.jsonl` | 1逻辑请求，网络失败、用量未知，停止并保留预留 | 0.057988000 |
| `quality-live-1792486285092.jsonl` | 4次有用量，事件漏嵌套字段被拒绝 | 0.023682240 |
| `quality-live-1792486494949.jsonl` | 7次有用量，事件修复通过，道具包装 / 必填漏写被拒绝 | 0.029975762 |
| `quality-live-1792486939679.jsonl` | 8次有用量，完整旅程通过 | 0.039439361 |

合计¥0.151085363（含未知费用保留），不是账户实际账单。最后一批输入13624 / 命中3584 / 输出2402 tokens，仅一次合成旅程；重复前缀带来的缓存不能外推为真实用户收益。阶段报告：`docs/reports/R10_6_REPORT.md`。
