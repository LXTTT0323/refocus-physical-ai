import { FaceLandmarker, FilesetResolver } from "/vendor/vision_bundle.mjs";
import { FOCUS_THRESHOLDS, FocusSignalPolicy } from "/focus-policy.js";
import { HeadDirectionFilter } from "/head-direction-filter.js";
import {
  encodeRefocusSerialCommand,
  parseRefocusSerialLine,
  serialCommandForLight,
} from "/refocus-serial.js";

const $ = (selector) => document.querySelector(selector);
const demoMode = new URLSearchParams(location.search).get("demo") === "1";
const hardwareMode = new URLSearchParams(location.search).get("hardware") === "1";
const webSerialMode = new URLSearchParams(location.search).get("webserial") === "1";
// Both transports use a physical button to control the product Session. They
// differ only in transport: Mac bridge versus Chrome Web Serial.
const physicalHardwareMode = hardwareMode || webSerialMode;

const elements = {
  webModeLink: $("#webModeLink"),
  hardwareModeLink: $("#hardwareModeLink"),
  modeDescription: $("#modeDescription"),
  goal: $("#goal"),
  goalVoiceStatus: $("#goalVoiceStatus"),
  startView: $("#startView"),
  runningBar: $("#runningBar"),
  runningGoal: $("#runningGoal"),
  runningElapsed: $("#runningElapsed"),
  runningIndicator: $("#runningIndicator"),
  runningStateLabel: $("#runningStateLabel"),
  runningStepDescription: $("#runningStepDescription"),
  webStateLegend: $("#webStateLegend"),
  runtimeView: $("#runtimeView"),
  startProgress: $("#startProgress"),
  start: $("#startButton"),
  hardwareConnect: $("#hardwareConnectButton"),
  permissionNote: $("#permissionNote"),
  hardwareStatusLabel: $("#hardwareStatusLabel"),
  reflectionStateBadge: $("#reflectionStateBadge"),
  end: $("#endButton"),
  taskTest: $("#taskTestButton"),
  cameraTest: $("#cameraTestButton"),
  clarify: $("#clarifyButton"),
  classify: $("#classifyButton"),
  visualClassify: $("#visualClassifyButton"),
  visualSource: $("#visualSource"),
  visualResult: $("#visualResult"),
  visualPrivacy: $("#visualPrivacy"),
  clarificationCard: $("#clarificationCard"),
  clarificationQuestion: $("#clarificationQuestion"),
  clarificationAnswer: $("#clarificationAnswer"),
  cameraVideo: $("#cameraVideo"),
  screenVideo: $("#screenVideo"),
  screenCanvas: $("#screenCanvas"),
  personState: $("#personState"),
  screenState: $("#screenState"),
  present: $("#presentMetric"),
  missing: $("#missingMetric"),
  head: $("#headMetric"),
  eye: $("#eyeMetric"),
  yawn: $("#yawnMetric"),
  model: $("#modelMetric"),
  screenLabel: $("#screenLabel"),
  change: $("#changeMetric"),
  stable: $("#stableMetric"),
  activeApp: $("#activeApp"),
  windowTitle: $("#windowTitle"),
  domain: $("#domain"),
  classification: $("#classificationResult"),
  focusDecision: $("#focusDecision"),
  eventList: $("#eventList"),
  taskContractCard: $("#taskContractCard"),
  taskConfidence: $("#taskConfidence"),
  contractGoal: $("#contractGoal"),
  contractDeliverable: $("#contractDeliverable"),
  contractCriteria: $("#contractCriteria"),
  contractHints: $("#contractHints"),
  feedbackCard: $("#feedbackCard"),
  experienceFeedback: $("#experienceFeedback"),
  voiceStatus: $("#voiceStatus"),
  generateSummary: $("#generateSummaryButton"),
  summaryCard: $("#summaryCard"),
  summaryOutcome: $("#summaryOutcome"),
  summaryText: $("#summaryText"),
  summaryMinutes: $("#summaryMinutes"),
  summaryInterruptions: $("#summaryInterruptions"),
  summaryNextAction: $("#summaryNextAction"),
  historySessions: $("#historySessions"),
  historyMinutes: $("#historyMinutes"),
  historyAverage: $("#historyAverage"),
  taskDonut: $("#taskDonut"),
  taskDonutValue: $("#taskDonutValue"),
  taskLegend: $("#taskLegend"),
  durationDonut: $("#durationDonut"),
  durationDonutValue: $("#durationDonutValue"),
  durationLegend: $("#durationLegend"),
  historyInsight: $("#historyInsight"),
  newSession: $("#newSessionButton"),
};

const state = {
  phase: "start",
  running: false,
  faceLandmarker: null,
  localSessionId: null,
  coordinatorSessionId: null,
  taskContract: null,
  cameraStream: null,
  screenStream: null,
  present: false,
  confirmedPresent: false,
  faceCandidateAt: 0,
  lastFaceAt: 0,
  missingSeconds: 0,
  missingCandidateRecorded: false,
  absentConfirmedRecorded: false,
  headDirection: "unknown",
  headDirectionSince: 0,
  headCandidateRecorded: false,
  headConfirmedRecorded: false,
  eyeState: "unknown",
  eyeBlinkScore: 0,
  yawnDetected: false,
  jawOpenScore: 0,
  eyeRecorded: false,
  yawnRecorded: false,
  blinkCandidateAt: 0,
  yawnCandidateAt: 0,
  screenShared: false,
  screenChangeScore: 0,
  lastScreenChangeAt: 0,
  screenStableSeconds: 0,
  previousScreenPixels: null,
  contextClassification: "unknown",
  readySince: 0,
  events: [],
  autoVisual: false,
  visualTimer: null,
  visualInFlight: false,
  headAwaySeconds: 0,
  headAwayStartedAt: 0,
  headDirectionFilter: new HeadDirectionFilter(),
  focusPolicy: new FocusSignalPolicy(),
  sessionStartedAt: 0,
  sessionEndedAt: 0,
  lastLight: "yellow",
  interruptionStartedAt: 0,
  interruptionCount: 0,
  interruptionTotalMs: 0,
  interruptionReasons: { absent: 0, off_task: 0, idle: 0 },
  monitorTimers: [],
  voiceRecorder: null,
  voiceTargetId: null,
  voiceButton: null,
  voiceChunks: [],
  voiceStream: null,
  hardwareEventId: 0,
  hardwarePollTimer: null,
  serialPort: null,
  serialReader: null,
  serialBuffer: "",
  hardwareConnected: false,
  hardwareDevice: null,
  hardwarePrepared: false,
  hardwareSessionActive: false,
  hardwareSequence: 0,
  hardwareLastLight: null,
};

function setSessionPhase(phase) {
  state.phase = phase;
  elements.startView.classList.toggle("hidden", phase !== "start");
  elements.runningBar.classList.toggle("hidden", phase !== "running");
  elements.runtimeView.classList.toggle("hidden", phase !== "running");
  elements.webStateLegend.classList.toggle("hidden", phase !== "running" || physicalHardwareMode);
  elements.feedbackCard.classList.toggle("hidden", phase !== "reflection");
  elements.summaryCard.classList.toggle("hidden", phase !== "summary");
  for (const step of document.querySelectorAll("[data-step]")) {
    const order = { start: 0, running: 1, reflection: 2 };
    const current = phase === "summary" ? 3 : order[phase];
    const item = order[step.dataset.step];
    step.classList.toggle("active", item === current);
    step.classList.toggle("complete", item < current);
  }
  const target = phase === "running"
    ? elements.runningBar
    : phase === "reflection"
      ? elements.feedbackCard
      : phase === "summary"
        ? elements.summaryCard
        : elements.startView;
  target?.scrollIntoView({ behavior: "smooth", block: "start" });
  if (phase === "summary") renderHistoryDashboard();
}

