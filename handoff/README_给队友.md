# RE:FOCUS C 板第一版固件交接

> **历史归档，不是最终比赛方案。** 本文记录摇杆联调过程；最终 Demo 没有使用摇杆，请以 [`README_先看这里.md`](README_先看这里.md) 为唯一真机说明。

这个压缩包是可直接编译的完整 Agent_link 工程，基于官方提交：

```text
3c93ecfcdc473c952a0e85d9797c2663e9ba7d87
```

团队新增的板型为：

```text
RE:FOCUS C Board V1 (joystick session switch + WS2812)
```

## 第一版只做什么

- 摇杆保持在前方：上报 `session_active=true`，本地 RGB 亮低亮绿色；
- 摇杆拨回原位：上报 `session_active=false`，本地 RGB 熄灭；
- Agent/ROROLEE 可通过标准 `led0` 端点覆盖 RGB 颜色；
- 不接屏幕、摄像头、麦克风、SD 卡，也不使用摇杆按键。

## 接线

摇杆接口标有 `G / V / X / Y / K`：

```text
G → GND
V → 3V3
Y → GPIO2
X、K 不接
```

务必按实物丝印确认，不要按线材颜色猜测。插拔前断电，V 不要接 5V。

## 编译

使用 ESP-IDF v5.5.4：

```powershell
idf.py set-target esp32s3
idf.py menuconfig
```

确认：

```text
Agent Link Device
→ Board Type
→ RE:FOCUS C Board V1 (joystick session switch + WS2812)

Agent Link Device
→ Transport backend
→ BLE
```

压缩包已把这两个选项写入 fresh-build 默认配置，但仍建议在 menuconfig 中看一眼。之后：

```powershell
idf.py build
idf.py -p COM<实际串口> flash monitor
```

## 真机通过标准

1. 开机前摇杆位于原位；开机第一秒不要移动，等待自动校准。
2. 日志出现 `board = REFOCUS_C_V1` 和 `joystick calibrated`。
3. ROROLEE 连接设备 `REFOCUS_C_V1`，能力中出现 `session_active` 与 `led0`。
4. 保持前方约 350ms：日志出现 `SESSION_START`，灯变低亮绿色，读数为 `true`。
5. 拨回原位约 600ms：日志出现 `SESSION_END`，灯熄灭，读数为 `false`。
6. 连续重复三次，每次位置变化只能产生一次状态变化。

如果向前没有反应、反方向才触发，请把：

```cpp
#define REFOCUS_FORWARD_IS_HIGH 1
```

改成：

```cpp
#define REFOCUS_FORWARD_IS_HIGH 0
```

位置：`boards/refocus-c-v1/config.h`，然后重新编译烧录。

## 当前验证状态

- 代码和 Agent_link 注册路径已经完成静态检查。
- 编写代码的电脑没有 ESP-IDF 编译器，也没有识别到 C 板串口，所以尚未完成真实编译与烧录。
- 第一次编译若出现错误，请把完整的第一条错误和前后约 20 行发回，不要只发最后一行。
- 固件和压缩包不含 Agent Stack API Key、账号或其他秘密。
