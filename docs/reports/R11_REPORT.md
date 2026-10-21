# R11 — 模块级开源调研与复用决策

日期：2026-10-21。交付范围：R11.1–R11.4 的候选地图、重点源码核验、两个离线复用实验和后续实施任务。**不是把24个开源项目接入产品，也不是语音 / 人格效果已经验收。** 当前业务、数据结构、Prompt和生产依赖不变。

## 1. 结论

- 最值得下一步直接采用的是 **ts-fsrs 5.4.2 的复习算法**，但必须先设计显式四档自评、卡片状态与日志迁移。不能把现有百分制背书分数直接强转为FSRS评分。
- **MaiBot / 幕间系统适合借鉴机制，不适合整体迁入**：前者提供消息身份 / 有界记忆注入思路，后者提供有依据的主动联系窗口、空日程结果缓存、叙事与发言分离思路。专业模式、现实任务、用户静默规则和R10人物认知边界仍由本项目管理。
- **CosyVoice保留为独立TTS服务的优先实验候选，GPT-SoVITS为备选**。本轮没有推理、下载权重或克隆声音；未测笔记本性能和目标音色，因此没有最终选型。
- 现阶段保留简洁任务调度、现有PostgreSQL事实库、游戏确定性宿主、第一方插件和Capacitor共享客户端。**不新增第二个Agent运行时、向量数据库、工作流平台或整站UI。**
- 新闻正文抽取 / RSS是另一条较轻的潜在复用方向；先验证内容质量与去重，再决定引入Readability / rss-parser，不默认部署RSSHub全站服务。

证据原件：[仓库 / 版本 / 许可元数据与源码指纹](../r11/repositories.json)、[实际实验结果](../r11/probe-results.json)、[可重跑实验脚本](../../web/scripts/r11-reuse-probe.ts)。Star查询时间为 `2026-10-21T03:26:50.710Z`。数据只代表该时刻；不是质量评分或许可证审计意见。

## 2. 怎么调查、调查到哪一层

本轮访问GitHub / 官方包注册表，核对24个仓库的身份、Star、默认分支、最近推送、归档状态和许可标识；六个重点仓库另固定commit、查看发布信息及测试 / CI路径。随后分两轮阅读：MaiBot / HDS / CosyVoice重点模块；FSRS / rrule发布包及DSH移植差异。没有运行第三方全量测试，没有审完全部issue / 安全公告，没有声称完整审计第三方代码。

证据等级：**M**＝仓库元数据 / 官方文档候选筛选；**S**＝下文指定版本的相关源码 / 发布包核验；**P**＝本地真实执行隔离实验。M不代表已读完整源码，S不代表已部署，P不代表生产集成或长期效果成立。

