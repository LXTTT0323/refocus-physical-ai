import test from "node:test";
import assert from "node:assert/strict";

import {
  encodeRefocusSerialCommand,
  parseRefocusSerialLine,
  serialCommandForLight,
} from "../web-monitor/public/refocus-serial.js";

test("ignores normal ESP-IDF logs and parses RE:FOCUS protocol frames", () => {
  assert.equal(parseRefocusSerialLine("I (10) boot: hello"), null);
  assert.deepEqual(
    parseRefocusSerialLine('@REFOCUS {"v":1,"type":"session_active","value":true,"seq":2}'),
    { v: 1, type: "session_active", value: true, seq: 2 },
  );
});

test("rejects unsupported protocol frames", () => {
  assert.throws(
    () => parseRefocusSerialLine('@REFOCUS {"v":2,"type":"boot"}'),
    /unsupported/,
  );
});

test("maps focus lights to C board V2 commands", () => {
  assert.deepEqual(serialCommandForLight("yellow"), { type: "set_led", rgb: "201600", mode: "solid" });
  assert.deepEqual(serialCommandForLight("green"), { type: "set_led", rgb: "002000", mode: "solid" });
  assert.deepEqual(serialCommandForLight("red"), { type: "set_led", rgb: "200000", mode: "solid" });
  assert.equal(encodeRefocusSerialCommand({ type: "get_state" }), '{"type":"get_state"}\n');
});
