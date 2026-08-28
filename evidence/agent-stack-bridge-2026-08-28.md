# Windows Bridge × Agent Stack 真实闭环验收

验收日期：2026-08-28（Asia/Shanghai）

## 结论

Windows Bridge 已使用 User API Key、`Default Project` 和正式 `flow-coordinator` 完成真实语义闭环。测试未使用产品 Skill，未连接硬件。

- Agent Stack Session：`sess_3c354694d30e4db5818911a1bc8950ba`
- Bridge 最终状态：`ENDED`
- 真实 Turn 数：4
- `assistant_message`：4/4 已观察
- `turn_finished.status=succeeded`：4/4 已观察
- 历史接口持久化状态：4/4 `succeeded`

## 语义结果

```text
SESSION_START → Coordinator Session 建立
INTERRUPTION_DETECTED → 3/3 页已完成，中断恢复中
NEXT → 验证第 3 页内容并完成收尾
RETURN_DETECTED → 已恢复至 PowerPoint，PPT 已完成 3/3 页
SESSION_END → RE:FOCUS 路演 PPT 前三页已全部完成，用户手动结束任务
```

## Trace

| 操作 | Turn ID | Run ID | 状态 |
| --- | --- | --- | --- |
| `START_SESSION` | `turn_1f09ddf1ca5740d99439fd21502c30b8` | `run_a2351a26bf224a44ba57849c60a409fc` | `succeeded` |
| `CREATE_CHECKPOINT` | `turn_0f39e6204cd94ca981c23dd809c245d0` | `run_9051803a766942828647132217c202d3` | `succeeded` |
| `CREATE_RESTORE` | `turn_959478f58eeb4126a61edf4876383d12` | `run_7144bdf222d44c1997a14fba30e4b5ec` | `succeeded` |
| `END_SESSION` | `turn_42320b05536c4ae6a3f6fd72db9026a3` | `run_9a89a66c9f8f48188fe906a93d318b6a` | `succeeded` |

## 安全与可靠性

- Key 只从环境变量读取，未写入仓库或输出。
- Turn 以 NDJSON 逐行解析，忽略空 heartbeat。
- 只有同时观察到 `assistant_message` 和成功的 `turn_finished` 才接受结果。
- 模型输出必须为严格 JSON，并经过字段类型校验。
- Turn 不自动重试；流中断时要求先检查 Session 历史。
- 窗口标题等字符串被明确视为不可信数据，不能作为指令执行。

## 下一步

定义 Bridge 到 ESP32 的串口 JSON 命令，并先用本地模拟串口验证状态到灯光/屏幕的确定性映射。

