# RE:FOCUS 事件协议 v0.1

状态：已确认并实现本地状态机，可用于模拟闭环与跨平台 Desktop Bridge 开发。

## 设计原则

- 一个事件只表达一件事；“中断”和“回来”不能共用同一事件。
- 原始摄像头画面与连续屏幕内容不进入协议，只传本地提取后的结构化信号。
- Bridge 生成 `event_id`、`session_id`、`sequence` 和 `timestamp`，用于排序、去重和 Trace。
- `INTERRUPTION_DETECTED` 表示中断已经成立；`RETURN_DETECTED` 表示用户重新回来。
- 当前没有手动暂停。回来由本地检测自动触发，不使用含义模糊的 `SESSION_RESUME` 输入命令。
- `SESSION_RESUMED` 是恢复完成后的系统结果，不是用户输入。

机器合同见 [`protocol/refocus-event.schema.json`](../protocol/refocus-event.schema.json)。

## 公共字段

每个事件都包含：

| 字段 | 含义 |
| --- | --- |
| `schema_version` | 当前固定为 `0.1` |
| `event_id` | Bridge 生成的唯一事件 ID |
| `session_id` | 本地专注 Session ID；之后映射 Agent Stack Session ID |
| `sequence` | Session 内从 1 开始严格递增 |
| `timestamp` | 带时区的 ISO 8601 时间 |
| `source` | 事件来自用户、桌面观察器、状态机、Agent Stack 或硬件 |
| `event` | 事件类型 |
| `payload` | 该事件的具体数据 |

## 输入与观察事件

### `SESSION_START`

由用户主动开始，建立本次目标。第一版允许按钮、摇杆、语音或电脑端操作触发，但必须是明确动作。

必要信息：

- `goal`：这次要完成的任务。
- `focus_minutes`：用户指定时为 1–480；未指定为 `null`。

状态变化：`IDLE → SETUP`。

### `TASK_CLARIFICATION`

当 Agent 判断目标还不能形成可验证交付物时，设备保持黄灯慢闪并提出一个问题。用户的补充回答通过本事件送入同一个 Agent Stack Session。该事件可重复，但每次只回答当前问题。

状态保持：`SETUP → SETUP`。

### `ACTIVITY_SAMPLE`

由 Windows Bridge 每 3–5 秒产生，记录本地结构化观察：

- 是否在席、连续消失时长。
- 头部是否朝向屏幕、眼睛状态、是否检测到哈欠。
- 当前应用和窗口标题。
- 最近 10 秒的键盘、鼠标活动与系统空闲时长。

该事件只提供事实，不能单独宣告“进入心流”或“发生中断”。摄像头字段允许 `unknown`，避免把检测失败误当成用户状态。

在 `SETUP` 阶段，它只更新在席与窗口事实，不会直接进入专注。

### `FOCUS_READY`

由本地确定性门禁生成，必须同时满足：

- Agent 返回的任务合同为 `ready`；
- 检测到用户在场；
- 当前应用/窗口与任务相关；
- 三项条件连续稳定至少 5 秒。

状态变化：`SETUP → FOCUSING`。此时黄灯熄灭、绿灯常亮并开始记录专注时间。

### `PROGRESS_UPDATE`

只有出现可验证进展时产生，例如：

- 文档内容或文件版本发生变化。
- PPT 页数增加。
- 代码测试由失败变为通过。
- 用户明确确认完成一个小步骤。

它用于区分“看着相关窗口”和“任务确实在推进”。

### `INTERRUPTION_DETECTED`

由本地状态机在阈值成立后产生，不由单个采样点直接产生。

第一版原因：

- `absent`：持续离席。
- `off_task`：持续停留在与目标无关的窗口。
- `idle`：在席但持续没有输入和进展。

状态变化：`FOCUSING → INTERRUPTED`。该事件触发保存 Checkpoint，但不表示 Session 结束。

### `RETURN_DETECTED`

由本地状态机自动产生，不要求手动点击继续。第一版要求：

- 重新检测到用户在席；
- 重新回到与原任务相关的窗口；
- 两者稳定约 10 秒，避免用户只是经过电脑。

状态变化：`INTERRUPTED → RESTORING`。

### `SESSION_END_REQUESTED`

仅由用户主动结束；离席过久不能直接替用户结束，以免误判。正式硬件入口是摇杆从前位拨回原位；网页按钮只作为开发调试备用。

状态变化：`SETUP | FOCUSING | INTERRUPTED | RESTORING → REFLECTING`。

进入 `REFLECTING` 后停止专注判定，系统通过麦克风依次询问：

1. 这次完成了什么？
2. 刚才专注感受怎么样？

音频采集属于硬件/本地 Bridge 层。Skill 只接收语音转写后的文本，因此从网页麦克风切换到 C 板麦克风不会改变 `session-summary` Skill。

### `SESSION_FEEDBACK_COMPLETED`

两段回答均完成转写后产生，载荷包含 `completion_report` 与 `focus_experience`。此时才调用 `session-summary` 并完成 Session。

状态变化：`REFLECTING → ENDED`。

## 系统结果事件

### `SESSION_RESUMED`

当 Checkpoint 已经恢复并向用户展示“刚才做到哪里、下一步是什么”后，由状态机产生。

状态变化：`RESTORING → FOCUSING`。

它与 `RETURN_DETECTED` 的区别：

```text
RETURN_DETECTED = 用户回来了
SESSION_RESUMED = 系统已经恢复完上下文，可以继续任务
```

## 最小事件顺序

```text
SESSION_START
→ ACTIVITY_SAMPLE（重复）
→ FOCUS_READY
→ PROGRESS_UPDATE（按需）
→ INTERRUPTION_DETECTED
→ RETURN_DETECTED
→ SESSION_RESUMED
→ SESSION_END_REQUESTED
→ SESSION_FEEDBACK_COMPLETED
```

完整示例见 [`protocol/examples/happy-path.jsonl`](../protocol/examples/happy-path.jsonl)。

## 本地执行

回放完整状态变化：

```powershell
node .\scripts\replay-event-stream.mjs .\protocol\examples\happy-path.jsonl
```

运行自动测试：

```powershell
node --test .\tests\state-machine.test.mjs
```

## 暂不进入 v0.1

- 手动暂停/继续。
- 原始图片、连续截图、键盘文本和鼠标坐标上传。
- 根据哈欠做医疗或疲劳诊断。
- 因长时间离席自动结束 Session。
