# 单用户自托管运行手册

当前基线由 Docker Compose 中的 Next.js Web/API、独立 Reminder Worker、PostgreSQL 与内网 SearXNG 搜索服务组成，面向个人笔记本运行，并保留未来迁移到云主机时不改领域代码的路径。手机远程访问首选 Tailscale 私有网络；数据库和搜索服务不映射宿主机端口，Web 默认只绑定 localhost。

## 1. 前提

- 安装 Docker Desktop（Windows/macOS）或 Docker Engine + Compose Plugin（Linux）。
- 在笔记本和需要访问的手机上安装 Tailscale，并登录同一个 Tailnet 账号。
- 笔记本重启后要自动恢复服务，需要让 Docker 与 Tailscale 随系统启动；Compose 服务已设置 `restart: unless-stopped`。
- 当前版本没有应用登录鉴权。不要做公网端口转发，也不要启用 Tailscale Funnel。

## 2. 首次启动

在仓库根目录执行：

```powershell
Copy-Item .env.selfhost.example .env.selfhost
```

编辑 `.env.selfhost`：

- 为 `POSTGRES_PASSWORD` 生成长随机密码，并同步修改 `DATABASE_URL`；密码含 URI 保留字符时需要 URL 编码。
- 为 `CREDENTIAL_MASTER_KEY` 生成 32 个随机字节的无填充 base64url 字符串。PowerShell 可使用：

```powershell
$bytes = New-Object byte[] 32
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
$rng.Dispose()
[Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_')
```

- 启动后在 /api-key 页面填写并保存模型配置；R9.2 起不再提供环境模型凭据兜底。现有 Vault 无需重填；旧环境变量即使保留也不再生效。
- 为 `SEARXNG_SECRET` 设置另一条长随机字符串。`WEB_SEARCH_BASE_URL=http://search:8080/` 保持默认值即可。
- 保持 `APP_BIND_ADDRESS=127.0.0.1`。Tailscale Serve 可以代理 localhost，无需将应用暴露到整个局域网。

启动并构建：

```powershell
docker compose --env-file .env.selfhost up --build -d
docker compose --env-file .env.selfhost ps
docker compose --env-file .env.selfhost logs --tail 100 web
docker compose --env-file .env.selfhost logs --tail 100 worker
```

Web 与 Worker 容器都会等待 PostgreSQL 健康，并通过数据库迁移锁安全地先完成迁移；需要搜索的 Web 对话和个人简报还会等待内部 SearXNG 启动。首次启动会下载官方 SearXNG 镜像，它只接受 Compose 内部请求。电脑本机打开 `http://127.0.0.1:3000/api-key` 测试并保存模型凭据，之后可使用 `/chat`、`/tasks`、`/inbox`、`/notifications` 与 `/proactivity`。Worker 默认每 5 秒扫描到期任务和待投递通知、每 60 秒按已保存策略检查主动问候，网页关闭后仍运行；主动问候默认关闭。可通过 `PROACTIVITY_POLL_INTERVAL_MS` 在 5000–3600000 毫秒内调整检查周期。Web Push 启用与真机排障见 `WEB_PUSH.md`。

## 3. Tailscale 手机私有访问

完成电脑端与手机端安装、登录后，在 Windows 管理员 PowerShell 执行：

```powershell
tailscale serve --bg localhost:3000
tailscale serve status
```

命令会返回仅 Tailnet 内可访问的 HTTPS 地址。在手机开启 Tailscale 后，访问该地址的 `/api-key`、`/chat`、`/tasks` 或 `/inbox`。此方案保留 `APP_BIND_ADDRESS=127.0.0.1`，由 Tailscale 提供设备身份、私有路由与 HTTPS。