function configureExperienceMode() {
  elements.webModeLink.classList.toggle("active", !physicalHardwareMode);
  elements.webModeLink.setAttribute("aria-current", physicalHardwareMode ? "false" : "page");
  elements.hardwareModeLink.classList.toggle("active", physicalHardwareMode);
  elements.hardwareModeLink.setAttribute("aria-current", physicalHardwareMode ? "page" : "false");

  if (physicalHardwareMode) {
    elements.modeDescription.textContent = "保留当前硬件 Demo 流程：先完成授权，再由实体按钮开始或结束，LED 显示 Session 是否正在进行。";
    elements.permissionNote.textContent = "先点击一次完成摄像头与屏幕共享授权；页面显示“准备完成”后，按实体按钮才会开始计时和监测。共享时请选择“整个屏幕”。";
    elements.runningStepDescription.textContent = "灯亮并持续监测";
    elements.runningStateLabel.textContent = "灯已亮";
    elements.reflectionStateBadge.textContent = "灯已熄灭";
    elements.hardwareStatusLabel.textContent = "C 板硬件";
  } else {
    elements.modeDescription.textContent = "无需连接设备，授权后直接开始，页面用黄、绿、红三种状态陪你完成专注。";
    elements.permissionNote.textContent = "点击后完成摄像头与屏幕共享授权，授权成功即开始计时和监测。共享时请选择“整个屏幕”。";
    elements.runningStepDescription.textContent = "状态判断并持续监测";
    elements.runningStateLabel.textContent = "黄灯 · 正在建立专注";
    elements.reflectionStateBadge.textContent = "本次监测已结束";
    elements.hardwareStatusLabel.textContent = "运行模式";
  }
}

function renderRunningState(light) {
  if (physicalHardwareMode) {
    elements.runningIndicator.className = "running-indicator";
    elements.runningStateLabel.textContent = "灯已亮";
    return;
  }
  const labels = {
    yellow: "黄灯 · 正在建立专注",
    green: "绿灯 · 专注状态稳定",
    red: "红灯 · 检测到持续偏离",
  };
  elements.runningIndicator.className = `running-indicator ${light}`;
  elements.runningStateLabel.textContent = labels[light] ?? labels.yellow;
}

function setConnection(name, text, kind = "") {
  const node = document.querySelector(`[data-status="${name}"]`);
  node.className = kind;
  node.querySelector("b").textContent = text;
}

function setStartProgress(text, kind = "working") {
  elements.startProgress.className = `start-progress ${kind}`;
  elements.startProgress.querySelector("span").textContent = text;
}

function updateRunningElapsed() {
  const seconds = Math.max(0, Math.floor((Date.now() - state.sessionStartedAt) / 1000));
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const remainder = (seconds % 60).toString().padStart(2, "0");
  elements.runningElapsed.textContent = `${minutes}:${remainder}`;
}

function badge(node, text, kind) {
  node.textContent = text;
  node.className = `state-badge ${kind}`;
}

function addEvent(type, payload) {
  state.events.unshift({ time: new Date().toLocaleTimeString(), type, payload });
  state.events = state.events.slice(0, 8);
  elements.eventList.innerHTML = state.events
    .map((item) => `<li><b>${item.time} ${item.type}</b> ${escapeHtml(JSON.stringify(item.payload))}</li>`)
    .join("");
}

function escapeHtml(value) {
  return value.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);
}

function hardwareSupported() {
  return "serial" in navigator;
}

function describeSerialPort(port) {
  const info = port?.getInfo?.() ?? {};
  const vendor = info.usbVendorId?.toString(16).toUpperCase().padStart(4, "0");
  const product = info.usbProductId?.toString(16).toUpperCase().padStart(4, "0");
  return vendor && product ? `USB ${vendor}:${product}` : "USB 串口";
}

async function sendHardwareCommand(command) {
  if (!state.hardwareConnected || !state.serialPort?.writable) return false;
  const writer = state.serialPort.writable.getWriter();
  try {
    await writer.write(new TextEncoder().encode(encodeRefocusSerialCommand(command)));
    return true;
  } finally {
    writer.releaseLock();
  }
}

async function syncHardwareLight(light) {
  // In direct Web Serial mode, the board is a calm Session indicator rather
  // than a mirror of every vision-policy transition.
  const effectiveLight = webSerialMode ? (state.running ? "green" : "off") : light;
  if (!state.hardwareConnected || state.hardwareLastLight === effectiveLight) return;
  try {
    await sendHardwareCommand(serialCommandForLight(effectiveLight));
    state.hardwareLastLight = effectiveLight;
  } catch (error) {
    addEvent("HARDWARE_LED_ERROR", { message: error.message });
  }
}

function handleHardwareFrame(frame) {
  if (frame.type === "boot") {
    state.hardwareDevice = frame.device ?? "REFOCUS_C_V2";
    setConnection("hardware", `固件在线 · ${state.hardwareDevice}`, "ok");
    addEvent("HARDWARE_BOOT", { device: state.hardwareDevice });
    void sendHardwareCommand({ type: "get_state" });
    return;
  }
  if (frame.type === "session_active" && typeof frame.value === "boolean") {
    if (Number.isInteger(frame.seq) && frame.seq > 0 && frame.seq <= state.hardwareSequence) return;
    if (Number.isInteger(frame.seq)) state.hardwareSequence = frame.seq;
    const previous = state.hardwareSessionActive;
    state.hardwareSessionActive = frame.value;
    setConnection("hardware", frame.value ? "已连接 · 按钮已开始" : "已连接 · 待机", frame.value ? "warn" : "ok");
    addEvent("HARDWARE_SESSION_STATE", { active: frame.value, seq: frame.seq ?? null });
    if (frame.value && state.hardwarePrepared && !state.running) {
      void activateHardwareSession("physical_button");
    } else if (frame.value && !state.hardwarePrepared) {
      addEvent("HARDWARE_START_REQUESTED", { action: "请先点击准备检测并完成摄像头和整屏授权" });
    }
    if (previous === true && frame.value === false && state.running && state.localSessionId) {
      void finishHardwareSession("physical_button");
    }
    return;
  }
  if (frame.type === "ack") addEvent("HARDWARE_ACK", { command: frame.command, ok: frame.ok === true });
}

async function readHardwareSerial(port) {
  const decoder = new TextDecoder();
  try {
    while (port.readable && state.serialPort === port) {
      const reader = port.readable.getReader();
      state.serialReader = reader;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          state.serialBuffer += decoder.decode(value, { stream: true });
          const lines = state.serialBuffer.split(/\r?\n/);
          state.serialBuffer = lines.pop() ?? "";
          for (const line of lines) {
            try {
              const frame = parseRefocusSerialLine(line);
              if (frame) handleHardwareFrame(frame);
            } catch (error) {
              addEvent("HARDWARE_FRAME_ERROR", { message: error.message });
            }
          }
        }
      } finally {
        reader.releaseLock();
        state.serialReader = null;
      }
    }
  } catch (error) {
    if (state.serialPort === port) addEvent("HARDWARE_READ_ERROR", { message: error.message });
  } finally {
    if (state.serialPort === port) {
      state.hardwareConnected = false;
      state.serialPort = null;
      state.hardwareLastLight = null;
      setConnection("hardware", "连接已断开", "bad");
      elements.hardwareConnect.textContent = "重新连接 C 板";
    }
  }
}

async function openHardwarePort(port) {
  if (!port) return false;
  if (!port.readable && !port.writable) await port.open({ baudRate: 115200, bufferSize: 4096 });
  state.serialPort = port;
  state.hardwareConnected = true;
  state.hardwareDevice = describeSerialPort(port);
  state.hardwareSequence = 0;
  state.hardwareLastLight = null;
  setConnection("hardware", `已连接 · ${state.hardwareDevice}`, "ok");
  elements.hardwareConnect.textContent = "检测硬件状态";
  addEvent("HARDWARE_CONNECTED", { port: state.hardwareDevice, baud: 115200 });
  void readHardwareSerial(port);
  await sendHardwareCommand({ type: "get_state" });
  await syncHardwareLight(state.running ? state.lastLight : "off");
  return true;
}

