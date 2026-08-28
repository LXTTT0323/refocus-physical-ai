import { readFile } from "node:fs/promises";
import { RefocusStateMachine } from "../bridge/state-machine.mjs";

const file = process.argv[2] ?? "protocol/examples/happy-path.jsonl";
const text = await readFile(file, "utf8");
const lines = text.split(/\r?\n/).filter((line) => line.trim());
const machine = new RefocusStateMachine();

for (const line of lines) {
  const transition = machine.apply(JSON.parse(line));
  const sequence = String(transition.sequence).padStart(2, "0");
  console.log(
    `${sequence} ${transition.from} --${transition.event}--> ${transition.to}`,
  );
}

console.log(`REPLAY_OK final_state=${machine.state}`);

