# R5.6交付报告：用户控制与跨端综合验收

2026-10-17。基点 `b2f973e20d1a4fcff77e371d79366f3eac0330ab`，分支 `codex/r3-r5-capability-plan`。工程实现与自动验收交付；真实插件学习跨端因当前授权不足未执行，华为硬件仍待用户确认，不标“全部真机通过”。

## 新增与修复

- 记忆页「数据控制与迁移」：专业/陪伴/反思的长期/敏感读取开关，服务端版本保存、检索和调用前复核；默认兼容旧行为，不改变娱乐隔离。
- 最近20次上下文使用：Run状态、个人记忆ID/排名/当前存在状态、资料版本/行引用、摘要ID/覆盖条数和原文降级标记。不是隐藏思考或正确性证明，不从旧日志返回已删正文。
- 所选正式记忆/资料原文/宫殿的4MB范围导出，Web下载/APK复用系统分享；文件本地校验与新ID/版本冲突/待核对引用预演。预演0写入，无restore接口；包不含Key、原聊天、候选证据、摘要正文、任务或插件材料日志，不代替数据库备份。
- 文档「检查并按需重建分段」：无变化保留ID，只修指定派生分段，不改原文版本或其他数据。原文降级限定同owner/同模式/所选集合，最多100篇/1MB；调用前重新核对根版本/hash及虚拟片段/位置。
- 修复个人记忆保存/删除失败后的自动刷新，避免另一端版本冲突时丢草稿；显式刷新有放弃确认，异步变更事件也不覆盖未保存编辑。
- 审查补齐「资料更正/删除 → 覆盖消息引用元数据 → 派生摘要失效」链。只读根元数据，不自动读取新版正文/重新收费、不改原消息；没有资料引用的旧摘要兼容。

使用与边界见 [指南](../MEMORY_CONTROL_AND_ACCEPTANCE_GUIDE.md)、[ADR-069](../adr/ADR-069-memory-control-and-cross-client-acceptance.md)。

## 代码与数据

| 层 | 入口 |
|---|---|
| 用户契约 | `web/lib/memory/controls.ts`、`archive.ts`：模式开关、严格记忆包、本地预演与4MB限制 |
| 数据访问 | `memoryControlRepository.ts`、`memoryDataRepository.ts`：owner/CAS、一致快照导出、上下文元数据 |
| API | `/api/v1/memory-data/{controls,manifest,usage,export}`；无restore；资料新增 `POST /api/v1/knowledge/documents/:id/rebuild` |
| 读取约束 | `memoryRepository.ts`、`promptRunRepository.ts`：服务端开关校验，失效来源/权限拒绝后不调用模型 |
| 派生索引 | `knowledge/sourceIndex.ts`、`knowledgeRepository.ts`、`knowledgeRetrievalRepository.ts`：按需重建/有界原文降级 |
| 摘要 | `conversationSummaryRepository.ts`：根引用元数据纳入contextStamp，派生摘要不当最新知识 |
| UI | `MemoryDataControls.tsx`、`MemoryManager.tsx`、`KnowledgeLibrary.tsx`，Web/APK共享 |
| 迁移 | 新0032 `memory_controls`，owner PK/FK、settings JSONB、version；33迁移，旧SQL字节未修改 |

没有新增npm依赖、模型、向量服务、调度器或公开测试端点。现有个人读取默认开启；sensitive按存储标签过滤，不假称能自动发现所有隐私。开关不撤回已发送请求，不删除历史/Persona/旧摘要。一般原文分段不重建全部资料；表结构缺失需迁移/恢复，不由UI自动DDL。

导出排除Key是指排除凭据字段，不自动剔除用户自己写入正文的密钥；这是私人数据包，不是已自动脱敏的公开分享文件。

## 自动检查及实测

