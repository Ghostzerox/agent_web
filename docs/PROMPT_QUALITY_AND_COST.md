# R3.4：任务质量、成本对照与集成回归

> 2026-10-16 更新：下文保留 2026-10-15 的历史对照条件。已知问题修复与新增定点复测见 [`reports/R3_4_FOLLOWUP.md`](reports/R3_4_FOLLOWUP.md)，R4 整体验证见 [`reports/R4_REPORT.md`](reports/R4_REPORT.md)。原始快照不覆盖；当前离线命令核对 `baseline-r5.2.json`（原 R4 的 80 个请求/样例 hash 不变，新增记忆读取边界源码指纹），历史 `baseline-r4.json` 与 `baseline-r3.4-v2.json` 保留。原 ¥5 授权已结束；后续所有付费测试共用 ¥3 总预算，台账见 [`PAID_TEST_BUDGET.md`](PAID_TEST_BUDGET.md)。不要直接照抄历史付费命令重跑，需核对累计余额、当日价格和候选源码版本；定点复测不能混入原 270 次比较。

日期：2026-10-15。工程评测与真实受控对照已交付；人工语义评分、发现的问题修正和最终质量签收仍待完成。不能把格式校验通过当作专业性、自然度或事实准确性通过。

## 1. 两套不同用途的数据

| 数据集 | 用途 | 范围 |
|---|---|---|
| 离线基线 `baseline-r3.4.json` | 检查真实拼装、边界拒绝、版本与源码漂移 | 80 例：66 个正常执行路径、14 个边界；九类入口各至少 5 正常、1 边界 |
| 真实受控 `qualityWorkflows.ts` | 同输入、同资料、同模型参数比较 R3.2 与 R3.3 | 九类各 5 个案例 × 新旧两版 × 各 3 次，共 270 次尝试 |

原 R3.1/R3.2/R3.3 快照保留。R3.4 不改现有运行时提示词；旧 67 例定义/请求和 21 个运行时源码指纹不变，增加 13 例。语义边界案例也可以走正常执行路径，不应把这些数量说成真实回答正确率。

真实测试有独立、明确的合成输入和闭集资料，不使用用户私人聊天、真实任务或现实 Memory。新闻与书目是标明虚构的测试材料，可检查是否越出证据，但不能证明真实新闻搜索和真实书目核验已合格；图片与长上下文也不在这次真实对照范围。

## 2. 可复现条件

