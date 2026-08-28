import { FaceLandmarker, FilesetResolver } from "/vendor/vision_bundle.mjs";
import { FOCUS_THRESHOLDS, FocusSignalPolicy } from "/focus-policy.js";
import { HeadDirectionFilter } from "/head-direction-filter.js";

const $ = (selector) => document.querySelector(selector);
const demoMode = new URLSearchParams(location.search).get("demo") === "1";

const elements = {
  goal: $("#goal"),
  minutes: $("#minutes"),
  start: $("#startButton"),
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
};

const state = {
  running: false,
  faceLandmarker: null,
  localSessionId: null,
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
};

function setConnection(name, text, kind = "") {
  const node = document.querySelector(`[data-status="${name}"]`);
  node.className = kind;
  node.querySelector("b").textContent = text;
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

async function api(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? `HTTP ${response.status}`);
  return result;
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
    taskReady: state.taskContract?.status === "ready",
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
    elements.focusDecision.textContent = `FOCUSING · 绿灯｜${decision.reason}`;
  } else if (decision.light === "red") {
    elements.focusDecision.textContent = `INTERRUPTED · 红灯慢闪｜${decision.reason}`;
  } else {
    elements.focusDecision.textContent = `SETUP · 黄灯｜${decision.reason}`;
  }
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
    focus_minutes: Number(elements.minutes.value),
  });
  state.localSessionId = result.local_session_id;
  state.taskContract = result.task_contract;
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
  elements.start.textContent = "正在授权…";
  try {
    if (demoMode) {
      state.running = true;
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
      await startAgentSession();
      updateReadyGate();
      setInterval(emitSample, 5000);
      setInterval(updateReadyGate, 500);
      elements.start.textContent = "监测运行中";
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || !navigator.mediaDevices?.getDisplayMedia) {
      throw new Error("当前浏览器不支持摄像头或屏幕共享，请使用最新版 Chrome/Edge");
    }

    const displayPromise = navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 5, max: 10 } },
      audio: false,
      selfBrowserSurface: "exclude",
      surfaceSwitching: "include",
    });
    const cameraPromise = navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
      audio: false,
    });
    [state.screenStream, state.cameraStream] = await Promise.all([displayPromise, cameraPromise]);
    state.screenShared = true;
    state.lastScreenChangeAt = performance.now();
    elements.screenVideo.srcObject = state.screenStream;
    elements.cameraVideo.srcObject = state.cameraStream;
    document.querySelector(".camera-panel .video-wrap").classList.add("live");
    document.querySelector(".screen-panel .video-wrap").classList.add("live");
    setConnection("camera", "已授权，本地分析", "ok");
    setConnection("screen", "正在共享", "ok");
    const screenTrack = state.screenStream.getVideoTracks()[0];
    elements.screenLabel.textContent = screenTrack.label || "已选择的屏幕";
    elements.activeApp.value ||= screenTrack.label || "";
    screenTrack.addEventListener("ended", () => {
      state.screenShared = false;
      setConnection("screen", "共享已停止", "bad");
      badge(elements.screenState, "共享已停止", "bad");
      updateReadyGate();
    });
    await loadFaceModel();
    await startAgentSession();
    state.running = true;
    requestAnimationFrame(faceLoop);
    setInterval(analyzeScreen, 1000);
    setInterval(emitSample, 5000);
    setInterval(updateReadyGate, 500);
    elements.start.textContent = "监测运行中";
    addEvent("MONITORING_STARTED", { camera: true, screen: true });
  } catch (error) {
    elements.start.disabled = false;
    elements.start.textContent = "重新开始";
    if (!state.cameraStream) setConnection("camera", "授权未完成", "bad");
    if (!state.screenStream) setConnection("screen", "授权未完成", "bad");
    if (state.cameraStream && state.screenStream) setConnection("agent", "Agent 会话失败", "bad");
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
    setInterval(emitSample, 5000);
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
      local_session_id: state.localSessionId,
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
      local_session_id: state.localSessionId,
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
  elements.visualResult.textContent = "正在截取单张画面并由 flow-coordinator 判断…";
  try {
    const response = await api("/api/context/visual", {
      local_session_id: state.localSessionId,
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
      : response.processing?.mode === "openai_visual_then_agent_stack"
        ? `OpenAI 视觉 → Agent Stack（${response.processing.visual_trace?.model ?? "视觉模型"}）`
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

elements.start.addEventListener("click", startMonitoring);
elements.taskTest.addEventListener("click", testTaskUnderstanding);
elements.cameraTest.addEventListener("click", startCameraTest);
elements.clarify.addEventListener("click", clarifyTask);
elements.classify.addEventListener("click", classifyContext);
elements.visualClassify.addEventListener("click", toggleVisualClassification);
loadFaceModel();
loadVisualProvider();