| 检查 | 结果 |
|---|---|
| 全量Vitest | **147文件、604/604通过**，比R5.5增加13项：11项新SQL/预演/恢复反例，1项摘要依赖，1项旧请求兼容 |
| SQL反例 | 三模式开关/敏感过滤、跨端CAS、检索→Run期间设置变化、范围导出排除私钥/未选/跨owner、文件错误/重复/超限、零写预演、使用记录删源状态、no-op及修复不改其他来源、降级虚拟引用/未选拒绝/过期拒绝、分段表不可用、100篇边界、4MB边界、控制表up/down |
| Core / Prompt | 25/25、80/80；R5.6快照39源文件，历史快照保留，旧请求/fixture hash不变；新摘要/降级/控制另有专项，不用旧80例冒充涵盖新功能 |
| 词项检索金标 | 原80查询复跑，Recall@5 90.91%，无答案误召回0/12，越域0、旧/删源0、定位错误0；仍有4个隐含改写漏检，不是向量实验 |
| TypeScript / ESLint / Next构建 | 通过；脚本局部变量遮蔽DOM的类型问题改用window.document，无业务放宽 |
| Docker Edge | **48/48通过**，新增开关冲突/离线、范围下载/本地预演、记忆冲突草稿保护；保留原聊天/任务/学习/娱乐/导航/多宽度回归 |
| 本地React Bundle | 新控制3项、原宫殿2项及mobile-ui-smoke；分别使用各自hash路由测试开关，结果不冒充真机 |
| 真实Web+Bundle→同Docker API/PG | 合成布局两端共享、版本冲突后保留草稿、显式刷新、资料更正拒绝旧正文通过；脚本只代理/展示自己的合成资料，未改用户开关或授权 |
| 真实背书跨端 | **跳过**：现有 `/memorization` 返回403，脚本没有自动启用插件或授权，没有创建材料。授权下的真实Gateway/PGlite服务与本地UI分别测过，不冒充这一真链已经通过 |
| 真实HTTP→PG导出/重建 | 10篇/100段合成资料、范围导出、清单预演、no-op重建和禁止restore通过；finally清理自己的集合 |
| APK访问链路 | 新API本机OPTIONS预检204，配置的Tailscale HTTPS GET200，均返回允许的 `https://localhost` Origin；不代替手机硬件测试 |
| Debug APK | 构建成功；包内43份JS与mobile-dist的43份逐一比较，0不一致；不是华为硬件签收 |

测试发现并修复：原文降级结果是500字符以内的行片段，不能拿完整分段与结果直接比较；改按真实截取规则、根hash和行范围校验。新增摘要根引用依赖后补专项及源码指纹；原有语义/权限断言不放宽，没有延长超时来掩盖错误。

最终审查还确认：派生表不可用时原文查看不能一起失效；已将getDocument限定降级为指定版本原文+显式索引不可用标记，不编造已保存分段/行高亮。连接失败不被当成此类降级。

### 查询时延与成本

真实本机Docker HTTP/PostgreSQL：10篇合成文档、100分段，1次首次查询+25次重复查询；`web/scripts/memory-data-smoke.ts`可复跑。

| 测量 | 首次 | 重复P50 | 重复P95 |
|---|---:|---:|---:|
| HTTP端到端 | 45.46ms | 33.25ms | 38.71ms |
| 服务端检索 | 41.28ms | 29.60ms | 34.85ms |

这是**会话首次/后续重复请求**，创建资料已预热数据库；不是OS/数据库页缓存清空后的冷启动、真实手机网络、生产SLA或Provider Prompt缓存命中率。纯评分器80例首次9.00ms、后续P50 1.65ms/P95 6.20ms仅作另列参考，不与HTTP混用。后台worker/机器负载可改变结果，不承诺固定加速比例。

本轮模型/Embedding **0次，¥0**。共享¥3累计已用上界¥0.173498566、余额¥2.826501434，无在途调用；没有借此扩大旧¥5授权或重新计预算。

## 备份与部署

- 前置真实备份：`backups/agent-web-20261017-124716.sql`，188,984 bytes；SHA-256 `4A5AC4BD27448325C51DE01B26FF24F739F637C103A267A7106D14834739CD41`，含私人数据，仅本地忽略保存。
- 临时PostgreSQL16 `agent-web-r56-restore-check` 禁网络/无主机端口、tmpfs，恢复原32历史迁移后新表up存在/down不存在通过。首次容器尚未ready未能执行，等pg_isready确认后完成；没有在生产回退。核对ID后仅移除该临时恢复副本，备份保留可恢复。
- 生产现**33迁移**，Web/Postgres健康、Worker运行，搜索/数据卷保留，仅更新Web/Worker。合成测试集合/宫殿均按自己的ID清理，用户偏好/授权未改。
- APK：`web/android/app/build/outputs/apk/debug/app-debug.apk`，5,684,624 bytes，SHA-256 `A9B07E51845B54672174E60513E4B61325981440B5909A5A3EBE61512284BC53`。API Origin `https://laptop-skh8fc5e.tail36fb9a.ts.net`，本地React，无server.url。

## 剩余验收与主线

工程首期R5.1–R5.6已交付，但完整发布尚未签收：请在手机安装新APK、连接Tailscale，检查开关双端一致、冲突草稿与刷新、实际导出保存/文件选择、断网错误。需要用户在插件页明确启用/授权背书存储后，再跑电脑材料→手机逐字练习→电脑日志的真链；开发者不代点授权。

通用恢复写入、跨实例ID重映射、全部格式导入、向量/Embedding、独立业务自动RAG、任意部分污染自动检测、3D/AI联想、语义/陪伴/学习质量、真正系统级冷启动及长期净收益仍保留。已打开客户端、导出/备份/远端请求不会因删源瞬间消失。历史摘要不因重建自动变成新版事实；有效性回退也不改写原聊天。

下一步建议先完成真机/用户体验签收，再按原主线推进语音与移动发布及Phase5.6发布前封版；本轮不自动进入它们，**R5.6不等于Phase5.6**。
