import assert from "node:assert/strict";
import test from "node:test";
import { MockFlowCoordinator } from "../bridge/mock-flow-coordinator.mjs";
import { createMonitorServer } from "../web-monitor/server.mjs";

async function withServer(run) {
  const server = createMonitorServer({
    coordinatorFactory: () => new MockFlowCoordinator(),
    visionMode: "vision",
    visualProvider: "agent_stack",
    audioTranscriber: {
      model: "gpt-4o-mini-transcribe",
      transcribe: async () => ({ text: "语音测试成功", model: "gpt-4o-mini-transcribe" }),
    },
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("monitor serves the local UI and keeps Agent Stack secrets server-side", async () => {
  await withServer(async (baseUrl) => {
    const page = await fetch(`${baseUrl}/`).then((response) => response.text());
    assert.match(page, /RE:FOCUS/);
    assert.doesNotMatch(page, /AGENT_STACK_USER_API_KEY/);

    const response = await fetch(`${baseUrl}/api/session/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goal: "完成 RE:FOCUS 路演 PPT", focus_minutes: 30 }),
    });
    assert.equal(response.status, 201);
    const started = await response.json();
    assert.equal(started.task_contract.status, "ready");
    assert.ok(started.local_session_id.startsWith("local_web_"));
    assert.equal(JSON.stringify(started).includes("apiKey"), false);

    const audioResponse = await fetch(`${baseUrl}/api/audio/transcribe`, {
      method: "POST",
      headers: { "Content-Type": "audio/webm" },
      body: Buffer.from([1, 2, 3]),
    });
    assert.equal(audioResponse.status, 201);
    const audio = await audioResponse.json();
    assert.equal(audio.text, "语音测试成功");

    const joystickResponse = await fetch(`${baseUrl}/api/hardware/session-state`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: false, sequence: 3 }),
    });
    assert.equal(joystickResponse.status, 202);
    const hardwareEvents = await fetch(`${baseUrl}/api/hardware/events?after=0`).then((item) => item.json());
    assert.equal(hardwareEvents.events[0].type, "SESSION_END_REQUESTED");
    assert.equal(hardwareEvents.events[0].payload.trigger, "physical_button");

    const ledResponse = await fetch(`${baseUrl}/api/hardware/led`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ on: true, state: "session_active" }),
    });
    assert.equal(ledResponse.status, 202);
    const ledCommands = await fetch(`${baseUrl}/api/hardware/commands?after=0`).then((item) => item.json());
    assert.equal(ledCommands.commands[0].type, "LED_SET");
    assert.equal(ledCommands.commands[0].payload.on, true);

    const statusResponse = await fetch(`${baseUrl}/api/hardware/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connected: true, port: "/dev/cu.usbmodem-test" }),
    });
    assert.equal(statusResponse.status, 202);
    const statusEvents = await fetch(
      `${baseUrl}/api/hardware/events?after=${hardwareEvents.latest_id}`,
    ).then((item) => item.json());
    assert.equal(statusEvents.events[0].type, "HARDWARE_CONNECTED");

    const stopStartedResponse = await fetch(`${baseUrl}/api/session/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goal: "测试实体按钮结束", focus_minutes: 5 }),
    });
    const stopStarted = await stopStartedResponse.json();
    const stopResponse = await fetch(`${baseUrl}/api/session/stop`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        local_session_id: stopStarted.local_session_id,
        coordinator_session_id: stopStarted.coordinator_session_id,
        task_contract: stopStarted.task_contract,
        session_started_at: stopStarted.session_started_at,
        duration_seconds: 12,
        interruptions: { count: 1, total_seconds: 2.5 },
        end_reason: "physical_button",
      }),
    });
    assert.equal(stopResponse.status, 201);
    const stopped = await stopResponse.json();
    assert.equal(stopped.record.duration_seconds, 12);
    assert.equal(stopped.record.end_reason, "physical_button");

    const reflectionResponse = await fetch(`${baseUrl}/api/hardware/reflection-text`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        local_session_id: started.local_session_id,
        question: "completion_report",
        text: "板载麦克风转写结果",
      }),
    });
    assert.equal(reflectionResponse.status, 202);
    const reflectionEvents = await fetch(
      `${baseUrl}/api/hardware/events?after=${statusEvents.latest_id}`,
    ).then((item) => item.json());
    assert.equal(reflectionEvents.events[0].type, "REFLECTION_TRANSCRIPT");
    assert.equal(reflectionEvents.events[0].payload.source, "board_microphone");

    const contextResponse = await fetch(`${baseUrl}/api/context/relevance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        local_session_id: started.local_session_id,
        observation: {
          active_app: "PowerPoint",
          window_title: "RE:FOCUS 路演 PPT",
          screen_shared: true,
          screen_change_score: 0.08,
        },
      }),
    });
    assert.equal(contextResponse.status, 201);
    const context = await contextResponse.json();
    assert.equal(context.result.classification, "relevant");

    const visualResponse = await fetch(`${baseUrl}/api/context/visual`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        local_session_id: started.local_session_id,
        source: "screen_share",
        image_data_url: "data:image/jpeg;base64,/9j/2Q==",
        screen_change_score: 0.08,
      }),
    });
    assert.equal(visualResponse.status, 201);
    const visual = await visualResponse.json();
    assert.equal(visual.result.classification, "relevant");

    const endResponse = await fetch(`${baseUrl}/api/session/end`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        local_session_id: started.local_session_id,
        user_feedback: {
          completion_report: "完成了 PPT 前三页初稿",
          focus_experience: "整体顺利，找素材时有些分心",
        },
        interruptions: { count: 1, total_seconds: 8.2, main_reason: "off_task" },
      }),
    });
    assert.equal(endResponse.status, 201);
    const ended = await endResponse.json();
    assert.equal(ended.summary.schema_version, "2.0");
    assert.equal(ended.summary.skill, "session-summary");
    assert.equal(ended.summary.user_feedback.completion_report, "完成了 PPT 前三页初稿");
  });
});

