# Windows Bridge v0 骨架

## 目的

Bridge 是电脑、本地状态机、`flow-coordinator` 和硬件之间的确定性边界。

当前 v0 同时提供模拟协调器和真实 Agent Stack 适配器，尚未连接硬件。它已经能够：

1. 读取标准事件。
2. 驱动本地状态机。
3. 保存目标、最近进展和当前窗口上下文。
4. 只在四个语义节点调用协调器：开始、中断、回来、结束。
5. 得到 Checkpoint、恢复提示和结束总结。

`ACTIVITY_SAMPLE` 与 `PROGRESS_UPDATE` 只在本地累计，不逐条发送到云端。

## 当前调用边界

```text
SESSION_START          → startSession
INTERRUPTION_DETECTED  → createCheckpoint
RETURN_DETECTED        → createRestore
SESSION_END            → endSession
```

## 本地演示

```powershell
node .\scripts\run-bridge-demo.mjs .\protocol\examples\happy-path.jsonl
```

成功标准：

```text
BRIDGE_DEMO_OK final_state=ENDED coordinator_calls=4
```

## 真实 Agent Stack 演示

真实适配器从环境变量读取配置：

```text
AGENT_STACK_BASE_URL
AGENT_STACK_USER_API_KEY
AGENT_STACK_PROJECT_ID
AGENT_STACK_AGENT_ID
```

运行：

```powershell
node .\scripts\run-agent-stack-bridge-demo.mjs .\protocol\examples\happy-path.jsonl
```

每个关键节点必须同时观察到 `assistant_message` 和 `turn_finished.status=succeeded`。Turn 不自动重试；流中断时先查询 Session 历史。
