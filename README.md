# VentureD AI Hardware Hackathon 项目库

> 状态：RE:FOCUS 方案已锁定；网页监测器已连接真实 `flow-coordinator`；OpenAI 视觉、OCR 降级、结束后双问题语音反馈与总结均已验收；三个产品 Skill 已安装到线上 Agent 并通过真实 Trace 验证；Vercel 部署入口已配置。
> 最后核对：2026-08-28（Asia/Shanghai）  
> 目标：用一套可重复演示的 Physical AI 闭环参赛，并让所有产品、技术和交付决策服从同一套官方标准。

## 当前结论

**正式参赛方案：回神 RE:FOCUS。**

它是一个保护工作上下文的桌面 Physical AI Agent：理解用户此刻想完成什么，在分心、离席或被打断时保存工作现场，在用户回来后恢复“刚才做到哪里、下一步是什么”。它不监工、不评价人，也不做医疗诊断。

比赛 MVP 以**桌面形态**为主：电脑端提供最小化的任务上下文，独立硬件负责真实世界输入与状态反馈。队伍实际已领用 **C 板（ESP32-S3 AIoT 全功能套件）**，因此所有后续固件和接线都以 C 板为唯一比赛硬件。电脑摄像头负责稳定的人脸/头部方向判断，C 板优先提供 PIR、距离、按键与灯光/屏幕等交叉证据。衣夹/可穿戴形态不进入首个闭环。AI Game Master 仅保留为历史备选。

## 官方核心标准（所有方案的最高约束）

### 1. 必须形成真实 Physical AI 闭环

合格作品至少同时满足：

- 一种真实世界输入：麦克风、摄像头、按钮或传感器等。
- 一次程序、Agent 或业务逻辑判断。
- 一个用户可以观察到的真实输出：声音、屏幕、灯光、震动、报告或后续任务等。
- 现场能够稳定、连续、重复演示完整过程。

只有聊天机器人、只有网页/App、或只有传感器看板，都不符合赛道期待。

推荐用一句话校验项目：

> 当用户在【具体场景】中进行【真实操作】时，设备感知【输入】，Agent 判断【什么】，并通过【真实输出】帮助用户获得【价值】。

### 2. 三项评分，各 10 分，取算术平均

- **创新性**：问题洞察、AI 应用范式或解决方案是否原创，是否突破常规产品思路。
- **向善价值**：是否关注社会、人文或环境价值，并考虑公平、包容和长期正向影响。
- **落地完成度**：场景、用户与执行路径是否清楚；Agent 是否真实运行；是否考虑隐私、安全、伦理与部署。

因此不能只追求“现场很酷”，也不能只讲商业故事。作品必须同时能解释：为什么新、为什么对人有益、为什么真的跑得起来。

### 3. 本队最终采用的三层架构

```text
真实输入
  ↓
ESP32-S3 C 板 + Agent_link（摇杆输入、RGB 物理输出）
  ↓ USB 串口 JSONL
自定义 Desktop Bridge（Windows/macOS；状态机、电脑信号、安全校验）
  ↓ HTTPS / NDJSON
TiDB Agent Stack（Agent、Session、Turn、Skill、Tool、Artifact、状态与任务）
  ↓
Desktop Bridge 将确定性、安全的命令映射回设备
  ↓
屏幕 / 声音 / 灯光 / 震动 / 报告 / 后续任务
```

ROROLEE 只保留为可选 BLE 调试工具，不进入正式业务链路。其 App 不能把设备事件路由到本队自定义的 Agent Stack 业务逻辑。

安全原则：**模型提出意图，确定性程序执行硬件动作。** 不允许把自然语言直接变成未经校验的 GPIO、继电器或电机指令。

### 4. 官方硬件与选型

| 代号 | 板卡 | 数量 | 主要能力 | 当前最适合 |
| --- | --- | ---: | --- | --- |
| A | AIoT BasicV2 | 15 | 2.4 英寸屏、摄像头、麦克风/播放、温湿度、气压、光敏、WS2812 | 桌面多模态装置、AI Game Master |
| B | OJBadge 电子吧唧 | 10 | 1.28 英寸圆形触摸屏、麦克风/扬声器、电池、双按键 | 精致可穿戴；但无现成 Agent_link 适配 |
| C | AIoT 全功能套件 | 5 | 摄像头、六轴、PIR、测距、烟雾、环境传感器、LCD/OLED 等 | **本队已领取；RE:FOCUS 唯一目标板** |
| D | ROROLEE-Basic | 10 | AMOLED、双麦 AEC、扬声器、电池、SD、按键、震动马达 | 随身语音/陪伴设备、RE:FOCUS |

