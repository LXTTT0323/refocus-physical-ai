import { readFile } from "node:fs/promises";
import { RefocusStateMachine, STATES } from "../bridge/state-machine.mjs";

const file = process.argv[2] ?? "protocol/examples/happy-path.jsonl";
const text = await readFile(file, "utf8");
const lines = text.split(/\r?\n/).filter((line) => line.trim());

const machine = new RefocusStateMachine();

for (const [index, line] of lines.entries()) {
  const item = JSON.parse(line);
  const lineNumber = index + 1;

  try {
    machine.apply(item);
  } catch (error) {
    throw new Error(`Line ${lineNumber}: ${error.message}`);
  }
}

if (machine.state !== STATES.ENDED) {
  throw new Error(`Stream ended in ${machine.state}, expected ENDED`);
}

console.log(`EVENT_STREAM_OK events=${lines.length} final_state=${machine.state}`);
