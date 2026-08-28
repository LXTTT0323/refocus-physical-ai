export class HeadDirectionFilter {
  #direction = "unknown";
  #candidate = null;
  #candidateSince = 0;
  #leaveHoldMs;
  #returnHoldMs;

  constructor({ leaveHoldMs = 500, returnHoldMs = 1_800 } = {}) {
    this.#leaveHoldMs = leaveHoldMs;
    this.#returnHoldMs = returnHoldMs;
  }

  update(rawDirection, now) {
    if (this.#direction === "unknown") {
      this.#direction = rawDirection;
      return this.#direction;
    }
    if (rawDirection === this.#direction) {
      this.#candidate = null;
      this.#candidateSince = 0;
      return this.#direction;
    }

    if (rawDirection !== this.#candidate) {
      this.#candidate = rawDirection;
      this.#candidateSince = now;
      return this.#direction;
    }

    const returningToScreen = rawDirection === "toward_screen";
    const holdMs = returningToScreen ? this.#returnHoldMs : this.#leaveHoldMs;
    if (now - this.#candidateSince >= holdMs) {
      this.#direction = rawDirection;
      this.#candidate = null;
      this.#candidateSince = 0;
    }
    return this.#direction;
  }
}
