# RE:FOCUS C V2：Mac 烧录与 USB 串口测试

本包的正式链路不需要 ROROLEE：

```text
C 板摇杆/RGB ↔ USB 串口 ↔ Desktop Bridge ↔ 自己的 Agent Stack
```

固件仍保留 Agent_link/可选 BLE 兼容能力，但 ROROLEE 不连接也不影响 USB 主链路。

## 1. 准备

- ESP-IDF v5.5.4；
- 支持数据传输的 USB 线；
- Python 3 和 `pyserial`；
- 摇杆启动时位于原位。

验证环境：

```bash
idf.py --version
python3 --version
python3 -m pip install pyserial
```

## 2. 摇杆接线

```text
G → GND
V → 3V3
Y → GPIO2
X、K 第一版不接
```

按实物丝印确认，插拔前断电，V 不能接 5V。

## 3. 编译

进入解压后的 Agent_link 工程根目录：

```bash
idf.py set-target esp32s3
idf.py menuconfig
```

确认：

```text
Agent Link Device
→ Board Type
→ RE:FOCUS C Board V2 (joystick + WS2812 + USB serial bridge)
```

然后：

```bash
idf.py build
```

## 4. 烧录

USB 数据线优先连接板上标有 `UART` 的接口。查串口：

```bash
ls /dev/cu.*
```

常见串口：

```text
/dev/cu.usbserial-xxxx
/dev/cu.wchusbserialxxxx
/dev/cu.SLAB_USBtoUART
/dev/cu.usbmodemxxxx
```

烧录并查看首次日志：

```bash
idf.py -p /dev/cu.usbserial-xxxx flash monitor
```

如果不能下载：按住 BOOT，短按 RST，松开 BOOT，再重试。看到以下内容即表示固件启动：

```text
board = REFOCUS_C_V2
joystick calibrated
@REFOCUS {"v":1,"type":"session_active","value":false,...}
```

按 `Ctrl+]` 退出 monitor，释放串口；不能让 monitor 和测试脚本同时占用一个串口。

## 5. 电脑端串口测试

列出串口：

```bash
python3 serial_smoke_test.py --list
```

连接：

```bash
python3 serial_smoke_test.py --port /dev/cu.usbserial-xxxx
```

可输入：

```text
state
yellow
green
red
off
blink-yellow
blink-red
quit
```

## 6. 验收

1. `state` 返回 `session_active=false`。
2. 摇杆保持前方约 350ms，电脑收到 `value=true`，设备默认亮低亮黄色。
3. 输入 `green`，灯变绿色并返回 `set_led ok=true`。
4. 输入 `blink-red`，灯红色慢闪。
5. 摇杆拨回原位约 600ms，电脑收到 `value=false`，灯熄灭。
6. 连续重复三次，每次物理变化只有一个递增的 `seq`。

若方向相反，把 `boards/refocus-c-v2/config.h` 中：

```cpp
#define REFOCUS_FORWARD_IS_HIGH 1
```

改为 `0` 后重新编译烧录。

## 7. 返回证据

请返回：

- `idf.py build` 最终成功行，或第一条编译错误前后约 20 行；
- `board = REFOCUS_C_V2` 与 `joystick calibrated` 日志；
- 前方/原位各一条 `@REFOCUS` 事件；
- `green` 和 `blink-red` 的 ACK 与实物视频。

本包不包含 Agent Stack API Key。烧录测试阶段不需要登录 Agent Stack，也不需要打开 ROROLEE。

