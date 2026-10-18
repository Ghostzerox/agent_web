# 变更记录

当前收敛阶段摘要。完整旧日志见 [R9.4前冻结版本](https://github.com/Ghostzerox/agent_web/blob/ebaeecbf67dfc03e34065d25e68d51f005177095/docs/CHANGELOG.md)，各阶段索引见 [历史](HISTORY.md)。当前排序只看 [产品主线](PRODUCT_MAINLINE_GUIDE.md)。

## R9.4 — 依赖、工具链、测试与文档瘦身（2026-10-18）

**Commit**: same delivery commit

- Prompt 基线 15 → 1，80 个请求 / 夹具和当前源码冻结原样保留；撤下 9 项历史对比，不删现用行为覆盖。
- 30 份 SQL 测试共享 PGlite 迁移适配器；仍独立建库、控制迁移范围，保留事务 / 回滚 / 来源 / 版本测试。
- 退役滞后的 Drizzle Kit、生成元数据 / 配置及生成 / 检查命令；34 对正式 SQL 不改写。旧单次 scheduler claim 退出，常驻 Worker 保留。
- tsx 归入生产依赖；Docker builder / runner 分层，只发布生产依赖和三个运行脚本，移除未使用的可选 PGlite peer；原生 / 测试 / 评测文件不进入镜像。
- 一套 check / Web build / React Bundle 入口；截图不覆盖历史图。文档以目录、开发手册、当前技术地图和历史索引收拢；29 份旧阶段文档从工作区归档到固定 Git 提交。
- localStorage 键 / 内容、真实数据库、模型产品语义不变；费用账本 / 原始比较保留，真机继续暂缓。验收与剩余告警见 [R9.4报告](reports/R9_4_REPORT.md)。

## R9.3 — 模块解耦与单一实现

[报告](reports/R9_3_REPORT.md)：23 个 API Client 共用 JSON 传输；领域契约、页面归属与确定性工具统一，大 UI 按职责拆分；类型环 4 → 0，生产源码非空行减少 385。原功能、数据和模板 / 引擎分离保留。

## R9.2 — 兼容收敛与直接删冗余

[报告](reports/R9_2_REPORT.md)：退役旧浏览器导入、环境变量凭据兜底、旧摘要 / 工具占位与 remote-shell 打包轨。localStorage 不读取、不清空；服务端数据保留。

## R9.1 — 现状解构

[盘点](R9_1_SIMPLIFICATION_AUDIT.md)、[基线](r9/inventory-baseline.json)：26 项决策和只读源码图；以同口径指标复核，不把静态零引用直接判死代码，不预承诺削减比例。
