# 服务端 Model Provider、Credential Vault 与 SSE

模型请求统一由 Next.js Node.js Runtime 发起。浏览器只访问本站 API；真实 API Key 不进入 HTML、localStorage 或可回读的状态接口。Chat 会话与模型凭据均以 PostgreSQL 为事实来源。

## 1. 推荐配置流程

自托管实例必须先在服务端设置凭据加密主密钥：

```dotenv
CREDENTIAL_MASTER_KEY=<32 个随机字节的无填充 base64url 字符串>
```

该变量不能带 `NEXT_PUBLIC_` 前缀，也不能提交到 Git。启动服务后打开 `/api-key`：

1. 填写 Provider 厂商标识、OpenAI-compatible Base URL、模型名和 API Key。
2. 先执行连接测试；测试只查询 Provider `/models`，不会保存。
3. 保存后，服务端使用 AES-256-GCM 加密 Key 并写入 PostgreSQL；Provider、Base URL 和 Model 作为可读取的普通文本列保存。
4. 页面及读取接口返回三个非敏感配置字段，但 Key 只显示末四位提示，永不返回明文或密文。

R9.2 起只使用网页保存的数据库凭据，不再读取 AI_API_KEY、AI_BASE_URL、AI_MODEL。删除后明确返回未配置（missing: [modelCredential]），不会切回旧环境配置；已有 Vault 数据无需迁移。

Base URL 默认只接受 HTTPS、拒绝内嵌凭据。仅可信 HTTP 服务可设置 AI_ALLOW_INSECURE_HTTP=true；修改该策略或主密钥需重启。CREDENTIAL_MASTER_KEY、数据库连接和 Token 预算仍由服务端环境管理，不得公开到客户端。

## 2. 凭据端点

### `GET /api/v1/model/credentials`

返回非敏感状态，包括 `configured`、`source`、`provider`、`baseUrl`、`model`、`apiKeyHint`、`version` 和 `missing`。`source` 为 `stored` 或 `none`，响应禁止缓存且不包含 Key 或密文。

### `PUT /api/v1/model/credentials`

保存或替换单用户当前模型配置。Provider 是可编辑的厂商标识，当前请求协议仍由 OpenAI-compatible Adapter 处理：

```json
{
  "apiKey": "<仅在本次请求中使用>",
  "provider": "deepseek",
  "baseUrl": "https://api.deepseek.com",
  "model": "deepseek-v4-flash-vision-exp"
}
```

请求使用严格 Schema，Provider 只接受 1–100 字符的字母数字、点、下划线或连字符标识，并拒绝未知字段、不安全 URL 和 URL 内嵌认证信息。成功响应仅返回公开状态。每个用户只有一条当前配置，修改 Provider 会原位更新同一条记录。

### `DELETE /api/v1/model/credentials`

删除 PostgreSQL 中的加密凭据，返回 HTTP 204。之后模型调用明确返回未配置，不存在环境兜底。

### `POST /api/v1/model/credentials/test`

请求体与保存接口相同。服务端在 10 秒超时内请求 `${baseUrl}/models`，报告是否连通以及目标模型是否出现在列表中；不保存输入，也不向浏览器透传上游正文。

### `GET /api/v1/model/config`

供 Chat 使用的非敏感模型状态接口。它与凭据状态接口共享运行时解析逻辑，但保持原有精简响应契约。

## 3. 模型 Streaming 端点

### `POST /api/v1/model/stream`

请求接受带来源的结构化 Prompt 和会话分支：

```json
{
  "trigger": "send",
  "conversation": {
    "id": "conversation uuid",
    "title": "事务学习",
    "activeLeafId": "message uuid"
  },
  "searchMode": "auto",
  "prompt": [
    { "kind": "instruction", "source": "policy", "role": "system", "content": "..." },
    { "kind": "conversation", "source": "conversation", "role": "user", "content": "解释数据库事务" }
  ]
}
```

限制：1–500 层、单层最多 1,000,000 字符、总内容最多 2,000,000 字符；来源、角色组合和未知字段均严格校验。`searchMode` 可选 `auto`、`on` 或 `off`。检索由服务端从最后一条用户消息发起；成功后插入 Citation Policy 与不可信 Web Evidence，再生成 Prompt Envelope、验证会话分支并写入无明文 Run 审计，最后才把 Envelope 内的标准消息发送到上游 `/chat/completions`。