另抽查了CosyVoice / rrule少量最近更新的open issue，原始条目见[抽样快照](../r11/open-issue-sample.json)：CosyVoice [#1171](https://github.com/QwenAudio/CosyVoice/issues/1171)有用户报告空音频，rrule [#674](https://github.com/jkbrzt/rrule/issues/674) / [#671](https://github.com/jkbrzt/rrule/issues/671)涉及细粒度复发 / 去重计数。这些**是未独立复现的用户报告**，不据此宣称所有版本都有缺陷；也说明192个简单规则对照不能扩展为任意RRULE正确性。加速方案issue中的性能数字不作为本项目测量值。其余重点仓库未完成issue内容核验，未解决问题清单仍未知。

高Star优先而非唯一条件：MaiBot 6,343、CosyVoice 24,080、GPT-SoVITS 63,301、SillyTavern 34,744；其余快照见JSON。HDS镜像14、DSH移植2，是**用户点名方向的探索样本**，不包装为经典成熟项目。ts-fsrs 828，因专用算法、明确发布包 / 测试线索和TS边界进入实验；不是按跨领域Star统一阈值选型。

## 3. R11.1：逐模块地图与决定

表中“引入候选”均指后续有界任务，不是本轮已经安装。源码入口为仓库相对路径。

| 模块 / 现有入口与真实缺口 | 候选及证据等级 | 决定、替换范围与代价 |
|---|---|---|
| 语音：`web/lib/platform/speechOutput.ts`、`web/lib/speech/`；已有设备TTS、停止和音色选择，但设备提供的音色不可控 | [CosyVoice](https://github.com/QwenAudio/CosyVoice) S；[GPT-SoVITS](https://github.com/RVC-Boss/GPT-SoVITS) M | 服务候选，非npm库；先做音色 / 硬件实验再选。只替换合成来源，保留用户播放控制；新增Python / 模型与运维，不把模型塞进APK |
| 陪伴 / 主动：`web/lib/persona/`、`web/lib/proactivity/proactivityPolicy.ts`；已有静默、预算、冷却，表达连续性仍需体验验证 | [MaiBot](https://github.com/Mai-with-u/MaiBot) S；[HDS镜像](https://github.com/euphoriaaaaaa1/hds-interlude) S；[DSH移植](https://github.com/Dacangshu987/dsh-hds-interlude) S（限定迁移说明） | 借鉴结构化依据、机会窗口与叙事 / 发言分离；不迁机器人、不复制人格Prompt、不自动增加后台模型调用。保留现有静默与费用上限 |
| 娱乐：`web/lib/game/worlds/`、`events/`、`draws/`、`exploration/perception.ts`；已有创作 / 抽卡 / 事件 / 人物隔离，长期自然度未验收 | [SillyTavern](https://github.com/SillyTavern/SillyTavern) M；HDS / DSH S | 世界书预算、角色资料分层仅设计参考。没有实际角色卡交换需求就不做导入器；不替换宿主结算，不把世界书全部注入人物，不平行维护第二背包或剧情事实库 |
| 记忆 / RAG：`web/lib/knowledge/retrieval.ts`、`web/lib/memory/domainPolicy.ts`、资料仓库；当前词法检索，跨表述召回仍有提升空间 | [Mem0](https://github.com/mem0ai/mem0) M；[Haystack](https://github.com/deepset-ai/haystack) M；[pgvector](https://github.com/pgvector/pgvector) M | 先保留现状。若中文召回基准不足，再优先评估原Postgres上的向量列 / 混合检索，不再放一套外部记忆事实库。Embedding模型、迁移、删除失效与重建成本另测 |
| 学习：`web/lib/memorization/domain.ts`、`learningTools.ts`、`spelling.ts`；固定1/3/7/14天不考虑个人历史 | [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) S/P；沿用[KaTeX](https://github.com/KaTeX/KaTeX)已用依赖 M | FSRS是直接算法库的首选后续项，非整个平台迁移。抽背、拼写、题库和宫殿保留；状态 / 自评与最大间隔需明确，不额外再找整套学习站凑候选 |
| 任务 / 打卡：`web/lib/tasks/schedule.ts`、行动 / 通知Worker；当前仅上海时区的单次 / 每日 / 每周，复杂周期尚无明确需求 | [rrule](https://github.com/jkbrzt/rrule) S/P；[Temporal TS SDK](https://github.com/temporalio/sdk-typescript) M；[ntfy](https://github.com/binwiederhier/ntfy) M | rrule可补复杂复发但现阶段不接；Temporal需额外服务与执行语义，暂不采用；ntfy不能自动解决卓易通后台通知。保留Worker、行动记录及投递回执，不把送达当完成 |
| 新闻 / 书籍 / 反思：`web/lib/tasks/personalBriefingGenerator.ts`、`bookRecommendationGenerator.ts`；结构化来源已有，RSS与正文清洗可补 | [RSSHub](https://github.com/DIYgod/RSSHub)、[rss-parser](https://github.com/rbren/rss-parser)、[Readability](https://github.com/mozilla/readability)、[Open Library](https://github.com/internetarchive/openlibrary) 均M | 优先小组件验证rss-parser / Readability；Open Library仅书目来源候选，中文覆盖、接口限流未验收；RSSHub按确有路由需要再独立部署。反思质量仍靠问题筛选，不因接内容库就自然变好 |
| 专业问答 / 搜索：`web/lib/search/webSearch.ts`、`web/lib/tools/sourceTools.ts`、现有Markdown / KaTeX | [LangChain.js](https://github.com/langchain-ai/langchainjs) M；KaTeX（已使用）M | 保留现有搜索 / 引用 / 工具契约与公式渲染。无必要用另一套Agent运行时包装全部请求；不把通用框架当正确性验证器，暂无新增依赖 |
| UI / 编辑器：`web/components/ui/Disclosure.tsx`、`ModuleDirectory.tsx`、R8独立子页；真实手机易用性待统一验收 | [Radix Primitives](https://github.com/radix-ui/primitives) M；[dnd-kit](https://github.com/clauderic/dnd-kit) M | 可访问复杂弹层 / 排序出现真实缺口再按组件引入，不整站搬迁。现有折叠 / 归属导航保留，不为了组件库再造平行设计系统 |
| 插件 / Provider / Token：`web/lib/plugins/activityRegistry.ts`、`web/lib/ai/server/modelProvider.ts`、用量与预算 | [AstrBot](https://github.com/AstrBotDevs/AstrBot) M；[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) M；MaiBot S（消息 / 记忆模块） | 借鉴生命周期、稳定上下文分层；现有第一方插件与受控工具保留。不同宿主的插件不能直接装入；不引入第二凭据库、不让“缓存命中”掩盖总Token增加，不建设公开插件市场 |
| APK / 平台：`web/lib/platform/`、`web/lib/notifications/`、`web/android/`；本地Bundle已有，后台 / Huawei差异待真机 | [Capacitor](https://github.com/ionic-team/capacitor) 已用依赖M；ntfy M | 继续共享React + 薄桥接，不双端重写。Capacitor已有插件优先，但杀进程、Doze、厂商限制不能由JS库的README证明解决；Huawei Push / ArkWeb仍按独立平台任务实施 |

## 4. R11.2：重点核验

### 4.1 MaiBot：学消息和记忆边界，不迁入另一套机器人

固定 `5c7637e6913c84d1c3d5e742fa9e95a7e70d3501`；查询时最新GitHub release为v1.3.12。默认分支树有446个测试样式路径及16个工作流文件，**未运行这些测试、未检查每项CI状态**。

- [planner_messages.py](https://github.com/Mai-with-u/MaiBot/blob/5c7637e6913c84d1c3d5e742fa9e95a7e70d3501/src/maisaka/context/planner_messages.py)：消息前缀携带消息 / 会话 / 引用 / 时间 / 人物身份，属性转义，避免把自然语言中的自称当成真实发送者。适合借鉴结构化来源，不是直接复制说话口吻。
- [heuristic_injector.py](https://github.com/Mai-with-u/MaiBot/blob/5c7637e6913c84d1c3d5e742fa9e95a7e70d3501/src/maisaka/memory/heuristic_injector.py)：配置开关、TTL / 最小间隔 / 新消息阈值、上下文长度上限；调用工具模型生成印象后检索，按会话 / 人物和跨会话许可过滤。**多一步模型会有额外Token**；TTL不替代资料版本与分支失效。本项目仍先做域 / 祖先 / 修订过滤，不能照搬群聊放行规则。
- [pyproject.toml](https://github.com/Mai-with-u/MaiBot/blob/5c7637e6913c84d1c3d5e742fa9e95a7e70d3501/pyproject.toml)：Python≥3.12，另有SQLModel / FastAPI / faiss等运行依赖；不是可直接import的TS人格库。仓库GPL标识外还存在[EULA与组件说明](https://github.com/Mai-with-u/MaiBot/blob/5c7637e6913c84d1c3d5e742fa9e95a7e70d3501/EULA.md)，实际复制需逐文件核对。

结论：只借鉴设计，不接其数据库、群聊调度或整套插件运行时。未验证私人一对一自然度、其语音插件效果或对本项目的净成本收益。

### 4.2 幕间系统：机会窗口不是“随时主动说话”

HDS镜像固定 `ab043c4d4ff5827a815ba1520a3e15b8ca159e78`；包0.1.4、Koishi peer ^4.18.7，23个测试样式路径，未发现工作流文件 / GitHub正式release。**这是镜像，不代表已经与Gitee原始上游逐提交同步验证。**

- [架构](https://github.com/euphoriaaaaaa1/hds-interlude/blob/ab043c4d4ff5827a815ba1520a3e15b8ca159e78/docs/ARCHITECTURE.md)：生活叙事、现实回复分层；主叙事、连续性、事实 / 后果、私有视角、行动窗口、日程预案组合，持久层有13张SQLite表。单进程队列不能直接当多实例分布式锁。
- [agency.ts](https://github.com/euphoriaaaaaa1/hds-interlude/blob/ab043c4d4ff5827a815ba1520a3e15b8ca159e78/src/agency.ts)：候选需来源和许可，检查窗口到期、设备可用性、负载、私密性与冷却，发送前重新判定。不应复制其中承诺对冷却的特殊放行来绕过本项目静默 / 每日额度；**角色虚构日程也不证明用户此时方便。**
- [schedule-preplan.ts](https://github.com/euphoriaaaaaa1/hds-interlude/blob/ab043c4d4ff5827a815ba1520a3e15b8ca159e78/src/schedule-preplan.ts)：无新依据且已有覆盖时跳过模型；明确记录已审查但为空的结果，防止空结果不断触发生成。这比后台不停模拟生活更适合本项目的成本目标。
- 架构的cache-first前缀思路可以学习，但重复recentExchange会增加输入量，须看总费用而非只看命中率；其blindMode隐藏调试 / 日志的做法不采用，保留用户可解释性。
- [DSH移植差异](https://github.com/Dacangshu987/dsh-hds-interlude/blob/ff8a33ea9a0735fb19ce1487e1068cf779627fca/MIGRATION.md)：叙事正文与`interlude_say`分离值得参考；迁移说明明确部分continuity snapshot只有读取 / 类型而无写入、embedding / 场景压缩等未实现，不能把两版功能混为一谈。其132个测试样式路径不等于本项目集成测试已通过。

两版AGPL；本轮未复制代码 / Prompt。拟采用的只是独立实现的机制：少量有来源的机会信号、空结果缓存、明确的发言字段。不是把幕间模块插入R10人物请求；其SQLite / Koishi或DeepSeek Harness宿主与现有API不兼容。

### 4.3 CosyVoice：服务候选，不是现成网页声音插件

固定 `074ca6dc9e80a2f424f1f74b48bdd7d3fea531cc`；查询未见GitHub正式release，目录有1个测试样式路径，lint / stale工作流不证明推理质量。已检查Apache-2.0代码许可，**未完成具体权重、数据集及目标声音授权核查**；GPT-SoVITS仅候选筛选，未做同等源码 / 推理审查。

- [FastAPI示例](https://github.com/QwenAudio/CosyVoice/blob/074ca6dc9e80a2f424f1f74b48bdd7d3fea531cc/runtime/python/fastapi/server.py)：使用表单 / wav上传参数；生成器把采样转int16并输出原始PCM字节，不是附带采样率的WAV文件。示例`StreamingResponse`不自动证明模型边生成边首包返回，调用未显式开启推理`stream=True`；不能直接喂给HTML audio当WAV播。
- [推理类](https://github.com/QwenAudio/CosyVoice/blob/074ca6dc9e80a2f424f1f74b48bdd7d3fea531cc/cosyvoice/cli/cosyvoice.py)：有独立stream / speed控制，采样率来自配置；缺CUDA时可关JIT / TRT / fp16，不等于CPU实时性已测。AutoModel缺模型路径可触发下载，所以本轮没有import启动它。
- [依赖](https://github.com/QwenAudio/CosyVoice/blob/074ca6dc9e80a2f424f1f74b48bdd7d3fea531cc/requirements.txt)：PyTorch / torchaudio与按平台启用的GPU依赖，不适合打进React / APK。示例CORS和监听方式也不能照搬为项目部署策略。

现有`SpeechOutputAdapter.provider`固定为`system`，并非已经支持任意TTS；正式接入需明确服务端合成API、音频容器 / MIME / 采样率、字符与音频长度、AbortSignal、播放代际ID与取消后迟到音频丢弃。保留原设备TTS为用户可选项而非失败后悄悄切换音色；服务未配置 / 不可达时明确提示。缓存键至少包括文本、音色 / 模型版本和语速；声音 / 陪伴文本不能因缓存跨用户泄露。

结论：先确认笔记本CPU / GPU / 内存及声音偏好，再在隔离服务测首段延迟、实时率、资源和主观音色；当前不安装Python / CUDA、不下载模型、不承诺离线手机本地推理。

### 4.4 FSRS / rrule：以实际发布包为准

- ts-fsrs默认分支当时在新版本开发，不能把main的要求套到所有版本。**本轮实际执行npm 5.4.2，声明Node≥20，已在现有Node22镜像做冒烟检查**；无需为了它升级项目Node。MIT、无生产依赖。默认分支35个测试样式路径 / 10个工作流，不是发布包测试已全部执行。[发布入口](https://github.com/open-spaced-repetition/ts-fsrs/releases/tag/v5.4.2)、[实际包](https://registry.npmjs.org/ts-fsrs/5.4.2)。
- rrule npm **2.8.1**与GitHub最新release **v2.7.1**不同，不能混写。仓库最近推送2024-06，维护活跃度弱于前者，不能保证未来修复时效。GitHub的`NOASSERTION`不能直接当无许可：发布包`LICENCE`实查BSD三条款及python-dateutil版权告知；声明tslib依赖，所测UMD包含运行实现，未另外安装。[仓库](https://github.com/jkbrzt/rrule)、[实际包](https://registry.npmjs.org/rrule/2.8.1)。

这里只对已执行发布包作版本 / 行为结论；GitHub main的commit及包内容指纹分别记录，**不声称main就是所测发布包**。

## 5. R11.3：两个真实隔离实验

实验仅加载忽略目录中的第三方发布包，不进入package.json / lockfile / APK / Docker产物；没有数据库或真实聊天。脚本校验压缩包SHA512、执行bundle SHA256及版本；缺失或不匹配立即失败，不自动下载 / 安装，也不伪装为跳过后通过。

### P1 — FSRS替代固定复习间隔的可行性

用固定日期2030-01-01、关闭fuzz，检查四档预览、输入不变、重放、`repeat` / `next`一致、JSON日期显式恢复、遗忘与成功差异、12次合成复习。首次Again / Hard / Good / Easy分别落在1分钟 / 6分钟 / 10分钟 / 8天；现有40 / 70 / 85 / 95分为1 / 3 / 7 / 14天。**这两套输入含义不同，不构成“FSRS让同一次评分更准确”的质量证明。**

12次Good按到期日推进时，stability随历史增长；这是加速模拟，最终甚至跨数百年，反映默认最大间隔36500天而非合理学习计划。接入时须明确短期学习步骤与有界最大间隔，不能照搬默认值。现有最多40条attempt、不含stability / difficulty / state等字段，不能凭lastScore重建真实历史；冷启动与已有nextReviewAt应由迁移策略解释。

`probe-results.json`记录12次算法调用约0.37ms（不含导入 / IO）；bundle 61,245字节，不等于gzip或最终Bundle增量。真实学习收益、负担、提醒频率、参数拟合和用户自评体验未测。算法无网络 / Token，取消 / 播放不适用；生产需在服务端写入状态，React只展示自评 / 预览，不给客户端另写调度真相。

试验初稿曾直接deepEqual整个`repeat()`返回对象而失败；查源码发现其含新绑定的`Symbol.iterator`函数。现已按四档**数据**比较，未通过删掉重放断言掩盖问题。

### P2 — rrule与现有任务规则对照

32组规则（4个时刻 × 每日及7个星期）× 6个边界＝**192次一致**；包含跨年、闰日、上海午夜、恰到期及±1毫秒。额外用有限COUNT验证每月最后一个工作日的三个日期，证明新表达能力，不代表已提供新UI。

比较适配仅固定上海UTC+8，以已知星期一的UTC时刻作锚点，**不声称支持TZID / DST / 多时区 / iCalendar导入 / 异常日期**。原实现适合当前范围；当前累计约0.79ms、候选查询约225.52ms（192次，旧锚点需遍历，含其缓存策略影响），只是一次进程内测量，不能推广为库整体速度排名。130,524字节bundle也是未压缩测量。

结论：可用但现需求没有净收益，保留现有`normalizeTaskSchedule`；直到用户需要每月 / 隔周 / 例外日再另做有界适配。rrule解决规则展开，不解决Worker认领、离线通知、重复投递或用户是否完成。未来规则必须限输出 / 计算范围，不对无穷规则调用`all()`。

### 环境与复现

完整探针实测环境：Windows宿主Node **v24.15.0**、Asia/Shanghai；项目部署仍Node22。另用已有`agent-web-web`镜像，在**Node v22.23.3、无网络、只读挂载**下执行FSRS四档确定性及rrule三日期冒烟通过，**这不是Node22下重复完整192次对照**。不以本机Node版本悄悄修改支持矩阵。

仓库根目录准备（只获取固定发布包，不运行生命周期脚本；目录是忽略的实验缓存）：

```powershell
New-Item -ItemType Directory -Force .r3-eval/r11/vendor/fsrs, .r3-eval/r11/vendor/rrule
npm pack ts-fsrs@5.4.2 rrule@2.8.1 --ignore-scripts --pack-destination .r3-eval/r11/vendor
```

先按`repositories.json`的integrity核验两个tgz；解压前用`tar -tzf`检查所有成员只在`package/`内（允许根目录成员`package`，不允许绝对路径 / `..`），再分别解到`vendor/fsrs`与`vendor/rrule`。不要将实验包放入`web/node_modules`或提交Git。两个包完整展开合计约1.4MB；没有语音模型下载。

```powershell
tar -xzf .r3-eval/r11/vendor/ts-fsrs-5.4.2.tgz -C .r3-eval/r11/vendor/fsrs
tar -xzf .r3-eval/r11/vendor/rrule-2.8.1.tgz -C .r3-eval/r11/vendor/rrule
cd web
npx tsx scripts/r11-reuse-probe.ts
```

脚本会重写`docs/r11/probe-results.json`的测量时间与结果（生成证据，不是业务状态）；不要为每次本地重跑无意义地提交时间差。普通`check`不依赖此缓存，不会联网拉取这些候选。

## 6. R11.4：有界后续任务（提案，未自动启动）

这些是下一次用户选择任务的输入，不把调研报告膨胀为新平台。实际排序只在[产品主线](../PRODUCT_MAINLINE_GUIDE.md)维护。

| 提案 | 最小交付 / 接入契约 | 验收与退出条件 |
|---|---|---|
| F01 背书FSRS接入 | 固定5.4.2；unit附算法版本与卡片状态，独立review log；新增用户四档自评，百分制仍是质量反馈；保留材料 / 尝试 / 原到期信息，明确冷启动与一次性迁移 | 新 / 旧材料、遗忘 / 逾期、并发幂等、取消与双端刷新一致；设产品最大间隔、逐步验证真实负担。必要时前向修复 / 还原备份，不永久维护两个默认算法；需单独授权生产依赖和迁移设计 |
| F02 中文可控音色实验 | 先确认硬件 / 声音风格与音源授权；CosyVoice / GPT-SoVITS最多各一小组固定文本，独立服务，不改系统TTS默认 | 朗读 / 陪伴 / 中英 / 数字各类短样本，首段 / 实时率 / CPU-GPU内存 / 停止后无迟到播放 / Web与APK试听；未达标则不集成。用户先确认软件下载、权重许可、资源和可能费用 |
| F03 陪伴机会窗口 | 在现有proactivity policy前复用其开关 / 静默 / 额度，增有来源、到期、已审查空结果的有限信号；只限陪伴，分开叙事草稿与可发送文本 | 相同依据不重复生成；拒绝 / 静默 / 费用上限不被角色承诺绕过；对照自然度与净Token，不加入无界生活模拟。没有实际改善就保留当前策略 |
| F04 RSS / 正文提取小闭环 | 先用合成 / 公共固定页面测rss-parser与Readability；仅将清洗后的带URL / 时间 / 标题内容交给原来源工具，不另建事实库 | 中文正文、空正文、重定向、超时、重复条目、注入文本与体积上限；不执行页面脚本，不以抓取等于证实。无有效覆盖增益就不加依赖 / RSSHub服务 |
| F05 检索向量化门槛实验 | 复用R5语料与域 / 分支 / 删除过滤；只有跨表述召回不足才评估pgvector + 单个Embedding来源；Mem0 / Haystack暂不进生产 | 比词法基线的召回 / 引用准确性 / 净成本与删除失效。先做只读候选索引，不能用召回率提升换取跨域泄露；不达门槛保留现状 |

**建议优先F02确认语音体验所需条件，或F01增强学习复习；由用户选择，不在本次继续安装。** rrule、Temporal、整套机器人 / 前端迁移不列为自动开发项；角色卡交换、拖拽编辑没有需求就不创建空适配层。

## 7. 许可、成本和数据边界

本轮没有把第三方业务源码、Prompt、模型或音频复制进产品；只提交自编实验脚本、元数据和合成结果。研究设计不等于取得复制授权；正式接入时保留MIT / BSD / Apache的必要通知，GPL / AGPL组件需按具体文件、修改和分发 / 服务方式核查义务，不简单宣称“自用就没问题”或“独立服务就自动免除义务”。权重、数据集和声音本人授权分别确认。`NOASSERTION` / SPDX与Star不能代替此步骤。

收费调用0、模型Token0；累计¥3账本不变。未读取密钥、私人聊天或生产库，未执行迁移、清理localStorage、开启自动发言或安装生产依赖。没有新Python / GPU / 云支出。重点候选的长期维护、全部issue、安全漏洞及真实音色效果仍未知；这是诚实的采用门槛，不将未测项写成已通过。

## 8. 交付验证

| 检查 | 本次结果 / 范围 |
|---|---|
| `npx tsx scripts/r11-reuse-probe.ts` | 通过，真实固定发布包 / 合成输入；四档 / 历史 / 存储恢复、192次对照及3个复杂规则日期 |
| Node22只读 / 无网络容器冒烟 | 通过，v22.23.3；只验证四档确定性及3个日期，不冒充全量实验 |
| `npm run check` | ESLint、TypeScript、166测试文件 / **704测试**通过，含合成PGlite SQL；没有访问生产库 |
| Web生产构建 | `npm run build`通过（Next.js 16.3.4 / webpack），类型、静态页面与构建追踪完成；不代表生产服务已启动 |
| APK重包 | `mobile-build-debug.ps1`：Vite 626模块、Capacitor sync、Gradle `BUILD SUCCESSFUL`（245 tasks，24 executed）；不是只拿旧包改名 |
| APK内容 / 签名 | 107个本地Bundle文件逐一匹配APK内SHA256，`webDir=mobile-dist`、无`server.url`、API Origin正确；apksigner验证通过，v2签名，1个签名者 |

APK为 `web/android/app/build/outputs/apk/debug/app-debug.apk`，5,710,237字节，SHA256：

```text
B5B742AD396406F6C7696C07B0F6C6EFAB91EA74C2EA4254C70111A054650D17
```

本轮未改业务资源，因此重新执行构建后的APK与上次R10包指纹相同是预期结果，不代表没有重新构建，也不声称APK已含FSRS / 新TTS。构建出现现有的Zod注释位置 / Gradle flatDir非阻断提示，未为此扩展工具链整改。

本轮没有业务 / API / schema / Prompt改动，Docker镜像不需要因文档 / eval重建；检查时没有运行中的项目容器，不声称做过生产服务 / 数据持久性验收。Tailscale Serve仍为私网HTTPS代理到localhost:3000；Serve存在不等于后端已启动。没有UI或API改动，本轮不重复整套浏览器旅程。

真机安装、声音试听、后台 / 系统清理后通知与D01–D10仍在统一验收待办；APK重新构建不等于这些项目通过。