async function connectHardware({ request = true } = {}) {
  if (!hardwareSupported()) {
    setConnection("hardware", "请用桌面版 Chrome/Edge", "bad");
    return false;
  }
  if (state.hardwareConnected) {
    await sendHardwareCommand({ type: "get_state" });
    return true;
  }
  elements.hardwareConnect.disabled = true;
  setConnection("hardware", "正在连接", "warn");
  try {
    const knownPorts = await navigator.serial.getPorts();
    const port = knownPorts[0] ?? (request ? await navigator.serial.requestPort() : null);
    if (!port) {
      setConnection("hardware", "未授权 · 点击连接", "warn");
      return false;
    }
    return await openHardwarePort(port);
  } catch (error) {
    const cancelled = error?.name === "NotFoundError";
    setConnection("hardware", cancelled ? "未选择串口" : "连接失败", cancelled ? "warn" : "bad");
    addEvent("HARDWARE_CONNECT_ERROR", { message: error.message });
    return false;
  } finally {
    elements.hardwareConnect.disabled = false;
  }
}

async function initializeHardwareDetection() {
  if (!hardwareSupported()) {
    setConnection("hardware", "浏览器不支持 Web Serial", "bad");
    elements.hardwareConnect.disabled = true;
    return;
  }
  setConnection("hardware", "正在检测已授权设备", "warn");
  const connected = await connectHardware({ request: false });
  if (!connected) setConnection("hardware", "未连接 · 点击授权", "warn");
  navigator.serial.addEventListener("connect", () => void connectHardware({ request: false }));
  navigator.serial.addEventListener("disconnect", (event) => {
    if (event.port === state.serialPort) {
      state.hardwareConnected = false;
      setConnection("hardware", "USB 已拔出", "bad");
    }
  });
}

async function api(path, body) {
  const headers = body === undefined ? {} : { "Content-Type": "application/json" };
  const response = await fetch(path, body === undefined ? { headers } : {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? `HTTP ${response.status}`);
  return result;
}

function sessionEnvelope() {
  return {
    local_session_id: state.localSessionId,
    coordinator_session_id: state.coordinatorSessionId,
    task_contract: state.taskContract,
    session_started_at: state.sessionStartedAt,
  };
}

async function loadVisualProvider() {
  try {
    const response = await fetch("/api/health");
    const health = await response.json();
    if (health.visual_provider === "openai") {
      elements.visualPrivacy.textContent = `外部视觉已启用（${health.visual_model}）：每 10 秒最多一张压缩快照发送到 OpenAI，失败时降级为本地 OCR；不上传连续视频。`;
    } else if (health.visual_provider === "agent_stack") {
      elements.visualPrivacy.textContent = "Agent Stack 直接视觉已启用：每 10 秒最多发送一张压缩快照；不上传连续视频。";
    } else {
      elements.visualPrivacy.textContent = "备用模式：每 10 秒最多在本机 OCR 一张快照，只有提取文字发送给 Agent Stack；不上传连续视频。";
    }
  } catch {
    elements.visualPrivacy.textContent = "无法确认视觉处理方式，请检查本地服务。";
  }
}

async function loadFaceModel() {
  if (state.faceLandmarker || demoMode) return;
  try {
    elements.model.textContent = "加载中";
    const vision = await FilesetResolver.forVisionTasks("/vendor/wasm");
    state.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: "/models/face_landmarker.task" },
      runningMode: "VIDEO",
      numFaces: 1,
      minFaceDetectionConfidence: 0.55,
      minFacePresenceConfidence: 0.55,
      minTrackingConfidence: 0.55,
      outputFaceBlendshapes: true,
    });
    elements.model.textContent = "MediaPipe 就绪";
  } catch (error) {
    elements.model.textContent = "模型失败";
    addEvent("MODEL_ERROR", { message: error.message });
  }
}

function blendshapeMap(result) {
  const categories = result.faceBlendshapes?.[0]?.categories ?? [];
  return new Map(categories.map((item) => [item.categoryName, item.score]));
}

function analyzeFaceResult(result, now) {
  const landmarks = result.faceLandmarks?.[0];
  if (!landmarks) {
    state.present = false;
    state.faceCandidateAt = 0;
    state.confirmedPresent = false;
    state.missingSeconds = state.lastFaceAt ? Math.max(0, (now - state.lastFaceAt) / 1000) : 0;
    state.headAwaySeconds = state.headAwayStartedAt ? (now - state.headAwayStartedAt) / 1000 : 0;
    state.eyeState = "unknown";
    state.eyeBlinkScore = 0;
    state.yawnDetected = false;
    state.jawOpenScore = 0;
    state.blinkCandidateAt = 0;
    state.yawnCandidateAt = 0;
    state.eyeRecorded = false;
    state.yawnRecorded = false;
    if (state.missingSeconds >= 3 && !state.missingCandidateRecorded) {
      state.missingCandidateRecorded = true;
      addEvent("FACE_MISSING_CANDIDATE", { missing_seconds: Number(state.missingSeconds.toFixed(1)) });
    }
    if (state.missingSeconds >= 30 && !state.absentConfirmedRecorded) {
      state.absentConfirmedRecorded = true;
      addEvent("FACE_ABSENT_CONFIRMED", { missing_seconds: Number(state.missingSeconds.toFixed(1)) });
    }
    renderPersonMetrics();
    return;
  }

  state.present = true;
  state.faceCandidateAt ||= now;
  if (!state.confirmedPresent && now - state.faceCandidateAt >= 800) {
    state.confirmedPresent = true;
    addEvent("FACE_PRESENT", { stable_seconds: Number(((now - state.faceCandidateAt) / 1000).toFixed(1)) });
  }
  state.lastFaceAt = now;
  state.missingSeconds = 0;
  state.missingCandidateRecorded = false;
  state.absentConfirmedRecorded = false;

  const nose = landmarks[1];
  const left = landmarks[234];
  const right = landmarks[454];
  const top = landmarks[10];
  const chin = landmarks[152];
  const width = Math.max(0.001, Math.abs(right.x - left.x));
  const height = Math.max(0.001, Math.abs(chin.y - top.y));
  const yaw = (nose.x - (left.x + right.x) / 2) / width;
  const pitch = (nose.y - (top.y + chin.y) / 2) / height;
  let rawHeadDirection;
  if (Math.abs(pitch) > 0.16) rawHeadDirection = "away";
  // The preview is mirrored like a normal selfie camera, so user-facing left/right
  // is the reverse of the model's raw image x-axis.
  else if (yaw < -0.11) rawHeadDirection = "right";
  else if (yaw > 0.11) rawHeadDirection = "left";
  else rawHeadDirection = "toward_screen";
  const nextHeadDirection = state.headDirectionFilter.update(rawHeadDirection, now);
  if (nextHeadDirection !== state.headDirection) {
    const wasAway = state.headDirection !== "unknown" && state.headDirection !== "toward_screen";
    const isAway = nextHeadDirection !== "unknown" && nextHeadDirection !== "toward_screen";
    if (wasAway && !isAway) {
      addEvent("HEAD_RETURNED", { from: state.headDirection });
    }
    if (!wasAway && isAway) state.headAwayStartedAt = now;
    if (!isAway) state.headAwayStartedAt = 0;
    state.headDirection = nextHeadDirection;
    state.headCandidateRecorded = false;
    state.headConfirmedRecorded = false;
  }
  const headAwaySeconds = state.headAwayStartedAt ? (now - state.headAwayStartedAt) / 1000 : 0;
  state.headAwaySeconds = headAwaySeconds;
  if (headAwaySeconds >= 3 && !state.headCandidateRecorded) {
    state.headCandidateRecorded = true;
    addEvent("HEAD_AWAY_CANDIDATE", { direction: state.headDirection, duration_seconds: Number(headAwaySeconds.toFixed(1)) });
  }
  if (headAwaySeconds >= 30 && !state.headConfirmedRecorded) {
    state.headConfirmedRecorded = true;
    addEvent("HEAD_AWAY_CONFIRMED", { direction: state.headDirection, duration_seconds: Number(headAwaySeconds.toFixed(1)) });
  }

  const shapes = blendshapeMap(result);
  const blink = ((shapes.get("eyeBlinkLeft") ?? 0) + (shapes.get("eyeBlinkRight") ?? 0)) / 2;
  state.eyeBlinkScore = blink;
  if (blink > 0.55) state.blinkCandidateAt ||= now;
  else state.blinkCandidateAt = 0;
  state.eyeState = state.blinkCandidateAt && now - state.blinkCandidateAt >= 800 ? "closed" : "open";
  if (state.eyeState === "closed" && !state.eyeRecorded) {
    state.eyeRecorded = true;
    addEvent("EYES_CLOSED_CANDIDATE", { duration_seconds: 0.8 });
  }
  if (state.eyeState === "open") state.eyeRecorded = false;

  const jawOpen = shapes.get("jawOpen") ?? 0;
  state.jawOpenScore = jawOpen;
  if (jawOpen > 0.58) state.yawnCandidateAt ||= now;
  else state.yawnCandidateAt = 0;
  state.yawnDetected = Boolean(state.yawnCandidateAt && now - state.yawnCandidateAt >= 1200);
  if (state.yawnDetected && !state.yawnRecorded) {
    state.yawnRecorded = true;
    addEvent("YAWN_CANDIDATE", { duration_seconds: 1.2 });
  }
  if (!state.yawnDetected) state.yawnRecorded = false;
  renderPersonMetrics();
}

