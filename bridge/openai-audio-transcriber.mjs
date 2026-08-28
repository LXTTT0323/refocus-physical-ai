export class OpenAIAudioTranscriber {
  #apiKey;
  #model;
  #fetch;

  constructor({ apiKey, model = "gpt-4o-mini-transcribe", fetchImpl = fetch }) {
    if (!apiKey) throw new Error("OPENAI_API_KEY is required for audio transcription");
    this.#apiKey = apiKey;
    this.#model = model;
    this.#fetch = fetchImpl;
  }

  static fromEnvironment() {
    if (!process.env.OPENAI_API_KEY) return null;
    return new OpenAIAudioTranscriber({
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.REFOCUS_OPENAI_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe",
    });
  }

  get model() {
    return this.#model;
  }

  async transcribe(bytes, { contentType = "audio/webm" } = {}) {
    const form = new FormData();
    form.append("file", new Blob([bytes], { type: contentType }), `refocus-feedback.${contentType.includes("wav") ? "wav" : "webm"}`);
    form.append("model", this.#model);
    form.append("language", "zh");
    form.append("response_format", "json");
    const response = await this.#fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.#apiKey}` },
      body: form,
      signal: AbortSignal.timeout(45_000),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const code = body?.error?.code ?? "openai_transcription_error";
      const message = body?.error?.message ?? response.statusText;
      throw new Error(`OpenAI audio transcription failed: HTTP ${response.status} ${code}: ${message}`);
    }
    if (typeof body.text !== "string" || !body.text.trim()) {
      throw new Error("OpenAI audio transcription returned no text");
    }
    return { text: body.text.trim(), model: this.#model };
  }
}
