import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { AgentStackFlowCoordinator } from "../bridge/agent-stack-flow-coordinator.mjs";
import { extractLocalText } from "../bridge/local-ocr.mjs";

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

async function readJson(request, maxBytes = 64 * 1024) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > maxBytes) throw new Error("Request body is too large");
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

export function createMonitorServer({
  coordinatorFactory,
  ocrExtractor = extractLocalText,
  visionMode = process.env.AGENT_STACK_VISION_MODE,
} = {}) {
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
          // Privacy-first default: keep pixels local. Direct image upload is an
          // explicit opt-in for a separately verified vision-capable Agent.
          visionModelUnsupported: visionMode !== "vision",
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

      if (request.method === "POST" && url.pathname === "/api/context/visual") {
        const body = await readJson(request, 1024 * 1024);
        const active = sessions.get(body.local_session_id);
        if (!active) return json(response, 404, { error: "monitor session not found" });
        if (active.taskContract.status !== "ready") {
          return json(response, 409, { error: "task must be ready before visual classification" });
        }
        if (!['screen_share', 'camera_page'].includes(body.source)) {
          return json(response, 400, { error: "visual source must be screen_share or camera_page" });
        }
        const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(body.image_data_url ?? "");
        if (!match) return json(response, 400, { error: "a JPEG data URL is required" });
        const imageBytes = Buffer.from(match[1], "base64");
        if (!imageBytes.length || imageBytes.length > 700 * 1024) {
          return json(response, 413, { error: "visual snapshot must be between 1 byte and 700 KiB" });
        }
        const observation = {
          source: body.source,
          captured_at: new Date().toISOString(),
          screen_change_score: Number(body.screen_change_score ?? 0),
        };
        let result;
        let processingMode = "agent_stack_vision";
        let ocr = null;
        if (!active.visionModelUnsupported) {
          try {
            result = await active.coordinator.classifyVisualContext(
              {
                local_session_id: body.local_session_id,
                task_contract: active.taskContract,
                observation,
              },
              imageBytes,
              { originalName: `refocus-${body.source}-${Date.now()}.jpg`, contentType: "image/jpeg" },
            );
          } catch (error) {
            if (!/vision_model_unsupported/i.test(safeMessage(error))) throw error;
            active.visionModelUnsupported = true;
          }
        }
        if (!result) {
          processingMode = "local_ocr_then_agent_stack";
          ocr = await ocrExtractor(imageBytes);
          result = await active.coordinator.classifyContext({
            local_session_id: body.local_session_id,
            task_contract: active.taskContract,
            observation: {
              active_app: body.source === "screen_share" ? "共享屏幕 OCR" : "摄像头页面 OCR",
              window_title: null,
              domain: null,
              screen_shared: body.source === "screen_share",
              screen_change_score: observation.screen_change_score,
              visual_source: body.source,
              ocr_text: ocr.text || null,
              ocr_confidence: ocr.confidence,
            },
          });
        }
        return json(response, 201, {
          result,
          processing: {
            mode: processingMode,
            raw_image_uploaded_to_agent_stack: processingMode === "agent_stack_vision",
            continuous_video_uploaded: false,
            ocr_characters: ocr?.text.length ?? null,
            ocr_confidence: ocr?.confidence ?? null,
          },
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
