import { AgentStackFlowCoordinator } from "../bridge/agent-stack-flow-coordinator.mjs";

const coordinator = AgentStackFlowCoordinator.fromEnvironment();
const started = await coordinator.startSession({
  local_session_id: `local_skill_smoke_${Date.now()}`,
  goal: "在 30 分钟内完成 RE:FOCUS 路演 PPT 的前三页",
  focus_minutes: 30,
});

const relevance = await coordinator.classifyContext({
  local_session_id: "local_skill_smoke",
  task_contract: started.task_contract,
  observation: {
    active_app: "PowerPoint",
    window_title: "RE:FOCUS 路演.pptx",
    domain: null,
    screen_shared: true,
    screen_change_score: 0.08,
  },
});

const summary = await coordinator.endSession({
  local_session_id: "local_skill_smoke",
  task_contract: started.task_contract,
  goal: started.task_contract.goal,
  success_criteria: started.task_contract.success_criteria,
  recent_progress: ["完成了前三页初稿"],
  focus_minutes_actual: 25,
  interruptions: { count: 1, total_seconds: 8, main_reason: "off_task" },
  user_feedback: {
    completion_report: "完成了前三页初稿",
    focus_experience: "整体比较专注，中间短暂分心了一次",
  },
  end_reason: "user_finished",
});

const trace = coordinator.trace;
const successful = trace.length === 3 && trace.every(
  (item) => item.assistantMessageObserved === true && item.status === "succeeded",
);

console.log(JSON.stringify({
  successful,
  session_id: coordinator.sessionId,
  task_setup: started.task_contract,
  context_relevance: relevance,
  session_summary: summary,
  trace,
}, null, 2));

if (!successful) process.exitCode = 1;
