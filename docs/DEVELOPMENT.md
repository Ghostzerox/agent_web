# 开发、验证与构建

当前命令在 `web/package.json`，本文只维护使用入口。运行目录默认 `web/`，Docker / PowerShell 运维脚本在仓库根目录执行。产品进度只看 [主线](PRODUCT_MAINLINE_GUIDE.md)。

## 日常开发

相关模块新增 / 深化能力前，优先核对现有依赖和已成形开源实现，按 [R11规划](OPEN_SOURCE_REUSE_PLAN.md) 区分直接复用、独立服务、借鉴设计与保留自研；不因发现同类仓库就整体重写，也不为每次小改重复完整选型。正式引入时记录固定版本、来源 / 许可、接入与退出代价；README或Star不能代替测试。

```powershell
cd web
npm ci
npm run dev
```

需要 Node.js 22 与 npm；数据库和搜索可由现有 Docker 提供。环境变量见 `.env.example` 和 [自托管](SELF_HOSTING.md)，不要提交真实环境文件。模型在 `/api-key` 保存，不能用旧环境变量兜底。不要把没有登录鉴权的服务公开到公网。

## 一组明确的验证入口

| 目的 | 命令 | 范围 |
|---|---|---|
| 常规自检 | `npm run check` | Lint → TypeScript → 全量单元 / 内存SQL测试 |
| 局部测试 | `npm test -- taskSchedule.test.ts` | Vitest 过滤文件 / 名称，默认最多两个 Worker；不调用收费模型 |
| Prompt冻结 | `npm run eval:prompts` | 唯一当前基线，80 例；详细方法见 [Prompt指南](PROMPT_INVENTORY_AND_BASELINE.md) |
| 模式 / 成本契约 | `npm run eval:core`、`npm run eval:cost` | 离线确定性检查；不是实际质量或账单收益 |
| 浏览器 | `npm run test:e2e` | 已安装的 Microsoft Edge；默认管理本地开发服务器 |
| Web生产构建 / 启动 | `npm run build`、`npm start` | 明确使用已验证的 webpack 构建；运行时不需要 TypeScript 编译器 |
| 本地 React Bundle | `npm run mobile:client:build` | 共享组件的 Vite 产物，不是 APK / 手机硬件验收 |

本地 React 构建前设置 API Origin：

```powershell
$env:VITE_API_BASE_URL='https://<设备名>.<tailnet>.ts.net'
npm run mobile:client:build
```

运行已经启动的生产 / Docker / Bundle 服务时，设置 `PLAYWRIGHT_EXTERNAL_SERVER=true` 和 `PLAYWRIGHT_PORT`，防止 E2E 再创建或关闭第二个服务器。Bundle 专用用例读取各自 `*_MOBILE_BUNDLE` 标志，见相应 `web/e2e/*.spec.ts`；没有增加第二套业务测试目录。截图 / trace 进入忽略的 `web/test-results/`，不自动覆盖历史证据图。

局部纯函数修改跑受影响测试和静态检查；涉及跨层 / 依赖 / 部署时才做全量、构建和相应 Docker / 浏览器验收。Next 构建、全量 PGlite 和 Docker 构建避免同时争用资源。真实模型测试不是 `check` 的一部分，必须核对 [累计预算](PAID_TEST_BUDGET.md)。

## 数据库与常驻 Worker

使用 `db:migrate` / `db:rollback` 与 `worker:reminders`。新迁移手写前向 / 回滚 SQL，更新 ORM Schema 并执行完整迁移集成测试；见 [数据库手册](DATABASE_OPERATIONS.md)。不再使用停在 0017 的 Drizzle 生成器 / 元数据检查，也不运行旧 `scheduler:claim` 单次认领脚本，常驻 Worker 是实际执行入口。

`npm test -- releasePersistence.test.ts` 可单独复现 R9.5 的跨模块持久化冷重启检查：仅用合成 PGlite 快照，不读取真实库、不调用模型、不替代生产灾备或真机验收。整体封版范围见 [R9报告](reports/R9_5_REPORT.md)。

R10首期回归：`npm test -- r10CreationJourney.test.ts r10CreationQuality.test.ts` 检查合成创作 / 抽卡 / 事件 / 人物请求与冷重启；`creation-journey.spec.ts` 是共享完整点击旅程，React预览时加 `CREATION_JOURNEY_MOBILE_BUNDLE=true`。`npx tsx scripts/r10-quality-live.ts` 默认只离线演练；真实模式需重新核对共享余额、当日价格并显式开启，操作与历史失败费用见 `web/evals/r10/README.md` 和 [R10.6报告](reports/R10_6_REPORT.md)。不得把该真实模式接入 `check`、CI或普通启动脚本。

## 构建边界与依赖取舍

- Docker builder 安装构建依赖；runner 只安装 `npm ci --omit=dev`、复制 Web 产物、业务源文件、SQL 和三个运行脚本。构建缓存、Android、测试与评测不进入发布镜像。
- `tsx` 必须是生产依赖，因为迁移与 Worker 仍执行 TypeScript；只装 production 后仍须测试真实启动，不能仅检查 Dockerfile 文本。
- PGlite 虽是开发依赖，npm 仍会通过 Drizzle 的可选 peer 安装它；镜像层显式移除这个未使用驱动，本地 SQL 测试继续保留。不能全局禁用 optional 包，否则可能破坏 tsx / Next 原生包。
- `@next/env` 是迁移 / Worker 使用的环境读取器；Capacitor Android 是原生同步输入；CSS、类型和测试工具没有源码 import 也不等于无用。
- 保留 Next.js / React / Drizzle / PostgreSQL 和现用 Capacitor 工具链，本轮不升级版本、不新增打包框架。依赖告警另行记录，不代表清理后安全封版。

## 手机相关

日常功能继续共享 Web / React 业务。APK 构建与安装只有 [Android手册](MOBILE_ANDROID.md) 一套正式流程。**2026-10-20用户明确：每个大阶段完成后都重新生成Debug APK，只暂缓安装与真机测试，不暂缓打包。**阶段收尾包括共享客户端构建、Capacitor同步、Gradle打包、包内配置 / 资源检查、记录源提交 / 文件路径 / SHA-256，并在交付时给出安装包链接；仅构建React Bundle不算完成APK交付。小任务按影响做定向检查，不要求每个文案修改都打包；大阶段不以“仅服务端修改”或“真机暂缓”为由跳过。真机统一 [暂缓待办](DEVICE_ACCEPTANCE_BACKLOG.md)，构建成功不替代设备验收。

## 文档维护

[文档目录](README.md) → 所属操作指南；[产品主线](PRODUCT_MAINLINE_GUIDE.md) 维护排序；报告记录一次交付。历史阶段不再长期刷新为“当前”，归档与恢复见 [历史索引](HISTORY.md)。本地 Markdown 链接由单元测试检查；外部 Git 链接固定到归档提交，历史 API / 命令不视为现用能力。
