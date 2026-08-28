# 任务检测与理解真人验收

日期：2026-08-28（Asia/Shanghai）

## 模糊任务测试

输入：`做一下比赛 PPT`

结果：

- `status=needs_clarification`
- `confidence=0.30`
- 只追问一个问题：`这个比赛 PPT 的主题和具体内容是什么？`
- 未伪造交付物或成功标准。
- Turn 同时出现 `assistant_message=true` 与 `turn_finished.status=succeeded`。

## 具体任务测试

输入：`完成 RE:FOCUS 路演 PPT 前三页：第一页说明专注痛点，第二页说明解决方案，第三页说明摇杆、RGB 灯和 Agent Stack 技术架构`

结果：

- `status=ready`
- `confidence=0.90`
- 目标保持完整，没有扩大范围。
- 可见交付物：`RE:FOCUS 路演 PPT 前三页文件`
- 成功标准被确定性限制为三条，覆盖三页完整性、前两页内容和第三页技术架构。
- 相关线索只保留原文中实际出现的关键词：RE:FOCUS、路演、PPT、专注痛点、解决方案、摇杆、RGB 灯、Agent Stack。
- 没有保留模型擅自补充的 PowerPoint、Keynote、Google Slides，也没有接受伪造域名。
- Turn 同时出现 `assistant_message=true` 与 `turn_finished.status=succeeded`。

## 测试发现并修复的问题

1. 模型曾把“演示文稿设计、路演”错误放进域名数组，并补充用户未指定的应用。现由确定性代码只保留原文明确出现的应用、关键词与合法域名。
2. 模型偶尔返回超过三条成功标准。现在适配器接受有限候选并确定性截取前三条，最终产品合同始终保持 1～3 条。

## 结论

任务理解闭环已满足：模糊任务不猜测、只问一个问题；具体任务返回可验证合同；模型输出越界时由本地程序约束；只有 NDJSON 成功节点完整时才进入产品状态。
