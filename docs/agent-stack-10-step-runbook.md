# Agent Stack 十步运行手册

> 目标：证明 RE:FOCUS 的云端 Agent 确实收到输入、调用模型、留下可追踪证据，并返回经过校验、硬件可读的结果。本文依据官方 Agent Stack Developer Skill、OpenAPI 和 `esp32-agent-lcd` 示例整理。

## 当前已有与仍缺内容

已在项目库中：官方 Gamma 资料、Agent_link、Agent Stack Developer Skill/OpenAPI、Hello World 示例、比赛交付标准和 RE:FOCUS 产品/技术方案。

仍必须由队伍提供或现场确认：

- Agent Stack 实际登录账号与 Workspace 权限；
- `AGENT_STACK_BASE_URL`；
- User API Key；
- 可用的 Project、Agent 及模型额度；
- C 板的串口号、具体硬件修订版、ROROLEE App 与真实链路状态。

任何 Key 都不粘贴到聊天、固件、截图或 Git；只放本机环境变量或密钥管理器。

## ① 登录 Agent Stack

操作：

1. 使用主办方提供的地址和账号登录 Console。
2. 确认进入正确 Workspace。
3. 查看是否已有可用 Project 和 Agent；记录名称，不在群聊发送 Key。
4. 确认账号可以查看 Session/Turn 的运行记录。

产物：Workspace 名称、登录成功截图（不得含 Key）。

通过标准：能进入 Console，能看到至少一个 Project；若没有 Project，记录为主办方权限阻塞，不继续猜地址。

## ② 配置 API Key 与 Project

普通 Project、Agent、Session、Turn 调用使用 **User API Key**。Workspace API Key 主要用于服务用户/User Key bootstrap，不替代普通调用的 User Key。

先看 Key 前缀决定路线：

- 已有 `ag9_uak_...`：直接执行本节的 Project/Agent 只读验证，**不要**再调用 `/api/admin/users`。
- 只有 `ag9_wak_...`：先用 WAK 调用 `POST /api/admin/users` 创建服务用户，再调用 `POST /api/admin/users/{userId}/api-keys` 签发只显示一次的 UAK；之后所有普通调用切换到 UAK。

这两步 bootstrap 会创建线上资源，必须在明确确认后执行。它们可以在 Cursor、VS Code、Codex 或普通 PowerShell 终端中运行，IDE 不是必要条件；Key 绝不能进入固件和 Git。

PowerShell 当前窗口配置：

```powershell
$env:AGENT_STACK_BASE_URL="https://<现场提供地址>"
$env:AGENT_STACK_USER_API_KEY="<只在本机填写>"
$env:AGENT_STACK_PROJECT_ID="<选择后的 projectId>"
$env:AGENT_STACK_AGENT_ID="<可先留空>"
```

第一条验证请求：

```powershell
curl.exe -sS `
  -H "Authorization: Bearer $env:AGENT_STACK_USER_API_KEY" `
  "$env:AGENT_STACK_BASE_URL/api/console/projects"
```

产物：选中的 `projectId`。

通过标准：HTTP 200，响应有 `projects` 数组，配置的 `projectId` 确实在列表中。401 检查 Key；403 检查权限；空列表找主办方确认 Workspace/Project。

## ③ 跑官方 Hello World

官方示例位于 `external/esp32-agent-lcd`，使用 Node.js 20+、pnpm、PlatformIO。其固件针对 M5Stack CoreS3，不应直接烧到比赛 C 板；我们先复用它验证 Agent Service API 与 NDJSON 客户端。

```powershell
cd external\esp32-agent-lcd
pnpm install
pnpm build
pnpm test
```

若手上恰有 M5Stack CoreS3，再执行：

```powershell
pnpm firmware:build
pnpm firmware:upload
```

比赛 C 板的首个固件验证应改跑 `external/agent-link` 的 `gc2145-camera` Board Type，不使用 M5Stack 固件；其他传感器需扩展 C 板适配。

产物：依赖安装日志、TypeScript build/test 通过记录；有对应硬件时再增加烧录记录。

通过标准：`pnpm build` 和 `pnpm test` 均成功。没有 M5Stack 不算阻塞云端验证。

## ④ 手动输入一句文字

列出 Agent 并选择一个：

```powershell
curl.exe -sS `
  -H "Authorization: Bearer $env:AGENT_STACK_USER_API_KEY" `
  "$env:AGENT_STACK_BASE_URL/api/agents"
```

将返回的 `agentId` 写入当前环境变量。运行官方 Bridge 时还需提供串口号；串口未连接不会阻止终端 Turn，但会持续打印重连信息。

```powershell
$env:AGENT_STACK_AGENT_ID="<agentId>"
$env:M5_SERIAL_PORT="COM<实际编号>"
pnpm dev
```

在 `You >` 后输入固定测试句：

```text
只回复：HELLO_REFOCUS_OK
```

产物：本次使用的 `projectId`、`agentId`、`sessionId`、`turnId` 和测试文本；全部脱敏保存。

通过标准：输入非空、长度不超过 4000，Bridge 创建一次而不是重复创建 Turn。

## ⑤ 证明 Agent 调用了模型

官方调用链：

```text
GET /api/console/projects
GET /api/agents
POST /api/sessions  Header: x-agent9-project-id
POST /api/sessions/{sessionId}/turns
Accept: application/x-ndjson
Body: {"input":{"type":"text","text":"..."}}
```

