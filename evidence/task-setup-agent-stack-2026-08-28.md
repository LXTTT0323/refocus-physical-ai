# Agent Stack 任务明确度验收

日期：2026-08-28（Asia/Shanghai）

## 验收目标

- 明确任务产生完整 `task-setup` v1 合同。
- 模糊任务保持在 `SETUP`，返回 `needs_clarification` 和一个问题。
- 用户补充后在同一个 Agent Stack Session 中返回 `ready`。
- 每个 Turn 必须同时出现 `assistant_message` 与 `turn_finished.status=succeeded`。

## 自动测试

- 状态机与 Bridge 共 12 项测试通过。
- 正常事件流共 8 个事件，最终状态为 `ENDED`。
- `ACTIVITY_SAMPLE` 不再使 `SETUP` 自动跳到 `FOCUSING`。
- `FOCUS_READY` 只有在任务明确、人在场、窗口相关且稳定至少 5 秒时才成立。

## 真实明确任务闭环

Agent Stack Session：`sess_627d…b4774`

| 操作 | Turn | Agent Run | 结果 |
| --- | --- | --- | --- |
| `SETUP_TASK` | `turn_b2fa…11f59` | `run_d754…dd22e` | succeeded + assistant message |
| `CREATE_CHECKPOINT` | `turn_137a…d8afb` | `run_cefc…54b45` | succeeded + assistant message |
| `CREATE_RESTORE` | `turn_b29c…0af66` | `run_102c…c5564` | succeeded + assistant message |
| `END_SESSION` | `turn_87ec…930d1` | `run_a422…5c29f` | succeeded + assistant message |

## 真实模糊任务与补充

Agent Stack Session：`sess_e8fc…66481`

输入“做一下项目”后，首个 Turn 返回：

- `status=needs_clarification`
- 问题：希望完成的具体交付物是什么。

用户补充“完成 RE:FOCUS 路演 PPT 的前三页，每页都有标题和核心内容”后，同一 Session 返回：

- `status=ready`
- 规范化目标：完成 RE:FOCUS 路演 PPT 的前三页。

| 操作 | Turn | Agent Run | 结果 |
| --- | --- | --- | --- |
| `SETUP_TASK` | `turn_db09…ff771` | `run_e575…3851c9` | succeeded + assistant message |
| `CLARIFY_TASK` | `turn_387a…25da9` | `run_8774…cecb81` | succeeded + assistant message |

首次调试时，第二个 Turn 曾遗漏必填的 `success_criteria`。本地严格校验拒绝了不完整结果，没有进入状态机。强化“完整十字段合同”提示后重新建立测试 Session，以上复验成功。
