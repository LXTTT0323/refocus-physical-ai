# RE:FOCUS 比赛硬件联动

## 当前唯一联调方案

- 待机或 Session 结束：单色灯灭。
- 第一次按实体按钮：灯亮，网页开始 Session。
- Session 期间：灯保持常亮；准备、专注、需要回神等细节只在网页显示。
- 第二次按实体按钮：灯灭，网页结束 Session，并在浏览器本地保存一条基础记录。
- 网页开始/结束按钮保留为备用入口。
- 不使用 ROROLEE、不使用麦克风、不做灯光闪烁。

## 已确认接线

- 外侧 Button-PullUp：G / V / S，信号接 GPIO0。
- LED1：G / V / S，信号接 GPIO46。
- C 板通过 USB 数据线连接 Mac。

板子已经烧入并验证过 USB 双向固件。当前联调不要重新烧录。

## Mac 操作顺序

1. 保持 C 板 USB 数据线连接。
2. 双击 `启动桥接.command`。首次运行会创建独立环境并安装 pyserial。
3. 桥接会自动检测 `/dev/cu.usbmodem*` 或 Espressif 串口，不需要填写端口号。
   连接成功后每 5 秒发送一次心跳，网页会显示“桥接在线”。
4. 打开 `https://refocus-physical-ai.vercel.app/?hardware=1`。
5. 网页点击一次“开始检测”，授权摄像头和“整个屏幕”。
6. 网页显示“备用：网页开始 Session”后，按第一次实体按钮。
7. 验收：灯亮；桥接窗口出现 `WEB_FORWARD_OK active=true`；网页进入 Session。
8. 再按一次实体按钮。
9. 验收：灯灭；桥接窗口出现 `WEB_FORWARD_OK active=false`；网页显示“已记录”。

## 正常日志

```text
REFOCUS_USB_BRIDGE_READY
BOARD_DETECTED port=/dev/cu.usbmodem...
WEB_FORWARD_OK active=true
BOARD_COMMAND_SENT led=true
BOARD_ACK
WEB_FORWARD_OK active=false
BOARD_COMMAND_SENT led=false
BOARD_ACK
```

## 自动诊断

- 持续出现 `SERIAL_RECONNECT`：数据线、USB 口或串口占用问题；先关闭串口监视器。
- 出现 `WEB_FORWARD_FAILED`：网站接口或网络未通。
- 出现 `COMMAND_POLL_FAILED`：网站下行命令接口未通。
- 有 `WEB_FORWARD_OK` 但网页不变化：确认网址带 `?hardware=1`，且已先完成一次网页授权。
- 有 `BOARD_COMMAND_SENT` 但灯不变：保存 `BOARD_ACK` 前后的完整日志，核对 LED1 是否仍接 GPIO46。

Vercel 上的硬件队列是比赛版内存队列。若偶发漏事件，先保留日志、重启桥接并刷新网页，不要立即重刷固件。
