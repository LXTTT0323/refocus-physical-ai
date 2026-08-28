import { readFile } from "node:fs/promises";
import { MockFlowCoordinator } from "../bridge/mock-flow-coordinator.mjs";
import { RefocusBridge } from "../bridge/refocus-bridge.mjs";

const file = process.argv[2] ?? "protocol/examples/happy-path.jsonl";
const events = (await readFile(file, "utf8"))
  .split(/\r?\n/)
  .filter((line) => line.trim())
  .map((line) => JSON.parse(line));

const coordinator = new MockFlowCoordinator();
const bridge = new RefocusBridge({ coordinator });

for (const event of events) {
  const effects = await bridge.process(event);
  console.log(`${event.event} -> state=${bridge.state}`);
  for (const effect of effects.filter(({ type }) => type !== "STATE_CHANGED")) {
    if (effect.type === "CHECKPOINT_READY") {
      console.log(`  CHECKPOINT: ${effect.checkpoint.status_line}`);
      console.log(`  NEXT: ${effect.checkpoint.next_action}`);
    } else if (effect.type === "RESTORE_READY") {
      console.log(`  RESTORE: ${effect.restore.restore_message}`);
    } else if (effect.type === "SUMMARY_READY") {
      console.log(`  SUMMARY: ${effect.summary.summary}`);
    } else {
      console.log(`  ${effect.type}`);
    }
  }
}

console.log(
  `BRIDGE_DEMO_OK final_state=${bridge.state} coordinator_calls=${coordinator.calls.length}`,
);

