# RE:FOCUS 网页监测 × Agent Stack 验收

日期：2026-08-28（Asia/Shanghai）

## 验收结果

已在本地网页的安全演示模式中连接真实 TiDB Agent Stack `flow-coordinator`，完成两个 Turn：

1. `SETUP_TASK`：把完整的三页路演目标整理为 `task-setup` 合同，返回 `status=ready`。
2. `CLASSIFY_CONTEXT`：输入应用 `PowerPoint` 与窗口标题 `RE:FOCUS 路演 PPT - 技术架构`，返回 `classification=relevant`、`confidence=0.95`。

两个 Turn 均同时满足：

- 出现 `assistant_message`；
- `turn_finished.status=succeeded`；
- 输出通过本地严格 JSON Schema/字段白名单校验。

网页最终满足四项门槛并进入 `FOCUSING · 绿灯`：任务合同 ready、人在场、当前窗口相关、条件稳定至少 5 秒。

## 测试中发现并修正的问题

首次用模糊目标“完成前三页”测试时，Agent 正确返回 `needs_clarification`。补充三页内容后，模型曾返回不符合 `success_criteria` 数组上限的结果，本地校验拒绝该结果。随后收紧 `SETUP_TASK / CLARIFY_TASK` 的数组格式和最多三项约束，并重新用完整目标验证成功。

这证明网页没有把“模型有文字回复”误当成功：返回 JSON 不符合合同，即使云端 Turn 已完成，业务层仍会失败并保留错误节点。

## 隐私与限制

- 本次演示模式没有启用真实摄像头或屏幕，仅用于验收界面和真实 Agent Turn。
- 实际模式的摄像头与屏幕帧在浏览器本地处理，不上传 Agent Stack。
- 浏览器每次开始屏幕共享都必须由用户手动确认。
- V1 的屏幕像素变化不等于任务进展；语义相关性由用户填写的应用/标题/域名与任务合同交叉判断。

## 自动测试

- Node：16/16 通过。
- Python 产品 Skill 合同：3/3 通过。
- 已覆盖真实适配器 NDJSON 成功条件、错误 JSON、硬件字段越权、Web API、任务澄清、状态机和三个产品 Skill 示例 Schema。
