import assert from "node:assert/strict";
import test from "node:test";
import { AgentStackFlowCoordinator } from "../bridge/agent-stack-flow-coordinator.mjs";

function ndjsonResponse(events) {
  return new Response(`${events.map((event) => JSON.stringify(event)).join("\n")}\n`, {
    status: 201,
    headers: { "Content-Type": "application/x-ndjson" },
  });
}

function successfulTurn(text, suffix = "1") {
  return ndjsonResponse([
    {
      event: "turn_started",
      turnId: `turn_${suffix}`,
      sessionId: "sess_test",
      agentRunId: `run_${suffix}`,
      seq: 1,
      createdAt: "2026-08-28T00:00:00.000Z",
      payload: {},
    },
    {
      event: "assistant_message",
      turnId: `turn_${suffix}`,
      sessionId: "sess_test",
      agentRunId: `run_${suffix}`,
      seq: 2,
      createdAt: "2026-08-28T00:00:01.000Z",
      payload: { messageId: `msg_${suffix}`, text },
    },
    {
      event: "turn_finished",
      turnId: `turn_${suffix}`,
      sessionId: "sess_test",
      agentRunId: `run_${suffix}`,
      seq: 3,
      createdAt: "2026-08-28T00:00:02.000Z",
      payload: { status: "succeeded" },
    },
  ]);
}

test("real coordinator adapter creates one Session and parses NDJSON Turns", async () => {
  const responses = [
    new Response(JSON.stringify({ session: { sessionId: "sess_test" } }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    }),
    successfulTurn('{"understood_goal":"完成 PPT"}', "1"),
    successfulTurn(
      '{"last_progress":"已完成结构","next_action":"补充痛点","status_line":"进度已保存"}',
      "2",
    ),
    successfulTurn(
      '{"restore_message":"刚完成结构，继续补充痛点。","next_action":"补充痛点"}',
      "3",
    ),
    successfulTurn('{"summary":"完成了结构整理","completed":true}', "4"),
  ];
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    return responses.shift();
  };
  const coordinator = new AgentStackFlowCoordinator({
    baseUrl: "https://example.invalid",
    apiKey: "test-secret",
    projectId: "proj_test",
    agentId: "agent_test",
    fetchImpl,
  });

  const started = await coordinator.startSession({
    local_session_id: "local_test",
    goal: "完成 PPT",
    focus_minutes: 30,
  });
  const checkpoint = await coordinator.createCheckpoint({ interruption_sequence: 4 });
  const restore = await coordinator.createRestore({ checkpoint });
  const summary = await coordinator.endSession({ end_reason: "user_finished" });

  assert.equal(started.coordinator_session_id, "sess_test");
  assert.equal(checkpoint.next_action, "补充痛点");
  assert.equal(restore.restore_message, "刚完成结构，继续补充痛点。");
  assert.equal(summary.completed, true);
  assert.equal(requests.length, 5);
  assert.equal(coordinator.trace.length, 4);
  assert.ok(coordinator.trace.every(({ status }) => status === "succeeded"));
});

test("adapter rejects non-JSON assistant output", async () => {
  const responses = [
    new Response(JSON.stringify({ session: { sessionId: "sess_test" } }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    }),
    successfulTurn("不是 JSON"),
  ];
  const coordinator = new AgentStackFlowCoordinator({
    baseUrl: "https://example.invalid",
    apiKey: "test-secret",
    projectId: "proj_test",
    agentId: "agent_test",
    fetchImpl: async () => responses.shift(),
  });

  await assert.rejects(
    coordinator.startSession({
      local_session_id: "local_test",
      goal: "完成 PPT",
      focus_minutes: 30,
    }),
    /not strict JSON/,
  );
});

