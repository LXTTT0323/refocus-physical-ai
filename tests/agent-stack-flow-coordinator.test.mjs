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

function taskContract(overrides = {}) {
  return JSON.stringify({
    schema_version: "1.0",
    skill: "task-setup",
    status: "ready",
    goal: "完成 PPT 前三页",
    deliverable: "一份包含前三页的路演 PPT",
    success_criteria: ["前三页均有标题和正文"],
    focus_minutes: 30,
    relevance_hints: {
      keywords: ["RE:FOCUS"],
      apps: ["PowerPoint"],
      domains: [],
    },
    clarification_question: null,
    confidence: 0.92,
    ...overrides,
  });
}

function contextContract(overrides = {}) {
  return JSON.stringify({
    schema_version: "1.0",
    skill: "context-relevance",
    classification: "relevant",
    confidence: 0.94,
    evidence: ["PowerPoint 与任务应用提示匹配"],
    matched_hints: {
      keywords: ["RE:FOCUS"],
      apps: ["PowerPoint"],
      domains: [],
    },
    ...overrides,
  });
}

test("real coordinator adapter creates one Session and parses NDJSON Turns", async () => {
  const responses = [
    new Response(JSON.stringify({ session: { sessionId: "sess_test" } }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    }),
    successfulTurn(taskContract(), "1"),
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
  assert.equal(started.task_contract.status, "ready");
  assert.equal(checkpoint.next_action, "补充痛点");
  assert.equal(restore.restore_message, "刚完成结构，继续补充痛点。");
  assert.equal(summary.completed, true);
  assert.equal(requests.length, 5);
  assert.equal(coordinator.trace.length, 4);
  assert.ok(coordinator.trace.every(({ status }) => status === "succeeded"));
});

test("task setup can request and consume one clarification in the same Session", async () => {
  const responses = [
    new Response(JSON.stringify({ session: { sessionId: "sess_test" } }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    }),
    successfulTurn(taskContract({
      status: "needs_clarification",
      goal: null,
      deliverable: null,
      success_criteria: [],
      clarification_question: "这次要完成 PPT 的哪几页？",
      confidence: 0.4,
    }), "1"),
    successfulTurn(taskContract(), "2"),
  ];
  const coordinator = new AgentStackFlowCoordinator({
    baseUrl: "https://example.invalid",
    apiKey: "test-secret",
    projectId: "proj_test",
    agentId: "agent_test",
    fetchImpl: async () => responses.shift(),
  });

  const started = await coordinator.startSession({
    local_session_id: "local_test",
    goal: "做一下 PPT",
    focus_minutes: 30,
  });
  assert.equal(started.task_contract.status, "needs_clarification");

  const clarified = await coordinator.clarifyTask({
    previous_contract: started.task_contract,
    answer: "完成路演 PPT 的前三页",
  });
  assert.equal(clarified.status, "ready");
  assert.equal(coordinator.trace.length, 2);
});

test("task setup removes invented apps and malformed domains from relevance hints", async () => {
  const responses = [
    new Response(JSON.stringify({ session: { sessionId: "sess_test" } }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    }),
    successfulTurn(taskContract({
      goal: "完成 RE:FOCUS 路演 PPT",
      relevance_hints: {
        keywords: ["RE:FOCUS", "PPT", "不存在词"],
        apps: ["PowerPoint", "Keynote"],
        domains: ["路演", "slides.google.com"],
      },
    })),
  ];
  const coordinator = new AgentStackFlowCoordinator({
    baseUrl: "https://example.invalid",
    apiKey: "test-secret",
    projectId: "proj_test",
    agentId: "agent_test",
    fetchImpl: async () => responses.shift(),
  });

  const started = await coordinator.startSession({
    local_session_id: "local_test",
    goal: "完成 RE:FOCUS 路演 PPT",
    focus_minutes: 30,
  });
  assert.deepEqual(started.task_contract.relevance_hints, {
    keywords: ["RE:FOCUS", "PPT"],
    apps: [],
    domains: [],
  });
});

test("task setup deterministically caps model-generated success criteria at three", async () => {
  const responses = [
    new Response(JSON.stringify({ session: { sessionId: "sess_test" } }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    }),
    successfulTurn(taskContract({
      success_criteria: ["第一页完成", "第二页完成", "第三页完成", "整体美观"],
    })),
  ];
  const coordinator = new AgentStackFlowCoordinator({
    baseUrl: "https://example.invalid",
    apiKey: "test-secret",
    projectId: "proj_test",
    agentId: "agent_test",
    fetchImpl: async () => responses.shift(),
  });
  const started = await coordinator.startSession({
    local_session_id: "local_test",
    goal: "完成 PPT 前三页",
    focus_minutes: 30,
  });
  assert.deepEqual(started.task_contract.success_criteria, ["第一页完成", "第二页完成", "第三页完成"]);
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

test("context relevance is a strict succeeded Turn and cannot contain hardware commands", async () => {
  const responses = [
    new Response(JSON.stringify({ session: { sessionId: "sess_test" } }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    }),
    successfulTurn(taskContract(), "1"),
    successfulTurn(contextContract(), "2"),
  ];
  const coordinator = new AgentStackFlowCoordinator({
    baseUrl: "https://example.invalid",
    apiKey: "test-secret",
    projectId: "proj_test",
    agentId: "agent_test",
    fetchImpl: async () => responses.shift(),
  });

  const started = await coordinator.startSession({
    local_session_id: "local_test",
    goal: "完成 RE:FOCUS 路演 PPT",
    focus_minutes: 30,
  });
  const result = await coordinator.classifyContext({
    task_contract: started.task_contract,
    observation: {
      active_app: "PowerPoint",
      window_title: "RE:FOCUS Demo",
      domain: null,
      screen_shared: true,
      screen_change_score: 0.12,
    },
  });

  assert.equal(result.classification, "relevant");
  assert.equal(coordinator.trace.at(-1).status, "succeeded");
  assert.equal(coordinator.trace.at(-1).assistantMessageObserved, true);
});

test("context relevance rejects extra reminder or hardware fields", async () => {
  const responses = [
    new Response(JSON.stringify({ session: { sessionId: "sess_test" } }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    }),
    successfulTurn(taskContract(), "1"),
    successfulTurn(contextContract({ light: "red_blink" }), "2"),
  ];
  const coordinator = new AgentStackFlowCoordinator({
    baseUrl: "https://example.invalid",
    apiKey: "test-secret",
    projectId: "proj_test",
    agentId: "agent_test",
    fetchImpl: async () => responses.shift(),
  });
  const started = await coordinator.startSession({
    local_session_id: "local_test",
    goal: "完成 RE:FOCUS 路演 PPT",
    focus_minutes: 30,
  });

  await assert.rejects(
    coordinator.classifyContext({
      task_contract: started.task_contract,
      observation: {},
    }),
    /missing or unsupported fields/,
  );
});
