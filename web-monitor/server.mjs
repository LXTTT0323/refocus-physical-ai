import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { AgentStackFlowCoordinator } from "../bridge/agent-stack-flow-coordinator.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(here);
const publicRoot = join(here, "public");
const vendorRoot = join(projectRoot, "node_modules", "@mediapipe", "tasks-vision");
const sessions = new Map();

const MIME = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".wasm", "application/wasm"],
  [".task", "application/octet-stream"],
]);

function json(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 64 * 1024) throw new Error("Request body is too large");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function safeMessage(error) {
  const message = error instanceof Error ? error.message : "Unknown error";
  return message.replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
}

async function serveFile(response, root, relative) {
  const safeRelative = normalize(relative).replace(/^(\.\.[/\\])+/, "");
  const absolute = join(root, safeRelative);
  if (!absolute.startsWith(root)) return false;
  try {
    const info = await stat(absolute);
    if (!info.isFile()) return false;
    response.writeHead(200, {
      "Content-Type": MIME.get(extname(absolute)) ?? "application/octet-stream",
      "Cache-Control": absolute.endsWith(".task") ? "public, max-age=86400" : "no-cache",
    });
    createReadStream(absolute).pipe(response);
    return true;
  } catch {
    return false;
  }
}

export function createMonitorServer({ coordinatorFactory } = {}) {
  const makeCoordinator = coordinatorFactory ?? (() => AgentStackFlowCoordinator.fromEnvironment());

  return createServer(async (request, response) => {
    response.setHeader("Permissions-Policy", "camera=(self), display-capture=(self), microphone=()");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");

    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    try {
      if (request.method === "GET" && url.pathname === "/api/health") {
        const required = [
          "AGENT_STACK_BASE_URL",
          "AGENT_STACK_USER_API_KEY",
          "AGENT_STACK_PROJECT_ID",
          "AGENT_STACK_AGENT_ID",
        ];
        return json(response, 200, {
          ok: true,
          agent_stack_configured: required.every((name) => Boolean(process.env[name])),
          active_sessions: sessions.size,
        });
      }

      if (request.method === "POST" && url.pathname === "/api/session/start") {
        const body = await readJson(request);
        if (typeof body.goal !== "string" || !body.goal.trim()) {
          return json(response, 400, { error: "goal is required" });
        }
        const localSessionId = `local_web_${crypto.randomUUID().replaceAll("-", "")}`;
        const coordinator = makeCoordinator();
        const started = await coordinator.startSession({
          local_session_id: localSessionId,
          goal: body.goal.trim(),
          focus_minutes: Number.isInteger(body.focus_minutes) ? body.focus_minutes : null,
        });
        sessions.set(localSessionId, {
          coordinator,
          taskContract: started.task_contract,
          createdAt: Date.now(),
        });
        return json(response, 201, {
          local_session_id: localSessionId,
          coordinator_session_id: started.coordinator_session_id,
          task_contract: started.task_contract,
          trace: coordinator.trace,
        });
      }

      if (request.method === "POST" && url.pathname === "/api/session/clarify") {
        const body = await readJson(request);
        const active = sessions.get(body.local_session_id);
        if (!active) return json(response, 404, { error: "monitor session not found" });
        if (typeof body.answer !== "string" || !body.answer.trim()) {
          return json(response, 400, { error: "answer is required" });
        }
        active.taskContract = await active.coordinator.clarifyTask({
          local_session_id: body.local_session_id,
          previous_contract: active.taskContract,
          answer: body.answer.trim(),
        });
        return json(response, 201, {
          task_contract: active.taskContract,
          trace: active.coordinator.trace,
        });
      }

      if (request.method === "POST" && url.pathname === "/api/context/relevance") {
        const body = await readJson(request);
        const active = sessions.get(body.local_session_id);
        if (!active) return json(response, 404, { error: "monitor session not found" });
        if (active.taskContract.status !== "ready") {
          return json(response, 409, { error: "task must be ready before context classification" });
        }
        const result = await active.coordinator.classifyContext({
          local_session_id: body.local_session_id,
          task_contract: active.taskContract,
          observation: {
            active_app: body.observation?.active_app ?? null,
            window_title: body.observation?.window_title ?? null,
            domain: body.observation?.domain ?? null,
            screen_shared: body.observation?.screen_shared === true,
            screen_change_score: Number(body.observation?.screen_change_score ?? 0),
          },
        });
        return json(response, 201, {
          result,
          trace: active.coordinator.trace,
        });
      }

      if (request.method === "GET" && url.pathname.startsWith("/vendor/")) {
        const served = await serveFile(response, vendorRoot, url.pathname.slice("/vendor/".length));
        if (served) return;
      }

      if (request.method === "GET") {
        const relative = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
        const served = await serveFile(response, publicRoot, relative);
        if (served) return;
      }

      json(response, 404, { error: "not found" });
    } catch (error) {
      json(response, 500, { error: safeMessage(error) });
    }
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.env.REFOCUS_MONITOR_PORT ?? 4173);
  const server = createMonitorServer();
  server.listen(port, "127.0.0.1", () => {
    console.log(`REFOCUS_MONITOR_READY http://127.0.0.1:${port}`);
  });
}
