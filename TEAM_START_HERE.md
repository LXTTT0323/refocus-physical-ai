# RE:FOCUS 队友从这里开始

这是比赛唯一主仓库。产品决策、Agent Stack、Desktop Bridge、协议、测试和 C 板固件都以这里为准。

## 1. 第一次获取代码

```bash
git clone --recurse-submodules https://github.com/LXTTT0323/refocus-physical-ai.git
cd refocus-physical-ai
```

如果已经克隆但缺少 `external` 里的代码：

```bash
git submodule update --init --recursive
```

真实密钥只放环境变量。复制 `.env.example` 只用于查看变量名，不要把填过真实 Key 的 `.env` 提交或发群。

## 2. 当前系统边界

```text
C 板摇杆 / RGB
  ↕ USB 串口 JSONL
Desktop Bridge（Windows 或 macOS）
  ↕ HTTPS / NDJSON
TiDB Agent Stack / flow-coordinator
```

- 不依赖 ROROLEE App 完成正式闭环。
- 电脑摄像头与前台窗口信号由 Desktop Bridge 采集。
- Agent 负责理解与建议；状态机和硬件动作由确定性代码执行。
- 第一版屏幕、板载摄像头、语音和产品 Skills 都不是阻塞项。

## 3. 三条并行工作线

### A. 硬件（当前由 macOS 队友验证）

- 固件位置：`external/agent-link/boards/refocus-c-v2/`
- 分支：`LXTTT0323/Agent_link:refocus-c-v2`
- 目标：摇杆保持向前触发 `session_active=true`，回原位触发 `false`；Bridge 可控制 RGB。
- 烧录与串口验收：`handoff/README_MAC_V2.md`
- 串口协议：`handoff/SERIAL_PROTOCOL_V2.md`

### B. Agent Stack / Desktop Bridge（当前主开发线）

- Agent：`flow-coordinator`
- Bridge：`bridge/`
- 协议：`protocol/` 与 `docs/event-protocol-v0.md`
- 已验收：Hello World、NDJSON、四节点真实 Agent 闭环。
- 下一目标：先用电脑模拟信号跑通“任务明确 → 专注 → 交叉确认分心 → 恢复 → 总结”。

### C. 产品与演示

- MVP：`docs/refocus-mvp.md`
- 心流/分心判断：`docs/flow-detection-plan.md`
- 官方标准与交付：`docs/official-standard.md`
- 演示只承诺已通过真机或自动测试的能力。

## 4. 改代码的协作方式

```bash
git switch -c feat/你的功能名
# 修改、测试后提交
git add <相关文件>
git commit -m "feat: 简短说明"
git push -u origin feat/你的功能名
```

通过 Pull Request 合入 `main`。不要直接提交真实 Key、个人摄像头画面、完整屏幕截图、串口隐私日志或构建目录。

修改 C 板固件时，请在 `Agent_link` Fork 的新分支提交，再更新主仓库的子模块版本；不要把整份固件复制回主仓库。

## 5. 当前完成标准

下一里程碑必须同时看到：

1. 模拟或真实摇杆开始一次 Session；
2. 任务达到明确标准；
3. 前台窗口与人在场信号进入状态机；
4. 两类信号持续满足阈值后才判定分心；
5. 回到任务后自动恢复绿色状态；
6. 结束后生成结构化总结；
7. Agent Stack Turn 同时出现 `assistant_message` 和 `turn_finished.status=succeeded`。
