import assert from "node:assert/strict";
import test from "node:test";
import { OpenAIAudioTranscriber } from "../bridge/openai-audio-transcriber.mjs";

test("OpenAI audio transcriber sends multipart audio and returns text", async () => {
  let captured;
  const transcriber = new OpenAIAudioTranscriber({
    apiKey: "test-secret",
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return new Response(JSON.stringify({ text: "这次完成了前三页初稿" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  });
  const result = await transcriber.transcribe(Buffer.from([1, 2, 3]), { contentType: "audio/webm" });
  assert.equal(result.text, "这次完成了前三页初稿");
  assert.equal(captured.url, "https://api.openai.com/v1/audio/transcriptions");
  assert.equal(captured.options.headers.Authorization, "Bearer test-secret");
  assert.equal(captured.options.body.get("model"), "gpt-4o-mini-transcribe");
  assert.equal(captured.options.body.get("language"), "zh");
  assert.equal(captured.options.body.get("file").type, "audio/webm");
});
