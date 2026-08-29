# Agent Stack API Hello World 验收

验收日期：2026-08-28（Asia/Shanghai）

## 结论

通过本地环境变量中的 User API Key，Agent Service API 最小文字调用已真实跑通。测试没有依赖浏览器 Session Cookie，也没有把 Key 写入代码、仓库或输出。

## 使用对象

- Base URL：`https://ventured-agent-stack.pingcap.cn`
- Project：`Default Project`
- Project ID：`proj_2820…3c25f`
- Agent：`refocus-agent`
- Agent ID：`agent_dc6a…e9b5b5`
- Session ID：`sess_b707…631b2`
- Turn ID：`turn_2c84…d046a7`
- Agent Run ID：`run_54d1…71ed19`

## 输入与观察结果

输入：

```text
只回复：HELLO_REFOCUS_API_OK
```

按顺序观察到的 NDJSON 关键事件：

```text
turn_started
assistant_message: HELLO_REFOCUS_API_OK
turn_finished: status=succeeded
```

终端验收信号：

```text
API_HELLO_WORLD_OK
```

随后通过 `GET /api/sessions/{id}/turns` 查询历史，确认该 Turn 已持久化且状态为 `succeeded`。

## 可复现入口

最小测试脚本：

```text
scripts/agent-stack-hello-world.mjs
```

脚本从下列环境变量读取配置，不接受代码内硬编码密钥：

```text
AGENT_STACK_BASE_URL
AGENT_STACK_USER_API_KEY
AGENT_STACK_PROJECT_ID（可选）
AGENT_STACK_AGENT_ID（可选）
```

## 当前验收边界

已证明：

- User API Key 鉴权有效。
- Project 和 Agent 可通过 API 获取。
- Session 可通过 API 创建。
- Turn 可通过 API 创建并按 NDJSON 解析。
- `assistant_message` 和 `turn_finished.payload.status == "succeeded"` 均已观察到。
- Turn 历史可通过 API 再次读取。

尚未开始：

- 创建正式的 `flow-coordinator` Agent。
- 编写、发布和安装三个产品 Skill。
- Windows Bridge 与 ESP32 联调。
