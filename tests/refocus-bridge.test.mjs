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

