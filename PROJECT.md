# 项目定位与固定边界

项目：AI Study Companion，个人 AI 学习 / 陪伴助手；用于自用、学习软件工程与作品集，不以市场创新或商业化为前提。

当前任务、排序和完成状态只在 [产品主线](docs/PRODUCT_MAINLINE_GUIDE.md) 维护；本文件不再复制易过期的 CURRENT_PHASE / CURRENT_TASK。操作入口：[开发手册](docs/DEVELOPMENT.md)、[文档目录](docs/README.md)。

## 固定边界

- 保留 Next.js App Router、React、TypeScript、Tailwind、PostgreSQL / Drizzle 和薄平台 Adapter；不擅自迁移框架。
- 业务事实来源是服务端数据库，模型凭据只由网页写入服务端 Vault；没有环境变量模型凭据兜底。旧浏览器存储不读取、不迁移、不清空。
- Web / 本地 React / Capacitor 共用业务和 API；不再维护 remote-shell 打包轨。手机通知与 Huawei / ArkWeb 能力按实际需求补足，真机统一暂缓。
- 陪伴表达不能损害专业性；现实记忆和虚构游戏隔离，工具操作不得冒充成功。
- 当前不建设支付、公开插件市场、多 Agent 平台或完整 ArkTS UI 重写。未实现登录鉴权，因此限 localhost / Tailscale 私网使用。
- 当前数据尽量无损保留；兼容只按真实消费者维护，不无限叠加历史分支。

开发规则见 [CLAUDE.md](CLAUDE.md) 与适用 AGENTS 指引；每个逻辑任务实现、自检 / 审查 / 测试后提交推送，验证强度与风险相匹配。费用账本和未完成的用户体验 / 真机门槛不得重置或冒称通过。
