# 硬件第一版：C 板摇杆 + RGB

## 范围

第一版只使用：

- 摇杆 Y 轴：前方为 `session_active=true`，拨回原位为 `false`；
- ESP32-S3 板载 WS2812：GPIO48；
- Agent_link BLE：继续由 ROROLEE 连接。

不使用摇杆按键、X 轴、屏幕、摄像头、麦克风或 SD 卡。

## 交互

| 实物位置 | 设备读数 | 本地灯光 | Bridge 语义 |
| --- | --- | --- | --- |
| 原位 | `session_active=false` | 熄灭 | 活跃 Session 中映射为 `SESSION_END_REQUESTED`，进入语音复盘 |
| 保持在前方 | `session_active=true` | 低亮绿色 | IDLE 映射为 `SESSION_START`；恢复等待态映射为 `SESSION_RESUMED` |
| 中间过渡区域 | 不改变 | 保持原状态 | 不产生事件 |

启动后的第一秒必须让摇杆位于原位，固件会自动校准中心值。前方需稳定约 350ms 才开始，回原位需稳定约 600ms 才结束，防止抖动。

## 接线

摇杆模块接口标有 `G / V / X / Y / K`。第一版只需要：

- `G` → GND；
- `V` → 3V3；
- `Y` → GPIO2；
- `X`、`K` 不接。

严禁把摇杆 V 接到 5V。插线前断电，并按实物丝印逐线确认，不能只按线材颜色判断。

## 编译与烧录

需要 ESP-IDF v5.5.4。选择：

```text
Agent Link Device
→ Board Type
→ RE:FOCUS C Board V1 (joystick session switch + WS2812)
```

然后执行：

```powershell
idf.py set-target esp32s3
idf.py menuconfig
idf.py build
idf.py -p COM<实际串口> flash monitor
```

## 第一次真机验收

1. 摇杆保持原位，重启设备；日志出现 `joystick calibrated`。
2. ROROLEE 重新连接设备 `REFOCUS_C_V1`。
3. 向前拨并保持：约 350ms 后灯变低亮绿色，日志出现 `SESSION_START`。
4. ROROLEE/设备能力中应出现 `session_active=true` 和 `led0`。
5. 拨回原位：约 600ms 后灯熄灭，日志出现 `session_active=false`；Bridge 映射为 `SESSION_END_REQUESTED`，依次采集两段语音，转写完成后再生成总结。
6. 连续重复三次，不允许出现一次动作触发多次事件。

若向前无反应、向后才触发，把 `config.h` 中 `REFOCUS_FORWARD_IS_HIGH` 从 `1` 改为 `0` 后重新编译。

## 当前限制

- 本机当前有 PlatformIO，但没有检测到 ESP-IDF 的 `idf.py`，因此代码尚未在本机完成 ESP-IDF 编译和真机烧录。
- ROROLEE 是否把 `session_active` 自动转成 Agent Turn 需要真机观察；设备端采用官方通用 I/O manifest/reading 协议，不使用未定义的 JSON 包。
- RGB 的 Agent 下行端点为官方合成的 `led0`；本地在位置变化时先即时亮灯/熄灯，云端仍可覆盖颜色。
