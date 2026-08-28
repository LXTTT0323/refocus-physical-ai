# 视觉来源与 OCR 降级验收（2026-08-28）

## 验收结论

- 页面提供 `screen_share`（共享屏幕）与 `camera_page`（摄像头拍到的页面）两个来源。
- 两个来源进入同一个视觉适配器、同一个 `flow-coordinator` 和同一份 `context-relevance` JSON 合同；切换来源不影响状态机或硬件协议。
- 当前 Agent Stack 中的 `flow-coordinator` 模型真实返回 `vision_model_unsupported`，不能直接读取图片。
- 已实现隐私优先降级：快照在本机 OCR，只有提取出的文字交给 Agent Stack 判断，连续视频不上传。
- 已实现可选独立视觉观察器：OpenAI 只生成画面结构化描述，`flow-coordinator` 仍拥有任务相关性的最终判断权。

## 真实调用结果

测试任务：`完成 REFOCUS 比赛路演 PPT 的前三页`。

测试画面：当前 RE:FOCUS 本地监测网页，而不是 PPT 编辑页。

### 共享屏幕来源

- HTTP：`201`
- processing mode：`local_ocr_then_agent_stack`
- OCR：识别 338 个字符
- classification：`unrelated`，confidence `0.75`
- raw image uploaded to Agent Stack：`false`
- `assistant_message`：`true`
- `turn_finished.status`：`succeeded`

因为测试画面不是 PPT 编辑内容，判断为 `unrelated` 符合预期。

### 摄像头页面来源

使用同一张测试页面模拟摄像头看到的实体页面，仅把 source 改为 `camera_page`：

- HTTP：`201`
- processing mode：`local_ocr_then_agent_stack`
- classification：`unrelated`
- `assistant_message`：`true`
- `turn_finished.status`：`succeeded`

这证明来源切换不需要重写 Agent 调用。

## 当前边界

- 电脑工作场景优先选共享屏幕，文字更清楚、视角稳定、不受反光影响。
- 摄像头页面适合纸质书、白板、实体任务清单，必须让页面完整进入画面。
- 当前 OCR 路径主要理解文字；纯图片、绘画和无文字动作不能可靠判断。
- 若之后更换为已验证支持图片的 Agent，可设置 `AGENT_STACK_VISION_MODE=vision`；否则保持默认本地 OCR。

## OpenAI visual-observer 真实验收

模型：`gpt-4.1-mini`。测试图片为本地生成的 RE:FOCUS 演示页面，不包含真人或私人工作内容。

- Agent Stack 模型目录：只有 `qwen3.7-plus` 可用。
- HTTP：`201`
- processing mode：`openai_visual_then_agent_stack`
- visual scene：`browser_page`
- visual activity：`idle`
- OpenAI response ID：已观察到（证据文件不记录完整 ID）
- `flow-coordinator` classification：`relevant`，confidence `0.9`
- Agent Stack `assistant_message`：`true`
- Agent Stack `turn_finished.status`：`succeeded`
- fallback reason：`null`

视觉观察器提取到 `RE:FOCUS LOCAL OBSERVER`、任务输入与连接状态等页面事实；它没有直接输出相关性或灯光命令。最终相关性仍由 `flow-coordinator` 返回。

## 生产力工具误判修正

曾观察到代码编辑器画面被判为 `UNRELATED · 95%`，证据仅为“没有出现 PPT/RE:FOCUS 关键词”。该规则会把开发 RE:FOCUS、临时使用 GPT、搜索资料或剪辑 Demo 等合理步骤误判为跑偏。

修正后的确定性边界：

- 有直接任务证据：`relevant`。
- 生产力工具且没有明确冲突/娱乐信号：至少 `neutral`，confidence 上限 `0.65`。
- 明确其他项目或娱乐内容：保留 `unrelated`。
- `relevant` 与 `neutral` 均可通过绿灯门槛，但仍需人在场并连续稳定 5 秒。

自动测试已覆盖“PPT 任务期间编辑 React/Next.js，模型仅因关键词缺失而判 unrelated”的案例；最终结果被安全收敛为 `neutral`。
