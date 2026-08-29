# RE:FOCUS｜回神

> 保护每天有限的专注时间，也提高进入专注与心流的能力。

RE:FOCUS 是面向长期使用电脑学习、写作、编程和创作用户的桌面 Physical AI 产品。用户通过实体按钮开始和结束一次专注；浏览器在用户授权后分析人在场状态和当前屏幕任务，TiDB Agent Stack 负责理解任务、判断语义并生成总结，实体灯则在真实空间中持续显示 Session 是否正在运行。

- 团队编号：22
- 在线体验：[https://refocus-physical-ai.vercel.app/](https://refocus-physical-ai.vercel.app/)
- 硬件模式：[https://refocus-physical-ai.vercel.app/?hardware=1](https://refocus-physical-ai.vercel.app/?hardware=1)
- 技术栈：ESP32-S3 C 板、Agent_link、TiDB Agent Stack、Node.js、Python、Web Serial、MediaPipe、Tesseract.js

## 核心 Physical AI 闭环

```text
用户输入本次任务
→ 网页建立任务合同并请求摄像头、整个屏幕授权
→ 用户按下 C 板实体按钮
→ LED 亮，Session 开始，网页开始计时与监测
→ 浏览器本地分析人在场信号，并提取必要的屏幕任务信息
→ flow-coordinator 通过 Skills 完成任务理解、相关性判断与结束总结
→ 用户再次按下实体按钮
→ LED 灭，计时和媒体流停止，页面进入 Session Reflection
→ 用户选择是否记录，并可选填写本次专注感受
```

这不是“网页加一个灯”。实体按钮为一次专注提供可重复的行为起点，灯让用户不切换窗口也能确认系统状态；Agent 只负责语义理解，计时、媒体停止、按钮、灯和数据保存均由确定性程序执行。

## 当前 Demo 能力

| 部分 | 当前实现 |
| --- | --- |
| 真实输入 | GPIO0 实体按钮、电脑摄像头、用户授权的整个屏幕、任务文字/可选语音 |
| 本地判断 | 人在场、头部方向、持续时间、防抖状态机、屏幕变化、本地 OCR 降级 |
| Agent | `flow-coordinator`，创建真实 Agent Stack Session / Turn，并保留 Trace |
| Skills | `task-setup`、`context-relevance`、`session-summary` |
| 物理输出 | GPIO46 LED1：Session 运行时亮，结束后灭 |
| 页面输出 | 任务合同、Session 状态、计时、相关性判断、Reflection 与专注记录 |
| 数据沉淀 | 当前浏览器 `localStorage` 中的次数、时长、任务类型和趋势 |

## 硬件清单与接线

### 硬件清单

- VentureD C 板：ESP32-S3 AIoT 全功能套件
- Button-PullUp 按键模块 × 1
- LED1 单色灯模块 × 1
- 支持数据传输的 USB 线 × 1
- 一台运行桌面版 Chrome 或 Edge 的电脑

### 最终 Demo 接线

| 模块 | 模块端口 | C 板连接 | 电压/说明 |
| --- | --- | --- | --- |
| Button-PullUp | `G` | GND | 共地 |
| Button-PullUp | `V` | 3V3 | 只接 3.3V |
| Button-PullUp | `S` | GPIO0 | 低电平有效；一次稳定按下切换 Session |
| LED1 | `G` | GND | 共地 |
| LED1 | `V` | 3V3 | 只接 3.3V |
| LED1 | `S` | GPIO46 | Session 亮/灭 |

注意：

- 插拔模块前先断开电源，按模块和底板丝印逐线确认，不要只依赖线材颜色。
- GPIO46 同时可能与 C 板 MicroSD 片选冲突；当前 Demo 不启用 MicroSD。
- 当前人体检测使用电脑摄像头。C 板摄像头、LCD、麦克风、PIR、测距和其他模块不属于本次最短闭环依赖。
- 已验证设备已经烧录完成。比赛联调时不要为了“确认版本”重复刷写。

## 固件、SDK 与依赖版本

| 依赖 | 版本/状态 | 用途 |
| --- | --- | --- |
| ESP-IDF | 5.5.4 | ESP32-S3 固件构建基线 |
| Agent_link | 子模块提交 `8debdee` | 主办方设备能力 SDK 基线 |
| Node.js | 20+ | 网页服务、Agent Stack 客户端和测试 |
| npm | 随 Node.js 安装 | 安装前端与本地服务依赖 |
| Python | 3.10+ | USB Bridge 与串口诊断 |
| pyserial | 3.5 | Mac/Windows USB Bridge |
| `@mediapipe/tasks-vision` | 1.0.1 | 浏览器本地人脸/头部信号 |
| Tesseract.js | 7.x | 本地 OCR 降级 |

PlatformIO 不是当前比赛 Demo 的必要依赖。只有重建其他官方示例时才需要安装。

最终真机固件以提交包中的“硬件联动包”为备份，包含脱敏源码快照和构建产物；`external/agent-link` 保存 Agent_link SDK 及 C 板适配开发基线。现场已验证的 GPIO0/GPIO46 设备应优先直接运行，不建议临时重烧。

## 仓库结构

```text
.
├── README.md                       # 本文：最终项目与复现入口
├── .env.example                    # 不含真实凭证的配置模板
├── api/                            # Vercel Serverless API 入口
├── bridge/                         # Agent Stack、视觉、OCR、语音与本地状态机
├── web-monitor/                    # RE:FOCUS 网页和本地服务
│   ├── public/                     # 页面、Web Serial 与本地视觉逻辑
│   └── server.mjs                  # Session、Agent、视觉及硬件 API
├── product-skills/                 # 三个产品 Skill 及 JSON Schema
│   ├── task-setup/
│   ├── context-relevance/
│   └── session-summary/
├── protocol/                       # 结构化事件协议和完整示例事件流
├── handoff/                        # macOS/Windows USB Bridge 与真机说明
├── external/
│   ├── agent-link/                 # Agent_link 子模块与 C 板适配基线
│   └── esp32-agent-lcd/            # 官方 Hello World 参考实现
├── scripts/                        # Hello World、诊断、回放与 Skill 打包脚本
├── tests/                          # 状态机、Agent、视觉、串口与服务测试
├── docs/                           # 设计决策、硬件核对和运行手册
└── evidence/                       # 脱敏的 Session / Turn / Trace 验收记录
```

## 环境准备

### 1. 获取代码

```bash
git clone --recurse-submodules https://github.com/LXTTT0323/refocus-physical-ai.git
cd refocus-physical-ai
npm ci
```

如果已经克隆但缺少子模块：

```bash
git submodule update --init --recursive
```

安装 USB Bridge 依赖：

```bash
python -m pip install -r handoff/requirements.txt
```

macOS 若只有 `python3`，将以上命令中的 `python` 替换为 `python3`。

### 2. 配置环境变量

仓库中的 [`.env.example`](.env.example) 只包含占位符。真实 API Key 不得写入代码、前端、固件、Git、截图或演示视频。

必须配置：

```text
AGENT_STACK_BASE_URL
AGENT_STACK_USER_API_KEY
AGENT_STACK_PROJECT_ID
AGENT_STACK_AGENT_ID
```

可选视觉配置：

```text
REFOCUS_VISUAL_PROVIDER=ocr        # 本地 OCR，不发送屏幕快照
REFOCUS_VISUAL_PROVIDER=openai     # 单帧视觉主路径
OPENAI_API_KEY                     # 仅在使用 openai 时配置
```

本地 Node.js 脚本不会自动读取 `.env`。请把变量注入当前终端，或在 Vercel 项目设置中配置。例如 PowerShell：

```powershell
$env:AGENT_STACK_BASE_URL="https://<event-provided-host>"
$env:AGENT_STACK_USER_API_KEY="<ag9_uak_...>"
$env:AGENT_STACK_PROJECT_ID="<project-id>"
$env:AGENT_STACK_AGENT_ID="<flow-coordinator-agent-id>"
$env:REFOCUS_VISUAL_PROVIDER="ocr"
```

这些设置只作用于当前终端。不要把真实值写回 `.env.example`。

## TiDB Agent Stack 配置

最终 Agent 名称为 `flow-coordinator`，安装三个产品 Skill：

| Skill | 调用时机 | 唯一职责 |
| --- | --- | --- |
| `task-setup` | Session 开始或用户补充目标时 | 把任务整理成可验证的任务合同；不明确时只追问一个问题 |
| `context-relevance` | 本地规则无法判断页面时 | 将单个页面分类为 `relevant / neutral / unrelated / unknown` |
| `session-summary` | 用户主动结束后 | 根据事件与用户反馈生成事实总结和下一步 |

Skill 源码和输出 Schema 位于 [`product-skills/`](product-skills/)。可在 Windows PowerShell 中重新打包：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/package-product-skills.ps1
```

在 Agent Stack Console 中上传并安装到 `flow-coordinator` 后，新建 Session 验证一次真实 Turn。成功标准必须同时出现：

```text
assistant_message
turn_finished.status = succeeded
```

Agent 不直接输出 GPIO 或任意灯光命令。Agent 生成语义事实，本地状态机和硬件白名单负责最终动作。

## 运行与验证

### A. 最短 Agent Stack 验证

完成环境变量配置后运行：

```bash
node scripts/agent-stack-hello-world.mjs
```

终端应依次显示选中的 Project、Agent、Session，以及：

```text
ASSISTANT_MESSAGE ...
TURN_FINISHED status=succeeded
API_HELLO_WORLD_OK
```

随后可在 Agent Stack Console 中按输出的 `sessionId` / `turnId` 查找对应 Trace。

### B. 本地网页验证

```bash
npm run monitor
```

打开 [http://127.0.0.1:4173/](http://127.0.0.1:4173/)。浏览器第一次使用时会分别请求摄像头和整个屏幕权限；屏幕共享请选择“整个屏幕”。

### C. 完整硬件闭环（推荐验收路径）

1. 按上表连接 Button-PullUp 和 LED1，并用 USB 数据线连接 C 板。
2. 关闭可能占用串口的监视器。
3. 启动 Bridge：

   ```bash
   python handoff/usb_web_bridge.py --port auto --web https://refocus-physical-ai.vercel.app
   ```

   macOS 也可以直接双击 `handoff/启动桥接.command`。

4. 打开[硬件模式网页](https://refocus-physical-ai.vercel.app/?hardware=1)。
5. 输入本次要完成的任务，点击开始准备，并授权摄像头和整个屏幕。
6. 页面显示“准备完成，等待实体按钮”后，按一次按钮。
7. 验收：LED 亮、网页开始计时、Bridge 出现 `WEB_FORWARD_OK active=true`。
8. 工作一段时间后再次按下按钮。
9. 验收：LED 灭、网页停止计时和媒体流、进入 Session Reflection。
10. 选择是否记录本次专注；专注感受为选填。保存后可在页面历史区域查看本次记录。

完整闭环的成功标准：

```text
真实按钮输入
→ 网页进入 Session
→ Agent Stack 产生成功 Turn 与 Trace
→ LED 给出可见状态
→ 再次按键结束
→ Reflection 与专注记录可见
```

### D. 自动测试

```bash
npm test
```

测试覆盖状态机、Agent Stack 客户端、三个 Skill 合同、视觉/OCR、串口协议和网页服务。若 macOS 没有 `python` 命令，可分别运行：

```bash
node --test tests/*.test.mjs
python3 -m unittest tests/test_product_skill_contracts.py -v
```

Windows 硬件环境可以先执行：

```powershell
npm run hardware:check
```

## 固件构建与恢复说明

当前比赛设备已完成真机烧录和 USB 双向验证，现场复现不需要重新刷写。若确实需要重建 Agent_link 固件：

```bash
cd external/agent-link
idf.py set-target esp32s3
idf.py menuconfig
idf.py build
idf.py -p <实际串口> flash monitor
```

要求 ESP-IDF v5.5.4。进入 `menuconfig` 后必须选择与目标硬件对应的 Board Type，不能把 M5Stack CoreS3 示例固件烧入 C 板。

最终 GPIO0 按钮/GPIO46 LED1 固件的脱敏源码快照、构建产物和校验值随比赛提交包中的硬件联动附件交付。该备份用于故障恢复，不建议覆盖已经验证的现场设备。

## 隐私与安全边界

- 摄像头的人脸、头部和在场信号默认在浏览器本地分析。
- 不上传连续摄像头或屏幕视频；视觉服务每 10 秒最多处理一张必要的压缩单帧。
- 视觉服务失败时可降级为本地 OCR。
- Agent Stack 主要接收任务合同、结构化页面事实和 Session 事件。
- Agent 不直接控制 GPIO；Bridge 只接受定义好的 Session 和 LED 白名单消息。
- 产品不用于员工监控，不进行医疗、ADHD、疲劳或心理状态诊断。
- 用户主动决定是否保存每次专注记录。

## 已知限制

- 专注历史当前保存在当前浏览器的 `localStorage`，尚未实现跨设备同步。
- Vercel 的硬件事件队列是比赛版内存队列；服务实例切换时可能需要重启 Bridge 并刷新网页。
- 首次摄像头、屏幕共享和 Web Serial 授权必须由用户点击确认，浏览器不能自动绕过。
- 当前 Demo 的摄像头来自电脑；C 板双摄/独立场景理解属于后续产品方向。
- GPIO46 与 MicroSD 片选存在资源冲突，因此当前 Demo 不启用 MicroSD。
- 当前硬件只承担开始、结束和 Session 灯光，不承担复杂的红黄绿提醒。
- 最终 GPIO0/GPIO46 固件备份位于比赛提交附件，现场优先使用已经验证的设备。

## 评委快速入口

- [在线 Demo](https://refocus-physical-ai.vercel.app/)
- [硬件模式](https://refocus-physical-ai.vercel.app/?hardware=1)
- [Agent Stack 十步运行手册](docs/agent-stack-10-step-runbook.md)
- [产品 Skills 与 JSON 合同](docs/product-skills-v1.md)
- [最终硬件联动说明](handoff/README_先看这里.md)
- [脱敏验收证据](evidence/)

评审重点可以沿这一条线快速验证：**实体按钮 → Session → Agent Stack Turn/Trace → LED 与网页状态 → Reflection → 个人专注记录**。
