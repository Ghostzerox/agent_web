# Android Debug APK 开发与安装

- 当前阶段：Mobile M1.3 本地通知发布加固代码已完成；2026-10-17 按用户要求暂缓真机回归，统一合并前期、R5.6 与后续设备检查
- 构建类型：仅 Debug APK，不是可发布签名版本
- 应用 ID：`com.ghostzero.aistudycompanion`
- 最近大阶段重包：2026-10-21 R12，构建 / 110个Bundle文件逐项核对 / APK v2签名通过，未安装；大小与SHA-256见[R12报告](reports/R12_REPORT.md)。历史R10证据仍见[R10报告](reports/R10_6_REPORT.md)。

真机测试的排期、历史结果和合并清单见 [真机验收统一待办](DEVICE_ACCEPTANCE_BACKLOG.md)。以下矩阵保留操作细节，恢复测试时集中执行，不要求现在逐项操作；暂缓不等于通过，不阻塞后续无关功能开发。

## 大阶段交付约定

2026-10-20用户明确：**每个大阶段更新完成后重新打包Debug APK；只有安装与真机测试留到统一验收。**不把“手机暂不测试”理解成“只构建React Bundle、不生成APK”。使用下述现有一键脚本，校验本地资源和API Origin，记录源提交、构建结果、APK路径 / 大小 / SHA-256；交付时提供本地包链接。APK仍不提交Git，不自动安装、不运行ADB设备测试。构建失败需明确说明，不能用旧包或Bundle成功冒充最新APK。

## 当前架构

当前 APK 内置由 Vite 构建的本地 React Client 与 Capacitor Bridge，不再通过 `server.url` 加载远程网页。Chat、Task、Inbox、通知、主动问候、学习/娱乐插件与凭据页面复用 Web 端组件，通过共享 API Client 调用笔记本上的 Next.js `/api/v1/*`；模型密钥、数据库、Scheduler、Plugin Registry 与 Worker 仍只存在服务端。

Phase 6.5 新增 `/entertainment/quick-adventure` 本地路由。真机回归需覆盖：启用规则包并授权隔离存储、Web/APK 配置同步、两种模板预览、确认后进入正确会话和一次故事检定。预览不消耗模型 Token，故事需要服务端模型配置；完整范围见 `GAME_RULE_PACKS.md`。

移动端使用 Hash Router，本地界面即使暂时连不上笔记本也能启动并显示连接诊断。需要服务端事实数据或模型的操作仍必须联网；本地 Bundle 不是数据库副本，也不伪造离线写入成功。R9.2 已删除 remote-shell / spike 打包轨；API 地址仍使用 VITE_API_BASE_URL。

## 已安装工具

| 工具 | 当前值 |
|---|---|
| Android Studio | `2026.1`，`E:\development\Android\Android_Studio` |
| Android SDK | `E:\development\Android\sdk` |
| Compile/Target SDK | 36 |
| Minimum SDK | 24 |
| Gradle | 8.14.3 |
| 构建 JDK | Microsoft OpenJDK 21 LTS，`E:\development\Java\microsoft-jdk-21\jdk-21.0.12.1+1` |
| Capacitor | 8.5.2 |

Android Studio 2026.1 自带 JDK 25，但当前 Gradle 8.14.3 不能运行 Java 25 class file，因此项目构建显式使用 JDK 21。不要为了本项目覆盖系统 Java 8；构建脚本只在自己的进程内设置 `JAVA_HOME`。

## 一键重建 Debug APK

先确认 Docker Desktop、项目 Compose 服务和 Tailscale 正在运行，然后在仓库根目录执行：

```powershell
.\scripts\mobile-build-debug.ps1 `
  -ApiBaseUrl "https://<你的设备名>.<你的-tailnet>.ts.net"