- 旧模板：`3f9e3afc92f4fa3bbd7f7ae3db2d58d9b1bc2f5a`（R3.2）。从 Git 导出六个原始模块到新建的 `web/.r3-eval/reference/`：四个 `lib/tasks` 生成器、`lib/plugins/hostCapabilityAdapters.ts`、`lib/game/gameTurnService.ts`。目录内使用原文件名，不修改源码；运行器会与指定 Git 对象逐一核对。
- 新模板：`e10487576d929f3bcc7b01ed683ed613d74cb932`（R3.3）。聊天在这两版之间没有改动，是观察随机波动的控制组，不是 R3.2 模式改动的收益对照。
- 当前运行器在付费前还核对新模板的 21 个运行时文件；若后续开发已修改这些文件，需要明确新对照版本，不能继续冒用旧提交名。
- 模型：当前服务端保存的 `deepseek-flash`，只允许已核价的官方 HTTPS Origin。响应也记录 model，但它是别名，不能据此证明底层权重快照永不变化。
- 新旧均使用非思考模式、相同的业务输出预算，最高 4096；沿用其余 Provider 默认参数，不额外启用 JSON mode，不自动重新生成或修复输出。
- 非思考模式只用于本轮对照，不改日常应用配置。官方说明默认启用思考模式及切换参数见 [思考模式文档](https://api-docs.deepseek.com/zh-cn/guides/thinking_mode/)。默认思考模式只做了独立小试跑，不能与非思考数据混算。

## 3. 费用与凭据

用户本轮批准总预算上限 ¥5。逐次按输入字节的宽松额度和最大输出预留，四并发也先占额度后调用；使用整数计账避免浮点误差。完成后按真实 usage 和已核价高峰价回收未用预留。缺失用量/无法确认的网络失败计入全额预留并停批，不把未知当免费。

核价日期为 2026-10-15；本轮按每百万输入未缓存 ¥2、已缓存 ¥0.04、输出 ¥8 的高峰价作上界估算。实际空闲时段价格更低，费用估算不是账户发票；未来复跑必须重新核价，旧日期运行器会拒绝付费执行。价格依据：[DeepSeek 官方价目](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/)。

API Key 仅由运行中的 Docker 服务解密，主机评测器只传合成请求、取回文本和用量，不导出凭据。模型用量保存在本地评测报告，不写入日常用量表，避免把测试混入用户业务统计；真实 API 费用仍会产生。没有创建真实 Task/Inbox/Memory，也没有调用收费裁判模型。

失败但已调用的请求照样计入费用；重试尝试、缓存未知和附加调用不能漏算。只有明确观测为一次有效 HTTP 响应、其他尝试均为请求前 DNS 失败时，才能按该响应 usage 估算。推理 Token 已包含在输出 Token 中，不重复计价。

## 4. 使用命令

以下在 `web` 执行。默认命令绝不付费：

```powershell
npm run eval:prompts
npm run eval:prompts:live
npm run eval:prompts:report -- --input .r3-eval/controlled-complete.jsonl
npm run eval:prompts:report -- --input .r3-eval/controlled-complete.jsonl --blind-answers
npm run eval:prompts:report -- --input .r3-eval/controlled-complete.jsonl --blind-mapping
```

付费执行须另获当次预算，准备固定旧模块并把 `scripts/prompt-quality-worker.mjs` 复制到运行容器的 `/tmp/r3-prompt-quality-worker.mjs`。完整调用示意（不是自动续用本轮剩余额度）：

```powershell
npm run eval:prompts:live -- --execute --budget-cny 5 --reference-dir .r3-eval/reference --output .r3-eval/new-run.jsonl
```

输出文件必须是 `.r3-eval` 下的新文件，使用独占创建和逐条持久化，不覆盖历史报告。终端只显示简短进度，完整回答留在本地。`.r3-eval` 被 Git 和 Docker 构建上下文忽略，不会随推送或镜像复制。

断点续跑使用 `--resume-input` 和另一个新 `--output`，预算应先减去所有前批保守计入费用。只补尚未执行的键，已有格式失败和网络失败也保留，不挑选好结果替换坏结果。思考模式或模板版本不相同的报告禁止混入。

仅当容器 DNS 不通、主机能解析官方域名且官方 HTTPS 探测成功时，可用 `--resolved-address` 传入刚解析的 IPv4；不要保存为常驻配置或硬编码旧 IP。这个测试专用路径保留 URL/Host/SNI 和正常 TLS 校验，不修改生产 Docker/Tailscale/DNS 设置。

## 5. 读报告和验收

`qualityReport.ts` 检查样例指纹、重复键、输入变化、费用与 usage 一致性；统计每模块的新旧合同通过率、Token、缓存、费用和耗时。未知保持 null，网络失败不冒充模型答案错误。中位/P95 是评测整体耗时，含 Docker 进程/配置读取开销，不等于网页首字延迟。

结构化门槛单独对新闻、书籍、反思、背书、解题、复习卡、游戏计算，不用容易通过的纯文本聊天/任务稀释失败率。整体 ≥95% 也不能掩盖单模块不足，报告会单列。

人工沿用 R3.1 七维 0–4 分；不适用标 `not-applicable` 并在理由中说明，未评保持 null。按案例汇总，至少 80% 达 3.2/4，其余不低于 3/4，候选版关键失败为 0；任何维度下降单列，解释并重新确认。盲评答案与映射分开导出，不把新旧标签/请求元数据放在答案页；填写分数只表示有评审记录，不是自动获得用户签收。

本轮结果及已知待办见 [交付报告](./reports/R3_4_REPORT.md) 和 [机器可读结果](./reports/R3_4_RESULTS.json)。先处理发现的输出契约/规则筛选和学习反馈问题，再完成语义验收；不以本轮通过部分门槛为由清除 R1/R2、移动真机、R4/R5 或发布前安全待办。
