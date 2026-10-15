# R5.1 交付报告：分域策略、来源/版本与迁移设计

- 日期：2026-10-16。
- 范围：仅 R5.1；R5.2–R5.6 未提前标为完成。
- 规范：[分域与来源指南](../MEMORY_DOMAIN_AND_SOURCE_GUIDE.md)；决策：[ADR-064](../adr/ADR-064-memory-domain-source-and-incremental-migration.md)。

## 1. 已实现

- 十六模块集中策略：个人事实/知识上下文预算、允许集合/数据集、会话或游戏分支、个人候选与模块写入边界。明确哪些现在生效、哪些是后续设计上限。
- 严格来源引用：owner、sourceKind/ID、scope、revision、状态、敏感性、有效期。显式集合/插件数据集、当前祖先和权威依赖清单，错 owner/域/分支、旧版本/删除/缺失、策略切换均不能复用。
- 修复真实生产缺口：旧 entertainment 聊天检索之前未读取保存模式，可能注入个人 Memory。现在从数据库解析模式，娱乐在查 memory_items 前就停止；未知模式同样拒绝。独立 GameSession 原有隔离保留。
- PromptRun 事务内复核模式：检索后如果改成娱乐则拒绝运行；既有版本/TTL/owner 栅栏和 Usage 原子性保留。候选提取复用同一模式映射，继续由用户确认写正式事实。
- 保留现有表和插件 v1：无新依赖、SQL 迁移、外部服务、新模型调用或双份业务状态。当前 PostgreSQL 迁移和持久卷不变。
- 规范涵盖来源修订映射、根依赖失效、备份/恢复/回退、后续 80 查询合成标注计划及规模/门槛。真实 RAG 指标未测，不填写虚构分数。

## 2. 自检与验证

| 检查 | 最终结果 |
|---|---|
| Vitest 单元/集成（`--maxWorkers=4`） | 138 文件，535/535 通过；代码冻结后全量复跑仍通过 |
| 新增覆盖 | 分域/来源契约 28 例 + 真实 Repository 复合反例 1 例 + R4 请求/样例兼容 1 例，共增加 30 例 |
| TypeScript `tsc --noEmit` / ESLint | 均通过 |
| Core 固定离线契约 | 25/25 |
| Prompt 离线拼装/验证器 | 80/80，网络禁止、真实调用 0，新快照无漂移 |
| Next.js 生产构建 | Docker builder 中 `npm run build` 通过 |
| 新 Docker 部署的 Edge 回归（4 workers） | 36/36，含手机视口；生成/业务接口按既有 E2E mock，不等于真实 Provider 验收 |
| 健康/持久化 | `/api/v1/health` healthy、database ready；Web/Postgres healthy、Worker/Search running |
| 文档/补丁 | 相对链接检查与 `git diff --check` 通过 |

开发自检中发现测试引用了不存在的 `detail.conversation.version`、比较器不存在的返回字段，以及 Next ESLint 禁止的 `module` 局部变量，均已修复再跑；未放宽业务断言、延长超时或绕过校验。

重点反例：十六模块的个人读取白名单、候选不能当确认事实、集合显式授权、plugin/dataset 精确匹配、会话/游戏祖先可读而兄弟分支拒绝、源身份与 revision 缺失/更改/删除/TTL、重复派生依赖与策略变化。PGlite 跑真实迁移和 Repository，不用 mock 冒充 SQL 过滤；另验证错 owner、娱乐禁读时零 Memory SELECT、模式变化与旧/已删 item 导致调用事务回滚。

Prompt 基线升级 `r5.1/source-policy-v1`，新增三份实际读取边界文件指纹；保留全部 R3/R4 快照，R4 的 80 个请求和样例 hash 全部不变。纯来源契约校验通过不代表真实检索召回率/摘要质量已经达标。

## 3. 部署与费用

已执行一次 `docker compose --env-file 'D:/Visual Studio Code/project/agent_web/.env.selfhost' up --build -d --no-deps web worker`。仅更新 Web/Worker，PostgreSQL 与搜索容器及持久数据保留；健康检查在新容器启动后通过。无 UI/原生/客户端传输变更，本轮不重建 APK，不要求手机重装；现有 APK 访问更新后的服务端即可。依赖安装仍报告既有 19 项告警（4 low/4 moderate/8 high/3 critical），本次未升级依赖或执行 audit fix，留待发布前处理。

复现命令（从 `web/`）：

```powershell
node node_modules/vitest/vitest.mjs run --maxWorkers=4
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js .
node node_modules/tsx/dist/cli.mjs scripts/core-quality-eval.ts
node node_modules/tsx/dist/cli.mjs scripts/prompt-baseline.ts
$env:PLAYWRIGHT_EXTERNAL_SERVER='true'
$env:PLAYWRIGHT_PORT='3000'
node node_modules/@playwright/test/cli.js test --workers=4
```

本轮付费模型测试 0 次、¥0；合并后的长期测试总预算仍为 ¥3，已用上界 ¥0.115798566、剩余 ¥2.884201434，没有重置额度或使用私人聊天。

## 4. 仍需注意

- 来源契约和派生依赖验证是可测试的后续接入边界；当前没有新知识库、向量索引、摘要生成、自动索引清理或记忆宫殿。
- 现有确认个人记忆是独立事实。删除原对话只会把来源外键置空，**不会自动删除确认事实或 candidate.evidenceQuote**。R5.2 必须把来源删除提示、关联记忆/证据处理与知识资料生命周期一起实现，不宣称本次已完成全链路删除。
- 当前仍是固定单用户 owner；新 Schema 不能替代真实服务端授权。候选正文前的源校验、hash 生成和索引适配器需在后续真正接入资料库时逐项验证。
- 专业/陪伴/反思保持原敏感记忆兼容；更细粒度的用户控制留 R5.6。主动联系的已授权非敏感目标跟进仍走原确定性流程，不是新增模型检索。
- 已发送的在途模型请求不能由后来的本地删除撤回。真实质量/费用净收益、R2 视觉/华为通知真机、R3 人工签收、依赖告警和 Phase 5.6 发布前验收仍保留。

## 5. 下一步

R5.2：先完成个人记忆来源/删除规则与可见的知识集合、文本/Markdown 文档导入、来源定位、更正/删除流程。不要先扩展向量数据库或 Palace 空框架；R5.3 接检索，R5.4 与 R1.3 共用分支摘要。