官方要求使用 ESP-IDF；赛前说明指定 **ESP-IDF v5.5.4**。板卡数量有限，三人一组，需准备第一和第二选板方案。

### 5. 已确认的现场限制

- 现场禁止任何焊接；只能使用杜邦线、面包板、端子或其他免焊方案。
- 现场不提供电机/电机驱动，不应把核心 Demo 依赖在机械运动上。
- 现场提供 3 台 3D 打印机，必须尽早提交打印任务。
- API Key、Access Token、密码不得进入代码、固件、前端静态资源、日志、截图、PPT 或视频。
- Agent Stack 的 ASR、图片理解、Scheduler、知识库等增强能力以现场账号和部署为准，必须准备降级方案。

## 源码核对后的真实技术基线

宣传页用于理解方向；真正实现必须以现场实物、当前源码和 OpenAPI 为准。

### Agent_link（核对提交 `3c93ecf`）

可靠基线：

- BLE 控制面、能力声明、回调路由。
- 语音上行、TTS 下行的代码路径。
- 通用传感器/执行器 I/O 模型。
- 单张 JPEG/RGB565 图片上传接口与 GC2145 快照示例。
- 板卡 A/C/D 的部分现成适配。

不能直接假设：

- **Wi-Fi 传输当前源码仍是骨架**，不能把核心闭环依赖在 Wi-Fi 后端。
- 连续视频不是稳定能力；应使用设备快照、手机侧视觉或文本降级。
- 多条链路在 README 中仍标注“尚未真机验证”，现场必须先跑 Hello World。
- D 板参考实现的 `Vibrate()` 目前只打印日志；必须补真实电机驱动才能承诺震动。
- D 板 `ShowText()` 目前只用蓝色填充代替文字；必须补字体/图形渲染才能展示眼睛或文本。

### TiDB Agent Stack（开发资料提交 `bed43b9`）

- 普通产品调用使用 User API Key；Workspace API Key 主要用于服务用户和 User Key 的 bootstrap。
- 先 `GET /api/console/projects` 选择 Project，再选择 Agent、创建 Session、创建 Turn。
- Turn 返回 NDJSON，必须逐行解析，忽略 heartbeat，并等待 `assistant_message` 与 `turn_finished`。
- 请求中断后先查询状态，不能盲目重复创建 Turn。
- API 精确方法、权限、Header、Schema 和错误码以 `references/openapi.yaml` 为权威。
- 凭据只放环境变量或密钥管理系统；不进入设备固件。

### Hello World 示例（核对提交 `ef2562e`）

官方示例采用：

```text
M5Stack CoreS3 ←USB JSONL→ TypeScript Bridge ←HTTP/NDJSON→ Agent Stack
```

它证明了最稳的分层方式：设备只处理显示/按钮；Bridge 保管 User API Key、选择 Project/Agent、创建 Session/Turn 并解析 NDJSON。我们的项目可以复用这个思想，即使最终设备链路换成 BLE + ROROLEE。

## 已锁定方案

### 历史备选：AI Game Master（停止开发）

**一句话：** 一个能主持、记忆并推动线下游戏持续运行的 AI 游戏操作系统；狼人杀是第一款规则包。

核心闭环：

```text
玩家语音/按键/手机座位输入
→ Agent 理解发言与游戏阶段
→ 确定性规则引擎更新状态和权限
→ 桌面设备用语音、屏幕和灯光主持
→ 离席玩家获得权限安全的补课
→ 赛后每位玩家获得个人复盘
```

必须守住的产品边界：

- Agent 不直接裁决确定性规则；规则引擎负责阶段、角色权限、投票和胜负。
- 不承诺一只桌面麦克风精准区分九个人。优先用“玩家手机/座位通道”确定说话人，公共设备负责主持和氛围。
- 离席补课必须按“该玩家本来有权知道的信息”过滤，不能泄露角色私密信息。
- MVP 只完整实现狼人杀的一条三人或最小可演示流程；其他游戏通过规则包架构说明扩展性。

推荐板卡：A 板。第二选择：D 板作为语音主持终端。

### 回神 RE:FOCUS（正式参赛方案）

**一句话：** 一个保护工作上下文的桌面/可穿戴 Agent，在用户跑偏或被打断时保存现场，并在回来后恢复下一步。

核心闭环：

```text
用户声明目标 + 电脑活动/在席状态
→ Agent 判断“相关、主动休息、跑偏或中断”
→ 保存文件、页面、进度和下一步 Checkpoint
→ 设备用眼睛/声音/震动提示
→ 用户回来后恢复任务上下文
```