命令细节与版本变化以 [Tailscale Serve 官方文档](https://tailscale.com/docs/reference/tailscale-cli/serve) 为准。

停用代理：

```powershell
tailscale serve reset
```

安全规则：

1. 使用 `tailscale serve`，不要使用会公开到互联网的 `tailscale funnel`。
2. 只把可信设备加入 Tailnet，并为 Tailscale 账号启用多因素认证。
3. 笔记本必须开机，Docker、Tailscale 和容器必须运行，手机才能访问。
4. 当前应用没有二次登录；同一 Tailnet 中获准访问该设备的成员应被视为可信用户。

如果以后确实只在可信同一 Wi-Fi 使用，也可以将 `APP_BIND_ADDRESS` 改为 `0.0.0.0` 并设置 Windows 防火墙来源限制。但 Tailscale 是当前首选，日常使用不需要修改该变量。

## 4. 健康检查

`GET /api/v1/health` 返回：

- `healthy`：数据库可用，模型配置完整。
- `degraded`：数据库可用，但模型未配置；会话管理仍可使用。
- `unhealthy` + HTTP 503：数据库不可用，容器健康检查会失败。

响应不包含数据库连接串、密码、API Key 或内部异常消息。查看状态：

```powershell
Invoke-RestMethod http://127.0.0.1:3000/api/v1/health
docker compose --env-file .env.selfhost ps
docker compose --env-file .env.selfhost logs --tail 100 search
```

## 5. 停止、升级与重启恢复

```powershell
# 停止容器但保留数据库卷
docker compose --env-file .env.selfhost down

# 拉取代码后重新构建；启动过程自动应用待执行迁移
docker compose --env-file .env.selfhost up --build -d
```

不要执行 `docker compose down -v`，它会删除 PostgreSQL 数据卷。代码更新前先备份；涉及 Schema 变化时阅读对应 CHANGELOG 和 rollback 说明。

## 6. 备份与主密钥

Windows PowerShell：

```powershell
.\scripts\selfhost-backup.ps1
```

Linux/macOS：

```bash
./scripts/selfhost-backup.sh
```

脚本通过容器内 `pg_dump` 生成 `backups/agent-web-<timestamp>.sql`。`backups/` 与真实 `.env.selfhost` 均被 Git 忽略。

数据库备份包含加密后的模型凭据、Push 订阅与 VAPID 私钥，但不包含 `CREDENTIAL_MASTER_KEY`。必须把主密钥另存到密码管理器或其他受保护位置；不要把它直接附在数据库备份旁。丢失主密钥不会影响会话和 Inbox 正文，但现有 API Key、Push 订阅与 VAPID 私钥密文无法解密；模型 Key 需重新保存，所有设备需重新启用系统通知。

至少定期把数据库备份复制到另一块磁盘或受保护的云存储；只保存在同一笔记本上不能防范磁盘损坏。

## 7. 还原演练

还原会替换当前数据库，必须显式确认。先停止写入并核对目标环境与文件：

```powershell
.\scripts\selfhost-restore.ps1 -BackupFile .\backups\agent-web-20260906-120000.sql -ConfirmRestore
```

```bash
./scripts/selfhost-restore.sh ./backups/agent-web-20260906-120000.sql --confirm-restore
```

脚本先验证文件存在且非空、同时停止 Web 与 Worker 写入，再重建 `public` Schema，并让 `psql` 使用 `ON_ERROR_STOP=1`；成功后重新启动 Web 与 Worker。任何 SQL 错误都会返回失败且写入服务保持停止，以避免继续写入不完整数据库。还原时还必须向新环境提供原来的 `CREDENTIAL_MASTER_KEY`，否则模型凭据需要重新保存。

正式数据至少做一次“备份 → 独立测试环境还原 → 核对会话数、分支和凭据状态”的演练，不能只验证备份文件存在。

## 8. 迁移到云端

云迁移时保持同一镜像、迁移命令和 PostgreSQL Schema：

1. 在笔记本生成并验证数据库备份，另行确认主密钥可恢复。
2. 云端通过 Secrets/KMS 注入变量，不复制真实 `.env.selfhost` 到镜像。
3. 创建受保护的 PostgreSQL，恢复备份并运行 `db:migrate`。
4. Web 只通过私有网络连接数据库；公网入口使用 HTTPS 反向代理，并在开放前增加应用身份认证、CSRF 防护、速率限制和审计。
5. 切换域名后核对健康检查、会话树、模型流、凭据解密和备份计划。

当前 Compose 是单机基线，不提供高可用、自动异地备份、应用登录或零停机升级。这些能力应在真正需要公网或多用户时进入后续 Sprint。

## 9. 当前验证边界

- 已在 Windows Docker Desktop 实机完成镜像构建、数据库迁移、容器健康检查、网页访问和重启后启动验证。
- 已用一次性假凭据完成写入、读取公开状态和删除的真实 API/数据库集成检查，并确认数据库密文不包含明文。
- 自动化测试覆盖私有数据库、持久卷、localhost 绑定、迁移先于启动、独立 Worker、Secret 排除、恢复确认和 Credential Vault 行为。
- 已真实验证一次性任务在网页之外由 Worker 自动执行，Task 进入 completed 并产生唯一 unread InboxItem；临时验证数据已清理。
- Web Push 自动化测试已覆盖订阅加密、权限手势、安静时段、租约幂等、重试、失效设备和隐私载荷；正式真机 Push 仍需用户在 `/notifications` 授权后完成一次到期提醒验收。
- 尚未执行正式 `pg_dump → 独立环境还原` 演练；产生重要个人数据前应补做。
- Tailscale Serve 需要在电脑和手机安装、登录后由用户启用；项目不自动修改系统 VPN、账号或 Tailnet 策略。
