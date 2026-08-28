import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { RefocusStateMachine, STATES } from "../bridge/state-machine.mjs";

const happyPath = (await readFile(
  new URL("../protocol/examples/happy-path.jsonl", import.meta.url),
  "utf8",
))
  .split(/\r?\n/)
  .filter((line) => line.trim())
  .map((line) => JSON.parse(line));

function event(sequence, name, payload = {}) {
  return {
    schema_version: "0.1",
    event_id: `evt_test_${String(sequence).padStart(4, "0")}`,
    session_id: "local_test_0001",
    sequence,
    timestamp: new Date(Date.UTC(2026, 7, 28, 2, 0, sequence)).toISOString(),
    source: "state_machine",
    event: name,
    payload,
  };
}

test("happy path reaches ENDED", () => {
  const machine = new RefocusStateMachine();
  for (const item of happyPath) machine.apply(item);
  assert.equal(machine.state, STATES.ENDED);
  assert.equal(machine.history.length, 8);
});

test("an interruption cannot also mean that the user returned", () => {
  const machine = new RefocusStateMachine();
  machine.apply(event(1, "SESSION_START", { goal: "写 PPT", focus_minutes: 30 }));
  machine.apply(event(2, "ACTIVITY_SAMPLE", { sample: true }));
  machine.apply(event(3, "FOCUS_READY", {
    task_ready: true,
    present: true,
    context_relevant: true,
    stable_seconds: 5,
  }));
  machine.apply(
    event(4, "INTERRUPTION_DETECTED", {
      reason: "absent",
      duration_seconds: 35,
    }),
  );

  assert.throws(
    () =>
      machine.apply(
        event(5, "INTERRUPTION_DETECTED", {
          reason: "absent",
          duration_seconds: 40,
        }),
      ),
    /invalid while state=INTERRUPTED/,
  );
});

test("SESSION_RESUMED requires RETURN_DETECTED first", () => {
  const machine = new RefocusStateMachine();
  machine.apply(event(1, "SESSION_START", { goal: "写 PPT", focus_minutes: 30 }));
  machine.apply(event(2, "ACTIVITY_SAMPLE", { sample: true }));
  machine.apply(event(3, "FOCUS_READY", {
    task_ready: true,
    present: true,
    context_relevant: true,
    stable_seconds: 5,
  }));
  machine.apply(
    event(4, "INTERRUPTION_DETECTED", {
      reason: "absent",
      duration_seconds: 35,
    }),
  );

  assert.throws(
    () =>
      machine.apply(
        event(5, "SESSION_RESUMED", {
          restore_message: "继续写第三页",
        }),
      ),
    /invalid while state=INTERRUPTED/,
  );
});

test("RETURN_DETECTED requires ten stable seconds", () => {
  const machine = new RefocusStateMachine();
  machine.apply(event(1, "SESSION_START", { goal: "写 PPT", focus_minutes: 30 }));
  machine.apply(event(2, "ACTIVITY_SAMPLE", { sample: true }));
  machine.apply(event(3, "FOCUS_READY", {
    task_ready: true,
    present: true,
    context_relevant: true,
    stable_seconds: 5,
  }));
  machine.apply(
    event(4, "INTERRUPTION_DETECTED", {
      reason: "absent",
      duration_seconds: 35,
    }),
  );

  assert.throws(
    () =>
      machine.apply(
        event(5, "RETURN_DETECTED", {
          present: true,
          stable_seconds: 5,
        }),
      ),
    /stable_seconds >= 10/,
  );
});

test("duplicate or skipped events are rejected", () => {
  const machine = new RefocusStateMachine();
  const start = event(1, "SESSION_START", { goal: "写 PPT", focus_minutes: 30 });
  machine.apply(start);
  assert.throws(() => machine.apply(start), /Duplicate event_id/);
  assert.throws(
    () => machine.apply(event(3, "ACTIVITY_SAMPLE", { sample: true })),
    /expected 2, received 3/,
  );
});

test("setup does not focus until the readiness gate passes", () => {
  const machine = new RefocusStateMachine();
  machine.apply(event(1, "SESSION_START", { goal: "做一下 PPT", focus_minutes: 30 }));
  machine.apply(event(2, "ACTIVITY_SAMPLE", { sample: true }));
  assert.equal(machine.state, STATES.SETUP);

  assert.throws(
    () => machine.apply(event(3, "FOCUS_READY", {
      task_ready: true,
      present: true,
      context_relevant: false,
      stable_seconds: 5,
    })),
    /requires task_ready, present, and context_relevant/,
  );
});
