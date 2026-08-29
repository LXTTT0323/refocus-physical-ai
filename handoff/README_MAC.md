# RE:FOCUS C 板第一版：macOS 烧录

> **历史归档，不是最终比赛方案。** 最终 Demo 不使用摇杆，也不按本文重新烧录；请只遵循 [`README_先看这里.md`](README_先看这里.md) 的 Button-PullUp + LED1 + USB Bridge 流程。

## 1. 环境

安装并使用 ESP-IDF v5.5.4。推荐通过 Espressif 官方安装方式完成，然后打开已经载入 ESP-IDF 环境的 Terminal。

验证：

```bash
idf.py --version
```

应显示 ESP-IDF v5.5.4。

## 2. 接线

摇杆：

```text
G → GND
V → 3V3
Y → GPIO2
X、K 第一版不接
```

插拔前断电；V 不能接 5V。USB 数据线优先连接板上标有 `UART` 的接口。

## 3. 查找串口

连接开发板前后分别运行：

```bash
ls /dev/cu.*
```

常见设备名：

```text
/dev/cu.usbserial-xxxx
/dev/cu.wchusbserialxxxx
/dev/cu.SLAB_USBtoUART
/dev/cu.usbmodemxxxx
```

若没有新增设备，先确认 USB 线支持数据，再根据开发板实际 USB-UART 芯片安装官方 macOS 驱动；不要凭猜测安装多个驱动。

## 4. 编译

进入解压后的 `refocus-c-v1-for-teammate`：

```bash
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

然后：

```bash
idf.py build
```

## 5. 烧录

把下面的串口替换为真实值：

```bash
idf.py -p /dev/cu.usbserial-xxxx flash monitor
```

如果无法进入下载模式：按住 BOOT，短按 RST，松开 BOOT，再重新执行烧录。

退出 monitor：`Ctrl+]`。

## 6. 验收

1. 开机时摇杆位于原位，第一秒不要移动。
2. 日志出现 `board = REFOCUS_C_V1` 和 `joystick calibrated`。
3. ROROLEE 重新搜索并连接 `REFOCUS_C_V1`。
4. 摇杆保持前方约 350ms：灯变低亮绿色，日志出现 `SESSION_START`。
5. 摇杆拨回原位约 600ms：灯熄灭，日志出现 `SESSION_END`。
6. 连续重复三次，每次只能发生一次状态变化。

如果前方方向相反，编辑 `boards/refocus-c-v1/config.h`：

```cpp
#define REFOCUS_FORWARD_IS_HIGH 0
```

重新编译烧录。

编译失败时，请返回第一条错误以及前后约 20 行；不要只截最后一行。