test("monitor rejects missing goals and unknown local sessions", async () => {
  await withServer(async (baseUrl) => {
    const missingGoal = await fetch(`${baseUrl}/api/session/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    assert.equal(missingGoal.status, 400);

    const unknownSession = await fetch(`${baseUrl}/api/context/relevance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ local_session_id: "missing", observation: {} }),
    });
    assert.equal(unknownSession.status, 404);
  });
});

test("deployed monitor can restore a session after a serverless restart", async () => {
  let started;
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/session/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goal: "完成 RE:FOCUS 路演 PPT", focus_minutes: 30 }),
    });
    started = await response.json();
  });

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/context/relevance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        local_session_id: started.local_session_id,
        coordinator_session_id: started.coordinator_session_id,
        task_contract: started.task_contract,
        session_started_at: started.session_started_at,
        observation: {
          active_app: "PowerPoint",
          window_title: "RE:FOCUS 路演 PPT",
          screen_shared: true,
          screen_change_score: 0.08,
        },
      }),
    });
    assert.equal(response.status, 201);
    const context = await response.json();
    assert.equal(context.result.classification, "relevant");
  });
});

test("visual route falls back to local OCR when the Agent model has no vision", async () => {
  const coordinator = new MockFlowCoordinator();
  coordinator.classifyVisualContext = async () => {
    throw new Error("Create Turn failed: HTTP 400 vision_model_unsupported: no images");
  };
  let ocrCalls = 0;
  const server = createMonitorServer({
    coordinatorFactory: () => coordinator,
    visionMode: "vision",
    visualProvider: "agent_stack",
    ocrExtractor: async () => {
      ocrCalls += 1;
      return { text: "REFOCUS 路演 PPT", confidence: 0.91 };
    },
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const started = await fetch(`${baseUrl}/api/session/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goal: "完成 RE:FOCUS 路演 PPT", focus_minutes: 30 }),
    }).then((response) => response.json());
    const response = await fetch(`${baseUrl}/api/context/visual`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        local_session_id: started.local_session_id,
        source: "screen_share",
        image_data_url: "data:image/jpeg;base64,/9j/2Q==",
      }),
    });
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.processing.mode, "local_ocr_then_agent_stack");
    assert.equal(body.processing.raw_image_uploaded_to_agent_stack, false);
    assert.equal(body.processing.ocr_characters, 14);
    assert.equal(ocrCalls, 1);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("visual route uses the external observer fast path without creating an Agent Stack Turn", async () => {
  const coordinator = new MockFlowCoordinator();
  let observedBytes = 0;
  const server = createMonitorServer({
    coordinatorFactory: () => coordinator,
    visualObserver: {
      model: "gpt-4.1-mini",
      observe: async (bytes, { source }) => {
        observedBytes = bytes.length;
        return {
          observation: {
            source,
            scene_type: "presentation_editor",
            visible_text: ["REFOCUS 路演"],
            activity: "editing",
            progress_signals: ["正在编辑幻灯片"],
            distraction_signals: [],
            confidence: 0.94,
          },
          relevance: {
            schema_version: "1.0",
            classifier: "openai-visual-fast-path",
            classification: "relevant",
            confidence: 0.93,
            evidence: ["正在编辑 RE:FOCUS 路演幻灯片"],
            matched_hints: { keywords: [], apps: [], domains: [] },
          },
          trace: { provider: "openai", model: "gpt-4.1-mini", response_id: "resp_test", status: "completed" },
        };
      },
    },
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const started = await fetch(`${baseUrl}/api/session/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goal: "完成 RE:FOCUS 路演 PPT", focus_minutes: 30 }),
    }).then((response) => response.json());
    const response = await fetch(`${baseUrl}/api/context/visual`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        local_session_id: started.local_session_id,
        source: "screen_share",
        image_data_url: "data:image/jpeg;base64,/9j/2Q==",
      }),
    });
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.ok(observedBytes > 0);
    assert.equal(body.processing.mode, "openai_visual_fast_path");
    assert.equal(body.result.classification, "relevant");
    assert.equal(
      coordinator.calls.filter((item) => item.operation === "classifyContext").length,
      0,
    );
    assert.equal(body.processing.raw_image_uploaded_to_openai, true);
    assert.equal(body.processing.raw_image_uploaded_to_agent_stack, false);
    assert.equal(body.processing.visual_observation.scene_type, "presentation_editor");
    assert.equal(body.processing.visual_trace.response_id, "resp_test");
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