function renderPersonMetrics() {
  elements.present.textContent = state.present ? "是" : "否";
  elements.missing.textContent = `${state.missingSeconds.toFixed(1)} 秒`;
  elements.head.textContent = {
    toward_screen: "朝向屏幕",
    left: "向左偏离",
    right: "向右偏离",
    away: "上下偏离",
    unknown: "未知",
  }[state.headDirection];
  elements.eye.textContent = `${{ open: "睁开", closed: "持续闭眼", unknown: "未知" }[state.eyeState]} · ${state.eyeBlinkScore.toFixed(2)}`;
  elements.yawn.textContent = `${state.yawnDetected ? "检测到候选" : "否"} · ${state.jawOpenScore.toFixed(2)}`;
  if (state.present) badge(elements.personState, "人在场", state.headDirection === "toward_screen" ? "good" : "warn");
  else badge(elements.personState, state.missingSeconds >= 30 ? "离席" : "未检测到", state.missingSeconds >= 30 ? "bad" : "warn");
  updateReadyGate();
}

let lastFaceFrameAt = 0;
function faceLoop(now) {
  if (!state.running) return;
  if (state.faceLandmarker && elements.cameraVideo.readyState >= 2 && now - lastFaceFrameAt >= 220) {
    lastFaceFrameAt = now;
    try {
      analyzeFaceResult(state.faceLandmarker.detectForVideo(elements.cameraVideo, now), now);
    } catch (error) {
      addEvent("FACE_ERROR", { message: error.message });
    }
  }
  requestAnimationFrame(faceLoop);
}

function analyzeScreen() {
  if (!state.running || !state.screenShared || elements.screenVideo.readyState < 2) return;
  const canvas = elements.screenCanvas;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(elements.screenVideo, 0, 0, canvas.width, canvas.height);
  const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const pixels = new Uint8Array(canvas.width * canvas.height);
  for (let source = 0, target = 0; source < data.length; source += 4, target += 1) {
    pixels[target] = Math.round(data[source] * 0.299 + data[source + 1] * 0.587 + data[source + 2] * 0.114);
  }
  if (state.previousScreenPixels) {
    let changed = 0;
    for (let index = 0; index < pixels.length; index += 1) {
      if (Math.abs(pixels[index] - state.previousScreenPixels[index]) > 18) changed += 1;
    }
    state.screenChangeScore = changed / pixels.length;
    if (state.screenChangeScore >= 0.015) state.lastScreenChangeAt = performance.now();
  }
  state.previousScreenPixels = pixels;
  state.screenStableSeconds = state.lastScreenChangeAt
    ? Math.max(0, (performance.now() - state.lastScreenChangeAt) / 1000)
    : 0;
  elements.change.textContent = `${(state.screenChangeScore * 100).toFixed(1)}%`;
  elements.stable.textContent = `${state.screenStableSeconds.toFixed(0)} 秒`;
  badge(elements.screenState, state.screenChangeScore >= 0.015 ? "画面有变化" : "画面稳定", state.screenChangeScore >= 0.015 ? "good" : "neutral");
}

function updateReadyGate() {
  const decision = state.focusPolicy.evaluate({
    taskReady: state.taskContract?.status === "ready" && (!physicalHardwareMode || state.hardwareSessionActive),
    screenShared: state.screenShared,
    present: state.present,
    confirmedPresent: state.confirmedPresent,
    lastFaceSeen: state.lastFaceAt > 0,
    missingSeconds: state.missingSeconds,
    headDirection: state.headDirection,
    headAwaySeconds: state.headAwaySeconds,
  });
  for (const [name, pass] of Object.entries(decision.gates)) {
    document.querySelector(`[data-gate="${name}"]`).classList.toggle("pass", pass);
  }
  elements.focusDecision.classList.toggle("ready", decision.light === "green");
  elements.focusDecision.classList.toggle("interrupted", decision.light === "red");
  if (decision.light === "green") {
    elements.focusDecision.textContent = `FOCUSING · 专注中（网页状态）｜${decision.reason}`;
  } else if (decision.light === "red") {
    elements.focusDecision.textContent = `INTERRUPTED · 需要回神（网页状态）｜${decision.reason}`;
  } else {
    elements.focusDecision.textContent = `SETUP · 准备中（网页状态）｜${decision.reason}`;
  }
  renderRunningState(decision.light);
  if (decision.light !== state.lastLight) {
    if (decision.light === "red" && state.lastLight === "green") {
      state.interruptionCount += 1;
      state.interruptionStartedAt = Date.now();
      const reason = decision.reason.includes("未检测到人脸")
        ? "absent"
        : decision.reason.includes("无关") || decision.reason.includes("娱乐")
          ? "off_task"
          : "idle";
      state.interruptionReasons[reason] += 1;
      addEvent("INTERRUPTION_STARTED", { reason, detail: decision.reason });
    }
    if (decision.light === "green" && state.lastLight === "red" && state.interruptionStartedAt) {
      state.interruptionTotalMs += Date.now() - state.interruptionStartedAt;
      state.interruptionStartedAt = 0;
      addEvent("INTERRUPTION_ENDED", { total_seconds: Number((state.interruptionTotalMs / 1000).toFixed(1)) });
    }
    state.lastLight = decision.light;
    void syncHardwareLight(decision.light);
  }
}

function rememberTimer(timer) {
  state.monitorTimers.push(timer);
  return timer;
}

function emitSample() {
  if (!state.running) return;
  addEvent("ACTIVITY_SAMPLE", {
    presence: {
      present: state.present,
      confirmed_present: state.confirmedPresent,
      missing_seconds: Number(state.missingSeconds.toFixed(1)),
    },
    camera: {
      head_direction: state.headDirection,
      eye_state: state.eyeState,
      eye_blink_score: Number(state.eyeBlinkScore.toFixed(3)),
      yawn_detected: state.yawnDetected,
      jaw_open_score: Number(state.jawOpenScore.toFixed(3)),
    },
    computer: {
      screen_shared: state.screenShared,
      screen_change_score: Number(state.screenChangeScore.toFixed(3)),
    },
  });
}

async function startAgentSession() {
  setConnection("agent", "连接中", "warn");
  const result = await api("/api/session/start", {
    goal: elements.goal.value,
    focus_minutes: null,
  });
  state.localSessionId = result.local_session_id;
  state.coordinatorSessionId = result.coordinator_session_id;
  state.taskContract = result.task_contract;
  state.sessionStartedAt = result.session_started_at ?? Date.now();
  setConnection("agent", "已连接 flow-coordinator", "ok");
  renderTaskContract();
  addEvent("AGENT_SESSION_READY", {
    status: state.taskContract.status,
    trace_status: result.trace.at(-1)?.status,
    assistant_message: result.trace.at(-1)?.assistantMessageObserved,
    coordinator_session_id: result.coordinator_session_id,
    turn_id: result.trace.at(-1)?.turnId,
  });
}