合理形态不是“只能挂在衣服上”，而是一个可拆卸核心：

- 工作时放在显示器或桌面底座，眼睛面对用户。
- 离开电脑时可夹在衣服上，用安静触觉和语音提醒。
- 比赛 MVP 以桌面模式为主，可穿戴作为产品延展。

必须守住的产品边界：

- 核心价值是“中断恢复”，不是监控员工或简单番茄钟。
- 摄像头的人脸、头部、闭眼与哈欠信号默认本地处理；当前主视觉每 10 秒最多向 OpenAI 发送一张压缩的共享屏幕快照，再把结构化观察交给 Agent Stack。OpenAI 失败时自动降级为本地 OCR；任何模式都不上传连续视频。
- 不做医疗诊断，不宣称治疗 ADHD 或疲劳。
- 第一版只识别在席、离席、当前应用/页面相关性，并完成一次 Checkpoint 恢复。

当前灯光防抖策略：进入绿灯需任务、人在场和相关/中性上下文连续成立 5 秒；人脸短暂消失未满 3 秒、短暂转头或单次疑似无关都保持绿灯。连续无人脸 3 秒、连续两次无关，或单独偏头 7 秒进入红灯；回正信号需连续稳定 1.8 秒才清空偏头计时，短暂无脸也不清空。恢复任务后稳定 3 秒回到绿灯。闭眼和哈欠只作为记录信号，不单独触发红灯。

实际板卡：C 板。推荐先做传感器优先模式：电脑端检测工作上下文和人脸/头部方向，C 板提供 PIR、距离、按键、RGB 灯与屏幕反馈。现成 `gc2145-camera` 可用于摄像头、LCD、快照和 WS2812 的独立基线验证，但默认引脚与多种 C 板传感器冲突，不能直接把所有示例同时开启。

## MVP 门槛与执行决定

正式开工前，RE:FOCUS 必须回答并验证：

1. 三分钟视频中的“连续魔法瞬间”是什么？
2. 哪个真实输入来自开发板或真实环境？
3. Agent 做的判断是否超出普通规则/脚本？
4. 用户能立刻观察到什么物理输出？
5. 为什么不能只做 App？
6. 断网、ASR、设备或多人识别失败时如何降级？
7. 三个人能否在提交前完成、录制并复现？

执行决定：

- 只开发 RE:FOCUS，不再并行实现 AI Game Master。
- 第一优先验证 C 板的 USB/串口、LCD、GPIO48 RGB 灯和一个明确用户输入；随后逐个加入 PIR 与 VL53L0X，不能在未核对引脚冲突前同时启用摄像头和全部传感器。
- 第一条闭环只做“声明目标 → 离席/中断 → 保存 Checkpoint → 回来恢复下一步”。
- 先采用页面标题、应用名、空闲状态和手动保存点等结构化信号，不上传连续屏幕和摄像头画面。

详见 [RE:FOCUS MVP 定义](docs/refocus-mvp.md) 和 [心流交叉验证与落地方案](docs/flow-detection-plan.md)。

C 板的完整参数、引脚冲突、Agent_link 支持范围和真机验收顺序见 [C 板完整核对与落地方案](docs/hardware-c-board.md)。

电脑、状态机、Agent 与硬件之间的第一版合同见 [事件协议 v0.1](docs/event-protocol-v0.md)。

本地状态机的实测结果见 [本地状态机验收](evidence/local-state-machine-2026-08-28.md)。

Windows Bridge 的本地模拟骨架见 [Windows Bridge v0](docs/windows-bridge-v0.md)。

实测结果见 [Windows Bridge v0 验收](evidence/windows-bridge-v0-2026-08-28.md)。

真实 Agent Stack 四节点闭环见 [Windows Bridge × Agent Stack 验收](evidence/agent-stack-bridge-2026-08-28.md)。

Agent 云端从账号到硬件协议的逐步验收见 [Agent Stack 十步运行手册](docs/agent-stack-10-step-runbook.md)。

电脑摄像头、屏幕变化、任务合同与页面相关性的网页入口见 [网页监测 V1](docs/web-monitor-v1.md)，真实 Agent Stack 验收见 [网页监测 × Agent Stack 验收](evidence/web-monitor-agent-stack-2026-08-28.md)。

模糊任务追问、具体任务合同和相关线索白名单的最新实测见 [任务检测与理解真人验收](evidence/task-understanding-live-check-2026-08-28.md)。

