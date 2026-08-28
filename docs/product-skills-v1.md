# RE:FOCUS 产品 Skills v1

状态：三个本地包及输出合同已完成验证，尚未发布或安装到线上 `flow-coordinator`。

## Skill 边界

| Skill | 调用时机 | 唯一职责 | 不负责 |
| --- | --- | --- | --- |
| `task-setup` | Session 开始或用户补充目标时 | 形成可验证任务合同，必要时只追问一个问题 | 窗口判断、提醒、硬件 |
| `context-relevance` | 本地规则无法判断某个窗口时 | 将一个前台上下文分类为 relevant / neutral / unrelated / unknown | 摄像头、人体状态、提醒、硬件 |
| `session-summary` | Session 主动结束或取消后 | 根据已验证事件生成事实总结和一个下一步 | 实时判断、评分、硬件 |

## 提醒与灯光不放进 Skill

Skill 只生成语义事实。确定性状态机组合以下证据：

```text
任务合同
+ 当前窗口相关性
+ 人在场/离席时长
+ 输入和进展事件
+ 持续时间阈值
→ 是否中断
→ 安全灯光状态
```

这样可以避免模型因为一次偏头、窗口切换或措辞变化直接点亮红灯。

逻辑状态到设备输出的白名单映射为：

| 状态 | RGB 输出 |
| --- | --- |
| `SETUP` 且等待用户补充 | 黄灯慢闪 |
| `SETUP` 且等待窗口/人在场稳定 | 黄灯常亮 |
| `FOCUSING` | 绿灯常亮 |
| `INTERRUPTED` | 红灯慢闪 |
| `ENDED` | 熄灭 |

无论最终由 ROROLEE App 还是本地 Bridge 调用硬件，设备执行层只能接受这组白名单状态。

## 合同位置

- `product-skills/task-setup/references/task-contract.schema.json`
- `product-skills/context-relevance/references/context-relevance.schema.json`
- `product-skills/session-summary/references/session-summary.schema.json`

每个合同都禁止额外字段。示例输出位于相同目录的 `contract-example.json`。

## 本地验收

```powershell
python -m unittest tests/test_product_skill_contracts.py -v
```

验收覆盖：

- 三个示例均符合各自 JSON Schema；
- `context-relevance` 不能输出灯光或硬件命令；
- `session-summary` 不能输出未定义的生产力评分。

## 上线前剩余步骤

1. 使用真实输入分别前向测试三个 Skill。
2. 在 Agent Stack Console 创建或上传 Skill 包。
3. 检查版本和文件后发布。
4. 将精确版本安装到 `flow-coordinator`。
5. 每个 Skill 分别保留一次 `assistant_message + turn_finished.status=succeeded` Trace。
6. 确认 ROROLEE App 选择或绑定的是该 `flow-coordinator`。

发布、安装和 Agent 修改都是线上写操作，必须在执行时单独确认。