async function setHardwareLed(on, stateName) {
  if (!hardwareMode) return;
  try {
    const result = await api("/api/hardware/led", { on, state: stateName });
    addEvent("HARDWARE_LED_QUEUED", { on, state: stateName, command_id: result.command?.id });
  } catch (error) {
    addEvent("HARDWARE_LED_QUEUE_FAILED", { on, state: stateName, message: error.message });
  }
}

async function activateHardwareSession(trigger = "physical_button") {
  if (!state.hardwarePrepared || !state.localSessionId || state.phase === "running") return;
  state.hardwareSessionActive = true;
  state.sessionStartedAt = Date.now();
  state.running = true;
  elements.start.disabled = true;
  elements.start.textContent = "正在专注";
  elements.runningGoal.textContent = elements.goal.value.trim();
  setConnection("hardware", physicalHardwareMode ? "已连接 · Session 已开始" : "未启用", physicalHardwareMode ? "ok" : "");
  await setHardwareLed(true, "session_active");
  await syncHardwareLight("green");
  addEvent("SESSION_STARTED", { trigger });
  setSessionPhase("running");
  updateRunningElapsed();
  requestAnimationFrame(faceLoop);
  rememberTimer(setInterval(analyzeScreen, 1000));
  rememberTimer(setInterval(emitSample, 5000));
  rememberTimer(setInterval(updateReadyGate, 500));
  rememberTimer(setInterval(updateRunningElapsed, 1000));
  if (!state.autoVisual && state.taskContract?.status === "ready") toggleVisualClassification();
  updateReadyGate();
}

async function finishHardwareSession(trigger = "physical_button") {
  if (!state.running || !state.localSessionId) return;
  state.hardwareSessionActive = false;
  await setHardwareLed(false, "session_ended");
  setConnection("hardware", physicalHardwareMode ? "已连接 · Session 已结束" : "未启用", physicalHardwareMode ? "ok" : "");
  openFeedback(trigger);
}

async function handleStartClick() {
  if (!elements.goal.value.trim()) {
    elements.goal.focus();
    elements.goal.setAttribute("aria-invalid", "true");
    addEvent("START_BLOCKED", { message: "请先输入这次要完成的任务" });
    return;
  }
  elements.goal.removeAttribute("aria-invalid");
  if (physicalHardwareMode && state.hardwarePrepared && !state.hardwareSessionActive) {
    await activateHardwareSession("web_fallback");
    return;
  }
  await startMonitoring();
}

function renderTaskContract() {
  const ready = state.taskContract?.status === "ready";
  setConnection("task", ready ? "ready" : "需要补充", ready ? "ok" : "warn");
  elements.classify.disabled = !ready;
  elements.visualClassify.disabled = !ready;
  elements.clarificationCard.classList.toggle("hidden", ready);
  if (!ready) elements.clarificationQuestion.textContent = state.taskContract?.clarification_question ?? "请补充任务";
  elements.taskContractCard.classList.remove("hidden");
  elements.taskConfidence.textContent = `${Math.round((state.taskContract?.confidence ?? 0) * 100)}%`;
  elements.taskConfidence.className = `state-badge ${ready ? "good" : "warn"}`;
  elements.contractGoal.textContent = state.taskContract?.goal ?? "等待补充";
  elements.contractDeliverable.textContent = state.taskContract?.deliverable ?? "等待补充";
  elements.contractCriteria.textContent = state.taskContract?.success_criteria?.length
    ? state.taskContract.success_criteria.map((item, index) => `${index + 1}. ${item}`).join("\n")
    : "等待补充";
  const hints = state.taskContract?.relevance_hints ?? { keywords: [], apps: [], domains: [] };
  const hintParts = [
    hints.apps.length ? `应用：${hints.apps.join("、")}` : null,
    hints.keywords.length ? `关键词：${hints.keywords.join("、")}` : null,
    hints.domains.length ? `域名：${hints.domains.join("、")}` : null,
  ].filter(Boolean);
  elements.contractHints.textContent = hintParts.join("；") || "没有可靠线索，后续上下文应返回 unknown";
  updateReadyGate();
}

async function testTaskUnderstanding() {
  elements.taskTest.disabled = true;
  elements.taskTest.textContent = "Flow Agent 理解中…";
  try {
    await startAgentSession();
    elements.taskTest.textContent = "任务理解已返回";
  } catch (error) {
    elements.taskTest.disabled = false;
    elements.taskTest.textContent = "重新测试任务理解";
    setConnection("agent", "任务理解失败", "bad");
    addEvent("TASK_TEST_ERROR", { message: error.message });
  }
}

async function startMonitoring() {
  elements.start.disabled = true;
  elements.start.textContent = "准备中…";
  setStartProgress("第 1 步 / 4：请选择“整个屏幕”并确认共享");
  try {
    if (demoMode) {
      state.screenShared = true;
      state.present = true;
      state.lastFaceAt = performance.now();
      state.headDirection = "toward_screen";
      state.eyeState = "open";
      state.screenChangeScore = 0.08;
      elements.model.textContent = "演示信号";
      setConnection("camera", "演示已就绪", "ok");
      setConnection("screen", "演示已共享", "ok");
      badge(elements.personState, "人在场", "good");
      badge(elements.screenState, "画面有变化", "good");
      elements.present.textContent = "是";
      elements.missing.textContent = "0.0 秒";
      elements.head.textContent = "朝向屏幕";
      elements.eye.textContent = "睁开";
      elements.yawn.textContent = "否";
      elements.change.textContent = "8.0%";
      elements.stable.textContent = "0 秒";
      setStartProgress("第 3 步 / 4：正在理解本次任务…");
      await startAgentSession();
      state.hardwarePrepared = true;
      if (physicalHardwareMode) {
        elements.start.disabled = false;
        elements.start.textContent = "备用：网页开始 Session";
        setConnection("hardware", "准备完成 · 等待实体按钮", "warn");
        await setHardwareLed(false, "prepared");
        setStartProgress("准备完成：现在按下实体按钮即可开始", "ready");
      } else {
        await activateHardwareSession("web_start");
      }
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || !navigator.mediaDevices?.getDisplayMedia) {
      throw new Error("当前浏览器不支持摄像头或屏幕共享，请使用最新版 Chrome/Edge");
    }

    state.screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        displaySurface: "monitor",
        frameRate: { ideal: 5, max: 10 },
      },
      audio: false,
      selfBrowserSurface: "exclude",
      surfaceSwitching: "include",
      monitorTypeSurfaces: "include",
      preferCurrentTab: false,
    });
    setStartProgress("第 2 步 / 4：请允许使用摄像头");
    state.cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
      audio: false,
    });
    state.screenShared = true;
    state.lastScreenChangeAt = performance.now();
    elements.screenVideo.srcObject = state.screenStream;
    elements.cameraVideo.srcObject = state.cameraStream;
    document.querySelector(".camera-panel .video-wrap").classList.add("live");
    document.querySelector(".screen-panel .video-wrap").classList.add("live");
    setConnection("camera", "已授权，本地分析", "ok");
    setConnection("screen", "正在共享", "ok");
    const screenTrack = state.screenStream.getVideoTracks()[0];
    const displaySurface = screenTrack.getSettings?.().displaySurface;
    if (displaySurface && displaySurface !== "monitor") {
      for (const stream of [state.screenStream, state.cameraStream]) {
        for (const track of stream?.getTracks?.() ?? []) track.stop();
      }
      state.screenStream = null;
      state.cameraStream = null;
      state.screenShared = false;
      throw new Error("请选择“整个屏幕”，不要选择单个窗口或浏览器标签页");
    }
    elements.screenLabel.textContent = screenTrack.label || "整个屏幕";
    setConnection("screen", "正在共享整个屏幕", "ok");
    screenTrack.addEventListener("ended", () => {
      state.screenShared = false;
      setConnection("screen", "共享已停止", "bad");
      badge(elements.screenState, "共享已停止", "bad");
      updateReadyGate();
    });
    setStartProgress("第 3 步 / 4：正在准备专注识别…");
    await loadFaceModel();
    setStartProgress("第 4 步 / 4：正在理解本次任务…");
    await startAgentSession();
    addEvent("MONITORING_PREPARED", {
      camera: true,
      screen: true,
      display_surface: displaySurface || "monitor_requested",
    });
    state.hardwarePrepared = true;
    if (physicalHardwareMode) {
      elements.start.disabled = false;
      elements.start.textContent = "备用：网页开始 Session";
      setConnection("hardware", "准备完成 · 等待实体按钮", "warn");
      await setHardwareLed(false, "prepared");
      setStartProgress("准备完成：现在按下实体按钮即可开始", "ready");
    } else {
      await activateHardwareSession("web_start");
    }
  } catch (error) {
    await setHardwareLed(false, "start_failed");
    for (const stream of [state.cameraStream, state.screenStream]) {
      for (const track of stream?.getTracks?.() ?? []) track.stop();
    }
    state.cameraStream = null;
    state.screenStream = null;
    state.screenShared = false;
    elements.start.disabled = false;
    elements.start.textContent = "重新授权并开始";
    if (!state.cameraStream) setConnection("camera", "授权未完成", "bad");
    if (!state.screenStream) setConnection("screen", "授权未完成", "bad");
    if (state.cameraStream && state.screenStream) setConnection("agent", "Agent 会话失败", "bad");
    setStartProgress(`准备未完成：${error.message}`, "error");
    addEvent("START_ERROR", { message: error.message });
  }
}

