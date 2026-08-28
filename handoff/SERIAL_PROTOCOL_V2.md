# RE:FOCUS C V2 串口协议

传输参数：115200 baud，8N1，UTF-8，每条命令一行。串口同时包含 ESP-IDF 日志，设备协议帧始终以 `@REFOCUS ` 开头，Desktop Bridge 必须忽略其他行。

## 设备到电脑

```text
@REFOCUS {"v":1,"type":"boot","device":"REFOCUS_C_V2"}
@REFOCUS {"v":1,"type":"session_active","value":true,"seq":2}
@REFOCUS {"v":1,"type":"session_active","value":false,"seq":3}
@REFOCUS {"v":1,"type":"ack","command":"set_led","ok":true}
```

`seq` 只在物理 Session 状态改变时递增。Bridge 应按 `seq` 去重，断线重连后主动查询当前状态。

语义映射：

- `session_active=true`：摇杆保持前位，映射为 `SESSION_START`；
- 活跃 Session 中收到 `session_active=false`：摇杆回到原位，映射为 `SESSION_END_REQUESTED`，不是立即总结；
- Bridge 随后用 C 板麦克风依次采集两段回答并完成语音转写，两个文本齐全后发送 `SESSION_FEEDBACK_COMPLETED`，再调用总结 Skill。

V2 固件当前只实现摇杆和 RGB；板载麦克风的采集/传输仍需在下一版固件与 Desktop Bridge 中实现。网页麦克风仅是联调备用入口。

## 电脑到设备

查询状态：

```json
{"type":"get_state"}
```

常亮：

```json
{"type":"set_led","rgb":"00FF00","mode":"solid"}
```

慢闪：

```json
{"type":"set_led","rgb":"FF0000","mode":"slow_blink"}
```

熄灭：

```json
{"type":"set_led","rgb":"000000","mode":"solid"}
```

V2 只接受六位十六进制 `RRGGBB`。未知命令、非法颜色和超长行返回 `ok:false`，不会执行硬件动作。
