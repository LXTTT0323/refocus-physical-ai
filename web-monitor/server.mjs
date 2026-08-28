import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { AgentStackFlowCoordinator } from "../bridge/agent-stack-flow-coordinator.mjs";
import { extractLocalText } from "../bridge/local-ocr.mjs";
import { OpenAIVisualObserver } from "../bridge/openai-visual-observer.mjs";
import { OpenAIAudioTranscriber } from "../bridge/openai-audio-transcriber.mjs";

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

async function readBytes(request, maxBytes) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > maxBytes) throw new Error("Request body is too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
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

export function createMonitorHandler({
  coordinatorFactory,
  ocrExtractor = extractLocalText,
  visionMode = process.env.AGENT_STACK_VISION_MODE,
  visualProvider = process.env.REFOCUS_VISUAL_PROVIDER ?? (process.env.OPENAI_API_KEY ? "openai" : "ocr"),
  visualObserver,
  audioTranscriber,
  demoToken = process.env.REFOCUS_DEMO_TOKEN,
} = {}) {
  const makeCoordinator = coordinatorFactory ?? (
    (sessionId = null) => AgentStackFlowCoordinator.fromEnvironment({ sessionId })
  );
  const externalVisualObserver = visualObserver ?? (
    visualProvider === "openai" ? OpenAIVisualObserver.fromEnvironment() : null
  );
  const externalAudioTranscriber = audioTranscriber ?? OpenAIAudioTranscriber.fromEnvironment();
  const hardwareEvents = [];
  let nextHardwareEventId = 1;
  const enqueueHardwareEvent = (type, payload = {}) => {
    const item = { id: nextHardwareEventId++, type, payload, timestamp: new Date().toISOString() };
    hardwareEvents.push(item);
    if (hardwareEvents.length > 100) hardwareEvents.shift();
    return item;
  };

  const restoreSession = (body) => {
    const localSessionId = body?.local_session_id;
    const existing = sessions.get(localSessionId);
    if (existing) return existing;
    if (
      typeof localSessionId !== "string" ||
      typeof body?.coordinator_session_id !== "string" ||
      !body?.task_contract ||
      typeof body.task_contract !== "object"
    ) {
      return null;
    }
    return {
      coordinator: makeCoordinator(body.coordinator_session_id),
      taskContract: body.task_contract,
      createdAt: Number.isFinite(Number(body.session_started_at))
        ? Number(body.session_started_at)
        : Date.now(),
      visionModelUnsupported: visionMode !== "vision",
    };
  };

  return async (request, response) => {
    response.setHeader("Permissions-Policy", "camera=(self), display-capture=(self), microphone=(self)");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");

    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    try {
      const configuredAccessToken = demoToken;
      if (
        configuredAccessToken &&
        url.pathname.startsWith("/api/") &&
        url.pathname !== "/api/health" &&
        request.headers["x-refocus-demo-token"] !== configuredAccessToken
      ) {
        return json(response, 401, { error: "demo access token is required" });
      }
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
          visual_provider: externalVisualObserver ? "openai" : (visionMode === "vision" ? "agent_stack" : "local_ocr"),
          visual_model: externalVisualObserver?.model ?? null,
          visual_image_leaves_device: Boolean(externalVisualObserver) || visionMode === "vision",
          active_sessions: sessions.size,
          audio_transcription_enabled: Boolean(externalAudioTranscriber),
          audio_transcription_model: externalAudioTranscriber?.model ?? null,
        });
      }

      if (request.method === "GET" && url.pathname === "/api/hardware/events") {
        const after = Math.max(0, Number(url.searchParams.get("after") ?? 0));
        return json(response, 200, {
          events: hardwareEvents.filter((item) => item.id > after),
          latest_id: hardwareEvents.at(-1)?.id ?? after,
        });
      }

      if (request.method === "POST" && url.pathname === "/api/hardware/session-state") {
        const body = await readJson(request);
        if (typeof body.active !== "boolean") {
          return json(response, 400, { error: "active must be boolean" });
        }
        const event = enqueueHardwareEvent(
          body.active ? "SESSION_START_REQUESTED" : "SESSION_END_REQUESTED",
          {
            trigger: body.active ? "joystick_forward" : "joystick_returned_to_origin",
            sequence: Number.isInteger(body.sequence) ? body.sequence : null,
          },
        );
        return json(response, 202, { accepted: true, event });
      }

      if (request.method === "POST" && url.pathname === "/api/hardware/reflection-text") {
        const body = await readJson(request);
        if (!sessions.has(body.local_session_id)) {
          return json(response, 404, { error: "monitor session not found" });
        }
        if (!new Set(["completion_report", "focus_experience"]).has(body.question)) {
          return json(response, 400, { error: "unknown reflection question" });
        }
        if (typeof body.text !== "string" || !body.text.trim()) {
          return json(response, 400, { error: "reflection text is required" });
        }
        const event = enqueueHardwareEvent("REFLECTION_TRANSCRIPT", {
          local_session_id: body.local_session_id,
          question: body.question,
          text: body.text.trim(),
          source: "board_microphone",
        });
        return json(response, 202, { accepted: true, event });
      }

      if (request.method === "POST" && url.pathname === "/api/audio/transcribe") {
        if (!externalAudioTranscriber) return json(response, 503, { error: "audio transcription is not configured" });
        const contentType = String(request.headers["content-type"] ?? "").split(";")[0];
        if (!new Set(["audio/webm", "audio/wav", "audio/mpeg", "audio/mp4", "audio/ogg"]).has(contentType)) {
          return json(response, 415, { error: "unsupported audio type" });
        }
        const audio = await readBytes(request, 5 * 1024 * 1024);
        if (!audio.length) return json(response, 400, { error: "audio is required" });
        const result = await externalAudioTranscriber.transcribe(audio, { contentType });
        const hardwareQuestion = String(request.headers["x-refocus-question"] ?? "");
        const hardwareSessionId = String(request.headers["x-refocus-session-id"] ?? "");
        if (hardwareQuestion || hardwareSessionId) {
          if (!sessions.has(hardwareSessionId)) {
            return json(response, 404, { error: "monitor session not found" });
          }
          if (!new Set(["completion_report", "focus_experience"]).has(hardwareQuestion)) {
            return json(response, 400, { error: "unknown reflection question" });
          }
          enqueueHardwareEvent("REFLECTION_TRANSCRIPT", {
            local_session_id: hardwareSessionId,
            question: hardwareQuestion,
            text: result.text,
            source: "board_microphone",
          });
        }
        return json(response, 201, result);
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
          session_started_at: Date.now(),
          task_contract: started.task_contract,
          trace: coordinator.trace,
        });
      }

      if (request.method === "POST" && url.pathname === "/api/session/end") {
        const body = await readJson(request);
        const active = restoreSession(body);
        if (!active) return json(response, 404, { error: "monitor session not found" });
        const completionReport = typeof body.user_feedback?.completion_report === "string"
          ? body.user_feedback.completion_report.trim()
          : "";
        const focusExperience = typeof body.user_feedback?.focus_experience === "string"
          ? body.user_feedback.focus_experience.trim()
          : "";
        if (!completionReport || !focusExperience) {
          return json(response, 400, { error: "both feedback answers are required" });
        }
        const interruptionCount = Number(body.interruptions?.count ?? 0);
        const interruptionSeconds = Number(body.interruptions?.total_seconds ?? 0);
        const mainReason = ["absent", "off_task", "idle"].includes(body.interruptions?.main_reason)
          ? body.interruptions.main_reason
          : null;
        const focusMinutesActual = Math.max(0, Math.round((Date.now() - active.createdAt) / 60_000));
        const summary = await active.coordinator.endSession({
          local_session_id: body.local_session_id,
          task_contract: active.taskContract,
          goal: active.taskContract.goal,
          success_criteria: active.taskContract.success_criteria,
          recent_progress: [],
          focus_minutes_actual: focusMinutesActual,
          interruptions: {
            count: Number.isInteger(interruptionCount) && interruptionCount >= 0 ? interruptionCount : 0,
            total_seconds: Number.isFinite(interruptionSeconds) && interruptionSeconds >= 0
              ? Number(interruptionSeconds.toFixed(1))
              : 0,
            main_reason: mainReason,
          },
          user_feedback: {
            completion_report: completionReport,
            focus_experience: focusExperience,
          },
          end_reason: "user_finished",
        });
        sessions.delete(body.local_session_id);
        return json(response, 201, {
          summary,
          trace: active.coordinator.trace,
        });
      }

      if (request.method === "POST" && url.pathname === "/api/session/clarify") {
        const body = await readJson(request);
        const active = restoreSession(body);
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
        const active = restoreSession(body);
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
        const active = restoreSession(body);
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
        let processingMode = null;
        let ocr = null;
        let externalObservation = null;
        let externalTrace = null;
        let fallbackReason = null;
        let rawImageUploadedToOpenAI = false;
        if (externalVisualObserver) {
          try {
            rawImageUploadedToOpenAI = true;
            const observed = await externalVisualObserver.observe(imageBytes, {
              source: body.source,
              contentType: "image/jpeg",
            });
            externalObservation = observed.observation;
            externalTrace = observed.trace;
            processingMode = "openai_visual_then_agent_stack";
            result = await active.coordinator.classifyContext({
              local_session_id: body.local_session_id,
              task_contract: active.taskContract,
              observation: {
                active_app: null,
                window_title: null,
                domain: null,
                screen_shared: body.source === "screen_share",
                screen_change_score: observation.screen_change_score,
                visual_source: body.source,
                visual_observation: externalObservation,
              },
            });
          } catch (error) {
            fallbackReason = safeMessage(error).slice(0, 240);
          }
        }
        if (!result && !active.visionModelUnsupported) {
          try {
            processingMode = "agent_stack_vision";
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
            fallbackReason ??= "Agent Stack model does not support images";
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
            raw_image_uploaded_to_openai: rawImageUploadedToOpenAI,
            continuous_video_uploaded: false,
            ocr_characters: ocr?.text.length ?? null,
            ocr_confidence: ocr?.confidence ?? null,
            visual_observation: externalObservation,
            visual_trace: externalTrace,
            fallback_reason: fallbackReason,
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
  };
}

export function createMonitorServer(options = {}) {
  return createServer(createMonitorHandler(options));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.env.REFOCUS_MONITOR_PORT ?? 4173);
  const server = createMonitorServer();
  server.listen(port, "127.0.0.1", () => {
    console.log(`REFOCUS_MONITOR_READY http://127.0.0.1:${port}`);
  });
}