async function startCameraTest() {
  elements.cameraTest.disabled = true;
  elements.start.disabled = true;
  elements.cameraTest.textContent = "正在授权…";
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("当前浏览器不支持摄像头");
    state.cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
      audio: false,
    });
    elements.cameraVideo.srcObject = state.cameraStream;
    document.querySelector(".camera-panel .video-wrap").classList.add("live");
    await loadFaceModel();
    state.running = true;
    setConnection("camera", "测试中，本地分析", "ok");
    requestAnimationFrame(faceLoop);
    rememberTimer(setInterval(emitSample, 5000));
    elements.cameraTest.textContent = "摄像头测试中";
    addEvent("CAMERA_TEST_STARTED", { raw_video_uploaded: false });
  } catch (error) {
    elements.cameraTest.disabled = false;
    elements.start.disabled = false;
    elements.cameraTest.textContent = "重新测试摄像头";
    setConnection("camera", "授权未完成", "bad");
    addEvent("CAMERA_TEST_ERROR", { message: error.message });
  }
}

async function clarifyTask() {
  elements.clarify.disabled = true;
  try {
    const result = await api("/api/session/clarify", {
      ...sessionEnvelope(),
      answer: elements.clarificationAnswer.value,
    });
    state.taskContract = result.task_contract;
    renderTaskContract();
    addEvent("TASK_CLARIFIED", { status: state.taskContract.status });
  } catch (error) {
    addEvent("CLARIFY_ERROR", { message: error.message });
  } finally {
    elements.clarify.disabled = false;
  }
}

async function classifyContext() {
  elements.classify.disabled = true;
  elements.classification.textContent = "flow-coordinator 判断中…";
  try {
    const response = await api("/api/context/relevance", {
      ...sessionEnvelope(),
      observation: {
        active_app: elements.activeApp.value || null,
        window_title: elements.windowTitle.value || null,
        domain: elements.domain.value || null,
        screen_shared: state.screenShared,
        screen_change_score: state.screenChangeScore,
      },
    });
    const result = response.result;
    state.contextClassification = result.classification;
    state.focusPolicy.recordContext(result.classification);
    elements.classification.className = `classification-result ${result.classification}`;
    elements.classification.textContent = `${result.classification.toUpperCase()} · ${(result.confidence * 100).toFixed(0)}% · ${result.evidence.join("；")}`;
    addEvent("CONTEXT_CLASSIFIED", {
      classification: result.classification,
      status: response.trace.at(-1)?.status,
      assistant_message: response.trace.at(-1)?.assistantMessageObserved,
    });
    updateReadyGate();
  } catch (error) {
    elements.classification.className = "classification-result unrelated";
    elements.classification.textContent = `判断失败：${error.message}`;
  } finally {
    elements.classify.disabled = state.taskContract?.status !== "ready";
  }
}

function captureVisualSnapshot(source) {
  const video = source === "screen_share" ? elements.screenVideo : elements.cameraVideo;
  const available = source === "screen_share" ? state.screenShared : Boolean(state.cameraStream);
  if (!available || video.readyState < 2) {
    throw new Error(source === "screen_share" ? "请先共享屏幕" : "请先开启摄像头并让页面进入画面");
  }
  const canvas = document.createElement("canvas");
  canvas.width = 480;
  canvas.height = 270;
  const context = canvas.getContext("2d");
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.58);
}

async function runVisualClassification() {
  if (!state.autoVisual || state.visualInFlight) return;
  state.visualInFlight = true;
  const source = elements.visualSource.value;
  elements.visualResult.className = "classification-result";
  elements.visualResult.textContent = "正在截取单张画面并由 OpenAI 快速判断…";
  try {
    const response = await api("/api/context/visual", {
      ...sessionEnvelope(),
      source,
      image_data_url: captureVisualSnapshot(source),
      screen_change_score: state.screenChangeScore,
    });
    const result = response.result;
    state.contextClassification = result.classification;
    const unrelatedStreak = state.focusPolicy.recordContext(result.classification);
    elements.visualResult.className = `classification-result ${result.classification}`;
    const modeLabel = response.processing?.mode === "local_ocr_then_agent_stack"
      ? `本地 OCR → Agent（识别 ${response.processing.ocr_characters ?? 0} 字）`
      : response.processing?.mode === "openai_visual_fast_path"
        ? `OpenAI 即时视觉（${response.processing.visual_trace?.model ?? "视觉模型"}）`
        : response.processing?.mode === "openai_visual_failed"
          ? "OpenAI 视觉超时，本轮已跳过"
        : "Agent Stack 直接看图";
    elements.visualResult.textContent = `${result.classification.toUpperCase()} · ${(result.confidence * 100).toFixed(0)}% · ${modeLabel} · ${result.evidence.join("；")}`;
    addEvent("VISUAL_CONTEXT_CLASSIFIED", {
      source,
      classification: result.classification,
      unrelated_streak: unrelatedStreak,
      processing_mode: response.processing?.mode,
      raw_image_uploaded_to_agent_stack: response.processing?.raw_image_uploaded_to_agent_stack,
      raw_image_uploaded_to_openai: response.processing?.raw_image_uploaded_to_openai,
      status: response.trace.at(-1)?.status,
      assistant_message: response.trace.at(-1)?.assistantMessageObserved,
      continuous_video_uploaded: false,
    });
    updateReadyGate();
  } catch (error) {
    elements.visualResult.className = "classification-result unrelated";
    elements.visualResult.textContent = `视觉判断失败：${error.message}`;
    addEvent("VISUAL_CONTEXT_ERROR", { source, message: error.message });
  } finally {
    state.visualInFlight = false;
    if (state.autoVisual) state.visualTimer = setTimeout(runVisualClassification, FOCUS_THRESHOLDS.visualIntervalMs);
  }
}

function toggleVisualClassification() {
  state.autoVisual = !state.autoVisual;
  if (state.autoVisual) {
    elements.visualClassify.textContent = "停止自动视觉判断";
    elements.visualSource.disabled = true;
    runVisualClassification();
  } else {
    clearTimeout(state.visualTimer);
    elements.visualClassify.textContent = "开启自动视觉判断";
    elements.visualSource.disabled = false;
    elements.visualResult.textContent = "视觉判断已停止";
  }
}

