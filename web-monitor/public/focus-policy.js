export const FOCUS_THRESHOLDS = Object.freeze({
  enterGreenMs: 5_000,
  missingRedSeconds: 3,
  headContextCrossSeconds: 8,
  headRedSeconds: 7,
  unrelatedSamplesForRed: 2,
  recoverGreenMs: 3_000,
  visualIntervalMs: 10_000,
});

const ACCEPTED_CONTEXT = new Set(["relevant", "neutral"]);

export class FocusSignalPolicy {
  #thresholds;
  #light = "yellow";
  #enteredFocus = false;
  #readySince = 0;
  #recoverySince = 0;
  #unrelatedStreak = 0;
  #contextClassification = "unknown";

  constructor(thresholds = {}) {
    this.#thresholds = { ...FOCUS_THRESHOLDS, ...thresholds };
  }

  get light() {
    return this.#light;
  }

  get unrelatedStreak() {
    return this.#unrelatedStreak;
  }

  recordContext(classification) {
    this.#contextClassification = classification;
    if (classification === "unrelated") this.#unrelatedStreak += 1;
    else if (ACCEPTED_CONTEXT.has(classification)) this.#unrelatedStreak = 0;
    return this.#unrelatedStreak;
  }

  evaluate(signal, now = performance.now()) {
    const taskReady = signal.taskReady === true;
    const screenHealthy = signal.screenShared === true;
    const presentForEntry = signal.confirmedPresent === true;
    const presenceInGrace = signal.present === true
      || (signal.lastFaceSeen === true && Number(signal.missingSeconds) < this.#thresholds.missingRedSeconds);
    const contextAccepted = ACCEPTED_CONTEXT.has(this.#contextClassification);
    const headAwaySeconds = Number(signal.headAwaySeconds ?? 0);

    if (!this.#enteredFocus) {
      const entryReady = taskReady && screenHealthy && presentForEntry && contextAccepted;
      if (entryReady) this.#readySince ||= now;
      else this.#readySince = 0;
      const entryStable = Boolean(this.#readySince && now - this.#readySince >= this.#thresholds.enterGreenMs);
      if (entryStable) {
        this.#enteredFocus = true;
        this.#light = "green";
      }
      return this.#decision({
        task: taskReady,
        present: presentForEntry,
        context: contextAccepted,
        stable: entryStable,
        reason: entryStable ? "专注条件稳定成立" : "等待进入专注条件稳定",
      });
    }

    const interruptionReason = !screenHealthy
      ? "屏幕共享已停止"
      : !presenceInGrace || Number(signal.missingSeconds) >= this.#thresholds.missingRedSeconds
        ? `连续未检测到人脸 ${Number(signal.missingSeconds).toFixed(1)} 秒`
        : this.#unrelatedStreak >= this.#thresholds.unrelatedSamplesForRed
          ? `连续 ${this.#unrelatedStreak} 次确认任务无关`
          : this.#unrelatedStreak >= 1 && headAwaySeconds >= this.#thresholds.headContextCrossSeconds
            ? "无关画面与持续偏头交叉确认"
            : headAwaySeconds >= this.#thresholds.headRedSeconds
              ? `持续偏头 ${headAwaySeconds.toFixed(0)} 秒`
              : null;

    if (interruptionReason) {
      this.#light = "red";
      this.#recoverySince = 0;
    }

    if (this.#light === "red") {
      const recoveryReady = taskReady
        && screenHealthy
        && signal.present === true
        && presentForEntry
        && contextAccepted
        && signal.headDirection === "toward_screen";
      if (recoveryReady) this.#recoverySince ||= now;
      else this.#recoverySince = 0;
      if (this.#recoverySince && now - this.#recoverySince >= this.#thresholds.recoverGreenMs) {
        this.#light = "green";
        this.#recoverySince = 0;
        return this.#decision({ task: true, present: true, context: true, stable: true, reason: "回到任务并稳定 3 秒" });
      }
      return this.#decision({
        task: taskReady,
        present: presenceInGrace,
        context: contextAccepted,
        stable: false,
        reason: interruptionReason ?? "等待回到任务并稳定 3 秒",
      });
    }

    this.#light = "green";
    const tolerated = this.#unrelatedStreak === 1
      ? "单次疑似无关，等待下一次视觉确认"
      : headAwaySeconds > 0
        ? "短暂转头，在容错时间内"
        : !signal.present
          ? "短暂无脸，在 3 秒容错内"
          : "专注状态稳定";
    return this.#decision({ task: taskReady, present: true, context: true, stable: true, reason: tolerated });
  }

  #decision({ task, present, context, stable, reason }) {
    return {
      light: this.#light,
      reason,
      unrelated_streak: this.#unrelatedStreak,
      gates: { task, present, context, stable },
    };
  }
}
