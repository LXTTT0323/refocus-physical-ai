import assert from "node:assert/strict";
import test from "node:test";
import { OpenAIVisualObserver } from "../bridge/openai-visual-observer.mjs";

test("OpenAI visual observer sends one low-detail image and parses strict observation JSON", async () => {
  let captured;
  const visual = {
    source: "screen_share",
    scene_type: "presentation_editor",
    visible_text: ["RE:FOCUS", "产品方案"],
    activity: "editing",
    progress_signals: ["正在编辑幻灯片"],
    distraction_signals: [],
    confidence: 0.93,
  };
  const observer = new OpenAIVisualObserver({
    apiKey: "test-secret",
    model: "gpt-4.1-mini",
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return new Response(JSON.stringify({
        id: "resp_test",
        status: "completed",
        output: [{
          type: "message",
          content: [{ type: "output_text", text: JSON.stringify(visual) }],
        }],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    },
  });

  const result = await observer.observe(Buffer.from([0xff, 0xd8, 0xff, 0xd9]), {
    source: "screen_share",
  });
  assert.deepEqual(result.observation, visual);
  assert.equal(result.trace.response_id, "resp_test");
  assert.equal(captured.url, "https://api.openai.com/v1/responses");
  assert.equal(captured.options.headers.Authorization, "Bearer test-secret");
  const body = JSON.parse(captured.options.body);
  const image = body.input[0].content.find((item) => item.type === "input_image");
  assert.equal(image.detail, "low");
  assert.match(image.image_url, /^data:image\/jpeg;base64,/);
  assert.equal(body.text.format.type, "json_schema");
  assert.equal(body.text.format.strict, true);
});

test("OpenAI visual observer rejects unexpected fields", async () => {
  const observer = new OpenAIVisualObserver({
    apiKey: "test-secret",
    fetchImpl: async () => new Response(JSON.stringify({
      id: "resp_test",
      status: "completed",
      output: [{
        type: "message",
        content: [{
          type: "output_text",
          text: JSON.stringify({
            source: "camera_page",
            scene_type: "physical_document",
            visible_text: [],
            activity: "reading",
            progress_signals: [],
            distraction_signals: [],
            confidence: 0.8,
            identity: "forbidden",
          }),
        }],
      }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }),
  });
  await assert.rejects(
    observer.observe(Buffer.from([1]), { source: "camera_page" }),
    /missing or unsupported fields/,
  );
});