```

脚本会：

1. 检查 JDK 与 Android SDK。
2. 把 Tailscale HTTPS Origin 作为 `VITE_API_BASE_URL` 构建本地 React Client。
3. 同步本地静态产物、Capacitor 插件和原生配置。
4. 验证生成配置使用 `mobile-dist` 且不含 `server.url`。
5. 生成 Debug APK，并从 APK 内再次验证本地 `index.html`、无 `server.url` 以及预期 API Origin，然后输出 SHA-256。
6. 构建结束后恢复当前终端原有的环境变量。

交付测试包必须使用上述一键脚本，避免忘记注入 API Origin 或误把旧 remote-shell 配置打进 APK。

APK 输出：

```text
web/android/app/build/outputs/apk/debug/app-debug.apk
```

APK 被 Android 工程的 `.gitignore` 排除，不提交到 GitHub。每次重新生成后应重新核对哈希。

## 安装到手机

### 文件安装

1. 把 `app-debug.apk` 传到手机。
2. 允许文件管理器/卓易通安装未知来源应用。
3. 安装 `AI Study Companion`。
4. 手机登录同一 Tailscale Tailnet，并确认电脑节点在线。
5. 电脑启动 Docker Desktop 和项目 Compose 服务后再打开 APK。

### USB ADB 安装

手机开启开发者选项和 USB 调试，连接电脑并确认授权，然后执行：

```powershell
E:\development\Android\sdk\platform-tools\adb.exe devices -l
E:\development\Android\sdk\platform-tools\adb.exe install -r `
  "D:\Visual Studio Code\project\agent_web\web\android\app\build\outputs\apk\debug\app-debug.apk"
```

当前检查时没有连接 ADB 设备，因此尚未自动安装或完成真机启动测试。

## 每次电脑重启

需要运行：

1. Docker Desktop。
2. 项目 Compose 服务：`docker compose --env-file .env.selfhost up -d`。
3. Tailscale，保持登录和 Serve 配置有效。

手机端需要 Tailscale/卓易通环境可用。服务端健康检查地址：

```text
https://<你的设备名>.<你的-tailnet>.ts.net/api/v1/health
```

## M0.3 真机验收矩阵

首轮华为手机/卓易通结果：登录、Chat SSE 流式输出、数学公式和树形分支通过；网页 Web Push 未弹窗。文件导出已经实现；Phase 5.4 设备系统语音已经进入 APK，但音线枚举与播放仍待统一真机验收。HMS Push 尚未实现，不计为通过。

## M0.4 本地通知验收矩阵

- `/tasks` 使用循环式时/分双滚轮选择时间，触摸惯性滚动后自动吸附，支持跨越 `23/00` 和 `59/00` 边界。
- 在 APK 内点击“开启本地提醒”，系统权限状态显示为已开启。
- 创建 3–5 分钟后到期的一次性任务；前台、后台、锁屏各验证一次。
- 点击通知后打开 `/tasks` 并滚动到对应任务。
- 修改任务时间后旧提醒不再触发；暂停、删除任务后系统待处理提醒被撤销。
- 每天、每周规则在系统层保持重复；手机重启后待处理提醒仍存在。
- 拒绝权限时应用不把任务保存误报为失败，并给出系统设置指引。
- 未授予精确闹钟权限时记录 Capacitor 的降级警告；提醒允许回退为非精确调度。

### 快速诊断（无需等待一天）

在 APK 的 `/notifications` 展开“通知诊断”，每轮点击“10 秒通知测试”，依次验证：

1. 保持应用前台；
2. 切到后台但保留最近任务；
3. 从最近任务列表划掉应用；
4. 使用华为系统清理。

安排后应先看到“测试状态：待发送”，弹出后不要点击或清除通知，手动重新打开应用并刷新，应看到“已送达”。Android 的已送达列表只包含仍留在通知栏中的通知，点击或划掉后会恢复为“无记录”。要验证取消路径，安排测试后立即点击“取消测试”，等待 10 秒确认没有弹出。任务本身的暂停/删除可创建 2–3 分钟后到期的一次性任务后立即暂停或删除，无需等到每日任务的次日时间。

当前 HarmonyOS 5 / 卓易通实测为前台、后台成功，系统清理后失败。如果仅第 4 组失败，说明系统清理很可能将兼容层应用置于类似 Android 强行停止的状态；下一步应验证系统自启动/后台运行白名单，并评估 Huawei Push 或 ArkTS 代理提醒，而不是增加耗电且不可靠的常驻保活服务。

本地通知只提醒已同步的任务时间。AI 主动聊天、每日新闻、书籍推荐等服务端新内容仍需要 Huawei Push Kit。

## M1.2 Prompt 导出验收

1. 在 Chat 中新建会话并成功发送一次消息；此前“导出 Prompt”按钮应保持禁用。
2. 点击“导出 Prompt”，确认窗口显示最近一次请求的模型和捕获时间。
3. 导出 JSON：Web 应下载 `.json`；APK 应打开系统分享面板并提供 `.json` 文件。
4. 导出 Markdown：APK 应同样提供可分享的 `.md` 文件，中文与数学符号保持正常。
5. 未勾选“包含个人记忆上下文”时，文件中的 memory 内容应显示为脱敏占位符；显式勾选后才包含完整记忆。
6. 文件中可以出现 Provider、Base URL、Model 和 Request ID，但不得出现 API Key、Authorization Header、数据库连接或 Push Token。
7. 页面刷新后导出按钮重新禁用；M1.2 不把敏感 Prompt 存入 localStorage 或 PostgreSQL，需要再次发送消息生成新快照。

