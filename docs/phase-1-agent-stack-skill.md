# 阶段 1：官方 Agent Stack Developer Skill 验收

验收日期：2026-08-28（Asia/Shanghai）

## 结论

阶段 1 已完成。官方开发 Skill 已安装在：

```text
.agents/skills/agent-stack-developer/
```

它是给 Codex/开发者使用的 Agent Stack 开发说明，不是 `flow-coordinator` 的运行时 Skill，不应安装到产品 Agent。

## 固定版本与完整性

- 来源：`https://github.com/mem9-ai/agent-stack-dev-guide`
- Git submodule 提交：`bed43b919b41486ef6fd8c5ae0f5f3144f28de6f`
- `SKILL.md` SHA-256：`0BFE08467142B51102BF72C326C2B9BBBCF97E1E2489EC28961290D446E37DBD`

已完整核对：

- `SKILL.md`
- `references/core-workflows.md`
- `references/reliability.md`
- `references/advanced-workflows.md`
- `references/openapi.yaml` 中 Project、Agent、Session、Turn、Skill 安装及 `turn_finished` 相关接口

## 后续强制执行规则

仓库根目录的 `AGENTS.md` 已加入强制规则。以后只要任务涉及 Agent Stack，就必须：

1. 先读取官方 `SKILL.md` 并按请求类型加载对应参考文件。
2. 以 `openapi.yaml` 为接口权威，不能凭记忆猜路径、Header 或 JSON。
3. Key 只来自环境变量，不得进入代码、Git、日志、固件、前端或截图。
4. Turn 必须逐行解析 NDJSON；同时观察到 `assistant_message` 和 `turn_finished.payload.status == "succeeded"` 才算成功。
5. 中断后先查历史，不盲目重复创建 Turn。
6. 官方开发 Skill 与产品 Skills 严格分离。

## 阶段 2 的入口条件

开始配置与调用前，本地终端应存在：

```text
AGENT_STACK_BASE_URL
AGENT_STACK_USER_API_KEY
```

可选：

```text
AGENT_STACK_PROJECT_ID
AGENT_STACK_AGENT_ID
```

检查时只能确认“存在/不存在”和 Key 前缀类型，绝不能输出完整 Key。

