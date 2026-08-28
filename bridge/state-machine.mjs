export const STATES = Object.freeze({
  IDLE: "IDLE",
  SETUP: "SETUP",
  FOCUSING: "FOCUSING",
  INTERRUPTED: "INTERRUPTED",
  RESTORING: "RESTORING",
  ENDED: "ENDED",
});

const transitions = new Map([
  [`${STATES.IDLE}:SESSION_START`, STATES.SETUP],
  [`${STATES.SETUP}:TASK_CLARIFICATION`, STATES.SETUP],
  [`${STATES.SETUP}:ACTIVITY_SAMPLE`, STATES.SETUP],
  [`${STATES.SETUP}:FOCUS_READY`, STATES.FOCUSING],
  [`${STATES.SETUP}:SESSION_END`, STATES.ENDED],
  [`${STATES.FOCUSING}:ACTIVITY_SAMPLE`, STATES.FOCUSING],
  [`${STATES.FOCUSING}:PROGRESS_UPDATE`, STATES.FOCUSING],
  [`${STATES.FOCUSING}:INTERRUPTION_DETECTED`, STATES.INTERRUPTED],
  [`${STATES.INTERRUPTED}:RETURN_DETECTED`, STATES.RESTORING],
  [`${STATES.RESTORING}:SESSION_RESUMED`, STATES.FOCUSING],
  [`${STATES.FOCUSING}:SESSION_END`, STATES.ENDED],
  [`${STATES.INTERRUPTED}:SESSION_END`, STATES.ENDED],
  [`${STATES.RESTORING}:SESSION_END`, STATES.ENDED],
]);

function assertEnvelope(event) {
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    throw new Error("Event must be an object");
  }
  if (event.schema_version !== "0.1") {
    throw new Error(`Unsupported schema_version: ${event.schema_version ?? "missing"}`);
  }
  if (!event.event_id || typeof event.event_id !== "string") {
    throw new Error("event_id is required");
  }
  if (!event.session_id || typeof event.session_id !== "string") {
    throw new Error("session_id is required");
  }
  if (!Number.isInteger(event.sequence) || event.sequence < 1) {
    throw new Error("sequence must be a positive integer");
  }
  if (!event.timestamp || Number.isNaN(Date.parse(event.timestamp))) {
    throw new Error("timestamp must be a valid ISO 8601 date-time");
  }
  if (!event.payload || typeof event.payload !== "object" || Array.isArray(event.payload)) {
    throw new Error("payload must be an object");
  }
}

function assertSemanticGuards(event) {
  if (
    event.event === "INTERRUPTION_DETECTED" &&
    !(Number(event.payload.duration_seconds) > 0)
  ) {
    throw new Error("INTERRUPTION_DETECTED requires duration_seconds > 0");
  }

  if (event.event === "RETURN_DETECTED") {
    if (event.payload.present !== true) {
      throw new Error("RETURN_DETECTED requires present=true");
    }
    if (!(Number(event.payload.stable_seconds) >= 10)) {
      throw new Error("RETURN_DETECTED requires stable_seconds >= 10");
    }
  }

  if (
    event.event === "SESSION_RESUMED" &&
    (typeof event.payload.restore_message !== "string" ||
      !event.payload.restore_message.trim())
  ) {
    throw new Error("SESSION_RESUMED requires a non-empty restore_message");
  }

  if (event.event === "TASK_CLARIFICATION") {
    if (
      typeof event.payload.answer !== "string" ||
      !event.payload.answer.trim()
    ) {
      throw new Error("TASK_CLARIFICATION requires a non-empty answer");
    }
  }

  if (event.event === "FOCUS_READY") {
    if (
      event.payload.task_ready !== true ||
      event.payload.present !== true ||
      event.payload.context_relevant !== true
    ) {
      throw new Error(
        "FOCUS_READY requires task_ready, present, and context_relevant to be true",
      );
    }
    if (!(Number(event.payload.stable_seconds) >= 5)) {
      throw new Error("FOCUS_READY requires stable_seconds >= 5");
    }
  }
}

export class RefocusStateMachine {
  #state = STATES.IDLE;
  #sessionId;
  #lastSequence = 0;
  #eventIds = new Set();
  #history = [];

  get state() {
    return this.#state;
  }

  get sessionId() {
    return this.#sessionId;
  }

  get history() {
    return this.#history.map((item) => ({ ...item }));
  }

  apply(event) {
    assertEnvelope(event);
    assertSemanticGuards(event);

    if (this.#eventIds.has(event.event_id)) {
      throw new Error(`Duplicate event_id: ${event.event_id}`);
    }

    if (this.#sessionId && event.session_id !== this.#sessionId) {
      throw new Error(
        `Mixed session_id: expected ${this.#sessionId}, received ${event.session_id}`,
      );
    }

    const expectedSequence = this.#lastSequence + 1;
    if (event.sequence !== expectedSequence) {
      throw new Error(
        `Invalid sequence: expected ${expectedSequence}, received ${event.sequence}`,
      );
    }

    const from = this.#state;
    const to = transitions.get(`${from}:${event.event}`);
    if (!to) {
      throw new Error(`${event.event} is invalid while state=${from}`);
    }

    this.#sessionId ??= event.session_id;
    this.#eventIds.add(event.event_id);
    this.#lastSequence = event.sequence;
    this.#state = to;

    const transition = {
      sequence: event.sequence,
      event: event.event,
      from,
      to,
      timestamp: event.timestamp,
    };
    this.#history.push(transition);
    return { ...transition };
  }
}
