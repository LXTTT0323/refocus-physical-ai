import { cp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const output = join(root, "public");

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(join(root, "web-monitor", "public"), output, { recursive: true });
await cp(
  join(root, "node_modules", "@mediapipe", "tasks-vision"),
  join(output, "vendor"),
  { recursive: true },
);

console.log("REFOCUS_VERCEL_STATIC_READY");
