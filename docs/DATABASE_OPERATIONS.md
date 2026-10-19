# 数据库迁移操作手册

当前迁移以版本化 SQL 与数据库内校验历史为准，ORM Schema 配套维护。R9.4 退役停在 0017 的生成元数据与 Drizzle Kit，34对正式 SQL 原样保留；R10.3追加0034世界创作三表，R10.4追加0035设计稿与可编辑世界草稿一次性升级，R10.4.1追加0036抽卡回执表与会话所有权关联索引，R10.5追加0037事件草稿表，现共38对；前37份不改写。旧浏览器导入已退役，不读取或清空 localStorage。

## 环境和命令

在 `web/` 下复制 `.env.example` 为 `.env.local`，填写 PostgreSQL 的 `DATABASE_URL`；不提交真实环境文件。Docker 方式见 [自托管](SELF_HOSTING.md)，Web 与 Worker 启动时均会执行待处理迁移。

```powershell
npm run db:migrate
npm test -- databaseMigrations.test.ts
```

`npm run db:rollback` **可能删表 / 列 / 数据**，只回滚最近一条，执行前确认目标、备份和配套代码。不要在真实库试回滚。备份 / 恢复演练见自托管手册，不使用生产数据库验证破坏性流程。

## 新迁移规范

1. 更新 `web/lib/db/schema.ts`，同时手写下一编号 `web/drizzle/<id>.sql`。不直接 ORM push，不从过期快照生成 SQL。
2. 添加 `web/drizzle/rollback/<id>.sql` 同名回滚文件，逆向处理依赖；使用 `--> statement-breakpoint` 分隔语句。
3. 已应用的 SQL **不可改写**，包括换行；保持 LF，修正新增迁移。涉及删列、类型转换或重写数据时先设计无损升级与隔离演练。
4. 执行 `npm test -- databaseMigrations.test.ts`，覆盖新库安装、幂等、回滚 / 重应用、既有数据升级与校验漂移拒绝。新增表时同步当前表清单，新增升级场景不能只检查空库。
5. 执行 `npm run check` 与 `npm run build`，受影响 Repository / API 的 SQL 测试继续保留。
6. TypeScript 通过不自动证明 ORM 定义和 SQL 等价，需审查两者。Drizzle Kit 的 `db:generate` / `db:check` 已退出，不作为当前验证入口。

## 执行与并发

`lib/db/migrations.ts` 从 `drizzle/` 读取前向 SQL 和同名回滚 SQL。它不依赖旧 `meta/_journal.json` 或生成器快照。

- 数据库内 `app_internal.schema_migrations` 保存文件 ID、SHA-256 和执行时间。
- 每条迁移及历史写入在同一事务，失败整体撤销；对历史表加排他锁，Web / Worker 并发启动不会重复应用。
- 已应用 SQL 校验和不同则拒绝继续，避免数据库与 Git 历史分叉。
- 回滚在同一锁和事务中只退一条，成功后移除该条记录；再升级时重新应用。0035发现已使用的新设计数据、0036发现卡池 / 抽取 / 分支获取数据、0037发现事件草稿 / 定义 / 分支规则或唯一奖励标记时会拒绝有损降级，需审阅备份恢复方案，不能直接删数据求回滚成功。
- 生产使用 PostgreSQL；测试使用独立内存 PGlite 实例，共享的只是 `tests/helpers/pglite.ts` 适配器，各用例仍自行决定迁移范围和关闭实例。

## 数据归属

UUID 主键、`timestamptz` 时间、`users` 与业务外键维持原设计。真实数据均在服务端 PostgreSQL，浏览器 / APK 不是数据库。

| 领域 | 持久化事实 |
|---|---|
| 聊天 | Conversation / Message 树、活动叶与乐观版本；历史导入收据保留，现无导入 API |
| 模型配置 | 一份当前 Provider / Base URL / Model；Key 加密，读取接口不返完整值 |
| 定时任务 | Task / Run、租约、幂等和终态；Inbox 是实际结果，Push 仅可失败的提示 |
| 行动 | 行动 / 打卡 / 目标 / 事件；不把 Worker 执行等同用户完成 |
| 记忆 / 资料 | 用户、模块、来源与版本约束；宫殿只保存布局引用 |
| 游戏 | 独立 Session / Character / Turn / Event / Checkpoint；虚构状态不写入现实记忆 |
| 插件 | 启停、授权、隔离存储、配额与审计；不下放 SQL 权限 |
| 表达 / 通知 | Persona、Voice、主动联系偏好、预算和投递记录；不复制不必要正文 |

JSONB 用于引用和部分结构化业务内容；关系、归属、版本与关键约束仍用表 / 列维护。完整字段以 Schema 与正式 SQL 为准，不在文档复制整套定义。

## 查看数据与恢复

日常优先在对应模块页面查看。需要 SQL 时从 Docker Desktop 的 PostgreSQL 容器终端进入，或使用 `docker compose exec postgres` 调用 `psql`，按自己的环境配置连接信息；数据库不映射公网端口。先只读查询，不将凭据 / 正文导出到日志或 Git。

正式卷为 Compose 命名卷，构建代码不等于重建数据库；不要使用 `docker compose down -v` 清理部署。R9.4 不更改应用中的迁移历史、不删真实数据。历史生成工具和收据设计见 [历史索引](HISTORY.md)。
