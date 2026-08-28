# RE:FOCUS 本地状态机验收

验收日期：2026-08-28（Asia/Shanghai）

## 结果

示例事件流成功回放：

```text
01 IDLE --SESSION_START--> SETUP
02 SETUP --ACTIVITY_SAMPLE--> FOCUSING
03 FOCUSING --PROGRESS_UPDATE--> FOCUSING
04 FOCUSING --INTERRUPTION_DETECTED--> INTERRUPTED
05 INTERRUPTED --RETURN_DETECTED--> RESTORING
06 RESTORING --SESSION_RESUMED--> FOCUSING
07 FOCUSING --SESSION_END--> ENDED
REPLAY_OK final_state=ENDED
```

协议检查：

```text
EVENT_STREAM_OK events=7 final_state=ENDED
```

自动测试：5 项通过，0 项失败。

覆盖规则：

- 正常事件流最终进入 `ENDED`。
- `INTERRUPTION_DETECTED` 不能同时表示用户回来。
- 必须先有 `RETURN_DETECTED`，才能产生 `SESSION_RESUMED`。
- `RETURN_DETECTED` 要求重新在席稳定至少 10 秒。
- 重复 `event_id` 和跳号 `sequence` 会被拒绝。

## 文件

- 状态机：`bridge/state-machine.mjs`
- 回放程序：`scripts/replay-event-stream.mjs`
- 协议验证：`scripts/validate-event-stream.mjs`
- 自动测试：`tests/state-machine.test.mjs`
- 示例输入：`protocol/examples/happy-path.jsonl`

## 验收边界

本次只证明本地事件与状态转换可靠。尚未连接 Agent Stack、摄像头、Windows 活动检测或 ESP32。

