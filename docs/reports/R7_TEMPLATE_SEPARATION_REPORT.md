# R7 调整：通用框架与模板分离

日期：2026-10-18。状态：本地实现与验证完成；Git 提交 / 推送、Docker 更新尚未完成。

后续发布更新（同日 R8）：本轮环境权限已恢复，以上修改随 R8 一起完成 Web / React / SQL 回归，Docker 已更新且健康、保留原数据卷；下方“交付限制”是上一轮历史记录，不再表示当前 Docker 未更新。最终交付见 [R8报告](R8_REPORT.md) 与对应 Git 记录。

## 调整结果

1. 通用框架：`templateTypes.ts`、`characterFactory.ts`、`templateRegistry.ts`、`validateTemplate.ts` 和 `engine.ts` 负责契约、注册和执行，不包含雾港专属人物、目标或开场。
2. 具体模板：`templates/fog-harbor/world.ts` 保存私有世界定义；同目录 `public.ts` 保存无剧透介绍与创建默认值；服务端 / 客户端目录分别注册。旧 `preset.ts` 仅保留兼容名称。
3. 选择流程：娱乐模式 → 大世界探索 · 选择模板 → 选择并阅读背景、角色定位、玩法、规模和特色 → 确认创建 → 开启探索世界。浏览简介不创建存档。
4. 开场、初始玩家 / 资金 / 档位、商人资金、等待文本和承诺完成效果改为模板数据。人物承诺确认读取当前公开承诺，不写死镜片任务。
5. 选择时版本固定到会话，旧启动请求省略版本时从标记补齐。旧快照与 d20、导出格式保持兼容，无新数据库迁移。

正式模板仍只有雾港。“风铃营地”只用于测试框架复用和版本隔离，不发布给用户。不包含第三方模板上传、热加载或新的插件权限。

## 验证

- 全量 Vitest：159 个文件、654 项通过，包含真实 SQL Repository 回归与旧雾港完整旅程。
- 最后修改下拉框显式标签关联后：TypeScript、针对组件 ESLint、分层 / Prompt 基线 21 项复测通过。本轮完整 ESLint 此前已通过。
- 本地 React 生产构建通过；577 模块，沿用依赖中已有的 Zod PURE 注释警告。
- Edge 对本次构建的本地 React Bundle：3 项通过，覆盖 360px / 1440px 的简介、显式创建、完整探索、结局、来源历史、导出及 AI 失败草稿保护。首次验收发现下拉框标签文本定位问题，改为 `useId` + 显式 `htmlFor` 后重跑全部通过。
- Prompt 保留旧 R7 基线，新增 `baseline-r7-templates.json`；80 个用例 / 请求保持原样，仅更新版本和 TurnService 源码指纹。
- `git diff --check` 通过；未调用收费模型，费用 ¥0。未构建新 APK，真机按既有要求暂缓合并。

## 交付限制

当前工作区的 Git 实际索引在主仓库 `.git/worktrees/agent_web`；普通 `git add` 返回 `index.lock: Permission denied`。已尝试提权执行提交，但请求未返回，终止等待后确认 HEAD 仍为 `d5c2ba8`。没有生成本次提交，也未推送。

Docker 普通访问返回引擎管道权限不足，尚未执行本次容器更新。因此现有 `localhost:3000` / Tailscale 服务不代表本次修改，不能只刷新页面判断本次功能。

下一步在具备工作区 Git 写入和 Docker 引擎权限的环境：提交本次文件 → 非强制推送 `HEAD:main` → 使用既有私有环境文件执行 `docker compose up --build -d` 并检查服务健康。保留原 PostgreSQL 数据卷，不需要迁移或清空数据。后续主线仍为 R8.2，不自动扩展其他阶段。

扩展步骤见 [探索指南](../R7_EXPLORATION_GUIDE.md)。