成功响应为 `text/event-stream`：

```text
event: meta
data: {"requestId":"...","model":"deepseek-v4-flash-vision-exp","envelope":{"format":"ai-study-companion.prompt-envelope","schemaVersion":1,"...":"..."},"retrieval":{"status":"completed","query":"...","citations":["..."]}}

event: delta
data: {"text":"增量文字"}

event: done
data: {"citations":[{"id":"S1","title":"...","url":"https://..."}],"verification":{"schemaVersion":1,"verifierVersion":"core-3.4/rule-v1","status":"warning","checks":["..."]}}
```

`verification` 是服务端在流完成后执行的确定性规则检查，覆盖引用完整性、搜索摘要支持度、时效日期和推断边界。它不发起第二次模型调用，也不代表事实已经被证明；完整结果与 Assistant Message 一起保存到 `messages.verification`。

建立 SSE 前的配置/校验错误使用普通 JSON 和 400/503。建立 SSE 后的 Provider 错误使用 `event: error`，包含稳定 `code`、安全文案、`retryable` 和 `requestId`。

### `POST /api/v1/model/prompt-export`

请求携带本次 SSE 返回的 `envelope`、`format`（`json` 或 `markdown`）和 `includeMemory`。服务端重新计算 Envelope 哈希，并与 `prompt_runs` 中本地用户的审计记录核对；成功后返回可交给平台文件 Adapter 的 `{ filename, mediaType, content }`。不存在的 Run 返回 404，Envelope 被修改或与审计不一致返回 409。

## 4. 取消传播

Chat 的“停止生成”会中止浏览器 fetch；Route Handler 监听请求 AbortSignal，并中止上游 Provider fetch。响应流被客户端取消时也会触发同一个上游 AbortController。取消不是重试，不会继续在服务器后台消耗模型输出。

## 5. Provider 错误映射

| 上游情况 | Code | Retryable |
|---|---|---|
| 401/403 | `PROVIDER_AUTHENTICATION_FAILED` | false |
| 429 | `PROVIDER_RATE_LIMITED` | true |
| 404 | `PROVIDER_MODEL_NOT_FOUND` | false |
| 其他 4xx | `PROVIDER_REQUEST_REJECTED` | false |
| 5xx/网络失败 | `PROVIDER_UNAVAILABLE` | true |
| 缺失正文/错误 SSE | `PROVIDER_INVALID_RESPONSE` | false |

上游响应正文不会直接返回浏览器，避免泄露 Provider 内部细节。凭据测试端点使用独立而更精简的错误码，但遵循同样的不泄密原则。

## 6. 浏览器与数据行为

- `agent_api_key`、`agent_api_base_url`、`agent_api_model` 不再被读取；打开 Chat 或模型配置页时会清理这些旧 localStorage 项。
- `/api-key` 表单中的 Key 明文只存在于组件状态与当次 HTTPS/本机请求中；保存完成后 Key 输入框会清空。Provider、Base URL 与 Model 会从服务端读取并继续显示，方便修改。
- Chat 会话、消息树与分支存入 PostgreSQL；重试仍建立兄弟分支，不会为每个 Token 创建消息节点。
- `CREDENTIAL_MASTER_KEY` 只存在于服务端运行环境。数据库备份与该主密钥必须分别安全备份；丢失主密钥后，已加密的 API Key 无法恢复。

## 7. 当前安全边界

- 当前是单用户自托管版本，没有应用登录。仅允许在 localhost 或 Tailscale 私有网络中使用，不得通过公网端口转发或 Tailscale Funnel 暴露。
- 自定义 Base URL 目前依赖 HTTPS、URL 校验和服务端超时；公网多用户版本仍需 Provider/域名白名单、DNS/IP 出口策略与重定向复检，以进一步防御 SSRF。
- 主密钥保存在环境变量，适合个人自托管；多用户云端应迁移到 KMS/Secrets 服务并支持密钥轮换。
- 当前 Envelope 已预留工具、生成参数和 Context 处理字段，但尚未启用工具调用、Token 计量或流断线续传；这些属于后续 Agent Runtime 阶段。
