# flow-coordinator 基线验收

验收日期：2026-08-28（Asia/Shanghai）

## Agent

- 名称：`flow-coordinator`
- Agent ID：`agent_d6aa…c468e`
- Project：`Default Project`
- Project ID：`proj_2820…3c25f`
- 模板：`Default Agent`
- Runtime：`pi`
- Sandbox Profile：`standard-v1`
- 已安装产品 Skill：0

官方 `agent-stack-developer` 是本地开发说明，没有安装到该 Agent。

## API 基线测试

- Session ID：`sess_85dd…dd85c`
- Turn ID：`turn_2d41…4f394`
- Agent Run ID：`run_c229…760aa`

观察到：

```text
assistant_message: HELLO_REFOCUS_API_OK
turn_finished: status=succeeded
API_HELLO_WORLD_OK
```

结论：正式 Agent 的 Project、Session、Turn、NDJSON 和 Trace 基线已经成立，可以独立于产品 Skill 继续开发 Bridge 与事件协议。

## Skill 暂停点

根据 2026-08-28 的产品决定，三个产品 Skill 暂停设计、上传与安装，等待重新确认职责和 JSON 合同。

本地 `product-skills/task-setup/` 只是未定稿草稿，不作为正式版本，不得上传或安装。
