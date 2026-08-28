# RE:FOCUS 网页监测 V1

## 这一版解决什么

用户打开本地网页，点击一次“开始监测”，授权电脑摄像头和屏幕共享。网页在本地提取人在场、头部方向、闭眼候选、哈欠候选和屏幕变化等信号；任务理解与当前页面相关性由 TiDB Agent Stack 的 `flow-coordinator` 判断。

默认采用隐私优先模式：摄像头和屏幕快照只在本机做 OCR，Agent Stack 只接收提取出的文字、用户任务和数值化信号；连续视频永不上传。需要理解纯图片和界面结构时，可显式启用独立 OpenAI `visual-observer`：单张压缩快照先交给视觉模型生成固定 JSON，再由 Agent Stack `flow-coordinator` 判断任务相关性。

## 成功标准

### 1. 权限与启动

- 网页只监听 `127.0.0.1`，Agent Stack Key 只存在服务端环境变量中。
- 用户点击一次“开始监测”后，浏览器同时申请摄像头和屏幕共享权限。
- 两路视频都显示为已连接；任一权限被拒绝时，页面明确显示失败原因。
- 屏幕共享因浏览器安全规则不能静默或永久授权，每次新会话都需要用户确认。

### 2. 任务与 Agent Stack

- `flow-coordinator` 在同一个 Agent Stack Session 内把目标整理成 `task-setup` 固定 JSON。
- 任务明确时返回 `status=ready`、一个可见交付物和 1～3 个可验证成功标准。
- 任务模糊时只问一个澄清问题；用户回答后仍在同一个 Session 更新任务合同。
- 每次云端调用必须同时观察到 `assistant_message` 与 `turn_finished.status=succeeded`，否则页面不把结果当作成功。
- `context-relevance` 只判断 `relevant / neutral / unrelated / unknown`，不能直接决定红绿灯或输出硬件指令。

### 3. 人的信号

- **在场**：检测到一张主要人脸；连续稳定 0.8 秒后记录一次 `FACE_PRESENT`，该确认状态才允许通过专注门槛。
- **实时方向**：画面立即显示方向，但不立即写入“偏离”事件。预览为镜像画面，左右标签按用户自身方向显示。
- **偏离候选**：同一偏离方向持续 3 秒，记录一次 `HEAD_AWAY_CANDIDATE`。
- **确认偏离**：持续 30 秒，记录一次 `HEAD_AWAY_CONFIRMED`；回正时记录 `HEAD_RETURNED`。
- **短暂消失**：人脸连续消失不足 15 秒，只标记不确定，不提醒。
- **离席候选**：人脸连续消失 3 秒记录 `FACE_MISSING_CANDIDATE`；30 秒记录 `FACE_ABSENT_CONFIRMED`，才可作为一个中断证据。
- **闭眼候选**：双眼闭合指标连续超过约 0.8 秒记录一次 `EYES_CLOSED_CANDIDATE`；眨眼不算。
- **哈欠候选**：张嘴指标连续超过约 1.2 秒记录一次 `YAWN_CANDIDATE`。
- **周期采样**：监测运行期间每 5 秒记录一条 `ACTIVITY_SAMPLE`，但只有状态变化或达到阈值才记录上述事件节点。
- 闭眼、哈欠或偏头都只是信号，任何单一摄像头信号不能直接触发提醒。

### 4. 屏幕信号

