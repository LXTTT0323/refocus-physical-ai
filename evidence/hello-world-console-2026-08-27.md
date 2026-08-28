# Agent Stack Hello World 验证记录

- 日期：2026-08-27（Asia/Shanghai）
- Workspace：VentureD Participant 022
- Project：Default Project
- Agent：refocus-agent
- Session 模型：Qwen3.7 Plus
- 测试输入：`只回复：HELLO_REFOCUS_OK`
- 最终输出：`HELLO_REFOCUS_OK`
- Turn 状态：`succeeded`
- Run 展示：Started → Completed thinking → Assistant message → succeeded
- Operation：`llm.complete`
- Operation ID：`op_6b4c14da87bc485eb444e1d8b063ea9f`
- Turn ID：`turn_5cdc27fef4a64166a2f9293486aaef63`
- Run ID：`run_ba203b77c4ad4947a434f3a3a1b4d702`
- Runtime：`pi-agent-core`
- 请求模型/模型：`qwen3.7-plus`
- Provider：`openai`
- Operation Duration：1855 ms
- Input Tokens：4586
- Output Tokens：38
- Stop Reason：`stop`

## 结论

本次 Console 验证证明：账号与 Workspace 可用、Project 可用、Agent 创建成功、Session/Turn 可执行、模型真实调用完成、最终消息返回成功，并且 Operations 中存在可核对的 `llm.complete` 记录。

## 尚未证明

本记录尚未验证 User API Key 的 HTTP 调用、官方 TypeScript Hello World Bridge、Agent_link、A/D 板、音频、屏幕、摄像头或物理输出。下一门槛是使用 UAK 跑通 Project → Agent → Session → Turn 的 HTTP/NDJSON 链路。

本文件不包含密码、API Key、Cookie 或其他凭据。
