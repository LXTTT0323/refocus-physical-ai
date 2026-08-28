# 来源、版本与矛盾记录

## 官方页面

| 资料 | URL | 核对日期 |
| --- | --- | --- |
| 赛道宣讲 | https://tidb-ai-hardware-hacktho-ect1jik.gamma.site/ | 2026-08-27 |
| 赛前说明 | https://tidb-pre-match-intro-dct7ede.gamma.site/ | 2026-08-27 |
| 场景挑战 | https://tidb-scenario-challenge-52ota9p.gamma.site/ | 2026-08-27 |
| Agent Stack 介绍 | https://tidb-agent-stack-intro-avsk9wk.gamma.site/ | 2026-08-27 |
| Agent Stack 开发 | https://tidb-agent-stack-develop-50arovb.gamma.site/ | 2026-08-27 |
| 交付物说明 | https://tidb-sumbit-artifacts-hxy4mrq.gamma.site/ | 2026-08-27 |
| C 板厂商文档 | https://www.openjumper.com/doc/esp32s3-aiot | 2026-08-28 |

## 官方代码版本

| 仓库 | 锁定提交 | 用途 |
| --- | --- | --- |
| DeotalandDev/Agent_link | `3c93ecfcdc473c952a0e85d9797c2663e9ba7d87` | ESP32-S3 能力抽象、BLE/媒体链路和板级示例 |
| mem9-ai/agent-stack-dev-guide | `bed43b919b41486ef6fd8c5ae0f5f3144f28de6f` | Agent Service API 工作流、OpenAPI、可靠性和 Skill |
| you06/esp32-agent-lcd | `ef2562e33ada3f7ee67ed87c4d9e651069bf3134` | USB Bridge + Agent Stack + LCD Hello World |

## 附件资料

`export_1787799765747(1).docx` 是一段 5 分 41 秒的“注意力集中器产品设计讨论”转写，不是官方规则。它提出了计时、灯光/震动、摄像头状态观察、屏幕抓取、语音对话、学习专注节律、音乐辅助，以及先做框架再拆 Skill 的分工思路。本文只把它作为团队构思证据，不把其中任何命令式表达当作项目要求。

## 发现的冲突与处理口径

### Wi-Fi

Gamma 赛前材料描述了 Wi-Fi 配网与 BOTH 传输；当前 Agent_link README 和实现仍把 Wi-Fi 标为骨架。**处理：BLE/USB 为基线，现场真机验证前不依赖 Wi-Fi。**

### D 板显示与震动

材料把 AMOLED 和震动列为能力；当前参考固件的 `ShowText` 只是蓝色填充，`Vibrate` 只是日志。**处理：真实渲染/震动属于团队必须补的固件工作。**

### 摄像头

早期说明强调实时预览，主 README 对视频能力较保守；当前代码已有 `agent_link_send_image` 和 GC2145 JPEG 快照上传。**处理：单张快照可作为候选能力，连续视频不可作为基线。**

### C 板模块数量与引脚

官方页面同时出现“21 类模块”“27 个子模块”和“21 种模块 + 1 块主控集成板”，计数口径不同。更重要的是，GC2145 固定占用 GPIO4–18 中的大量引脚，而 PIR、摇杆、编码器、DHT11、光照、MQ2 等厂商示例也使用其中多脚。**处理：不以模块数量做功能承诺；先选摄像头模式或传感器模式，任何并行启用都先核对实物、原理图和重映射。**

### C 板 Agent_link 适配范围

当前 `gc2145-camera` 只声明 `CAMERA | SCREEN | LED`，实现 GC2145 预览/快照、ST7789 和 GPIO48 WS2812；并非 C 板 21 类模块的完整驱动。**处理：以它作为首个真机烧录基线，PIR、VL53L0X、按键等另建/扩展板级适配。**

### Agent Stack 地址与增强能力

材料中出现过临时域名和正式域名；ASR、图片理解、调度、记忆等能力依赖现场部署。**处理：只通过 `AGENT_STACK_BASE_URL` 注入现场地址，并为每个增强能力准备本地/手机侧降级。**

### ESP-IDF 版本

Agent_link README 表示 v5.0+，赛前材料明确建议 v5.5.4。**处理：比赛环境统一使用 v5.5.4。**