function openFeedback(trigger = "web_button") {
  if (!state.localSessionId) {
    addEvent("END_ERROR", { message: "请先开始完整监测" });
    return;
  }
  state.sessionEndedAt = Date.now();
  state.hardwareSessionActive = false;
  stopMonitoring();
  void syncHardwareLight("off");
  void setHardwareLed(false, "session_ended");
  elements.voiceStatus.textContent = trigger === "physical_button"
    ? "检测到实体按钮结束。请选择是否计入；专注感受可以语音输入、打字或留空。"
    : "请选择是否计入；专注感受可以语音输入、打字或留空。";
  addEvent("SESSION_END_REQUESTED", { trigger, next_state: "REFLECTING" });
  setSessionPhase("reflection");
}

async function pollHardwareEvents() {
  try {
    const response = await api(`/api/hardware/events?after=${state.hardwareEventId}`);
    for (const event of response.events) {
      state.hardwareEventId = Math.max(state.hardwareEventId, event.id);
      if (event.type === "HARDWARE_CONNECTED") {
        const port = event.payload.port ? ` · ${event.payload.port}` : "";
        setConnection("hardware", `桥接在线${port}`, "ok");
      }
      if (event.type === "HARDWARE_DISCONNECTED") {
        setConnection("hardware", "桥接在线 · 板子已断开", "bad");
      }
      if (event.type === "SESSION_START_REQUESTED") {
        if (!state.hardwarePrepared) {
          setConnection("hardware", "已按实体按钮 · 请在网页点击开始授权", "warn");
          addEvent("HARDWARE_START_WAITING_FOR_PERMISSION", { trigger: event.payload.trigger });
        } else {
          setConnection("hardware", "桥接在线 · 收到开始", "ok");
          await activateHardwareSession(event.payload.trigger);
        }
      }
      if (event.type === "SESSION_END_REQUESTED" && state.hardwareSessionActive) {
        setConnection("hardware", "桥接在线 · 收到结束", "ok");
        await finishHardwareSession(event.payload.trigger);
      }
      if (
        event.type === "REFLECTION_TRANSCRIPT" &&
        event.payload.local_session_id === state.localSessionId
      ) {
        if (event.payload.question === "focus_experience") {
          elements.experienceFeedback.value = event.payload.text;
          elements.voiceStatus.textContent = "已收到专注感受的语音文字。";
        }
      }
    }
  } catch (error) {
    console.debug("hardware event poll unavailable", error);
  } finally {
    state.hardwarePollTimer = setTimeout(pollHardwareEvents, 750);
  }
}

function voiceButtonLabel(targetId) {
  return targetId === "goal" ? "🎙 语音输入" : "🎙 语音输入感受";
}

function voiceStatusFor(targetId) {
  return targetId === "goal" ? elements.goalVoiceStatus : elements.voiceStatus;
}

function startVoiceAnswer(targetId, button) {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    toggleRecordedVoiceAnswer(targetId, button);
    return;
  }
  const recognition = new Recognition();
  recognition.lang = "zh-CN";
  recognition.interimResults = false;
  recognition.continuous = false;
  button.disabled = true;
  button.textContent = "正在听…";
  const status = voiceStatusFor(targetId);
  status.textContent = "请开始说话，停顿后会自动填入文字。";
  recognition.onresult = (event) => {
    const text = event.results?.[0]?.[0]?.transcript?.trim();
    if (text) {
      const target = document.getElementById(targetId);
      target.value = [target.value.trim(), text].filter(Boolean).join(" ");
    }
  };
  recognition.onerror = (event) => {
    status.textContent = `语音识别未完成：${event.error}。可以直接输入。`;
  };
  recognition.onend = () => {
    button.disabled = false;
    button.textContent = voiceButtonLabel(targetId);
    if (!status.textContent.includes("未完成")) status.textContent = "语音已转成文字，可以继续补充或提交。";
  };
  recognition.start();
}

async function toggleRecordedVoiceAnswer(targetId, button) {
  const status = voiceStatusFor(targetId);
  if (state.voiceRecorder?.state === "recording") {
    state.voiceRecorder.stop();
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    status.textContent = "当前浏览器不支持录音，请直接输入。";
    return;
  }
  try {
    state.voiceStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    const preferredType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";
    state.voiceChunks = [];
    state.voiceTargetId = targetId;
    state.voiceButton = button;
    state.voiceRecorder = new MediaRecorder(state.voiceStream, { mimeType: preferredType });
    state.voiceRecorder.ondataavailable = (event) => {
      if (event.data.size) state.voiceChunks.push(event.data);
    };
    state.voiceRecorder.onstop = transcribeRecordedAnswer;
    state.voiceRecorder.start();
    button.textContent = "■ 停止并转成文字";
    status.textContent = "正在录音。说完后再次点击按钮；音频会发送到 OpenAI 转成文字。";
  } catch (error) {
    status.textContent = `无法开始录音：${error.message}。可以直接输入。`;
  }
}

async function transcribeRecordedAnswer() {
  const button = state.voiceButton;
  const targetId = state.voiceTargetId;
  const status = voiceStatusFor(targetId);
  for (const track of state.voiceStream?.getTracks?.() ?? []) track.stop();
  state.voiceStream = null;
  if (button) {
    button.disabled = true;
    button.textContent = "OpenAI 转写中…";
  }
  try {
    const blob = new Blob(state.voiceChunks, { type: state.voiceRecorder.mimeType || "audio/webm" });
    const response = await fetch("/api/audio/transcribe", {
      method: "POST",
      headers: {
        "Content-Type": blob.type.split(";")[0] || "audio/webm",
      },
      body: blob,
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? `HTTP ${response.status}`);
    const target = document.getElementById(targetId);
    target.value = [target.value.trim(), result.text].filter(Boolean).join(" ");
    status.textContent = `语音已由 ${result.model} 转成文字，可以编辑后提交。`;
  } catch (error) {
    status.textContent = `语音转写失败：${error.message}。可以直接输入。`;
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = voiceButtonLabel(targetId);
    }
    state.voiceRecorder = null;
    state.voiceTargetId = null;
    state.voiceButton = null;
    state.voiceChunks = [];
  }
}

function interruptionSummary() {
  const ongoingMs = state.interruptionStartedAt ? Date.now() - state.interruptionStartedAt : 0;
  const reason = Object.entries(state.interruptionReasons).sort((a, b) => b[1] - a[1])[0];
  return {
    count: state.interruptionCount,
    total_seconds: Number(((state.interruptionTotalMs + ongoingMs) / 1000).toFixed(1)),
    main_reason: reason?.[1] > 0 ? reason[0] : null,
  };
}

function stopMonitoring() {
  state.running = false;
  state.autoVisual = false;
  clearTimeout(state.visualTimer);
  for (const timer of state.monitorTimers) clearInterval(timer);
  state.monitorTimers = [];
  for (const stream of [state.cameraStream, state.screenStream]) {
    for (const track of stream?.getTracks?.() ?? []) track.stop();
  }
  state.cameraStream = null;
  state.screenStream = null;
  state.screenShared = false;
}

const CHART_COLORS = ["#7cf1bc", "#f3d66d", "#72b7ff", "#b69cff", "#ff8f87", "#91aaa0"];

function taskTypeFor(goal = "") {
  const rules = [
    ["编程开发", /代码|编程|开发|debug|bug|接口|网站|网页|程序|算法/i],
    ["写作表达", /写作|文案|文章|论文|报告|PPT|演讲|路演|脚本|提案/i],
    ["学习研究", /学习|阅读|读书|复习|课程|研究|背诵|作业|考试/i],
    ["设计创作", /设计|剪辑|视频|图片|海报|建模|创作|原型/i],
    ["事务沟通", /邮件|会议|沟通|回复|整理|计划|排期|表格/i],
  ];
  return rules.find(([, pattern]) => pattern.test(goal))?.[0] ?? "其他任务";
}