当前 AI 回复不会出现在同一次 Prompt 导出中，这是请求时序的真实结果：模型回复在请求发出后才产生。下一轮请求会把它作为 Conversation 历史带入。未来若需要同时保留请求和响应，应新增独立的 Run 导出，不能修改 Prompt 快照语义。

APK 使用 Capacitor Filesystem 将 UTF-8 文件写入应用 Cache，再通过 Share 插件打开系统分享面板，不申请公共存储权限。分享后的目标副本由用户选择的应用管理。

## Phase 5.4 设备语音验收

1. 从“人格设置”进入“语音”，确认页面能列出华为手机/卓易通当前提供的系统音线；若显示不支持，记录系统版本与 WebView/卓易通版本。
2. 选择一条中文音线，分别调整语速、音高和音量，点击“试听音线”，确认可以播放并能立即停止。
3. 保存后进入 Chat，对一条已经生成完成的回答点击“朗读”；切到另一条回答时，前一次播放应停止。
4. 用包含公式、代码块与来源链接的回答测试：公式应读作提示、代码块应省略、URL 不应逐字符朗读。
5. 关闭系统媒体音量或让系统 TTS 临时不可用，确认文字答案仍保留，只有朗读入口显示失败。

系统音线由设备决定；桌面保存的 voice ID 在手机不存在时会按语言回退，不视为数据丢失。当前版本不自动朗读、不克隆真人声音，也不会把回答正文上传到第三方 TTS。

## M1.3 本地通知可靠性验收

M1.3 增加设备端最小提醒快照、离线回退同步、精确闹钟设置入口，并让 Android 在开机、手动校时、时区变化和应用覆盖安装后重新注册原生提醒。

1. **前台基线**：安排 10 秒测试并保持应用前台，通知应弹出，诊断由“待发送”变为“已送达”。
2. **后台**：再次安排测试后回到桌面，通知应弹出。
3. **划掉应用**：再次安排测试，从最近任务中划掉 APK；通知仍应由 Android 系统弹出。
4. **断开服务端**：先确保任务已在线同步，再关闭电脑 Docker 或断开手机 Tailscale；重新打开 APK 的通知页，应显示“设备离线缓存”，已同步提醒仍存在。
5. **重启手机**：安排一个至少两分钟后的测试或近期任务，重启手机并解锁，等待原定时间；Android Boot Receiver 应恢复提醒。
6. **时间与时区**：保留一个重复提醒，修改系统时区或手动校时后打开一次 APK；系统广播与前台 reconcile 应重新核对提醒。
7. **精确闹钟**：诊断显示“未允许”时点击“打开精确闹钟设置”；返回后应显示“已允许”。未允许时系统可降级为非精确提醒，因此可能延迟。
8. **覆盖安装**：不卸载旧版，直接安装新版 APK；设备缓存和任务提醒应继续存在。
9. **华为省电**：在应用启动管理中允许自启动、关联启动和后台活动，并把电池优化设为不允许优化，再重复后台与划掉应用测试。

“从最近任务划掉”和系统“强行停止”不是同一行为。划掉后系统闹钟应继续；强行停止会由 Android/HarmonyOS 冻结应用、闹钟和广播，任何普通 APK 都不能继续本地通知，必须手动重新打开应用。AI 主动消息仍需要后续 Huawei Push Kit。

## 安全边界

- APK 内不包含模型 API Key、数据库连接、Credential Master Key 或 Huawei 服务端凭据。
- Debug APK 使用 Android Debug 证书，只用于个人测试，不可发布应用商店。
- 正式 Debug APK 使用本地 `mobile-dist` 且没有 `server.url`；不再提供 remote-shell / spike 构建配置。
- Tailscale API Origin 不是认证 Token，会作为连接地址编译进个人 APK，但不会写入 Git；API Key 与服务端密钥不会进入移动产物。
- 服务端 API 默认只为 Capacitor 的 `https://localhost` Origin 返回 CORS 许可；可通过 `MOBILE_ALLOWED_ORIGINS` 显式收窄或扩展。
- 未来离开 Tailscale 或支持多人前，必须先增加设备认证、Token 撤销与严格 Origin/CORS 策略。