不能只用“收到 HTTP 201”证明模型成功。必须观察流事件：

- `turn_started`；
- 至少一个最终 `assistant_message`；
- `turn_finished.payload.status == succeeded`。

产物：脱敏后的 NDJSON 事件或 Bridge 日志。

通过标准：三类事件完整，并且 `turnId` 一致。断流后先查询 Session/Turn 状态，不盲目重发。

## ⑥ 验证返回结果

Hello World 期望返回包含：

```text
HELLO_REFOCUS_OK
```

检查：

- HTTP 状态为 201；
- `assistant_message.payload.text` 非空；
- `turn_finished` 为 `succeeded`；
- Terminal 与设备显示（若已连接）内容一致；
- 没有把 Key 打进日志。

产物：一条成功结果和一次失败/超时处理记录。

通过标准：相同测试连续运行三次成功；每次只产生一个 Turn。

## ⑦ 在 Trace 中证明执行

在 Console 中按 `sessionId`/`turnId` 查找对应 Session。入口名称可能显示为 Session、Trace、Operations 或运行记录，以现场 UI 为准。

必须核对：

1. 输入文本与本次测试一致；
2. Agent/模型执行记录存在；
3. 若调用 Skill/Tool，能看到调用名、参数摘要、结果和耗时；
4. 最终消息与 Terminal 返回一致；
5. 状态为 succeeded，时间与本地测试对应。

产物：一张脱敏 Trace 截图，加一份记录 `projectId/agentId/sessionId/turnId/status` 的证据表。

通过标准：评委能从截图和 ID 对上“输入 → 执行 → 输出”，而不是只看到最终一句文本。

## ⑧ 定义 RE:FOCUS Agent

先在 Console 创建独立 Agent，例如 `refocus-agent`。首版只配置必要说明，不急着装复杂工具。

核心职责：

- 接收已结构化的目标、窗口比例、任务进展和人体状态；
- 不进行医疗诊断或员工绩效评价；
- 在中断时生成 Checkpoint；
- 在用户回来时输出“做到哪里、下一步是什么”；
- 不直接操作 GPIO，不自行决定任意震动/灯光参数。

推荐输入：

```json
{
  "event": "flow_interrupted",
  "goal": "完成 RE:FOCUS 演示流程",
  "recent_progress": ["写完心流判断规则"],
  "active_app": "VS Code",
  "flow_score": 82,
  "reason_codes": ["person_absent_30s"]
}
```

产物：`agentId`、Agent 配置截图、三条固定测试用例。

通过标准：输入相同时输出结构稳定；不泄露窗口原文隐私；不会把疲劳或分心说成疾病。

## ⑨ 只增加必要 Skill / Tool

第一条闭环可以先不用 Tool：Bridge 直接把结构化事件放进 Turn，Agent 返回 Checkpoint。

稳定后最多增加：

- Skill `refocus-checkpoint-policy`：固化隐私、心流状态、Checkpoint 写法和禁止诊断规则；
- Tool `get_focus_context(session_id)`：读取当前目标和最近结构化事件；
- Tool `save_checkpoint(session_id, checkpoint)`：保存进度与下一步；
- Tool `get_last_checkpoint(session_id)`：用户回来时读取上次断点。

窗口采样、心流分数和实时状态机必须在本地规则引擎运行，不应每两秒调用 Agent/Tool。

产物：每个 Skill/Tool 的输入、输出、权限和失败降级表。

通过标准：Trace 中能看到真实调用；工具失败时仍能用 Turn 输入和本地模板完成演示；无用工具不安装。

## ⑩ 定义硬件可读输出

Agent 只返回业务意图，Bridge 校验后再生成设备命令。Agent 输出建议固定为：

```json
{
  "version": "1.0",
  "intent": "checkpoint_created",
  "flow_state": "interrupted",
  "confidence": 82,
  "summary": "你刚才完成了心流判断规则。",
  "next_action": "接入窗口事件采集。",
  "reason_codes": ["person_absent_30s"]
}
```

字段限制：

- `intent`：`no_action | checkpoint_created | resume_guidance`；
- `flow_state`：`warming_up | likely_flow | stable_flow | interrupted | recovering`；
- `confidence`：0–100；
- `summary`、`next_action`：各不超过 120 个中文字符；
- `reason_codes`：仅允许规则引擎定义的枚举。

Bridge 白名单映射示例：

```json
{
  "type": "show_resume",
  "text": "下一步：接入窗口事件采集",
  "led": "cyan",
  "speak": true,
  "duration_ms": 8000
}
```

硬件只识别 `type/text/led/speak/duration_ms` 等有限字段；未知类型、超长文本、非法颜色和过长时长一律拒绝或回退为安全默认值。

产物：JSON Schema、Bridge 校验器、三条合法样例和三条非法样例测试。

通过标准：Agent 返回无法直接触发任意硬件动作；同一合法结果能在 C 板稳定显示或亮灯三次。

## 最终阶段门槛

步骤 ①–⑦ 完成，才证明 Agent Stack 基础链路可用。步骤 ⑧–⑩ 完成，才证明它是 RE:FOCUS Agent。之后再进入：

```text
电脑/摄像头事件
→ 本地心流规则
→ Agent Checkpoint
→ Bridge 白名单
→ C 板物理反馈
→ Trace 与 TiDB 证据
```
