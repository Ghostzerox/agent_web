# AI Study Companion

个人使用、学习和作品集导向的 AI 助手：专业问答不受陪伴人格干扰，长期能力围绕任务、思考、内容、记忆和陪伴展开。

## 当前能力

- 树形聊天、SSE 流式回答、Markdown / 数学公式、受控搜索与来源引用。
- 定时提醒 / AI 任务、持久收件箱、通知、行动打卡 / 习惯 / 目标。
- 新闻简报、选书、思考问题、Persona、克制的主动联系与设备语音。
- 用户控制的分域记忆、资料检索、分支摘要、学习记忆宫殿。
- 第一方背书 / 解题插件、独立角色扮演 / 跑团与区域探索。
- Web 和共享 React 的 Capacitor Android 客户端；真机测试统一暂缓，APK 不是正式签名发布版本。

R9.1–R9.4 已交付；本轮已完成依赖 / 运行镜像、测试和文档收敛，见 [R9.4报告](docs/reports/R9_4_REPORT.md)。完整状态、限制和后续顺序只维护在 [产品主线](docs/PRODUCT_MAINLINE_GUIDE.md)，文档入口见 [目录](docs/README.md)。工程实现不等于真实质量、成本收益或设备体验全部通过。

## 开发

```powershell
cd web
npm ci
npm run dev
```

`npm run check` 做 Lint、类型与单元 / 内存 SQL 测试；`npm run build` / `npm start` 构建 / 启动 Web。完整开发、评测和 Bundle 命令见 [开发手册](docs/DEVELOPMENT.md)。

## 部署与数据

Next.js 16 + React + TypeScript + Tailwind；PostgreSQL + Drizzle ORM；Docker Compose 包含 Web/API、Worker、数据库和 SearXNG。笔记本通过 Tailscale 私有访问，部署、重启和备份见 [自托管手册](docs/SELF_HOSTING.md)。

会话 / 任务 / 记忆存于服务端 PostgreSQL，不是浏览器数据库；凭据由网页写入，服务端加密 Key，Provider / Base URL / Model 为普通字段。旧浏览器导入与环境变量凭据兜底已退役，不清空原 localStorage。

目前没有应用登录鉴权，只能在 localhost 或可信私网使用，不能直接公开到公网。已知依赖告警、发布前安全封版和统一设备验收未自动视为完成。

## 代码归属

`web/app` 页面和 API；`web/components` UI；`web/lib` 领域、平台与持久层；`web/mobile` 本地 React 入口；`web/tests` / `web/e2e` 测试；`web/drizzle` 正式迁移 SQL；`scripts` 运维；`docs` 当前指南与历史索引。

保持当前功能和数据，按职责修改、按风险验证后提交推送；不默认永久保留所有旧协议、APK 或过渡实现。