function durationBand(minutes) {
  if (minutes <= 15) return "轻专注 · 15 分钟内";
  if (minutes <= 45) return "深专注 · 16–45 分钟";
  return "长专注 · 45 分钟以上";
}

function renderDonut(node, valueNode, legendNode, entries, centerText, unit) {
  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  let cursor = 0;
  const segments = entries.map(([, value], index) => {
    const start = cursor;
    cursor += total ? value / total * 360 : 0;
    return `${CHART_COLORS[index % CHART_COLORS.length]} ${start}deg ${cursor}deg`;
  });
  node.style.background = total
    ? `conic-gradient(${segments.join(",")})`
    : "rgba(145,170,160,.12)";
  valueNode.textContent = centerText || "—";
  legendNode.innerHTML = entries.length
    ? entries.map(([label, value], index) => `<li><i style="background:${CHART_COLORS[index % CHART_COLORS.length]}"></i><span>${escapeHtml(label)}</span><b>${value}${unit}</b></li>`).join("")
    : "<li class=\"empty\">还没有已计入的记录</li>";
}

function renderHistoryDashboard() {
  let history = [];
  try {
    history = JSON.parse(localStorage.getItem("refocus_session_history") || "[]");
  } catch {
    history = [];
  }
  const recorded = history.filter((item) => item?.recorded !== false);
  const normalized = recorded.map((item) => {
    const minutes = Math.max(1, Math.round(Number(
      item.duration_minutes ?? item.summary?.focus_minutes_actual ?? (item.duration_seconds || 0) / 60,
    ) || 0));
    return { ...item, minutes, taskType: item.task_type || taskTypeFor(item.goal) };
  });
  const totalMinutes = normalized.reduce((sum, item) => sum + item.minutes, 0);
  const average = normalized.length ? Math.round(totalMinutes / normalized.length) : 0;
  elements.historySessions.textContent = `${normalized.length} 次`;
  elements.historyMinutes.textContent = `${totalMinutes} 分钟`;
  elements.historyAverage.textContent = `${average} 分钟`;

  const taskTotals = new Map();
  const durationTotals = new Map();
  for (const item of normalized) {
    taskTotals.set(item.taskType, (taskTotals.get(item.taskType) || 0) + item.minutes);
    const band = durationBand(item.minutes);
    durationTotals.set(band, (durationTotals.get(band) || 0) + 1);
  }
  const tasks = [...taskTotals.entries()].sort((a, b) => b[1] - a[1]);
  const durations = [...durationTotals.entries()].sort((a, b) => b[1] - a[1]);
  const favorite = tasks[0]?.[0];
  const rhythm = durations[0]?.[0]?.split(" · ")[0];
  renderDonut(elements.taskDonut, elements.taskDonutValue, elements.taskLegend, tasks, favorite, " 分钟");
  renderDonut(elements.durationDonut, elements.durationDonutValue, elements.durationLegend, durations, rhythm, " 次");
  elements.historyInsight.textContent = normalized.length
    ? `你目前把最多专注时间投入在“${favorite}”，最常见的是“${rhythm}”节奏。继续记录后，偏好会越来越准确。`
    : "完成第一次专注后，这里会逐渐形成你的专注画像。";
}

async function generateSessionSummary() {
  const recordChoice = document.querySelector('input[name="recordSession"]:checked')?.value;
  const focusExperience = elements.experienceFeedback.value.trim();
  if (!recordChoice) {
    elements.voiceStatus.textContent = "请先选择是否将这一次专注计入记录。";
    return;
  }
  elements.generateSummary.disabled = true;
  elements.generateSummary.textContent = recordChoice === "yes" ? "flow-coordinator 总结中…" : "正在结束本次会话…";
  try {
    if (recordChoice === "no") {
      const durationSeconds = Math.max(0, Math.round(((state.sessionEndedAt || Date.now()) - state.sessionStartedAt) / 1000));
      await api("/api/session/stop", {
        ...sessionEnvelope(),
        duration_seconds: durationSeconds,
        interruptions: interruptionSummary(),
        end_reason: "user_discarded",
      });
      const interruptions = interruptionSummary();
      elements.summaryOutcome.textContent = "未计入";
      elements.summaryOutcome.className = "state-badge neutral";
      elements.summaryText.textContent = "这次会话已经正常结束，但按照你的选择，不会保存为一次专注记录。";
      elements.summaryMinutes.textContent = `${Math.max(1, Math.round(durationSeconds / 60))} 分钟`;
      elements.summaryInterruptions.textContent = `${interruptions.count} 次 · ${interruptions.total_seconds} 秒`;
      elements.summaryNextAction.textContent = "准备好后，可以开始下一次专注";
      addEvent("SESSION_DISCARDED", { duration_seconds: durationSeconds });
      setSessionPhase("summary");
      return;
    }
    const response = await api("/api/session/end", {
      ...sessionEnvelope(),
      user_feedback: {
        completion_report: "用户确认将本次专注计入记录",
        focus_experience: focusExperience || "用户未填写专注感受",
      },
      interruptions: interruptionSummary(),
    });
    const summary = response.summary;
    elements.summaryOutcome.textContent = summary.outcome.toUpperCase();
    elements.summaryOutcome.className = `state-badge ${summary.outcome === "completed" ? "good" : "warn"}`;
    elements.summaryText.textContent = summary.summary;
    elements.summaryMinutes.textContent = summary.focus_minutes_actual === null ? "未记录" : `${summary.focus_minutes_actual} 分钟`;
    elements.summaryInterruptions.textContent = `${summary.interruptions.count} 次 · ${summary.interruptions.total_seconds} 秒`;
    elements.summaryNextAction.textContent = summary.next_action ?? "本次任务已完成";
    addEvent("SESSION_SUMMARY_READY", {
      outcome: summary.outcome,
      status: response.trace.at(-1)?.status,
      assistant_message: response.trace.at(-1)?.assistantMessageObserved,
    });
    const history = JSON.parse(localStorage.getItem("refocus_session_history") || "[]");
    history.unshift({
      local_session_id: state.localSessionId,
      goal: elements.goal.value.trim(),
      recorded: true,
      task_type: taskTypeFor(elements.goal.value.trim()),
      duration_minutes: Math.max(1, Math.round(Number(summary.focus_minutes_actual) || 0)),
      started_at: new Date(state.sessionStartedAt).toISOString(),
      focus_experience: focusExperience || null,
      summary,
      ended_at: new Date(state.sessionEndedAt || Date.now()).toISOString(),
    });
    localStorage.setItem("refocus_session_history", JSON.stringify(history.slice(0, 100)));
    setSessionPhase("summary");
  } catch (error) {
    elements.voiceStatus.textContent = `总结生成失败：${error.message}`;
    elements.generateSummary.disabled = false;
    elements.generateSummary.textContent = "重新确认";
  }
}

elements.start.addEventListener("click", handleStartClick);
elements.hardwareConnect.addEventListener("click", () => void connectHardware({ request: true }));
elements.taskTest.addEventListener("click", testTaskUnderstanding);
elements.cameraTest.addEventListener("click", startCameraTest);
elements.clarify.addEventListener("click", clarifyTask);
elements.classify.addEventListener("click", classifyContext);
elements.visualClassify.addEventListener("click", toggleVisualClassification);
elements.end.addEventListener("click", () => finishHardwareSession("web_end"));
elements.generateSummary.addEventListener("click", generateSessionSummary);
elements.newSession.addEventListener("click", () => location.reload());
for (const button of document.querySelectorAll("[data-voice-target]")) {
  button.addEventListener("click", () => startVoiceAnswer(button.dataset.voiceTarget, button));
}
loadFaceModel();
loadVisualProvider();
pollHardwareEvents();
configureExperienceMode();
setSessionPhase("start");
if (webSerialMode) {
  void initializeHardwareDetection();
} else {
  elements.hardwareConnect.classList.add("hidden");
  setConnection("hardware", hardwareMode ? "等待 Mac 桥接" : "纯网页版", hardwareMode ? "warn" : "ok");
}
