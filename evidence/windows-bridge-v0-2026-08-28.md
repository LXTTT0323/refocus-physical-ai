# Windows Bridge v0 验收

验收日期：2026-08-28（Asia/Shanghai）

## 演示结果

```text
SESSION_START -> state=SETUP
  COORDINATOR_SESSION_READY
ACTIVITY_SAMPLE -> state=FOCUSING
PROGRESS_UPDATE -> state=FOCUSING
INTERRUPTION_DETECTED -> state=INTERRUPTED
  CHECKPOINT: 当前进度已保存
RETURN_DETECTED -> state=RESTORING
  RESTORE: 你刚才PPT 从 2 页增加到 3 页。下一步：回到原任务窗口，继续完成当前最小步骤。
SESSION_RESUMED -> state=FOCUSING
SESSION_END -> state=ENDED
  SUMMARY: 目标：完成 RE:FOCUS 路演 PPT 的前三页；记录了 1 次进展。
BRIDGE_DEMO_OK final_state=ENDED coordinator_calls=4
```

## 自动测试

- 7 项通过。
- 0 项失败。

已确认：

- 完整模拟闭环最终进入 `ENDED`。
- 协调器只在开始、中断、回来、结束时调用。
- `ACTIVITY_SAMPLE` 和 `PROGRESS_UPDATE` 不会被逐条发送给协调器。
- Bridge 能保留目标、最近进展、窗口上下文和 Checkpoint。
- Bridge 能得到恢复提示和结束总结。

## 当前边界

本版本使用 `MockFlowCoordinator`。它验证的是 Bridge 的职责、数据最小化和调用时机；尚未调用真实 Agent Stack，也未输出串口硬件命令。

