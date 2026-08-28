import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { MockFlowCoordinator } from "../bridge/mock-flow-coordinator.mjs";
import { RefocusBridge } from "../bridge/refocus-bridge.mjs";

const events = (await readFile(
  new URL("../protocol/examples/happy-path.jsonl", import.meta.url),
  "utf8",
))
  .split(/\r?\n/)
  .filter((line) => line.trim())
  .map((line) => JSON.parse(line));

test("bridge completes the simulated RE:FOCUS loop", async () => {
  const coordinator = new MockFlowCoordinator();
  const bridge = new RefocusBridge({ coordinator });

  for (const event of events) await bridge.process(event);

  assert.equal(bridge.state, "ENDED");
  assert.equal(coordinator.calls.length, 4);
  assert.deepEqual(
    coordinator.calls.map(({ operation }) => operation),
    ["startSession", "createCheckpoint", "createRestore", "endSession"],
  );
  assert.match(bridge.checkpoint.last_progress, /PPT 从 2 页增加到 3 页/);
  assert.ok(bridge.effects.some(({ type }) => type === "CHECKPOINT_READY"));
  assert.ok(bridge.effects.some(({ type }) => type === "RESTORE_READY"));
  assert.ok(bridge.effects.some(({ type }) => type === "SUMMARY_READY"));
  assert.ok(bridge.effects.some(({ type }) => type === "REFLECTION_REQUIRED"));
});

test("activity samples and progress updates never call the coordinator directly", async () => {
  const coordinator = new MockFlowCoordinator();
  const bridge = new RefocusBridge({ coordinator });

  await bridge.process(events[0]);
  const callsAfterStart = coordinator.calls.length;
  await bridge.process(events[1]);
  await bridge.process(events[2]);

  assert.equal(coordinator.calls.length, callsAfterStart);
});

test("bridge keeps setup active until a vague task is clarified", async () => {
  const calls = [];
  const coordinator = {
    async startSession(input) {
      calls.push("startSession");
      return {
        coordinator_session_id: "sess_test",
        task_contract: {
          schema_version: "1.0",
          skill: "task-setup",
          status: "needs_clarification",
          goal: null,
          deliverable: null,
          success_criteria: [],
          focus_minutes: input.focus_minutes,
          relevance_hints: { keywords: [], apps: [], domains: [] },
          clarification_question: "这次具体要完成什么？",
          confidence: 0.3,
        },
      };
    },
    async clarifyTask(input) {
      calls.push("clarifyTask");
      return {
        ...input.previous_contract,
        status: "ready",
        goal: input.answer,
        deliverable: input.answer,
        success_criteria: ["形成可见成果"],
        clarification_question: null,
        confidence: 0.9,
      };
    },
  };
  const bridge = new RefocusBridge({ coordinator });
  const start = {
    ...events[0],
    payload: { goal: "做一下项目", focus_minutes: 30 },
  };
  const clarification = {
    schema_version: "0.1",
    event_id: "evt_demo_clarify",
    session_id: start.session_id,
    sequence: 2,
    timestamp: "2026-08-28T10:00:05+08:00",
    source: "user",
    event: "TASK_CLARIFICATION",
    payload: { answer: "完成 RE:FOCUS 路演 PPT 的前三页" },
  };

  const startEffects = await bridge.process(start);
  assert.equal(bridge.state, "SETUP");
  assert.ok(startEffects.some(({ type }) => type === "TASK_CLARIFICATION_REQUIRED"));

  const clarifiedEffects = await bridge.process(clarification);
  assert.equal(bridge.state, "SETUP");
  assert.equal(bridge.taskContract.status, "ready");
  assert.ok(clarifiedEffects.some(({ type }) => type === "TASK_READY"));
  assert.deepEqual(calls, ["startSession", "clarifyTask"]);
});
