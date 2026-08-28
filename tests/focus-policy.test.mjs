import assert from "node:assert/strict";
import test from "node:test";
import { FocusSignalPolicy } from "../web-monitor/public/focus-policy.js";

const healthy = {
  taskReady: true,
  screenShared: true,
  present: true,
  confirmedPresent: true,
  lastFaceSeen: true,
  missingSeconds: 0,
  headDirection: "toward_screen",
  headAwaySeconds: 0,
};

function enterGreen(policy) {
  policy.recordContext("relevant");
  policy.evaluate(healthy, 1);
  return policy.evaluate(healthy, 5_001);
}

test("enters green only after five stable seconds", () => {
  const policy = new FocusSignalPolicy();
  policy.recordContext("relevant");
  assert.equal(policy.evaluate(healthy, 1).light, "yellow");
  assert.equal(policy.evaluate(healthy, 5_001).light, "green");
});

test("keeps green for a short head turn and one unrelated sample", () => {
  const policy = new FocusSignalPolicy();
  enterGreen(policy);
  policy.recordContext("unrelated");
  const decision = policy.evaluate({ ...healthy, headDirection: "left", headAwaySeconds: 4 }, 8_000);
  assert.equal(decision.light, "green");
  assert.equal(decision.unrelated_streak, 1);
});

test("turns red after three seconds without a face", () => {
  const policy = new FocusSignalPolicy();
  enterGreen(policy);
  assert.equal(policy.evaluate({ ...healthy, present: false, confirmedPresent: false, missingSeconds: 2.9 }, 8_000).light, "green");
  assert.equal(policy.evaluate({ ...healthy, present: false, confirmedPresent: false, missingSeconds: 3 }, 8_100).light, "red");
});

test("turns red after two unrelated visual confirmations", () => {
  const policy = new FocusSignalPolicy();
  enterGreen(policy);
  policy.recordContext("unrelated");
  assert.equal(policy.evaluate(healthy, 10_000).light, "green");
  policy.recordContext("unrelated");
  assert.equal(policy.evaluate(healthy, 20_000).light, "red");
});

test("cross-validates one unrelated result with eight seconds of head deviation", () => {
  const policy = new FocusSignalPolicy();
  enterGreen(policy);
  policy.recordContext("unrelated");
  assert.equal(policy.evaluate({ ...healthy, headDirection: "right", headAwaySeconds: 8 }, 12_000).light, "red");
});

test("recovers only after person and relevant context remain stable for three seconds", () => {
  const policy = new FocusSignalPolicy();
  enterGreen(policy);
  policy.evaluate({ ...healthy, present: false, confirmedPresent: false, missingSeconds: 3 }, 8_000);
  policy.recordContext("neutral");
  assert.equal(policy.evaluate(healthy, 9_000).light, "red");
  assert.equal(policy.evaluate(healthy, 12_000).light, "green");
});