- 屏幕共享启用后，每秒在本地计算一次低分辨率画面变化比例。
- 变化超过约 1.5% 只代表屏幕有活动，不等同于任务有进展。
- 保留手动填写应用、窗口标题或域名的稳定降级入口。
- 自动入口把“共享屏幕页面”和“摄像头拍到的页面”归一成同一份视觉观察；用户只需切换来源，不改 Agent、状态机或硬件协议。
- 默认每 30 秒最多截取一张 480×270 JPEG，在本机 OCR 后把文字交给同一个 `context-relevance` 判断。
- 当前 Agent Stack 模型目录实测只有 `qwen3.7-plus`，且图片 Turn 返回 `vision_model_unsupported`，因此不能在平台内创建真正看图的第二 Agent。
- 已实现独立视觉路径：`OpenAI gpt-4.1-mini → 固定 visual_observation JSON → Agent Stack context-relevance`。视觉模型只描述画面，不判断任务相关性、不识别人身份、不输出硬件命令。
- 开启独立视觉时，页面会明确显示快照将发送至 OpenAI；仍然每 30 秒最多一张，连续视频永不上传。调用失败会降级到本地 OCR。
- 相关性采用“直接工作 / 合理支持 / 明确跑偏”三级语义：有任务证据为 `relevant`；代码编辑器、AI 助手、搜索、终端、文档、设计和剪辑等生产力工具在没有明确冲突时至少为 `neutral`；只有明确的其他项目或娱乐内容才为 `unrelated`。不能只因目标关键词暂时未出现在画面中就判跑偏。
- 本地 OCR 适合网页、PPT、文档和带文字的实体页面；对绘画、纯图像或没有文字的动作只能返回低置信度/`unknown`，不能假装已经理解。
- 普通网页无法读取操作系统中任意前台窗口的真实标题；后续若要全自动获取，需要桌面 Bridge 或浏览器扩展。

### 5. 进入专注状态

同时满足以下条件并稳定持续 5 秒，页面进入 `FOCUSING`，对应未来硬件绿灯常亮：

1. 任务合同为 `ready`；
2. 摄像头检测到用户在场；
3. 屏幕上下文被判断为 `relevant` 或 `neutral`；
4. 两路监测仍在运行。

当前版本不会仅凭“眼睛一直看着屏幕”宣布进入心流。严格来说，心流是主观心理状态；V1 检测的是“持续、低干扰的任务专注候选”。后续应结合持续时长、任务进展和用户结束反馈进行校准。

其中 `neutral` 是进入绿灯的重要容错：例如写 PPT 时临时使用 GPT、搜索资料或查看代码，剪视频时使用剪辑/素材工具，都不会因为页面上暂时没有任务关键词而被误判为跑偏。

## 提醒的后续标准

V1 先采集信号，不自动发红灯。接硬件前再实现确定性状态机：只有“屏幕明确无关”与“人脸消失/持续偏头/长期无活动”中至少两个独立证据同时持续，才进入 `INTERRUPTION`。用户重新在场且任务上下文恢复后进入 `SESSION_RESUME`，红灯熄灭、绿灯恢复。

## 本地运行

在 PowerShell 中确认以下环境变量已存在，但不要输出完整 Key：

```powershell
$env:AGENT_STACK_BASE_URL = [Environment]::GetEnvironmentVariable("AGENT_STACK_BASE_URL", "User")
$env:AGENT_STACK_USER_API_KEY = [Environment]::GetEnvironmentVariable("AGENT_STACK_USER_API_KEY", "User")
$env:AGENT_STACK_PROJECT_ID = [Environment]::GetEnvironmentVariable("AGENT_STACK_PROJECT_ID", "User")
$env:AGENT_STACK_AGENT_ID = [Environment]::GetEnvironmentVariable("AGENT_STACK_AGENT_ID", "User")
# 默认无需配置视觉模式，图片只在本机 OCR。
# 使用外部视觉观察器（快照会发送至 OpenAI）：
$env:OPENAI_API_KEY = [Environment]::GetEnvironmentVariable("OPENAI_API_KEY", "User")
$env:REFOCUS_VISUAL_PROVIDER = "openai"
# 可选，默认就是 gpt-4.1-mini：
# $env:REFOCUS_OPENAI_VISION_MODEL = "gpt-4.1-mini"
# 只有 Agent Stack 后续提供已验证的视觉模型时才使用：
# $env:AGENT_STACK_VISION_MODE = "vision"
npm install
npm run monitor
```

浏览器打开 `http://127.0.0.1:4173`。开发验收可打开 `http://127.0.0.1:4173/?demo=1`，它不会启用真实摄像头和屏幕，但仍可测试真实 Agent Stack Session。
