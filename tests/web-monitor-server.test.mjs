import assert from "node:assert/strict";
import test from "node:test";
import { MockFlowCoordinator } from "../bridge/mock-flow-coordinator.mjs";
import { createMonitorServer } from "../web-monitor/server.mjs";

async function withServer(run) {
  const server = createMonitorServer({
    coordinatorFactory: () => new MockFlowCoordinator(),
    visionMode: "vision",
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

test("visual route falls back to local OCR when the Agent model has no vision", async () => {
  const coordinator = new MockFlowCoordinator();
  coordinator.classifyVisualContext = async () => {
    throw new Error("Create Turn failed: HTTP 400 vision_model_unsupported: no images");
  };
  let ocrCalls = 0;
  const server = createMonitorServer({
    coordinatorFactory: () => coordinator,
    visionMode: "vision",
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