相关任务窗口与无关窗口的正反例实测见 [屏幕上下文与任务相关性真人验收](evidence/screen-context-live-check-2026-08-28.md)。

屏幕/摄像头页面统一输入、当前模型的视觉限制和本地 OCR 真实 Turn 证据见 [视觉来源与 OCR 降级验收](evidence/visual-source-live-check-2026-08-28.md)。

详见 [产品方向与评奖分析](docs/product-direction.md) 和 [技术实施基线](docs/technical-plan.md)。

## 官方交付物清单

每队必须准备：

1. **项目及团队介绍**：项目名、一句话、目标用户/场景、核心体验、团队分工。
2. **三分钟 Demo 视频**：必须出现真实设备，至少保留一次连续、完整、可验证的闭环。
3. **一页架构图**：真实输入、ESP32、SDK/Agent_link、连接、Agent/Skill/Tool、数据流和实际输出；区分主办方提供、团队配置、团队开发。
4. **代码与运行说明**：硬件型号、接线、依赖版本、编译、烧录、配置、运行、最短验证路径、已知限制。
5. **Agent Stack 使用说明**：Agent 的输入、判断、Skill/Tool、硬件映射、任务能力，以及脱敏日志/Trace。

建议视频结构：

- 0–30 秒：用户与问题。
- 30–120 秒：连续完整交互。
- 120–150 秒：ESP32、SDK、Agent、Tool 的职责。
- 150–180 秒：创新点、真实限制和下一步。

## 仓库结构

```text
.
├── README.md                         # 官方标准与当前决策入口
├── TEAM_START_HERE.md                # 队友克隆、分工和最短验收入口
├── AGENTS.md                         # Agent Stack 开发的强制执行规则
├── docs/
│   ├── official-standard.md          # 官方材料逐项整理
│   ├── product-direction.md          # 两个方案、评分与选择门槛
│   ├── technical-plan.md             # 架构、MVP、降级与验证顺序
│   ├── hardware-c-board.md            # C 板参数、引脚冲突与 RE:FOCUS 落地
│   ├── team-plan.md                  # 三人分工与招募建议
│   ├── agent-stack-10-step-runbook.md # Agent Stack 从登录到硬件协议
│   ├── phase-1-agent-stack-skill.md  # 官方开发 Skill 验收证据
│   └── source-review.md              # 全部来源、版本与矛盾记录
├── .agents/skills/
│   └── agent-stack-developer/        # 官方 Skill，锁定为 Git submodule
├── external/
│   ├── agent-link/                   # 本队 Fork，refocus-c-v2 固件，Git submodule
│   └── esp32-agent-lcd/              # Hello World 示例，Git submodule
└── .env.example                      # 只含占位符，绝不提交真实 Key
```

最新 API 实测证据见 [Agent Stack API Hello World 验收](evidence/hello-world-api-2026-08-28.md)。

正式 Agent 的独立实测见 [flow-coordinator 基线验收](evidence/flow-coordinator-baseline-2026-08-28.md)。

模糊任务追问、补充后进入 `ready` 的实测见 [Agent Stack 任务明确度验收](evidence/task-setup-agent-stack-2026-08-28.md)。

三个产品 Skill 的职责、JSON 合同和上线顺序见 [产品 Skills v1](docs/product-skills-v1.md)。

## 官方资料入口

- [赛道宣讲 PPT](https://tidb-ai-hardware-hacktho-ect1jik.gamma.site/)
- [赛前说明文档](https://tidb-pre-match-intro-dct7ede.gamma.site/)
- [Agent_link Repo](https://github.com/DeotalandDev/Agent_link)
- [挑战场景参考](https://tidb-scenario-challenge-52ota9p.gamma.site/)
- [TiDB Agent Stack 介绍](https://tidb-agent-stack-intro-avsk9wk.gamma.site/)
- [Agent Stack 开发 Skill Repo](https://github.com/mem9-ai/agent-stack-dev-guide)
- [Agent Stack 开发 Skill 文档](https://tidb-agent-stack-develop-50arovb.gamma.site/)
- [Hello World + Agent Stack 示例](https://github.com/you06/esp32-agent-lcd)
- [交付物详细说明](https://tidb-sumbit-artifacts-hxy4mrq.gamma.site/)

## 安全底线

- 真实密钥只放本地环境变量或 Secret Manager。
- `.env`、串口日志、设备截图和录屏在提交前都要检查。
- 对话、发言、屏幕和摄像头数据默认最小化采集并清楚告知用户。
- 所有角色权限、离席摘要和硬件动作都经过确定性校验。
