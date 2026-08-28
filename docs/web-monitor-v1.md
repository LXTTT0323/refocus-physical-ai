# RE:FOCUS 网页监测 V1

## 这一版解决什么

用户打开本地网页，点击一次“开始监测”，授权电脑摄像头和屏幕共享。网页在本地提取人在场、头部方向、闭眼候选、哈欠候选和屏幕变化等信号；任务理解与当前页面相关性由 TiDB Agent Stack 的 `flow-coordinator` 判断。

摄像头原始画面和屏幕图像不上传 Agent Stack。云端只接收用户填写的任务、应用名、窗口标题、域名和数值化的屏幕变化信号。

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

- **在场**：检测到一张主要人脸；首次检测结果在画面进入后的约 1 秒内更新。
- **短暂消失**：人脸连续消失不足 15 秒，只标记不确定，不提醒。
- **离席候选**：人脸连续消失 30 秒以上，才可作为一个中断证据。
- **头部偏离**：脸部中心相对左右边界明显偏移时输出 left/right；单次偏头不提醒，持续 30 秒以上才可作为一个分心证据。
- **闭眼候选**：双眼闭合指标连续超过约 0.8 秒时记录；眨眼不算。
- **哈欠候选**：张嘴指标连续超过约 1.2 秒时记录。
- 闭眼、哈欠或偏头都只是信号，任何单一摄像头信号不能直接触发提醒。

### 4. 屏幕信号

- 屏幕共享启用后，每秒在本地计算一次低分辨率画面变化比例。
- 变化超过约 1.5% 只代表屏幕有活动，不等同于任务有进展。
- 第一版由用户填写当前应用、窗口标题或域名，再交给 `context-relevance` 与任务提示交叉判断。
- 普通网页无法读取操作系统中任意前台窗口的真实标题；后续若要全自动获取，需要桌面 Bridge 或浏览器扩展。

### 5. 进入专注状态

同时满足以下条件并稳定持续 5 秒，页面进入 `FOCUSING`，对应未来硬件绿灯常亮：

1. 任务合同为 `ready`；
2. 摄像头检测到用户在场；
3. 屏幕上下文被判断为 `relevant` 或 `neutral`；
4. 两路监测仍在运行。

当前版本不会仅凭“眼睛一直看着屏幕”宣布进入心流。严格来说，心流是主观心理状态；V1 检测的是“持续、低干扰的任务专注候选”。后续应结合持续时长、任务进展和用户结束反馈进行校准。

## 提醒的后续标准

V1 先采集信号，不自动发红灯。接硬件前再实现确定性状态机：只有“屏幕明确无关”与“人脸消失/持续偏头/长期无活动”中至少两个独立证据同时持续，才进入 `INTERRUPTION`。用户重新在场且任务上下文恢复后进入 `SESSION_RESUME`，红灯熄灭、绿灯恢复。

## 本地运行

在 PowerShell 中确认以下环境变量已存在，但不要输出完整 Key：

```powershell
$env:AGENT_STACK_BASE_URL = [Environment]::GetEnvironmentVariable("AGENT_STACK_BASE_URL", "User")
$env:AGENT_STACK_USER_API_KEY = [Environment]::GetEnvironmentVariable("AGENT_STACK_USER_API_KEY", "User")
$env:AGENT_STACK_PROJECT_ID = [Environment]::GetEnvironmentVariable("AGENT_STACK_PROJECT_ID", "User")
$env:AGENT_STACK_AGENT_ID = [Environment]::GetEnvironmentVariable("AGENT_STACK_AGENT_ID", "User")
npm install
npm run monitor
```

浏览器打开 `http://127.0.0.1:4173`。开发验收可打开 `http://127.0.0.1:4173/?demo=1`，它不会启用真实摄像头和屏幕，但仍可测试真实 Agent Stack Session。
