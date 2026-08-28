import { AgentStackFlowCoordinator } from "../bridge/agent-stack-flow-coordinator.mjs";

const coordinator = AgentStackFlowCoordinator.fromEnvironment();
const started = await coordinator.startSession({
  local_session_id: `local_clarification_${Date.now()}`,
  goal: "做一下项目",
  focus_minutes: 30,
});

console.log(`FIRST_STATUS ${started.task_contract.status}`);
console.log(`FIRST_QUESTION ${started.task_contract.clarification_question ?? "none"}`);

if (started.task_contract.status !== "needs_clarification") {
  throw new Error("Expected the vague task to require clarification");
}

const clarified = await coordinator.clarifyTask({
  coordinator_session_id: started.coordinator_session_id,
  previous_contract: started.task_contract,
  answer: "完成 RE:FOCUS 路演 PPT 的前三页，每页都有标题和核心内容",
});

console.log(`SECOND_STATUS ${clarified.status}`);
console.log(`SECOND_GOAL ${clarified.goal ?? "none"}`);
for (const item of coordinator.trace) {
  console.log(
    `TRACE operation=${item.operation} turn=${item.turnId} run=${item.agentRunId} status=${item.status} assistant_message=${item.assistantMessageObserved}`,
  );
}

if (clarified.status !== "ready") {
  throw new Error("Expected the clarification answer to produce a ready task");
}

console.log(`TASK_CLARIFICATION_OK session=${coordinator.sessionId}`);
