# 浏览器旧会话导入

> 历史记录：本功能已在 R9.2 退役。用户明确不需要旧浏览器数据，因此移除了入口、API 和迁移器，但不清空 localStorage。下文只说明 Sprint 1.4 的历史行为，不再是操作指南；当前事实见 [R9.2报告](reports/R9_2_REPORT.md)。

Sprint 1.4 将 Chat 的事实来源从 `localStorage` 切换为 PostgreSQL，同时为已有 `agent_chat_sessions` 提供显式、可预检、可去重的迁移路径。

## 用户流程

1. Chat 启动时读取并规范化浏览器中的旧会话，但不会自动上传。
2. 页面显示旧会话数量，并通过 `preview` 查询其中多少条尚未导入。
3. 用户选择“确认导入”或“暂不导入”。暂不导入只隐藏本次提示，不删除数据。
4. 确认后，服务端先完成严格校验，再逐会话事务化写入。
5. 只有服务端返回成功后，浏览器才删除 `agent_chat_sessions`；网络或数据库失败时本地源数据完整保留。

## HTTP 契约

`POST /api/v1/imports/local-storage`

预检和确认使用相同数据结构，`action` 分别为 `preview` 与 `import`：

```json
{
  "action": "import",
  "sessions": [
    {
      "id": "legacy-session-id",
      "title": "历史对话",
      "updatedAt": 1700000000000,
      "schemaVersion": 2,
      "activeLeafId": "answer-b",
      "messages": [
        {
          "id": "question",
          "parentId": null,
          "role": "user",
          "content": "问题",
          "createdAt": 1700000000000
        }
      ]
    }
  ]
}
```

请求最多包含 100 个会话、每个会话 5000 个消息，总文本不超过 400 万字符。未知字段、重复 ID、缺失父节点、自引用、环路、非法活动叶和非 `user`/`assistant` 角色均会得到 `400 INVALID_IMPORT`，不会部分写入该会话。

## 树与 ID 迁移

- 浏览器旧 ID 仅作为本次树映射键，服务端为 Conversation 和 Message 生成新 UUID。
- 父节点通过映射后的 UUID 写入，兄弟回答因此仍是同一父节点下的不同分支。
- `activeLeafId` 映射到新 UUID，导入后显示的路径与导入前一致。
- 消息状态固定为 `complete`，模型和引用留空；旧会话不能借导入接口创建 system、developer 或 tool 消息。

## 幂等与失败边界

`conversation_imports` 以固定本地用户、来源 `agent_chat_sessions` 和原会话 ID 建立唯一收据。相同来源会话再次提交会被跳过，而不是复制。会话、消息树和收据在同一事务中提交；失败不会留下半棵树或无效收据。

当前策略把“相同来源 ID”视为同一份旧会话，即使浏览器内容后来变化也不会覆盖已导入数据。若用户删除已导入的服务端会话，级联删除对应收据；仍有本地副本时可以重新导入。

## 当前边界

- 这是一次性浏览器迁移，不是双向同步协议。
- 成功导入后，Chat 只读写服务端 Conversation API；localStorage 不再接收新会话。
- 当前仍是固定单用户，没有登录和设备身份；仅限本机或可信私有网络。
