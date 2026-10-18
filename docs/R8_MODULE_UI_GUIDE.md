# R8：模块入口、子页与折叠界面

2026-10-18：R8.2–R8.4 本地实现及自动验收；发布状态见 [报告](https://github.com/Ghostzerox/agent_web/blob/ebaeecbf67dfc03e34065d25e68d51f005177095/docs/reports/R8_REPORT.md)。原 [R8.1 设计](https://github.com/Ghostzerox/agent_web/blob/ebaeecbf67dfc03e34065d25e68d51f005177095/docs/R8_1_MODULE_ENTRY_DESIGN.md) 保留为设计历史。

## 如何使用

全局只保留对话、任务、学习、娱乐、内容、收件箱、设置七个入口。每页标题下的“本模块导航”（对话中为“对话内导航”）可展开，打开所属子页或返回模块首页；手机仍通过左上角图标展开全局菜单。

| 主入口 | 下一层 | 再下一层 / 按需展开 |
|---|---|---|
| 对话 `/chat` | 行为模式、当前会话；专业工具 `/chat?view=tools` | 对话历史抽屉；“本次对话的资料与上下文”；单条回答的引用、验证、朗读 |
| 任务 `/tasks` | `section=actions / habits / goals / insights / reminders / scheduled / tools` | 各页只挂载自己的操作区；习惯创建、导出和高级预览继续折叠 |
| 学习 `/study` | 背书、解题、助记宫殿、学习工具 | 材料 / 题目列表可折叠；训练和材料编辑沿用原有明确选择；宫殿展开后读取目录 |
| 娱乐 `/entertainment` | `view=worlds` 世界与存档；轻量冒险 | 世界列表可折叠；地图 / 背包 / 人物 / 事件 / 历史在当前存档内部；检查点、世界设定与角色卡按需展开 |
| 内容 `/content` | 简报 `view=briefing`、书籍 `/reading`、思考问题 `/reflection`、工具 `view=tools` | 来源检查折叠；结果链接到同一 Inbox，订阅跳转定时任务，不复制结果表 |
| 收件箱 `/inbox` | 全部、简报、书籍、思考问题来源链接 | 正文可展开；指定 highlight 自动展示对应正文；标为已读仍需明确操作 |
| 设置 `/settings` | 模型、个人数据、人格、主动联系、语音、通知、插件、高级工具 | 设置目录不挂载所有长表单；语音 / 插件高级检查按需展开 |

目录页不读取其他业务编辑器，不创建任务、存档，不改变对话模式或插件授权，也不调用收费模型。通用折叠使用原生 `details/summary`，不因收起卸载输入框或删除草稿。世界 / 材料 / 题目列表初始展开，可主动收起；对话资料、模块菜单和高级功能默认收起。

## 个人数据与学习宫殿

- `/memory` 默认只打开正式长期记忆；`view=candidates / knowledge / navigation / controls` 分别打开候选、资料、AI 记忆导航、读取控制与导出，互不常驻。
- `/study/memory-palaces` 仅呈现 `purpose=learning` 宫殿；AI 记忆导航仅呈现 `purpose=navigation`。共用组件和现有 API，列表展示按用途筛选，不新增授权或把个人事实转换成学习材料。
- R9.2 起退役 `/memory?palace=learning` 别名，旧参数显示无效链接，不读取学习或现实记忆；使用 `/study/memory-palaces`。知识原文深链不变。
- 知识引用原样使用 `/memory?document=<uuid>&version=<n>&line=<n>`。引用打开知识视图并沿用服务端版本校验；不加 `view`、不重写历史引用。重复关键参数、无版本、无效值、`document / palace / view` 冲突会显示错误，不挂载其他域的编辑器。
- 子页切换沿用 Navigation Guard，确认后才离开；折叠不触发离开。取消返回时本地 React 的查询读取延后到所有导航确认监听器结束之后，保留原 URL 与草稿。

## 深链与工具边界

原 19 个页面均保留。新增四个宿主页面：`/content`、`/settings`、`/study/memory-palaces`、`/study/tools`，Web 与本地 React 同步登记，共 23 页；任务、娱乐、对话和内容的局部子视图用 query，不占用 APK 的 hash 路由。

`/chat?mode=…&session=…` 仍是模式意向而不是自动切换；`/tasks?task=…&edit=1` 优先进入定时任务并定位；`/entertainment?session=…` 进入世界与存档并选中会话。地址变化不生成消息或游戏回合。

`/inbox?source=personal_briefing|book_recommendation|reflection_question` 对当前已加载的服务端结果做来源筛选，不冒充全库分页检索；`highlight=<id>` 定位、描边并展开正文，找不到明确提示，不自动标读或补发。

九个共享工具均保留，日常从所属模块打开同一 Workbench 的工具子集：对话的计算 / 原文定位、任务的行动草稿 / 时间预览、学习的导入校验等、内容的来源 / ISBN、语音的朗读预览、插件的兼容检查。高级 `/tools` 仍可打开全部。JSON 参数工作台仍属于高级操作，并非新做了一套自动填充表单；工具输出不会自动回填聊天或写入材料，创建提醒仍需确认。`allowedScopes` 和 Plugin API 没有扩大。

## 技术位置与后续

- `web/lib/platform/workspaceNavigation.ts`：七入口、小型静态归属解析、局部链接与工具展示归属；不是新路由器或授权服务。
- `components/ui/AppShell.tsx / ModuleDirectory.tsx / Disclosure.tsx`：共用外壳、目录卡片与折叠。
- `components/platform/useAppQuery.ts`：Web / hash 查询与返回的响应式读取。
- `components/memory/MemoryWorkspace.tsx`、`lib/platform/memoryView.ts`：单视图挂载与参数冲突规则。
- `TaskWorkspace / ActionBoard`、`EntertainmentWorkspace`：目录与所属功能的单独展示；后端业务仍复用原服务。

不新增数据库迁移，仍为 34 份；不更换数据卷、不复制服务端数据。本轮不重打 APK、不做华为真机；系统返回、键盘、触摸与通知直达继续合并至 [D03 / D07 等统一待办](DEVICE_ACCEPTANCE_BACKLOG.md)。后续按用户决定进入语音 / 移动完善、发布前安全封版或作品集整理，不自动执行。
